import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import ModerationReportsDashboard from "../src/components/moderation-reports-dashboard";
import { report, reportPreview } from "./fixtures/moderation-report";
afterEach(() => {cleanup(); vi.unstubAllGlobals();});
function mock(items = [report], fail = false) {
  const fetch = vi.fn(async (path: string, options: RequestInit) => {
    if (path.endsWith("/decision") && !fail) {
      const input = JSON.parse(options.body as string);
      items = items.map(item => item.id === input.case_id ? {...item, state: input.confirmed ? "confirmed" : "dismissed", revision: item.revision + 1, decision_note: input.decision_note} : item);
    }
    return {ok: !path.endsWith("/decision") || !fail,
      json: async () => path.endsWith("/preview") ? reportPreview : path.endsWith("/decision") ? fail ? {error: "This report changed. Refresh the queue."} : {ok: true} : items};
  });
  vi.stubGlobal("fetch", fetch); return fetch;
}
it("shows structured evidence and requires preview, review, note and confirmation before removing reported content", async () => {
  const fetch = mock(); const {container} = render(<ModerationReportsDashboard />);
  await screen.findByText("Unwanted links or messages"); expect(screen.getByText("Location: Video")).toBeTruthy();
  const confirm = screen.getByRole("button", {name: "Confirm violation"}) as HTMLButtonElement;
  expect(confirm.disabled).toBe(true);
  fireEvent.click(screen.getByRole("button", {name: "Open reported post"})); await screen.findByText("Reported video");
  const video = container.querySelector("video")!; const pause = vi.fn(); Object.defineProperty(video, "pause", {value: pause});
  fireEvent.click(screen.getByRole("button", {name: "Timestamp: 12.500 s"})); expect(video.currentTime).toBe(12.5); expect(pause).toHaveBeenCalledOnce();
  fireEvent.click(screen.getByLabelText("I reviewed the available content and report evidence."));
  fireEvent.change(screen.getByLabelText("Decision note"), {target: {value: "Spam verified"}}); fireEvent.click(confirm);
  const dialog = screen.getByRole("dialog"); expect(within(dialog).getByText(/A confirmed post violation awards one strike/)).toBeTruthy();
  expect(fetch.mock.calls.filter(([path]) => path.endsWith("/decision"))).toHaveLength(0);
  const save = within(dialog).getByRole("button", {name: "Confirm decision"}); fireEvent.click(save); fireEvent.click(save);
  await screen.findByText("Violation confirmed. The moderation decision was saved.");
  const calls = fetch.mock.calls.filter(([path]) => path.endsWith("/decision")); expect(calls).toHaveLength(1);
  expect(JSON.parse(calls[0][1].body as string)).toEqual({case_id: report.id, expected_revision: 3, confirmed: true, decision_note: "Spam verified", reviewed_content: true});
  expect(screen.queryByRole("button", {name: "Confirm violation"})).toBeNull(); expect(await screen.findByText("Decision: confirmed. Spam verified")).toBeTruthy();
});
it.each(["comment", "profile"] as const)("shows %s context and persists explicit dismissals without removal", async kind => {
  const fetch = mock([{...report, target_kind: kind, context: {username: "athlete", body: "Reported text"}}]);
  render(<ModerationReportsDashboard />); await screen.findByText("Reported text");
  expect(screen.queryByRole("button", {name: "Open reported post"})).toBeNull();
  if (kind === "profile") expect(screen.getByText(/Profile restrictions are not applied automatically/)).toBeTruthy();
  fireEvent.click(screen.getByLabelText("I reviewed the available content and report evidence.")); fireEvent.click(screen.getByRole("button", {name: "Dismiss reports"}));
  fireEvent.click(screen.getByRole("button", {name: "Confirm decision"})); await screen.findByText(/Reports dismissed/);
  expect(JSON.parse(fetch.mock.calls.find(([path]) => path.endsWith("/decision"))![1].body as string).confirmed).toBe(false);
});
it("retains decision inputs on a stale/retry failure and never claims success", async () => {
  mock([{...report, target_kind: "comment", context: {username: "athlete", body: "Reported text"}}], true);
  render(<ModerationReportsDashboard />); await screen.findByText("Reported text");
  fireEvent.click(screen.getByLabelText("I reviewed the available content and report evidence.")); fireEvent.change(screen.getByLabelText("Decision note"), {target: {value: "Reviewed note"}});
  fireEvent.click(screen.getByRole("button", {name: "Confirm violation"})); fireEvent.click(screen.getByRole("button", {name: "Confirm decision"}));
  await screen.findByRole("alert"); expect((screen.getByLabelText("Decision note") as HTMLTextAreaElement).value).toBe("Reviewed note");
  expect(screen.queryByRole("dialog")).toBeNull(); expect(screen.queryByRole("status")).toBeNull();
});
it("allows dismissal of unavailable content but prevents confirming a violation without inspecting it", async () => {
  mock(); render(<ModerationReportsDashboard />); await screen.findByText("Unwanted links or messages");
  fireEvent.click(screen.getByLabelText("I reviewed the available content and report evidence.")); fireEvent.change(screen.getByLabelText("Decision note"), {target: {value: "Unavailable content"}});
  expect((screen.getByRole("button", {name: "Confirm violation"}) as HTMLButtonElement).disabled).toBe(true);
  expect((screen.getByRole("button", {name: "Dismiss reports"}) as HTMLButtonElement).disabled).toBe(false);
});
it("does not attach a delayed preview to another report", async () => {
  let resolve!: (value: unknown) => void;
  vi.stubGlobal("fetch", vi.fn(async (path: string) => path.endsWith("/preview") ? new Promise(value => {resolve = value;})
    : {ok: true, json: async () => [report, {...report, id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", target_id: "other-post"}]}));
  const {container} = render(<ModerationReportsDashboard />); await screen.findByText("Unwanted links or messages");
  fireEvent.click(screen.getByRole("button", {name: "Open reported post"})); fireEvent.click(screen.getByRole("button", {name: /post · other-post/}));
  resolve({ok: true, json: async () => reportPreview}); await waitFor(() => expect(screen.getByRole("heading", {name: "other-post"})).toBeTruthy());
  expect(container.querySelector("video")).toBeNull();
});
it.each([
  ["hide", "Hide video"], ["restore", "Restore video"], ["delete", "Delete video"], ["ban", "Ban user"],
])("confirms and refreshes report action %s without supplying owner or post IDs", async (action, label) => {
  const item = {...report, context: {username: "athlete", body: "Reported text", post_state: "published", [`can_${action}`]: true}};
  const fetch = vi.fn(async (path: string, options?: RequestInit) => ({ok: true, json: async () => path.endsWith("/action") ? {ok: true} : [item]}));
  vi.stubGlobal("fetch", fetch); render(<ModerationReportsDashboard />);
  await screen.findByText("Unwanted links or messages");
  const button = screen.getByRole("button", {name: label}) as HTMLButtonElement;
  expect(button.disabled).toBe(true); fireEvent.change(screen.getByLabelText(/^(Action reason|Ban reason)/), {target: {value: "Reviewed reported evidence"}}); fireEvent.click(button);
  expect(fetch.mock.calls.filter(([path]) => path.endsWith("/action"))).toHaveLength(0);
  fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", {name: "Confirm action"}));
  await screen.findByText("Moderation action saved.");
  const calls = fetch.mock.calls.filter(([path]) => path.endsWith("/action")); expect(calls).toHaveLength(1);
  expect(JSON.parse(calls[0][1]?.body as string)).toEqual({case_id: report.id, expected_revision: 3, action, reason: "Reviewed reported evidence", request_id: expect.any(String), duration_days: null});
  await waitFor(() => expect(fetch.mock.calls.filter(([path]) => path === "/admin/api/reports")).toHaveLength(2));
});
it("offers owner bans on comment and profile reports but no video actions without server capabilities", async () => {
  mock([{...report, target_kind: "comment", context: {username: "athlete", body: "Reported text", can_ban: true}}]);
  render(<ModerationReportsDashboard />); await screen.findByText("Reported text");
  expect(screen.getByRole("button", {name: "Ban user"})).toBeTruthy();
  for (const name of ["Hide video", "Restore video", "Delete video"]) expect(screen.queryByRole("button", {name})).toBeNull();
});
it("clears action inputs when changing reports and refreshes revision after a decision", async () => {
  const first = {...report, target_kind: "profile" as const, context: {username: "first", body: "First profile", can_ban: true}};
  const second = {...first, id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", revision: 8, context: {username: "second", body: "Second profile", can_ban: true}};
  const fetch = mock([first, second]); render(<ModerationReportsDashboard />); await screen.findByText("First profile");
  fireEvent.change(screen.getByLabelText(/^(Action reason|Ban reason)/), {target: {value: "First reason"}});
  fireEvent.click(screen.getByRole("button", {name: /profile · second/})); expect((screen.getByLabelText(/^(Action reason|Ban reason)/) as HTMLTextAreaElement).value).toBe("");
  fireEvent.click(screen.getByLabelText("I reviewed the available content and report evidence."));
  fireEvent.click(screen.getByRole("button", {name: "Dismiss reports"})); fireEvent.click(screen.getByRole("button", {name: "Confirm decision"}));
  await screen.findByText(/Reports dismissed/);
  await screen.findByRole("button", {name: /profile · second/}); fireEvent.click(screen.getByRole("button", {name: /profile · second/}));
  fireEvent.change(screen.getByLabelText(/^(Action reason|Ban reason)/), {target: {value: "Independent account restriction"}});
  fireEvent.click(screen.getByRole("button", {name: "Ban user"})); fireEvent.click(screen.getByRole("button", {name: "Confirm action"}));
  await waitFor(() => expect(fetch.mock.calls.filter(([path]) => path.endsWith("/action"))).toHaveLength(1));
  expect(JSON.parse(fetch.mock.calls.find(([path]) => path.endsWith("/action"))![1].body as string)).toMatchObject({case_id: second.id, expected_revision: 9, action: "ban"});
});

it("confirms temporary report-owner bans and keeps duration out of video actions", async () => {
  const item = {...report, context: {username: "athlete", can_ban: true, can_hide: true}};
  const fetch = vi.fn(async (path: string, options?: RequestInit) => ({ok: true, json: async () => path.endsWith("/action") ? {ok: true} : [item]}));
  vi.stubGlobal("fetch", fetch); render(<ModerationReportsDashboard />); await screen.findByText("Unwanted links or messages");
  fireEvent.change(screen.getByLabelText("Action reason"), {target: {value: "Repeated abuse"}});
  fireEvent.change(screen.getByLabelText("Ban duration"), {target: {value: "temporary"}});
  expect((screen.getByRole("button", {name: "Ban user"}) as HTMLButtonElement).disabled).toBe(true);
  expect((screen.getByRole("button", {name: "Hide video"}) as HTMLButtonElement).disabled).toBe(false);
  fireEvent.change(screen.getByLabelText("Number of days"), {target: {value: "7"}});
  fireEvent.click(screen.getByRole("button", {name: "Hide video"})); fireEvent.click(screen.getByRole("button", {name: "Confirm action"}));
  await screen.findByText("Moderation action saved.");
  expect(JSON.parse(fetch.mock.calls.find(([path]) => path.endsWith("/action"))![1]?.body as string)).toMatchObject({action: "hide", duration_days: null});
  await screen.findByLabelText("Ban duration");
  fireEvent.change(screen.getByLabelText("Action reason"), {target: {value: "Repeated abuse"}});
  fireEvent.change(screen.getByLabelText("Ban duration"), {target: {value: "temporary"}});
  fireEvent.change(screen.getByLabelText("Number of days"), {target: {value: "7"}});
  fireEvent.click(screen.getByRole("button", {name: "Ban user"})); expect(screen.getByText(/Ban duration: 7 days/)).toBeTruthy();
  fireEvent.click(screen.getByRole("button", {name: "Confirm action"}));
  await waitFor(() => expect(fetch.mock.calls.filter(([path]) => path.endsWith("/action"))).toHaveLength(2));
  expect(JSON.parse(fetch.mock.calls.filter(([path]) => path.endsWith("/action"))[1][1]?.body as string)).toMatchObject({case_id: report.id, expected_revision: 3, action: "ban", duration_days: 7});
});

it("labels every report author separately, including unavailable profiles", async () => {
 mock([{...report, report_count: 3, reports: [
  {...report.reports[0],reporter_username:"first_reporter"},
  {...report.reports[0],id:"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",reporter_username:"second_reporter"},
  {...report.reports[0],id:"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",reporter_username:null},
 ],context:{username:"reported_athlete",body:"Reported text"}}]);
 render(<ModerationReportsDashboard/>);
 expect(await screen.findByText("Reported by: @first_reporter")).toBeTruthy();
 expect(screen.getByText("Reported by: @second_reporter")).toBeTruthy();
 expect(screen.getByText("Reported by: Username unavailable")).toBeTruthy();
 expect(screen.queryByText("Reported by: @reported_athlete")).toBeNull();
});
