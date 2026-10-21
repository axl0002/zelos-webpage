// @vitest-environment node
import { beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const client = vi.hoisted(() => ({auth: {getUser: vi.fn()}, rpc: vi.fn()}));
vi.mock("../src/lib/supabase/server", () => ({serverClient: async () => client}));
import { GET } from "../src/app/admin/api/users/route";
import { POST as ban } from "../src/app/admin/api/users/ban/route";
import { POST as action } from "../src/app/admin/api/reports/action/route";
const id = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", key = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const banInput = {user_id: id, banned: true, expected_revision: 0, reason: "Repeated harassment", request_id: key};
const actionInput = {case_id: id, action: "hide", expected_revision: 3, reason: "Review in progress", request_id: key};
function request(body: unknown, origin = "http://localhost:3004") {
  return new NextRequest("http://localhost:3004/admin/api/users/ban", {method: "POST", headers: {origin, "content-type": "application/json"}, body: JSON.stringify(body)});
}
beforeEach(() => {
  vi.resetAllMocks(); delete process.env.ADMIN_ORIGIN;
  client.auth.getUser.mockResolvedValue({data: {user: {id: "admin"}}, error: null});
  client.rpc.mockImplementation(async name => ({data: name === "admin_rank_review_context" ? {boards: []} : [], error: null}));
});
it("requires a session and admin permission for user search and every moderation action", async () => {
  client.auth.getUser.mockResolvedValue({data: {user: null}, error: null});
  for (const response of [await GET(new NextRequest("http://localhost:3004/admin/api/users?q=athlete")), await ban(request(banInput)), await action(request(actionInput))]) {
    expect(response.status).toBe(401); expect(response.headers.get("cache-control")).toBe("private, no-store");
  }
  expect(client.rpc).not.toHaveBeenCalled();
  client.auth.getUser.mockResolvedValue({data: {user: {id}}, error: null});
  client.rpc.mockResolvedValue({error: {code: "42501", message: "admin_required"}});
  expect((await ban(request(banInput))).status).toBe(403);
  expect(client.rpc).toHaveBeenCalledOnce();
});
it("searches using a bounded query and returns only allowlisted public/moderation fields", async () => {
  client.rpc.mockImplementation(async name => ({data: name === "admin_rank_review_context" ? {} : [{id, username: "athlete", country: "au", revision: 0,
    is_banned: false, manual_ban: false, can_ban: true, can_unban: false, email: "secret@example.test", provider: "private"}], error: null}));
  const response = await GET(new NextRequest("http://localhost:3004/admin/api/users?q=%20athlete%20"));
  expect(response.status).toBe(200); expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(JSON.stringify(await response.json())).not.toMatch(/secret|provider|email/);
  expect(client.rpc).toHaveBeenLastCalledWith("admin_search_users", {search_text: "athlete", page_size: 30});
  expect((await GET(new NextRequest("http://localhost:3004/admin/api/users?q=a"))).status).toBe(400);
});
it.each([true, false])("forwards validated ban=%s with revision and retry identity only", async banned => {
  expect((await ban(request({...banInput, banned, is_admin: true, ban_until: "forever"}))).status).toBe(200);
  expect(client.rpc).toHaveBeenLastCalledWith("admin_set_user_ban", {target_user: id, banned, expected_revision: 0, reason: banInput.reason, request_id: key});
});
it.each(["hide", "restore", "delete", "ban"])("resolves %s targets through the report RPC, ignoring forged owners and posts", async value => {
  expect((await action(request({...actionInput, action: value, owner_id: "forged", target_id: "forged"}))).status).toBe(200);
  expect(client.rpc).toHaveBeenLastCalledWith("admin_moderate_safety_case", {target_case: id, action: value, expected_revision: 3, reason: actionInput.reason, request_id: key});
});
it("rejects cross-site mutation, invalid actions, reasons, revisions and retry keys", async () => {
  expect((await ban(request(banInput, "https://evil.test"))).status).toBe(403);
  expect((await action(request(actionInput, "https://evil.test"))).status).toBe(403);
  expect(client.auth.getUser).not.toHaveBeenCalled();
  for (const body of [{...banInput, reason: " "}, {...banInput, expected_revision: -1}, {...banInput, request_id: "bad"}, {...banInput, banned: "true"}]) expect((await ban(request(body))).status).toBe(400);
  for (const body of [{...actionInput, action: "unban"}, {...actionInput, expected_revision: 0}, {...actionInput, reason: "a".repeat(1001)}]) expect((await action(request(body))).status).toBe(400);
  expect(client.rpc.mock.calls.every(([name]) => name === "admin_rank_review_context")).toBe(true);
});
it.each([["40001", "review_conflict", 409], ["42501", "protected_account", 403], ["22023", "action_unavailable", 400], ["unknown", "secret database message", 503]])("sanitizes backend failure %s/%s", async (code, message, status) => {
  client.rpc.mockImplementation(async name => name === "admin_rank_review_context" ? {data: {}, error: null} : {error: {code, message, details: "secret SQL"}});
  const response = await action(request(actionInput)); expect(response.status).toBe(status);
  expect(response.headers.get("cache-control")).toBe("private, no-store"); expect(JSON.stringify(await response.json())).not.toContain("secret");
});
