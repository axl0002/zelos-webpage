// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { AuthApiError, AuthRetryableFetchError, AuthSessionMissingError } from "@supabase/supabase-js";
const client = vi.hoisted(() => ({ auth: { getUser: vi.fn() }, rpc: vi.fn() }));
vi.mock("../src/lib/supabase/server", () => ({
  serverClient: async () => client,
}));
import { requireAdmin } from "../src/lib/require-admin";
import { GET } from "../src/app/admin/api/review/route";
import { POST as scan } from "../src/app/admin/api/review/scan/route";
import { POST as decide } from "../src/app/admin/api/review/decision/route";
beforeEach(() => {
  vi.resetAllMocks();
  delete process.env.ADMIN_ORIGIN;
});
const request = (
  path: string,
  body: unknown,
  origin = "http://localhost:3004",
) =>
  new NextRequest(`http://localhost:3004/admin/api/${path}`, {
    method: "POST",
    headers: { origin, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
describe("server authorization", () => {
  it("sends an empty optional rejection note to the RPC without inventing a reason", async () => {
    client.auth.getUser.mockResolvedValue({ data: { user: { id: "admin" } }, error: null });
    client.rpc
      .mockResolvedValueOnce({ data: { boards: [] }, error: null })
      .mockResolvedValueOnce({ data: { active: false }, error: null });
    const res = await decide(request("review/decision", {
      post_id: "clip", revision: 1, decision: "skip", board_id: null,
      value: null, note: "", watched: false, replace_current: false,
    }));
    expect(res.status).toBe(200);
    expect(client.rpc).toHaveBeenLastCalledWith("admin_decide_rank_candidate", {
      target_post: "clip", expected_revision: 1, decision: "skip", selected_board: null,
      measured_value: null, review_note: "", watched_video: false, replace_current: false,
    });
  });
  it("retries a temporary identity-check failure before saving an approval once", async () => {
    client.auth.getUser
      .mockResolvedValueOnce({
        data: { user: null },
        error: new AuthRetryableFetchError("fetch failed", 0),
      })
      .mockResolvedValueOnce({ data: { user: { id: "admin" } }, error: null });
    client.rpc
      .mockResolvedValueOnce({ data: { boards: [] }, error: null })
      .mockResolvedValueOnce({ data: { active: true }, error: null });
    const res = await decide(request("review/decision", {
      post_id: "clip", revision: 1, decision: "approve", board_id: "pull-up",
      value: 5, note: "Counted", watched: true, replace_current: false,
    }));
    expect(res.status).toBe(200);
    expect(client.auth.getUser).toHaveBeenCalledTimes(2);
    expect(client.rpc.mock.calls.map(([name]) => name)).toEqual([
      "admin_rank_review_context", "admin_decide_rank_candidate",
    ]);
  });
  it.each([0, 503])("returns service unavailable, not signed out, for persistent auth failure %i", async (status) => {
    client.auth.getUser.mockResolvedValue({
      data: { user: null },
      error: new AuthRetryableFetchError("fetch failed", status),
    });
    const res = await decide(request("review/decision", {}));
    expect(res.status).toBe(503);
    expect((await res.json()).error).toContain("temporarily unavailable");
    expect(client.auth.getUser).toHaveBeenCalledTimes(2);
    expect(client.rpc).not.toHaveBeenCalled();
  });
  it("does not retry rate limits or mislabel them as a missing session", async () => {
    client.auth.getUser.mockResolvedValue({
      data: { user: null }, error: new AuthApiError("Too many requests", 429, "over_request_rate_limit"),
    });
    expect((await requireAdmin()).response?.status).toBe(503);
    expect(client.auth.getUser).toHaveBeenCalledTimes(1);
    expect(client.rpc).not.toHaveBeenCalled();
  });
  it("still rejects a revoked session without retrying or approving", async () => {
    client.auth.getUser.mockResolvedValue({
      data: { user: null }, error: new AuthSessionMissingError(),
    });
    expect((await decide(request("review/decision", {}))).status).toBe(401);
    expect(client.auth.getUser).toHaveBeenCalledTimes(1);
    expect(client.rpc).not.toHaveBeenCalled();
  });
  it("rejects an absent or invalid session before querying the database", async () => {
    client.auth.getUser.mockResolvedValue({
      data: { user: null },
      error: null,
    });
    expect(
      (await GET(new NextRequest("http://localhost:3004/admin/api/review")))
        .status,
    ).toBe(401);
    expect((await scan(request("review/scan", { after: null }))).status).toBe(
      401,
    );
    expect((await decide(request("review/decision", {}))).status).toBe(401);
    expect(client.rpc).not.toHaveBeenCalled();
  });
  it("never trusts admin metadata from a user account", async () => {
    client.auth.getUser.mockResolvedValue({
      data: { user: { id: "tester", user_metadata: { admin: true } } },
      error: null,
    });
    client.rpc.mockResolvedValue({
      data: null,
      error: { code: "42501", message: "admin_required" },
    });
    expect((await requireAdmin()).response?.status).toBe(403);
    expect(client.rpc).toHaveBeenCalledWith("admin_rank_review_context");
  });
  it("blocks cross-site mutations even with a valid cookie", async () => {
    expect(
      (await scan(request("review/scan", { after: null }, "https://evil.test")))
        .status,
    ).toBe(403);
    expect(
      (await decide(request("review/decision", {}, "https://evil.test")))
        .status,
    ).toBe(403);
    expect(client.auth.getUser).not.toHaveBeenCalled();
  });
  it("forwards only validated decision fields using the authenticated client", async () => {
    client.auth.getUser.mockResolvedValue({
      data: { user: { id: "admin" } },
      error: null,
    });
    client.rpc
      .mockResolvedValueOnce({ data: { boards: [] }, error: null })
      .mockResolvedValueOnce({ data: { active: false }, error: null });
    const res = await decide(
      request("review/decision", {
        post_id: "clip",
        revision: 2,
        decision: "approve",
        board_id: "pull-up",
        value: 5,
        note: "Counted",
        watched: true,
        replace_current: false,
        reviewer_id: "forged",
      }),
    );
    expect(res.status).toBe(200);
    expect(client.rpc.mock.calls[1]).toEqual([
      "admin_decide_rank_candidate",
      {
        target_post: "clip",
        expected_revision: 2,
        decision: "approve",
        selected_board: "pull-up",
        measured_value: 5,
        review_note: "Counted",
        watched_video: true,
        replace_current: false,
      },
    ]);
  });
});
