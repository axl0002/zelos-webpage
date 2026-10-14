import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
const mocks = vi.hoisted(() => ({
  auth: { signInWithPassword: vi.fn(), signOut: vi.fn() },
  rpc: vi.fn(),
  replace: vi.fn(),
  refresh: vi.fn(),
}));
vi.mock("../src/lib/supabase/client", () => ({ browserClient: () => mocks }));
vi.mock("next/navigation", () => ({ useRouter: () => mocks }));
import Login from "../src/app/login/page";
beforeEach(() => {
  vi.resetAllMocks();
  mocks.auth.signInWithPassword.mockResolvedValue({ error: null });
  mocks.rpc.mockResolvedValue({ error: null });
});
afterEach(cleanup);
async function submit() {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText("Email address"), "admin@example.test");
  await user.type(screen.getByLabelText("Password"), "test-password");
  await user.click(screen.getByRole("button", { name: "Sign in" }));
}
it("signs in using password and checks admin role before navigation", async () => {
  render(<Login />);
  expect(screen.getByLabelText("Password").getAttribute("type")).toBe(
    "password",
  );
  await submit();
  await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith("/"));
  expect(mocks.auth.signInWithPassword).toHaveBeenCalledWith({
    email: "admin@example.test",
    password: "test-password",
  });
  expect(mocks.rpc).toHaveBeenCalledWith("admin_rank_review_context");
});
it("failed login does not query admin content", async () => {
  mocks.auth.signInWithPassword.mockResolvedValue({ error: { status: 400 } });
  render(<Login />);
  await submit();
  expect(await screen.findByRole("alert")).toHaveProperty(
    "textContent",
    "Could not sign in. Check your email and password.",
  );
  expect(mocks.rpc).not.toHaveBeenCalled();
  expect(mocks.replace).not.toHaveBeenCalled();
});
it("valid non-admin credentials do not open the dashboard", async () => {
  mocks.rpc.mockResolvedValue({ error: { code: "42501" } });
  render(<Login />);
  await submit();
  await waitFor(() =>
    expect(mocks.auth.signOut).toHaveBeenCalledWith({ scope: "local" }),
  );
  expect(mocks.replace).not.toHaveBeenCalled();
  expect(await screen.findByRole("alert")).toHaveProperty(
    "textContent",
    "This account does not have admin access. Use your assigned admin account.",
  );
});
