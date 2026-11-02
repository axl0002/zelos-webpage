/// <reference types="vite/client" />
// @vitest-environment node
import {beforeEach, expect, it, vi} from "vitest";
import {NextRequest} from "next/server";

const client = vi.hoisted(() => ({auth: {getUser: vi.fn(), signOut: vi.fn()}, rpc: vi.fn(), functions: {invoke: vi.fn()}}));
vi.mock("../src/lib/supabase/server", () => ({serverClient: async () => client}));
type Route = {GET?: (request: NextRequest) => Promise<Response>; POST?: (request: NextRequest) => Promise<Response>};
const modules = import.meta.glob<Route>("../src/app/admin/api/**/route.ts", {eager: true});
const routes = Object.entries(modules).map(([file, route]) => ({path: file.replace("../src/app", "").replace("/route.ts", ""), route}));
const protectedRoutes = routes.filter(({path}) => path !== "/admin/api/auth/logout");
const origin = "https://zelos.club";
const request = (path: string, method: string, from = origin, type = "application/json") => new NextRequest(origin + path, {
  method, headers: {origin: from, "content-type": type}, ...(method === "POST" ? {body: "{}"} : {}),
});
beforeEach(() => {vi.resetAllMocks(); vi.stubEnv("ADMIN_ORIGIN", origin);});

it("covers every protected endpoint, including future additions", () => {
  expect(protectedRoutes).toHaveLength(32);
  expect(protectedRoutes.some(({path})=>path==="/admin/api/ranking-flags/correction/v2")).toBe(true);
  expect(protectedRoutes.some(({path})=>path==="/admin/api/ranking-flags/group-context")).toBe(true);
  expect(protectedRoutes.some(({path})=>path==="/admin/api/ranking-flags/decision/group/v1")).toBe(true);
  expect(routes.filter(({route}) => route.POST).length).toBeGreaterThan(10);
});

it.each(protectedRoutes)("rejects missing sessions on $path before reading data or signing media", async ({path, route}) => {
  client.auth.getUser.mockResolvedValue({data: {user: null}, error: null});
  for (const method of ["GET", "POST"] as const) if (route[method]) {
    expect((await route[method](request(path, method))).status).toBe(401);
  }
  expect(client.rpc).not.toHaveBeenCalled();
  expect(client.functions.invoke).not.toHaveBeenCalled();
});

it.each(protectedRoutes)("rejects ordinary users with forged admin metadata on $path", async ({path, route}) => {
  client.auth.getUser.mockResolvedValue({data: {user: {id: "athlete", user_metadata: {admin: true, role: "admin"}}}, error: null});
  client.rpc.mockResolvedValue({data: null, error: {code: "42501", message: "admin_required"}});
  for (const method of ["GET", "POST"] as const) if (route[method]) {
    expect((await route[method](request(path, method))).status).toBe(403);
  }
  expect(client.rpc.mock.calls.every(([name]) => name === "admin_rank_review_context")).toBe(true);
  expect(client.functions.invoke).not.toHaveBeenCalled();
});

it.each(routes.filter(({route}) => route.POST))("rejects cross-site and form mutations on $path before authentication", async ({path, route}) => {
  expect((await route.POST!(request(path, "POST", "https://other.test"))).status).toBe(403);
  expect((await route.POST!(request(path, "POST", origin, "text/plain"))).status).toBe(403);
  expect(client.auth.getUser).not.toHaveBeenCalled();
  expect(client.auth.signOut).not.toHaveBeenCalled();
  expect(client.rpc).not.toHaveBeenCalled();
});

it("reports failed logout safely rather than claiming the session was cleared", async () => {
  const logout = routes.find(({path}) => path === "/admin/api/auth/logout")!.route.POST!;
  for (const throws of [false, true]) {
    if (throws) client.auth.signOut.mockRejectedValueOnce(new Error("private auth credential"));
    else client.auth.signOut.mockResolvedValueOnce({error: {message: "private auth credential"}});
    const response = await logout(request("/admin/api/auth/logout", "POST"));
    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(await response.text()).not.toContain("private auth credential");
  }
  client.auth.signOut.mockResolvedValueOnce({error: null});
  const response = await logout(request("/admin/api/auth/logout", "POST"));
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ok: true});
});
