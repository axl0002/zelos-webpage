import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { NextResponse } from "next/server";

const mocks = vi.hoisted(() => ({ requireAdmin: vi.fn(), redirect: vi.fn() }));
vi.mock("../src/lib/require-admin", () => ({ requireAdmin: mocks.requireAdmin }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
import AdminHome from "../src/app/admin/page";
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

it("offers retry instead of sending a signed-in admin to login during an outage", async () => {
  mocks.requireAdmin.mockResolvedValue({ response: NextResponse.json({}, { status: 503 }) });
  render(await AdminHome());
  expect(screen.getByRole("alert").textContent).toContain("temporarily unavailable");
  expect(screen.getByRole("link", { name: "Try again" }).getAttribute("href")).toBe("/admin");
  expect(mocks.redirect).not.toHaveBeenCalled();
});

it.each([
  [401, "/admin/login"], [403, "/admin/login?error=access"],
])("still redirects authentication/authorization failure %i", async (status, destination) => {
  mocks.requireAdmin.mockResolvedValue({ response: NextResponse.json({}, { status }) });
  mocks.redirect.mockImplementation(() => { throw new Error("redirect"); });
  await expect(AdminHome()).rejects.toThrow("redirect");
  expect(mocks.redirect).toHaveBeenCalledWith(destination);
});
