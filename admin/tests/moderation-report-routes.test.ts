// @vitest-environment node
import { beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { report } from "./fixtures/moderation-report";
const client = vi.hoisted(() => ({auth: {getUser: vi.fn()}, rpc: vi.fn()}));
vi.mock("../src/lib/supabase/server", () => ({serverClient: async () => client}));
import { GET } from "../src/app/admin/api/reports/route";
import { POST as preview } from "../src/app/admin/api/reports/preview/route";
import { POST as decide } from "../src/app/admin/api/reports/decision/route";
const decision = {case_id: report.id, expected_revision: report.revision, confirmed: true, decision_note: "Spam verified", reviewed_content: true};
function request(body: unknown, origin = "http://localhost:3004") {
  return new NextRequest("http://localhost:3004/admin/api/reports/decision", {method: "POST", headers: {origin, "content-type": "application/json"}, body: JSON.stringify(body)});
}
beforeEach(() => {vi.resetAllMocks(); delete process.env.ADMIN_ORIGIN;});
function admin(data: unknown = []) {
  client.auth.getUser.mockResolvedValue({data: {user: {id: "admin"}}, error: null});
  client.rpc.mockImplementation(async name => ({data: name === "admin_rank_review_context" ? {boards: []} : data, error: null}));
}
it("protects reads, previews and decisions with session and backend admin checks", async () => {
  client.auth.getUser.mockResolvedValue({data: {user: null}, error: null});
  for (const response of [await GET(), await preview(request({case_id: report.id})), await decide(request(decision))]) {
    expect(response.status).toBe(401); expect(response.headers.get("cache-control")).toBe("private, no-store");
  }
  expect(client.rpc).not.toHaveBeenCalled();
  admin(); client.rpc.mockResolvedValue({error: {code: "42501", message: "admin_required"}});
  expect((await decide(request(decision))).status).toBe(403);
  expect(client.rpc).toHaveBeenCalledTimes(1);
});
it("rejects cross-site requests before auth, and validates viewing, revision and confirmation note", async () => {
  expect((await decide(request(decision, "https://untrusted.test"))).status).toBe(403);
  expect(client.auth.getUser).not.toHaveBeenCalled(); admin();
  for (const invalid of [{...decision, reviewed_content: false}, {...decision, decision_note: " "}, {...decision, expected_revision: 0}]) {
    expect((await decide(request(invalid))).status).toBe(400);
  }
  expect(client.rpc.mock.calls.every(([name]) => name === "admin_rank_review_context")).toBe(true);
});
it("returns authorized reporter usernames for every report kind while stripping auth IDs and unrelated fields", async () => {
  admin([report, {...report, id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", target_kind: "comment", context: {username: "athlete", body: "Reported comment", post_id: "post", internal: "secret"}},
    {...report, id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", target_kind: "profile", reports: [{...report.reports[0], reporter_id: "private-reporter", reporter_username: "report_author"}], internal: "secret"}]);
  const response = await GET(), data = await response.json();
  expect(response.status).toBe(200); expect(data.map((item: {target_kind: string}) => item.target_kind)).toEqual(["post", "comment", "profile"]);
  expect(data[2].reports[0].reporter_username).toBe("report_author");
  expect(JSON.stringify(data)).not.toContain("private-reporter"); expect(JSON.stringify(data)).not.toContain("secret");
  expect(client.rpc).toHaveBeenLastCalledWith("get_moderation_cases");
});
it("forwards only validated revision-checked decisions to the backend", async () => {
  admin(); const response = await decide(request({...decision, owner_id: "forged", resolved_by: "forged"}));
  expect(response.status).toBe(200);
  expect(client.rpc).toHaveBeenLastCalledWith("admin_resolve_safety_case", {target_case: report.id, expected_revision: 3, confirmed: true, decision_note: "Spam verified"});
});
it("maps stale decisions to a private conflict without exposing SQL details", async () => {
  admin(); client.rpc.mockImplementation(async name => name === "admin_rank_review_context" ? {data: {boards: []}, error: null} : {error: {code: "40001", message: "case_conflict", details: "private SQL data"}});
  const response = await decide(request(decision)); expect(response.status).toBe(409);
  expect((await response.json()).error).toContain("Refresh"); expect(response.headers.get("cache-control")).toBe("private, no-store");
});
it("previews reported posts only through the authorized RPC and allowlisted media host", async () => {
  admin({title: "Reported video", caption: "Caption", author: {username: "athlete", email: "private"}, media: {primary_url: "https://media.zelos.club/reported.mp4"}, renditions: {bad: "https://untrusted.test/video", p720: "https://media.zelos.club/720.mp4"}});
  const response = await preview(request({case_id: report.id, target_id: "forged"}));
  expect(await response.json()).toEqual({title: "Reported video", caption: "Caption", username: "athlete", urls: ["https://media.zelos.club/720.mp4", "https://media.zelos.club/reported.mp4"]});
  expect(client.rpc).toHaveBeenLastCalledWith("get_review_post", {case_id: report.id});
});
it("returns a custom retry error for unexpected service failures", async () => {
  client.auth.getUser.mockRejectedValue(new Error("internal secret"));
  const response = await GET(); expect(response.status).toBe(503); expect(JSON.stringify(await response.json())).not.toContain("internal secret");
});

it("treats absent, blank and invalid reporter usernames as unavailable", async () => {
 for (const reporter_username of [undefined, null, " ", 123, "x".repeat(101)]) {
  admin([{...report,reports:[{...report.reports[0],reporter_username}]}]);
  const response=await GET(); expect(response.status).toBe(200);
  expect((await response.json())[0].reports[0].reporter_username).toBeNull();
 }
});
