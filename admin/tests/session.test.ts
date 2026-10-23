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
function pageRequest(path: string, headers: Record<string, string> = {}) {
  return new NextRequest(`http://localhost:3004${path}`, {headers: {
    cookie: [...store.values].map(([name, value]) => `${name}=${value}`).join("; "),
    ...headers,
  }});
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

it.each(["/admin", "/admin/", "/admin/ranked-uploads", "/admin/ranking-flags", "/admin/reports", "/admin/reports/legacy", "/admin/users", "/admin/safety", "/admin/scoring-lab", "/admin/unknown"])(
  "redirects signed-out %s before returning HTML or allowing the workspace render", async path => {
    const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
    const response = await middleware(pageRequest(path));
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("http://localhost:3004/admin/login");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("x-middleware-next")).toBeNull();
    expect(await response.text()).not.toContain("Admin workspace");
    expect(fetch).not.toHaveBeenCalled();
  },
);

it("also gates signed-out RSC and prefetch requests", async () => {
  vi.stubGlobal("fetch", vi.fn());
  const response = await middleware(pageRequest("/admin/users?_rsc=test", {rsc: "1", "next-router-prefetch": "1"}));
  expect(response.status).toBe(307);
  expect(response.headers.get("x-middleware-next")).toBeNull();
});

it.each(["/admin/login", "/admin/login/", "/admin/auth/callback?code=test", "/admin/api/review", "/admin/api/review-counts", "/admin/api/auth/logout"])(
  "keeps login/callback/API behavior reachable on %s", async path => {
    vi.stubGlobal("fetch", vi.fn());
    const response = await middleware(pageRequest(path));
    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
    expect(response.headers.get("x-middleware-next")).toBe("1");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  },
);

it("rejects a forged session cookie after verifying identity", async () => {
  seed(session());
  const fetch = vi.fn(async (input: string) => {
    expect(input).toBe(`${project}/auth/v1/user`);
    return Response.json({message: "Invalid JWT", code: "bad_jwt"}, {status: 401});
  });
  vi.stubGlobal("fetch", fetch);
  const response = await middleware(pageRequest("/admin"));
  expect(fetch).toHaveBeenCalledOnce();
  expect(response.status).toBe(307);
  expect(response.headers.get("x-middleware-next")).toBeNull();
});

it("preserves clearing chunked cookies when a revoked refresh token redirects to login", async () => {
  seed(session(Math.floor(Date.now() / 1000) - 60, true));
  const chunks = store.values.size;
  vi.stubGlobal("fetch", vi.fn(async (input: string) => {
    expect(input).toBe(`${project}/auth/v1/token?grant_type=refresh_token`);
    return Response.json({message: "Refresh token not found", code: "refresh_token_not_found"}, {status: 400});
  }));
  const response = await middleware(pageRequest("/admin"));
  expect(response.status).toBe(307);
  const cleared = response.cookies.getAll().filter(cookie => cookie.name.startsWith(cookieName));
  expect(cleared).toHaveLength(chunks);
  for (const cookie of cleared) {
    expect(cookie.maxAge).toBe(0);
    expect(cookie.path).toBe("/admin");
  }
});

it.each([429, 503])("withholds the workspace during Auth HTTP %i without clearing a valid session", async status => {
  seed(session());
  vi.stubGlobal("fetch", vi.fn(async () => Response.json({message: "Temporarily unavailable"}, {status})));
  const request = pageRequest("/admin/reports");
  const response = await middleware(request);
  expect(response.status).toBe(503);
  expect(response.headers.get("location")).toBeNull();
  expect(response.headers.get("x-middleware-next")).toBeNull();
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(response.cookies.getAll()).toHaveLength(0);
  expect(request.cookies.getAll().length).toBeGreaterThan(0);
  expect(await response.text()).not.toContain("Admin workspace");
});

it("continues authenticated page requests with verified identity and refreshed cookies", async () => {
  seed(session(Math.floor(Date.now() / 1000) - 60, true));
  const refreshed = session();
  const fetch = vi.fn(async (input: string) => {
    if (input === `${project}/auth/v1/token?grant_type=refresh_token`) return Response.json(refreshed);
    expect(input).toBe(`${project}/auth/v1/user`);
    return Response.json(user);
  });
  vi.stubGlobal("fetch", fetch);
  const response = await middleware(pageRequest("/admin/ranked-uploads"));
  expect(response.status).toBe(200);
  expect(response.headers.get("x-middleware-next")).toBe("1");
  expect(response.cookies.getAll().length).toBeGreaterThan(0);
  expect(response.headers.get("cache-control")).toBe("private, no-store");
});

it.each(["/scoring", "/profile/11111111-1111-4111-8111-111111111111"])("protects public dynamic scripts at %s without any session lookup", async path => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "");
  const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
  const response = await middleware(pageRequest(path));
  expect(response.status).toBe(200);
  expect(response.headers.get("x-middleware-next")).toBe("1");
  expect(response.headers.get("content-security-policy")).toContain("'strict-dynamic'");
  expect(fetch).not.toHaveBeenCalled();
});

it("generates a fresh script nonce and overwrites attacker-supplied request policy headers", async () => {
  const supplied = {"x-nonce": "attacker-nonce", "content-security-policy": "script-src * 'unsafe-inline'"};
  const first = await middleware(pageRequest("/admin/login", supplied));
  const second = await middleware(pageRequest("/admin/login", supplied));
  const policy = first.headers.get("content-security-policy")!;
  const nonce = policy.match(/'nonce-([^']+)'/)?.[1];
  expect(nonce).toBeTruthy();
  expect(first.headers.get("x-middleware-request-x-nonce")).toBe(nonce);
  expect(first.headers.get("x-middleware-request-content-security-policy")).toBe(policy);
  expect(policy).not.toContain("attacker");
  expect(policy).not.toContain("script-src *");
  expect(policy.split(";").find(d => d.trim().startsWith("img-src"))).toContain("https://*.r2.cloudflarestorage.com");
  expect(policy.split(";").find(d => d.trim().startsWith("script-src"))).not.toContain("unsafe-inline");
  expect(policy).not.toBe(second.headers.get("content-security-policy"));
});
