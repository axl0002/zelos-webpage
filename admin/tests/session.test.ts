// @vitest-environment node
// Exercise the real Supabase SSR clients with mocked HTTP and request cookies.
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createChunks } from "@supabase/ssr";
import { NextRequest } from "next/server";

const store = vi.hoisted(() => ({ values: new Map<string, string>() }));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    getAll: () => [...store.values].map(([name, value]) => ({ name, value })),
    set: (name: string, value: string) => store.values.set(name, value),
  }),
}));
import { middleware } from "../src/middleware";
import { POST as decide } from "../src/app/admin/api/review/decision/route";

const project = "https://obnirsfjxcvyyiocwaii.supabase.co";
const cookieName = "sb-obnirsfjxcvyyiocwaii-auth-token";
const user = { id: "admin", email: "admin@example.test", user_metadata: {} };
function session(expiresAt = Math.floor(Date.now() / 1000) + 3600, large = false) {
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
  return {
    access_token: `${encode({ alg: "HS256", typ: "JWT" })}.${encode({ sub: user.id, exp: expiresAt })}.test-signature`,
    refresh_token: "test-refresh-token",
    expires_at: expiresAt,
    expires_in: 3600,
    token_type: "bearer",
    user: large ? { ...user, user_metadata: { padding: "x".repeat(4000) } } : user,
  };
}
function seed(value: ReturnType<typeof session>) {
  store.values = new Map(createChunks(cookieName,
    `base64-${Buffer.from(JSON.stringify(value)).toString("base64url")}`,
  ).map(({ name, value }) => [name, value]));
}
function approvalRequest() {
  return new NextRequest("http://localhost:3004/admin/api/review/decision", {
    method: "POST",
    headers: {
      origin: "http://localhost:3004", "content-type": "application/json",
      cookie: [...store.values].map(([name, value]) => `${name}=${value}`).join("; "),
    },
    body: JSON.stringify({
      post_id: "test-clip", revision: 1, decision: "approve", board_id: "pull-up",
      value: 5, note: "Counted", watched: true, replace_current: false,
    }),
  });
}
beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", project);
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "test-public-key");
  vi.stubEnv("ADMIN_ORIGIN", "http://localhost:3004");
  store.values.clear();
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

it("approves with the signed-in cookie after a real SDK transport failure", async () => {
  const signedIn = session();
  seed(signedIn);
  vi.spyOn(console, "error").mockImplementation(() => {});
  let userChecks = 0;
  const fetch = vi.fn(async (input: string, init?: RequestInit) => {
    expect(new Headers(init?.headers).get("authorization")).toBe(`Bearer ${signedIn.access_token}`);
    if (input === `${project}/auth/v1/user`) {
      if (++userChecks === 1) throw new TypeError("fetch failed");
      return Response.json(user);
    }
    if (input === `${project}/rest/v1/rpc/admin_rank_review_context`)
      return Response.json({ user_id: user.id, boards: [] });
    if (input === `${project}/rest/v1/rpc/admin_decide_rank_candidate`)
      return Response.json({ active: true });
    throw new Error(`Unexpected mock request: ${input}`);
  });
  vi.stubGlobal("fetch", fetch);
  const response = await decide(approvalRequest());
  expect(response.status).toBe(200);
  expect(userChecks).toBe(2);
  expect(fetch.mock.calls.filter(([url]) => url.endsWith("/admin_decide_rank_candidate"))).toHaveLength(1);
  expect(store.values.size).toBeGreaterThan(0);
});

it("passes refreshed chunked cookies from middleware to approval and the next browser request", async () => {
  seed(session(Math.floor(Date.now() / 1000) - 60, true));
  expect(store.values.size).toBeGreaterThan(1);
  const refreshed = session();
  let refreshes = 0;
  vi.stubGlobal("fetch", vi.fn(async (input: string, init?: RequestInit) => {
    if (input === `${project}/auth/v1/token?grant_type=refresh_token`) {
      refreshes++;
      expect(JSON.parse(init!.body as string).refresh_token).toBe("test-refresh-token");
      return Response.json(refreshed);
    }
    expect(new Headers(init?.headers).get("authorization")).toBe(`Bearer ${refreshed.access_token}`);
    if (input === `${project}/auth/v1/user`) return Response.json(user);
    if (input === `${project}/rest/v1/rpc/admin_rank_review_context`)
      return Response.json({ user_id: user.id, boards: [] });
    if (input === `${project}/rest/v1/rpc/admin_decide_rank_candidate`)
      return Response.json({ active: true });
    throw new Error(`Unexpected mock request: ${input}`);
  }));
  const request = approvalRequest();
  const response = await middleware(request);
  const originalCookies = new Map(store.values);
  store.values = new Map(request.cookies.getAll().map(({ name, value }) => [name, value]));
  expect((await decide(request)).status).toBe(200);
  const cookies = response.cookies.getAll();
  expect(cookies.length).toBeGreaterThan(0);
  for (const cookie of cookies) {
    expect(cookie.path).toBe("/admin");
    if (cookie.maxAge === 0) originalCookies.delete(cookie.name);
    else originalCookies.set(cookie.name, cookie.value);
  }
  store.values = originalCookies;
  expect((await decide(approvalRequest())).status).toBe(200);
  expect(refreshes).toBe(1);
});
