import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { NextResponse } from "next/server";
const mocks = vi.hoisted(() => ({path: "/admin", replace: vi.fn(), refresh: vi.fn(), requireAdmin: vi.fn(), redirect: vi.fn(), notFound: vi.fn()}));
vi.mock("next/navigation", () => ({usePathname: () => mocks.path, useRouter: () => mocks, redirect: mocks.redirect, notFound: mocks.notFound}));
vi.mock("next/link", () => ({default: ({children, prefetch: _prefetch, ...props}: React.PropsWithChildren<Record<string, unknown>>) => <a {...props}>{children}</a>}));
vi.mock("../src/lib/require-admin", () => ({requireAdmin: mocks.requireAdmin}));
import WorkspaceLayout from "../src/app/admin/(workspace)/layout";
import AdminWorkspace from "../src/components/admin-workspace";
import WorkspaceLoading from "../src/app/admin/(workspace)/loading";
import WorkspaceError from "../src/app/admin/(workspace)/error";
import WorkspaceNotFound from "../src/app/admin/(workspace)/not-found";
import MissingAdminPage from "../src/app/admin/(workspace)/[...missing]/page";
import AdminHome from "../src/app/admin/(workspace)/page";
import RankedUploads from "../src/app/admin/(workspace)/ranked-uploads/page";
import RankingFlags from "../src/app/admin/(workspace)/ranking-flags/page";
import Reports from "../src/app/admin/(workspace)/reports/page";
import Safety from "../src/app/admin/(workspace)/safety/page";
import Users from "../src/app/admin/(workspace)/users/page";
import ScoringLab from "../src/app/admin/(workspace)/scoring-lab/page";
import FeedLab from "../src/app/admin/(workspace)/feed-lab/page";
import Analytics from "../src/app/admin/(workspace)/analytics/page";
import {adminDestinations} from "../src/components/admin-workspace";
const pages = [AdminHome, RankedUploads, RankingFlags, Reports, Safety, Users, ScoringLab, FeedLab, Analytics];
const routes = adminDestinations.map((route, index) => ({...route, page: pages[index]}));
beforeEach(() => {
  vi.resetAllMocks(); mocks.path = "/admin";
  mocks.requireAdmin.mockResolvedValue({context: {boards: []}, user: {email: "admin@example.test"}});
  vi.stubGlobal("fetch", vi.fn(async (url: string) => ({ok: true, json: async () => url === "/admin/api/review-counts/v2" ? {current_reports:0,legacy_reports:0,user_reports:0,ranking_flags:0,ranked_uploads:0,upload_safety:0} : url.startsWith("/admin/api/review?")
    ? {items: [], stats: {pending: 0, approved: 0, skipped: 0}} : []})));
});
afterEach(() => {cleanup(); vi.unstubAllGlobals();});
function expectNavigation(active: string | null) {
  const nav = screen.getByRole("navigation", {name: "Admin navigation"});
  expect(within(nav).getAllByRole("link")).toHaveLength(adminDestinations.length);
  for (const {href, label} of adminDestinations) {
    const link = within(nav).getByRole("link", {name: label});
    expect(link.getAttribute("href")).toBe(href);
    expect(link.getAttribute("aria-current")).toBe(href === active ? "page" : null);
  }
  expect(screen.getAllByRole("main")).toHaveLength(1);
  expect(screen.getAllByRole("complementary")).toHaveLength(1);
  expect(screen.getByRole("button", {name: "Sign out"})).toBeTruthy();
  for (const name of [/Scoring guide/, /Zelos website/]) {
    const link = screen.getByRole("link", {name});
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toContain("noopener");
  }
}
it.each(routes)("keeps one complete navigation shell on $href, including empty queue state", async ({href, label, page}) => {
  mocks.path = href;
  render(await WorkspaceLayout({children: await page()}));
  await screen.findByRole("heading", {name: label});
  await waitFor(() => expect(screen.queryByText(/Loading (reports|flags|ranked uploads|review queue)/)).toBeNull());
  expectNavigation(href);
  // The mock is not React's request-scoped cache; both boundaries still check.
  expect(mocks.requireAdmin).toHaveBeenCalledTimes(2);
});
it.each(routes)("preserves all navigation links while $href loads, fails or is missing", ({href}) => {
  mocks.path = href;
  const {rerender} = render(<AdminWorkspace><WorkspaceLoading /></AdminWorkspace>);
  expect(screen.getByRole("status").textContent).toContain("Loading workspace");
  expectNavigation(href);
  const sidebar = screen.getByRole("complementary");
  const reset = vi.fn();
  rerender(<AdminWorkspace><WorkspaceError error={new Error("private SQL/access token detail")} reset={reset} /></AdminWorkspace>);
  expectNavigation(href); expect(screen.queryByText(/private SQL/)).toBeNull();
  fireEvent.click(screen.getByRole("button", {name: "Try again"})); expect(reset).toHaveBeenCalledOnce();
  rerender(<AdminWorkspace><WorkspaceNotFound /></AdminWorkspace>);
  expectNavigation(href); expect(screen.getByRole("complementary")).toBe(sidebar);
  expect(screen.getByRole("link", {name: "Back to exercise review"}).getAttribute("href")).toBe("/admin");
});
it.each(routes)("withholds shell and page during $href authorization service outages", async ({href, page}) => {
  mocks.path = href; mocks.requireAdmin.mockResolvedValue({response: NextResponse.json({}, {status: 503})});
  render(await WorkspaceLayout({children: await page()}));
  expect(screen.queryByRole("complementary")).toBeNull();
  expect(screen.queryByRole("navigation", {name: "Admin navigation"})).toBeNull();
  expect(screen.getByRole("alert").textContent).toContain("temporarily unavailable");
  expect(screen.getByRole("link", {name: "Try again"}).getAttribute("href")).toBe("/admin");
  expect(fetch).not.toHaveBeenCalled();
  expect(mocks.redirect).not.toHaveBeenCalled();
});
it.each(routes)("retains server authentication and authorization guards on $href", async ({page}) => {
  mocks.redirect.mockImplementation(() => {throw new Error("redirect");});
  for (const [status, destination] of [[401, "/admin/login"], [403, "/admin/login?error=access"]] as const) {
    mocks.requireAdmin.mockResolvedValue({response: NextResponse.json({}, {status})});
    await expect(page()).rejects.toThrow("redirect"); expect(mocks.redirect).toHaveBeenLastCalledWith(destination);
  }
});
it("retains the navigation DOM while changing workspaces and browser-back path", () => {
  const {rerender} = render(<AdminWorkspace><p>First queue</p></AdminWorkspace>);
  const sidebar = screen.getByRole("complementary");
  for (const path of ["/admin/users", "/admin/reports", "/admin/users", "/admin"]) {
    mocks.path = path; rerender(<AdminWorkspace><p>Queue {path}</p></AdminWorkspace>);
    expectNavigation(path); expect(screen.getByRole("complementary")).toBe(sidebar);
  }
  expect(mocks.replace).not.toHaveBeenCalled(); expect(mocks.refresh).not.toHaveBeenCalled();
});
it("handles unknown admin deep links through authorization and an in-shell not-found state", async () => {
  mocks.notFound.mockImplementation(() => {throw new Error("not found");});
  await expect(MissingAdminPage()).rejects.toThrow("not found");
  mocks.path = "/admin/old-bookmark";
  render(<AdminWorkspace><WorkspaceNotFound /></AdminWorkspace>); expectNavigation(null);
});
it("signs out once from every workspace and retains navigation after a failed logout", async () => {
  let attempts = 0;
  const fetch = vi.fn(async (url: string) => url === "/admin/api/auth/logout" ? {ok: ++attempts > 1} : {ok:true,json:async()=>({current_reports:0,legacy_reports:0,user_reports:0,ranking_flags:0,ranked_uploads:0,upload_safety:0})});
  vi.stubGlobal("fetch", fetch); mocks.path = "/admin/reports";
  render(<AdminWorkspace><p>Report queue</p></AdminWorkspace>);
  fireEvent.click(screen.getByRole("button", {name: "Sign out"}));
  expect(await screen.findByRole("alert")).toHaveProperty("textContent", "Could not sign out. Please try again.");
  expectNavigation("/admin/reports"); expect(mocks.replace).not.toHaveBeenCalled();
  const button = screen.getByRole("button", {name: "Sign out"}); fireEvent.click(button); fireEvent.click(button);
  await waitFor(() => expect(mocks.replace).toHaveBeenCalledExactlyOnceWith("/admin/login"));
  expect(fetch.mock.calls.filter(([url]) => url === "/admin/api/auth/logout")).toHaveLength(2); expect(fetch).toHaveBeenLastCalledWith("/admin/api/auth/logout", expect.objectContaining({method: "POST", body: "{}"}));
});

it.each([401, 403])("never returns the layout, children or count provider for rejected access (%i)", async status => {
  mocks.requireAdmin.mockResolvedValue({response: NextResponse.json({}, {status})});
  mocks.redirect.mockImplementation(() => {throw new Error("redirect");});
  await expect(WorkspaceLayout({children: <h1>Private review data</h1>})).rejects.toThrow("redirect");
  expect(mocks.redirect).toHaveBeenCalledWith(status === 401 ? "/admin/login" : "/admin/login?error=access");
  expect(fetch).not.toHaveBeenCalled();
  expect(screen.queryByRole("complementary")).toBeNull();
});

it("waits for authorization before returning any workspace shell or loading state", async () => {
  let resolve!: (value: unknown) => void;
  mocks.requireAdmin.mockReturnValue(new Promise(done => {resolve = done;}));
  let settled = false;
  const layout = WorkspaceLayout({children: <WorkspaceLoading />});
  void layout.then(() => {settled = true;});
  await Promise.resolve();
  expect(settled).toBe(false);
  expect(fetch).not.toHaveBeenCalled();
  resolve({context: {boards: []}, user: {id: "admin"}});
  render(await layout);
  expectNavigation("/admin");
  expect(screen.getByRole("status").textContent).toContain("Loading workspace");
});

it("cannot return private children if session verification throws", async () => {
  mocks.requireAdmin.mockRejectedValue(new Error("provider unavailable"));
  await expect(WorkspaceLayout({children: <h1>Private review data</h1>})).rejects.toThrow("provider unavailable");
  expect(fetch).not.toHaveBeenCalled();
});
