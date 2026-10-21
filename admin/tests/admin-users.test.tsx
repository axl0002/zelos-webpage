import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import AdminUsersDashboard from "../src/components/admin-users-dashboard";
const user = {id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", username: "athlete", country: "au", revision: 0,
  is_banned: false, manual_ban: false, can_ban: true, can_unban: false};
afterEach(() => {cleanup(); vi.unstubAllGlobals();});
it.each([false, true])("searches then confirms and refreshes a manual ban removal=%s", async unban => {
  const item = {...user, is_banned: unban, manual_ban: unban, can_ban: !unban, can_unban: unban};
  const fetch = vi.fn(async (path: string) => ({ok: true, json: async () => path.includes("?q=") ? [item] : {ok: true}}));
  vi.stubGlobal("fetch", fetch); render(<AdminUsersDashboard />);
  fireEvent.change(screen.getByLabelText("Username or user ID"), {target: {value: "athlete"}}); fireEvent.click(screen.getByRole("button", {name: "Search users"}));
  await screen.findByRole("heading", {name: "athlete"});
  const button = screen.getByRole("button", {name: unban ? "Remove manual ban" : "Ban user"}) as HTMLButtonElement;
  expect(button.disabled).toBe(true); fireEvent.change(screen.getByLabelText("Action reason"), {target: {value: "Reviewed account history"}}); fireEvent.click(button);
  expect(fetch.mock.calls.filter(([path]) => path.endsWith("/ban"))).toHaveLength(0);
  const confirm = within(screen.getByRole("dialog")).getByRole("button", {name: "Confirm action"}); fireEvent.click(confirm); fireEvent.click(confirm);
  await screen.findByText("Account moderation saved.");
  const calls = (fetch.mock.calls as unknown as [string, RequestInit][]).filter(([path]) => path.endsWith("/ban")); expect(calls).toHaveLength(1);
  expect(JSON.parse(calls[0][1].body as string)).toMatchObject({user_id: user.id, banned: !unban, expected_revision: 0, reason: "Reviewed account history"});
  await waitFor(() => expect(fetch.mock.calls.filter(([path]) => path.includes("?q="))).toHaveLength(2));
});
it("retains reason and retry identity after failure and does not claim success", async () => {
  const fetch = vi.fn(async (path: string) => ({ok: !path.endsWith("/ban"), json: async () => path.includes("?q=") ? [user] : {error: "Please try again."}}));
  vi.stubGlobal("fetch", fetch); render(<AdminUsersDashboard />);
  fireEvent.change(screen.getByLabelText("Username or user ID"), {target: {value: "athlete"}}); fireEvent.click(screen.getByRole("button", {name: "Search users"}));
  await screen.findByRole("heading", {name: "athlete"}); fireEvent.change(screen.getByLabelText("Action reason"), {target: {value: "Repeated abuse"}});
  fireEvent.click(screen.getByRole("button", {name: "Ban user"})); fireEvent.click(screen.getByRole("button", {name: "Confirm action"}));
  await screen.findByRole("alert"); expect(screen.queryByRole("status")).toBeNull();
  fireEvent.click(screen.getByRole("button", {name: "Confirm action"}));
  await waitFor(() => expect(fetch.mock.calls.filter(([path]) => path.endsWith("/ban"))).toHaveLength(2));
  const calls = (fetch.mock.calls as unknown as [string, RequestInit][]).filter(([path]) => path.endsWith("/ban"));
  expect(JSON.parse(calls[0][1].body as string).request_id).toBe(JSON.parse(calls[1][1].body as string).request_id);
});
it("resets pending confirmation when switching accounts and uses the selected user's fresh revision", async () => {
  const second = {...user, id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", username: "second", revision: 4};
  let saved = false;
  const fetch = vi.fn(async (path: string, options?: RequestInit) => {
    if (path.endsWith("/ban")) saved = true;
    return {ok: true, json: async () => path.includes("?q=") ? [user, {...second, revision: saved ? 5 : 4, is_banned: saved, can_ban: !saved, can_unban: saved}] : {ok: true}};
  });
  vi.stubGlobal("fetch", fetch); render(<AdminUsersDashboard />);
  fireEvent.change(screen.getByLabelText("Username or user ID"), {target: {value: "athlete"}}); fireEvent.click(screen.getByRole("button", {name: "Search users"}));
  await screen.findByRole("heading", {name: "athlete"}); fireEvent.change(screen.getByLabelText("Action reason"), {target: {value: "First account reason"}});
  fireEvent.click(screen.getByRole("button", {name: "Ban user"})); fireEvent.click(screen.getByRole("button", {name: "Cancel"}));
  fireEvent.click(screen.getByRole("button", {name: /second.*Active/})); expect((screen.getByLabelText("Action reason") as HTMLTextAreaElement).value).toBe("");
  fireEvent.change(screen.getByLabelText("Action reason"), {target: {value: "Second account reason"}}); fireEvent.click(screen.getByRole("button", {name: "Ban user"}));
  fireEvent.click(screen.getByRole("button", {name: "Confirm action"})); await screen.findByText("Account moderation saved.");
  expect(JSON.parse(fetch.mock.calls.find(([path]) => path.endsWith("/ban"))![1]?.body as string)).toMatchObject({user_id: second.id, expected_revision: 4});
  await screen.findByRole("button", {name: /second.*Banned/});
  fireEvent.change(screen.getByLabelText("Action reason"), {target: {value: "Appeal accepted"}}); fireEvent.click(screen.getByRole("button", {name: "Remove manual ban"}));
  fireEvent.click(screen.getByRole("button", {name: "Confirm action"}));
  await waitFor(() => expect(fetch.mock.calls.filter(([path]) => path.endsWith("/ban"))).toHaveLength(2));
  expect(JSON.parse(fetch.mock.calls.filter(([path]) => path.endsWith("/ban"))[1][1]?.body as string)).toMatchObject({user_id: second.id, expected_revision: 5, banned: false});
});
