import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import ModerationReportsDashboard from "../src/components/moderation-reports-dashboard";
import { report, reportPreview } from "./fixtures/moderation-report";
afterEach(() => {cleanup(); vi.unstubAllGlobals();});
function mock(items = [report], fail = false) {
  const fetch = vi.fn(async (path: string, options: RequestInit) => ({ok: !path.endsWith("/decision") || !fail,
    json: async () => path.endsWith("/preview") ? reportPreview : path.endsWith("/decision") ? fail ? {error: "This report changed. Refresh the queue."} : {ok: true} : items}));
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
  expect(screen.queryByRole("button", {name: "Confirm violation"})).toBeNull(); expect(screen.getByText("Decision: confirmed. Spam verified")).toBeTruthy();
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
