import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
const mocks = vi.hoisted(() => ({
  auth: { signInWithPassword: vi.fn(), signInWithOtp: vi.fn(), verifyOtp: vi.fn(), signOut: vi.fn() },
  rpc: vi.fn(),
  replace: vi.fn(),
  refresh: vi.fn(),
}));
vi.mock("../src/lib/supabase/client", () => ({ browserClient: () => mocks }));
vi.mock("next/navigation", () => ({ useRouter: () => mocks }));
import Login from "../src/app/admin/login/page";
beforeEach(() => {
  vi.resetAllMocks();
  mocks.auth.signInWithPassword.mockResolvedValue({ error: null });
  mocks.auth.signInWithOtp.mockResolvedValue({error: null});
  mocks.auth.verifyOtp.mockResolvedValue({error: null});
  mocks.auth.signOut.mockResolvedValue({error: null});
  mocks.rpc.mockResolvedValue({ error: null });
  window.history.replaceState({}, "", "/admin/login");
});
afterEach(() => {cleanup(); vi.useRealTimers();});
async function submit() {
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", {name: "Sign in with password"}));
  await user.type(screen.getByLabelText("Email address"), "admin@example.test");
  await user.type(screen.getByLabelText("Password"), "test-password");
  await user.click(screen.getByRole("button", { name: "Sign in" }));
}
it("signs in using password and checks admin role before navigation", async () => {
  render(<Login />);
  await submit();
  expect(screen.getByLabelText("Password").getAttribute("type")).toBe("password");
  await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith("/admin"));
  expect(mocks.auth.signInWithPassword).toHaveBeenCalledWith({
    email: "admin@example.test",
    password: "test-password",
  });
  expect(mocks.rpc).toHaveBeenCalledWith("admin_rank_review_context");
});

async function sendCode() {
  fireEvent.change(screen.getByLabelText("Email address"), {target: {value: "  admin@example.test  "}});
  fireEvent.submit(screen.getByRole("button", {name: "Send sign-in code"}).closest("form")!);
  await screen.findByLabelText("Sign-in code");
}
async function verifyCode() {
  fireEvent.change(screen.getByLabelText("Sign-in code"), {target: {value: "123 456"}});
  fireEvent.click(screen.getByRole("button", {name: "Verify code and sign in"}));
}
it("sends no email on load and requests a code only for an existing account after submission", async () => {
  render(<Login />);
  expect(mocks.auth.signInWithOtp).not.toHaveBeenCalled();
  expect(screen.queryByLabelText("Password")).toBeNull();
  expect(screen.getByLabelText("Email address")).toHaveProperty("value", "");
  await sendCode();
  expect(mocks.auth.signInWithOtp).toHaveBeenCalledExactlyOnceWith({email: "admin@example.test", options: {shouldCreateUser: false}});
  expect(screen.getByLabelText("Email address")).toHaveProperty("readOnly", true);
  expect(screen.getByRole("button", {name: "Resend code in 60s"})).toHaveProperty("disabled", true);
  expect(mocks.rpc).not.toHaveBeenCalled();
});
it("verifies the email code then checks admin access before navigating", async () => {
  render(<Login />); await sendCode(); await verifyCode();
  await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith("/admin"));
  expect(mocks.auth.verifyOtp).toHaveBeenCalledExactlyOnceWith({email: "admin@example.test", token: "123456", type: "email"});
  expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith("admin_rank_review_context");
  expect(mocks.refresh).toHaveBeenCalledOnce();
});
it("clears an unauthorized email-code session locally", async () => {
  mocks.rpc.mockResolvedValue({error: {code: "42501", message: "private database detail"}});
  render(<Login />); await sendCode(); await verifyCode();
  expect(await screen.findByRole("alert")).toHaveProperty("textContent", "This account does not have admin access. Use your assigned admin account.");
  expect(mocks.auth.signOut).toHaveBeenCalledExactlyOnceWith({scope: "local"});
  expect(mocks.replace).not.toHaveBeenCalled();
});
it.each(["otp_expired", "invalid_credentials"])("shows a custom message for %s, keeps code retry possible and never queries admin data", async code => {
  mocks.auth.verifyOtp.mockResolvedValue({error: {status: 403, code, message: "internal auth detail"}});
  render(<Login />); await sendCode(); await verifyCode();
  expect(await screen.findByRole("alert")).toHaveProperty("textContent", "This code is invalid or has expired. Try the latest code or request a new one.");
  expect(mocks.rpc).not.toHaveBeenCalled(); expect(mocks.replace).not.toHaveBeenCalled();
  mocks.auth.verifyOtp.mockResolvedValue({error: null});
  fireEvent.change(screen.getByLabelText("Sign-in code"), {target: {value: "654321"}});
  fireEvent.click(screen.getByRole("button", {name: "Verify code and sign in"}));
  await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith("/admin"));
});
it("enforces resend cooldown without auto-sending and invalidates old code when changing email", async () => {
  vi.useFakeTimers(); render(<Login />);
  fireEvent.change(screen.getByLabelText("Email address"), {target: {value: "admin@example.test"}});
  await act(async () => {fireEvent.click(screen.getByRole("button", {name: "Send sign-in code"}));});
  fireEvent.click(screen.getByRole("button", {name: "Resend code in 60s"})); expect(mocks.auth.signInWithOtp).toHaveBeenCalledOnce();
  await act(async () => {vi.advanceTimersByTime(60_000);});
  expect(mocks.auth.signInWithOtp).toHaveBeenCalledOnce();
  await act(async () => {fireEvent.click(screen.getByRole("button", {name: "Resend code"}));});
  expect(mocks.auth.signInWithOtp).toHaveBeenCalledTimes(2);
  fireEvent.change(screen.getByLabelText("Sign-in code"), {target: {value: "123456"}});
  fireEvent.click(screen.getByRole("button", {name: "Change email"}));
  expect(screen.queryByLabelText("Sign-in code")).toBeNull();
  expect(screen.getByLabelText("Email address")).toHaveProperty("readOnly", false);
  expect(screen.getByRole("button", {name: "Send code in 60s"})).toHaveProperty("disabled", true);
  fireEvent.change(screen.getByLabelText("Email address"), {target: {value: "other@example.test"}});
  await act(async () => {vi.advanceTimersByTime(60_000);});
  await act(async () => {fireEvent.click(screen.getByRole("button", {name: "Send sign-in code"}));});
  expect(mocks.auth.signInWithOtp).toHaveBeenLastCalledWith({email: "other@example.test", options: {shouldCreateUser: false}});
  expect(screen.getByLabelText("Sign-in code")).toHaveProperty("value", "");
});
it("prevents duplicate sends while the first request is pending", async () => {
  let resolve!: (value: {error: null}) => void;
  mocks.auth.signInWithOtp.mockReturnValue(new Promise(value => {resolve = value;}));
  render(<Login />); fireEvent.change(screen.getByLabelText("Email address"), {target: {value: "admin@example.test"}});
  const form = screen.getByRole("button", {name: "Send sign-in code"}).closest("form")!;
  fireEvent.submit(form); fireEvent.submit(form); expect(mocks.auth.signInWithOtp).toHaveBeenCalledOnce();
  await act(async () => {resolve({error: null});});
});
it.each([
  [{status: 429, code: "over_email_send_rate_limit"}, "Too many code requests. Please wait before trying again."],
  [{status: 400, code: "otp_disabled"}, "Could not send a code. Check your email and use an existing Zelos account."],
  [{status: 503}, "Could not connect. Please try again."],
])("sanitizes send failures %j", async (error, message) => {
  mocks.auth.signInWithOtp.mockResolvedValue({error: {...error, message: "secret"}});
  render(<Login />); fireEvent.change(screen.getByLabelText("Email address"), {target: {value: "admin@example.test"}});
  fireEvent.click(screen.getByRole("button", {name: "Send sign-in code"}));
  expect(await screen.findByRole("alert")).toHaveProperty("textContent", message);
  expect(screen.queryByLabelText("Sign-in code")).toBeNull(); expect(mocks.rpc).not.toHaveBeenCalled();
});
it("rolls the local session back if the post-auth admin check throws", async () => {
  mocks.rpc.mockRejectedValue(new Error("secret network detail"));
  render(<Login />); await sendCode(); await verifyCode();
  expect(await screen.findByRole("alert")).toHaveProperty("textContent", "Could not connect. Please try again.");
  expect(mocks.auth.signOut).toHaveBeenCalledExactlyOnceWith({scope: "local"}); expect(mocks.replace).not.toHaveBeenCalled();
});
it.each([
  [{status: 429}, "Too many attempts. Please wait before trying again."],
  [{status: 0}, "Could not connect. Please try again."],
])("sanitizes verification failure %j without fetching admin data", async (error, message) => {
  mocks.auth.verifyOtp.mockResolvedValue({error: {...error, message: "private auth detail"}});
  render(<Login />); await sendCode(); await verifyCode();
  expect(await screen.findByRole("alert")).toHaveProperty("textContent", message);
  expect(mocks.rpc).not.toHaveBeenCalled(); expect(mocks.replace).not.toHaveBeenCalled();
});
it("allows an explicit retry after a network send failure and never retries automatically", async () => {
  mocks.auth.signInWithOtp.mockRejectedValueOnce(new Error("private network detail"));
  render(<Login />); fireEvent.change(screen.getByLabelText("Email address"), {target: {value: "admin@example.test"}});
  fireEvent.click(screen.getByRole("button", {name: "Send sign-in code"}));
  expect(await screen.findByRole("alert")).toHaveProperty("textContent", "Could not connect. Please try again.");
  expect(mocks.auth.signInWithOtp).toHaveBeenCalledOnce();
  fireEvent.click(screen.getByRole("button", {name: "Send sign-in code"}));
  await screen.findByLabelText("Sign-in code"); expect(mocks.auth.signInWithOtp).toHaveBeenCalledTimes(2);
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
