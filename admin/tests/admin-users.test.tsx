import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import AdminUsersDashboard from "../src/components/admin-users-dashboard";
const user = {id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", username: "athlete", country: "au", revision: 0,
  is_banned: false, manual_ban: false, can_ban: true, can_unban: false};
afterEach(() => {cleanup(); vi.unstubAllGlobals();});
it.each([false, true])("searches then confirms and refreshes a manual ban removal=%s", async unban => {
  const item = {...user, is_banned: unban, manual_ban: unban, can_ban: !unban, can_unban: unban};
  const fetch = vi.fn(async (path: string) => ({ok: true, json: async () => path.includes("?q=") ? [item] : path.includes("/users/clips?") ? {items: [], has_more: false, next_cursor: null} : {ok: true}}));
  vi.stubGlobal("fetch", fetch); render(<AdminUsersDashboard />);
  fireEvent.change(screen.getByLabelText("Username or user ID"), {target: {value: "athlete"}}); fireEvent.click(screen.getByRole("button", {name: "Search users"}));
  await screen.findByRole("heading", {name: "athlete"});
  const button = screen.getByRole("button", {name: unban ? "Remove manual ban" : "Ban user"}) as HTMLButtonElement;
  expect(button.disabled).toBe(true); fireEvent.change(screen.getByLabelText(/^(Action reason|Ban reason)/), {target: {value: "Reviewed account history"}}); fireEvent.click(button);
  if (!unban) {
    expect(screen.getByLabelText("Ban reason (shown to the user)")).toBeTruthy();
    expect(within(screen.getByRole("dialog")).getByText("This reason will be shown to the user.")).toBeTruthy();
  } else {
    expect(screen.getByLabelText("Action reason")).toBeTruthy();
    expect(screen.queryByText("This reason will be shown to the user.")).toBeNull();
  }
  expect(fetch.mock.calls.filter(([path]) => path.endsWith("/ban"))).toHaveLength(0);
  const confirm = within(screen.getByRole("dialog")).getByRole("button", {name: "Confirm action"}); fireEvent.click(confirm); fireEvent.click(confirm);
  await screen.findByText("Account moderation saved.");
  const calls = (fetch.mock.calls as unknown as [string, RequestInit][]).filter(([path]) => path.endsWith("/ban")); expect(calls).toHaveLength(1);
  expect(JSON.parse(calls[0][1].body as string)).toMatchObject({user_id: user.id, banned: !unban, expected_revision: 0, reason: "Reviewed account history", duration_days: null});
  await waitFor(() => expect(fetch.mock.calls.filter(([path]) => path.includes("?q="))).toHaveLength(2));
});
it("retains reason and retry identity after failure and does not claim success", async () => {
  const fetch = vi.fn(async (path: string) => ({ok: !path.endsWith("/ban"), json: async () => path.includes("?q=") ? [user] : path.includes("/users/clips?") ? {items: [], has_more: false, next_cursor: null} : {error: "Please try again."}}));
  vi.stubGlobal("fetch", fetch); render(<AdminUsersDashboard />);
  fireEvent.change(screen.getByLabelText("Username or user ID"), {target: {value: "athlete"}}); fireEvent.click(screen.getByRole("button", {name: "Search users"}));
  await screen.findByRole("heading", {name: "athlete"}); fireEvent.change(screen.getByLabelText(/^(Action reason|Ban reason)/), {target: {value: "Repeated abuse"}});
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
    return {ok: true, json: async () => path.includes("?q=") ? [user, {...second, revision: saved ? 5 : 4, is_banned: saved, can_ban: !saved, can_unban: saved}] : path.includes("/users/clips?") ? {items: [], has_more: false, next_cursor: null} : {ok: true}};
  });
  vi.stubGlobal("fetch", fetch); render(<AdminUsersDashboard />);
  fireEvent.change(screen.getByLabelText("Username or user ID"), {target: {value: "athlete"}}); fireEvent.click(screen.getByRole("button", {name: "Search users"}));
  await screen.findByRole("heading", {name: "athlete"}); fireEvent.change(screen.getByLabelText(/^(Action reason|Ban reason)/), {target: {value: "First account reason"}});
  fireEvent.click(screen.getByRole("button", {name: "Ban user"})); fireEvent.click(screen.getByRole("button", {name: "Cancel"}));
  fireEvent.click(screen.getByRole("button", {name: /second.*Active/})); expect((screen.getByLabelText(/^(Action reason|Ban reason)/) as HTMLTextAreaElement).value).toBe("");
  fireEvent.change(screen.getByLabelText(/^(Action reason|Ban reason)/), {target: {value: "Second account reason"}}); fireEvent.click(screen.getByRole("button", {name: "Ban user"}));
  fireEvent.click(screen.getByRole("button", {name: "Confirm action"})); await screen.findByText("Account moderation saved.");
  expect(JSON.parse(fetch.mock.calls.find(([path]) => path.endsWith("/ban"))![1]?.body as string)).toMatchObject({user_id: second.id, expected_revision: 4});
  await screen.findByRole("button", {name: /second.*Banned/});
  fireEvent.change(screen.getByLabelText(/^(Action reason|Ban reason)/), {target: {value: "Appeal accepted"}}); fireEvent.click(screen.getByRole("button", {name: "Remove manual ban"}));
  fireEvent.click(screen.getByRole("button", {name: "Confirm action"}));
  await waitFor(() => expect(fetch.mock.calls.filter(([path]) => path.endsWith("/ban"))).toHaveLength(2));
  expect(JSON.parse(fetch.mock.calls.filter(([path]) => path.endsWith("/ban"))[1][1]?.body as string)).toMatchObject({user_id: second.id, expected_revision: 5, banned: false});
});

it("validates temporary days, confirms duration and changes retry identity when duration changes", async () => {
  const fetch = vi.fn(async (path: string, options?: RequestInit) => ({ok: !path.endsWith("/ban"), json: async () => path.includes("?q=") ? [user] : path.includes("/users/clips?") ? {items: [], has_more: false, next_cursor: null} : {error: "Please try again."}}));
  vi.stubGlobal("fetch", fetch); render(<AdminUsersDashboard />);
  fireEvent.change(screen.getByLabelText("Username or user ID"), {target: {value: "athlete"}}); fireEvent.click(screen.getByRole("button", {name: "Search users"}));
  await screen.findByRole("heading", {name: "athlete"}); fireEvent.change(screen.getByLabelText("Ban reason (shown to the user)"), {target: {value: "Repeated abuse"}});
  fireEvent.change(screen.getByLabelText("Ban duration"), {target: {value: "temporary"}});
  for (const value of ["", "0", "-1", "1.5", "3651"]) {
    fireEvent.change(screen.getByLabelText("Number of days"), {target: {value}});
    expect((screen.getByRole("button", {name: "Ban user"}) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText("Enter a whole number of days from 1 to 3650.")).toBeTruthy();
  }
  fireEvent.change(screen.getByLabelText("Number of days"), {target: {value: "7"}});
  fireEvent.click(screen.getByRole("button", {name: "Ban user"})); expect(screen.getByText(/Ban duration: 7 days/)).toBeTruthy();
  fireEvent.click(screen.getByRole("button", {name: "Confirm action"})); await screen.findByRole("alert");
  fireEvent.click(screen.getByRole("button", {name: "Cancel"}));
  fireEvent.change(screen.getByLabelText("Number of days"), {target: {value: "14"}});
  expect(screen.queryByRole("dialog")).toBeNull();
  fireEvent.click(screen.getByRole("button", {name: "Ban user"})); expect(screen.getByText(/Ban duration: 14 days/)).toBeTruthy();
  fireEvent.click(screen.getByRole("button", {name: "Confirm action"})); await screen.findByRole("alert");
  const bodies = fetch.mock.calls.filter(([path]) => path.endsWith("/ban")).map(([, options]) => JSON.parse(options?.body as string));
  expect(bodies[0]).toMatchObject({duration_days: 7, user_id: user.id}); expect(bodies[1]).toMatchObject({duration_days: 14, user_id: user.id});
  expect(bodies[0].request_id).not.toBe(bodies[1].request_id);
});
it.each([null, "2026-10-28T12:00:00Z"])("shows manual ban expiry %s without the indefinite Auth sentinel", async manual_ban_until => {
  vi.stubGlobal("fetch", vi.fn(async (path: string) => ({ok: true, json: async () => path.includes("/users/clips?") ? {items: [], has_more: false, next_cursor: null} : [{...user, is_banned: true, manual_ban: true,
    manual_ban_until, ban_until: "2126-10-21T12:00:00Z", can_ban: false, can_unban: true}]})));
  const {container} = render(<AdminUsersDashboard />);
  fireEvent.change(screen.getByLabelText("Username or user ID"), {target: {value: "athlete"}}); fireEvent.click(screen.getByRole("button", {name: "Search users"}));
  await screen.findByRole("heading", {name: "athlete"});
  if (manual_ban_until) expect(container.querySelector("time")?.dateTime).toBe(manual_ban_until);
  else expect(screen.getByText("Manual ban: indefinite")).toBeTruthy();
  expect(container.textContent).not.toContain("2126"); expect(screen.queryByLabelText("Ban duration")).toBeNull();
});
