// @vitest-environment node
import { beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const client = vi.hoisted(() => ({auth: {getUser: vi.fn()}, rpc: vi.fn()}));
vi.mock("../src/lib/supabase/server", () => ({serverClient: async () => client}));
import { GET } from "../src/app/admin/api/reports/legacy/route";
import { POST as decide } from "../src/app/admin/api/reports/legacy/decision/route";
import { POST as ban } from "../src/app/admin/api/reports/legacy/ban/route";
const id = "11111111-1111-4111-8111-111111111111";
const decision = {report_id: id, expected_revision: 1, decision: "reviewed", note: "Checked evidence", reviewed_evidence: true};
const request = (body: unknown, origin = "http://localhost:3004") => new NextRequest("http://localhost:3004/admin/api/reports/legacy/decision", {method: "POST", headers: {origin, "content-type": "application/json"}, body: JSON.stringify(body)});
beforeEach(() => {vi.resetAllMocks(); delete process.env.ADMIN_ORIGIN;});
function admin() {client.auth.getUser.mockResolvedValue({data: {user: {id: "admin"}}, error: null}); client.rpc.mockResolvedValue({data: [], error: null});}
it("requires an admin session and rejects cross-site mutations", async () => {
  client.auth.getUser.mockResolvedValue({data: {user: null}, error: null});
  for (const r of [await GET(), await decide(request(decision)), await ban(request({}))]) {expect(r.status).toBe(401); expect(r.headers.get("cache-control")).toBe("private, no-store");}
  expect((await decide(request(decision, "https://untrusted.test"))).status).toBe(403); expect(client.rpc).not.toHaveBeenCalled();
});
it("forwards only checked evidence, revision and decision; rejects invalid inputs", async () => {
  admin(); expect((await decide(request({...decision, reviewed_evidence: false}))).status).toBe(400);
  expect((await decide(request({...decision, owner_id: "forged"}))).status).toBe(200);
  expect(client.rpc).toHaveBeenLastCalledWith("admin_review_legacy_report", {target_report: id, expected_revision: 1, decision: "reviewed", review_note: "Checked evidence"});
});
it("binds bans to the report and validates duration without accepting an arbitrary account ID", async () => {
  admin(); const input = {report_id: id, expected_revision: 1, request_id: id, reason: "Verified violation", duration_days: 7, owner_id: "forged"};
  expect((await ban(request({...input, duration_days: -1}))).status).toBe(400); expect((await ban(request(input))).status).toBe(200);
  expect(client.rpc).toHaveBeenLastCalledWith("admin_ban_legacy_report_user", {target_report: id, expected_revision: 1, request_id: id, reason: "Verified violation", duration_days: 7});
});
it("returns a private conflict without leaking backend errors", async () => {
  admin(); client.rpc.mockImplementation(async name => name === "admin_rank_review_context" ? {data: {}} : {error: {code: "40001", message: "review_conflict", details: "secret"}});
  const r = await decide(request(decision)); expect(r.status).toBe(409); expect(JSON.stringify(await r.json())).not.toContain("secret");
});
