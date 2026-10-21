// @vitest-environment node
import {beforeEach, expect, it, vi} from "vitest";
import {NextRequest} from "next/server";
import {rankedUpload, privatePreview} from "./fixtures/ranked-upload";
const client = vi.hoisted(() => ({auth: {getUser: vi.fn()}, rpc: vi.fn(), functions: {invoke: vi.fn()}}));
vi.mock("../src/lib/supabase/server", () => ({serverClient: async () => client}));
import {GET} from "../src/app/admin/api/ranked-uploads/route";
import {POST as decide} from "../src/app/admin/api/ranked-uploads/decision/route";
import {POST as preview} from "../src/app/admin/api/ranked-uploads/preview/route";
function request(body: unknown, origin = "http://localhost:3004") {
  return new NextRequest("http://localhost:3004/admin/api/ranked-uploads", {
    method: "POST", headers: {origin, "content-type": "application/json"}, body: JSON.stringify(body),
  });
}
const decision = {upload_id: rankedUpload.id, expected_revision: 4, approve: false,
  watched_video: true, reason_code: "unacceptable_form", review_note: "Arms bend during the hold.", rule_ids: [rankedUpload.guidelines.rules[0].id]};
beforeEach(() => {
  vi.resetAllMocks(); delete process.env.ADMIN_ORIGIN;
  client.auth.getUser.mockResolvedValue({data: {user: {id: "admin"}}, error: null});
  client.rpc.mockImplementation(async name => ({data: name === "get_ranked_upload_reviews" ? [rankedUpload] : {}, error: null}));
  client.functions.invoke.mockResolvedValue({data: privatePreview, error: null});
});
it("requires admin identity for all private queue operations", async () => {
  client.auth.getUser.mockResolvedValue({data: {user: null}, error: null});
  for (const response of [await GET(), await decide(request(decision)), await preview(request({upload_id: rankedUpload.id}))]) {
    expect(response.status).toBe(401); expect(response.headers.get("cache-control")).toBe("private, no-store");
  }
  expect(client.rpc).not.toHaveBeenCalled(); expect(client.functions.invoke).not.toHaveBeenCalled();
  client.auth.getUser.mockResolvedValue({data: {user: {id: "user"}}, error: null});
  client.rpc.mockResolvedValue({error: {code: "42501", message: "admin_required"}});
  expect((await GET()).status).toBe(403);
  expect((await decide(request(decision))).status).toBe(403);
  expect((await preview(request({upload_id: rankedUpload.id}))).status).toBe(403);
  expect(client.functions.invoke).not.toHaveBeenCalled();
});
it("rejects cross-origin mutations and validates approval viewing, revision and rejection reasons", async () => {
  expect((await decide(request(decision, "https://other.test"))).status).toBe(403);
  expect((await preview(request({upload_id: rankedUpload.id}, "https://other.test"))).status).toBe(403);
  expect(client.auth.getUser).not.toHaveBeenCalled();
  for (const patch of [{watched_video: "yes"}, {expected_revision: 0}, {expected_revision: 1.5}, {reason_code: "invented"},
    {reason_code: null}, {rule_ids: ["not-a-rule"]}, {rule_ids: [rankedUpload.guidelines.rules[0].id, rankedUpload.guidelines.rules[0].id]}, {review_note: "x".repeat(1001)}, {upload_id: "not-uuid"}]) {
    expect((await decide(request({...decision, ...patch}))).status).toBe(400);
  }
  expect(client.rpc.mock.calls.every(([name]) => name === "admin_rank_review_context")).toBe(true);
  expect((await decide(request({...decision, review_note: "x".repeat(1000)}))).status).toBe(200);
  const result = await decide(request({...decision, review_note: ` ${decision.review_note} `, owner_id: "forged", status: "published"}));
  expect(result.status).toBe(200); expect(result.headers.get("cache-control")).toBe("private, no-store");
  expect(client.rpc).toHaveBeenLastCalledWith("resolve_ranked_upload_review", decision);
  expect((await decide(request({...decision, approve: true, reason_code: null, review_note: "", rule_ids: []}))).status).toBe(200);
  expect((await decide(request({upload_id: rankedUpload.id, expected_revision: 4, approve: false,
    reason_code: "unacceptable_filming"}))).status).toBe(200);
  expect(client.rpc).toHaveBeenLastCalledWith("resolve_ranked_upload_review", {upload_id: rankedUpload.id,
    expected_revision: 4, approve: false, watched_video: false, reason_code: "unacceptable_filming", review_note: "", rule_ids: []});
  expect((await decide(request({...decision, approve: true, watched_video: false, reason_code: null, rule_ids: []}))).status).toBe(400);
});
it("allowlists queue data including plain-text guidelines without exposing future private fields", async () => {
  client.rpc.mockImplementation(async name => ({data: name === "get_ranked_upload_reviews" ? [{...rankedUpload, access_token: "private-secret",
    guidelines: {...rankedUpload.guidelines, demo_url: "https://private.test/secret", internal_note: "private-secret"}}] : {}, error: null}));
  const result = await GET(); expect(result.status).toBe(200);
  expect(result.headers.get("cache-control")).toBe("private, no-store");
  expect(await result.json()).toEqual([rankedUpload]);
  client.rpc.mockImplementation(async name => ({data: name === "get_ranked_upload_reviews" ? [{...rankedUpload, revision: -1}] : {}, error: null}));
  expect((await GET()).status).toBe(503);
});
it("returns only pending uploads even if an older backend includes rejected evidence", async () => {
  client.rpc.mockImplementation(async name => ({data: name === "get_ranked_upload_reviews"
    ? [rankedUpload, {...rankedUpload, id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee", state: "rank_rejected",
      rejection_reason: "incorrect_exercise", review_note: "Incorrect exercise or progression"}]
    : {}, error: null}));
  const response = await GET();
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(await response.json()).toEqual([rankedUpload]);
});
it("private preview pins the ranking kind and returns only a safe expiring R2 URL", async () => {
  const result = await preview(request({upload_id: rankedUpload.id, review_kind: "safety", object_key: "forged"}));
  expect(result.status).toBe(200); expect(await result.json()).toEqual(privatePreview);
  expect(result.headers.get("cache-control")).toBe("private, no-store");
  expect(client.functions.invoke).toHaveBeenCalledWith("review-upload-media", {body: {upload_id: rankedUpload.id, review_kind: "ranking"}});
  const pathStyle = {...privatePreview, url: "https://0123456789abcdef0123456789abcdef.r2.cloudflarestorage.com/zelos-supabase-staging/clip?X-Amz-Signature=test"};
  client.functions.invoke.mockResolvedValue({data: pathStyle, error: null});
  expect(await (await preview(request({upload_id: rankedUpload.id}))).json()).toEqual(pathStyle);
  for (const url of ["javascript:alert(1)", "http://0123456789abcdef0123456789abcdef.r2.cloudflarestorage.com/clip",
    "https://media.zelos.club/clip", "https://0123456789abcdef0123456789abcdef.r2.cloudflarestorage.com.attacker.test/clip",
    "https://another-bucket.0123456789abcdef0123456789abcdef.r2.cloudflarestorage.com/clip",
    "https://zelos-supabase-staging.0123456789abcdef0123456789abcdef.r2.cloudflarestorage.com.attacker.test/clip",
    "https://user:password@0123456789abcdef0123456789abcdef.r2.cloudflarestorage.com/clip"]) {
    client.functions.invoke.mockResolvedValue({data: {...privatePreview, url}, error: null});
    const failure = await preview(request({upload_id: rankedUpload.id}));
    expect(failure.status).toBe(503); expect(await failure.text()).not.toContain(url);
  }
});
it("returns safe no-store conflicts and temporary failures without leaking backend details", async () => {
  client.rpc.mockImplementation(async name => name === "resolve_ranked_upload_review"
    ? {error: {code: "40001", message: "rank_review_conflict"}} : {data: {}, error: null});
  const conflict = await decide(request(decision)); expect(conflict.status).toBe(409);
  expect(await conflict.text()).toContain("Refresh the queue");
  client.functions.invoke.mockRejectedValue(new Error("private credentials SQL error"));
  const unavailable = await preview(request({upload_id: rankedUpload.id}));
  expect(unavailable.status).toBe(503); expect(await unavailable.text()).not.toContain("private credentials");
  expect(unavailable.headers.get("cache-control")).toBe("private, no-store");
});
it.each([
  ["hold_too_long", "more than 6 seconds", "trim it in the app and upload again"],
  ["hold_too_short", "claimed hold plus 1 extra second", "request a complete clip"],
])("explains %s failures with a safe actionable response", async (code, explanation, action) => {
  client.rpc.mockImplementation(async name => name === "resolve_ranked_upload_review"
    ? {error: {code: "22023", message: code, details: "private object key and credentials"}}
    : {data: {}, error: null});
  const response = await decide(request({...decision, approve: true, reason_code: null, rule_ids: []}));
  expect(response.status).toBe(400);
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  const body = await response.text();
  expect(body).toContain(explanation);
  expect(body).toContain(action);
  expect(body).not.toContain("private object key");
  expect(body).not.toContain("credentials");
});
