import {parseRankedUploadReviews} from "../src/lib/ranked-uploads";
import {afterEach, expect, it, vi} from "vitest";
import {cleanup, fireEvent, render, screen, waitFor, within} from "@testing-library/react";
import RankedUploadsDashboard from "../src/components/ranked-uploads-dashboard";
import {rankedUpload, privatePreview} from "./fixtures/ranked-upload";
afterEach(() => {cleanup(); vi.unstubAllGlobals();});
function mockApi(items = [rankedUpload], fail = false) {
  const fetch = vi.fn(async (path: string, options: RequestInit) => ({
    ok: !path.endsWith("/decision") || !fail,
    json: async () => path.endsWith("/preview") ? privatePreview : path.endsWith("/decision")
      ? fail ? {error: "Connection failed. Try again."} : {ok: true} : items,
  }));
  vi.stubGlobal("fetch", fetch); return fetch;
}
async function review() {
  await screen.findByRole("heading", {name: rankedUpload.title});
  await waitFor(() => expect(document.querySelector("video")).not.toBeNull());
  fireEvent.click(screen.getByLabelText("I watched the full video and checked the exercise, result and form against these rules."));
}
it("automatically loads the selected private video muted without confirming a review", async () => {
  let resolvePreview!: (result: unknown) => void;
  const fetch = vi.fn(async (path: string) => path.endsWith("/preview")
    ? await new Promise(resolve => {resolvePreview = resolve;})
    : {ok: true, json: async () => [rankedUpload]});
  vi.stubGlobal("fetch", fetch);
  render(<RankedUploadsDashboard />);
  await screen.findByRole("heading", {name: rankedUpload.title});
  const watched = screen.getByLabelText("I watched the full video and checked the exercise, result and form against these rules.") as HTMLInputElement;
  expect(watched.disabled).toBe(true);
  await screen.findByRole("button", {name: "Loading video…"});
  resolvePreview({ok: true, json: async () => privatePreview});
  await waitFor(() => expect(document.querySelector("video")).not.toBeNull());
  const video = document.querySelector("video")!;
  expect(video.autoplay).toBe(true);
  expect(video.muted).toBe(true);
  expect(video.controls).toBe(true);
  expect(video.playsInline).toBe(true);
  expect(watched.checked).toBe(false);
  expect((screen.getByRole("button", {name: "Approve upload"}) as HTMLButtonElement).disabled).toBe(true);
  expect(fetch.mock.calls.filter(([path]) => path.endsWith("/decision"))).toHaveLength(0);
});
it("requires private video, full-video check, rejection choices and explicit confirmation", async () => {
  const fetch = mockApi(); render(<RankedUploadsDashboard />);
  await screen.findByRole("heading", {name: rankedUpload.title});
  const approve = screen.getByRole("button", {name: "Approve upload"}) as HTMLButtonElement;
  const reject = screen.getByRole("button", {name: "Reject upload"}) as HTMLButtonElement;
  expect(approve.disabled).toBe(true);
  expect(screen.getByText("Hips level with shoulders")).toBeTruthy();
  expect(screen.getByText(/Projected rank: #2 of 11/)).toBeTruthy();
  await review(); expect(approve.disabled).toBe(false); expect(reject.disabled).toBe(true);
  fireEvent.change(screen.getByLabelText("Rejection reason"), {target: {value: "unacceptable_form"}});
  expect(reject.disabled).toBe(true);
  fireEvent.change(screen.getByLabelText("Note shown to the uploader if rejected"), {target: {value: "Keep both arms straight for the full hold."}});
  expect(reject.disabled).toBe(true);
  fireEvent.click(screen.getByLabelText("Keep arms straight."));
  fireEvent.click(reject);
  const dialog = screen.getByRole("dialog");
  expect(within(dialog).getByText("Keep both arms straight for the full hold.")).toBeTruthy();
  expect(fetch.mock.calls.filter(([path]) => path.endsWith("/decision"))).toHaveLength(0);
  const confirm = within(dialog).getByRole("button", {name: "Confirm decision"});
  fireEvent.click(confirm); fireEvent.click(confirm);
  await screen.findByText("Rejected. The uploader will see your reason. The video remains private.");
  const decisions = fetch.mock.calls.filter(([path]) => path.endsWith("/decision"));
  expect(decisions).toHaveLength(1);
  expect(JSON.parse(decisions[0][1].body as string)).toEqual({upload_id: rankedUpload.id, expected_revision: 4,
    approve: false, watched_video: true, reason_code: "unacceptable_form", review_note: "Keep both arms straight for the full hold.", rule_ids: [rankedUpload.guidelines.rules[0].id]});
  expect(screen.queryByRole("button", {name: "Approve upload"})).toBeNull();
  expect(screen.queryByRole("button", {name: "Reject upload"})).toBeNull();
  expect(screen.getByText("The upload remains private and earns no points.")).toBeTruthy();
});
it("approval remains explicit and removes the completed queue entry", async () => {
  const fetch = mockApi(); render(<RankedUploadsDashboard />); await review();
  fireEvent.click(screen.getByRole("button", {name: "Approve upload"}));
  fireEvent.click(screen.getByRole("button", {name: "Cancel"}));
  expect(fetch.mock.calls.filter(([path]) => path.endsWith("/decision"))).toHaveLength(0);
  fireEvent.click(screen.getByRole("button", {name: "Approve upload"}));
  fireEvent.click(screen.getByRole("button", {name: "Confirm decision"}));
  await screen.findByText(/Approved. The upload will finish publication checks/);
  const call = fetch.mock.calls.find(([path]) => path.endsWith("/decision"))!;
  expect(JSON.parse(call[1].body as string)).toEqual({upload_id: rankedUpload.id, expected_revision: 4,
    approve: true, watched_video: true, reason_code: null, review_note: "", rule_ids: []});
  expect(screen.queryByRole("heading", {name: rankedUpload.title})).toBeNull();
});
it("failed decisions retain the reason, note and watched state for retry", async () => {
  mockApi([rankedUpload], true); render(<RankedUploadsDashboard />); await review();
  fireEvent.change(screen.getByLabelText("Rejection reason"), {target: {value: "incorrect_measurement"}});
  fireEvent.change(screen.getByLabelText("Note shown to the uploader if rejected"), {target: {value: "Only 8 seconds are held with valid form."}});
  fireEvent.click(screen.getByRole("button", {name: "Reject upload"}));
  fireEvent.click(screen.getByRole("button", {name: "Confirm decision"}));
  await screen.findByText("Connection failed. Try again.");
  expect((screen.getByLabelText("Rejection reason") as HTMLSelectElement).value).toBe("incorrect_measurement");
  expect((screen.getByLabelText("Note shown to the uploader if rejected") as HTMLTextAreaElement).value).toBe("Only 8 seconds are held with valid form.");
  expect((screen.getByLabelText("I watched the full video and checked the exercise, result and form against these rules.") as HTMLInputElement).checked).toBe(true);
  expect(screen.queryByRole("dialog")).toBeNull();
});
it("video failure clears watched confirmation and requires a fresh private preview", async () => {
  mockApi(); const {container} = render(<RankedUploadsDashboard />); await review();
  fireEvent.error(container.querySelector("video")!);
  expect((screen.getByLabelText("I watched the full video and checked the exercise, result and form against these rules.") as HTMLInputElement).checked).toBe(false);
  expect((screen.getByRole("button", {name: "Approve upload"}) as HTMLButtonElement).disabled).toBe(true);
  expect(screen.getByRole("button", {name: "Retry video"})).toBeTruthy();
});
it("switching reviews ignores late previews and resets the watch confirmation", async () => {
  let resolvePreview!: (result: unknown) => void;
  vi.stubGlobal("fetch", vi.fn(async (path: string) => path.endsWith("/preview")
    ? await new Promise(resolve => {resolvePreview = resolve;}) : {ok: true, json: async () => [rankedUpload,
      {...rankedUpload, id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee", username: "other", title: "Other upload"}]}));
  const {container} = render(<RankedUploadsDashboard />);
  await screen.findByRole("heading", {name: rankedUpload.title});
  await waitFor(() => expect(resolvePreview).toBeTypeOf("function"));
  const resolveOldPreview = resolvePreview;
  fireEvent.click(screen.getByRole("button", {name: /other · Full Planche/}));
  resolveOldPreview({ok: true, json: async () => privatePreview});
  await screen.findByRole("heading", {name: "Other upload"});
  expect(container.querySelector("video")).toBeNull();
  expect((screen.getByLabelText("I watched the full video and checked the exercise, result and form against these rules.") as HTMLInputElement).checked).toBe(false);
});
it("retained rejected uploads show uploader feedback and private preview without new actions", async () => {
  mockApi([{...rankedUpload, state: "rank_rejected", reason: "always_review", always_require_review: true,
    rejection_reason: "incorrect_exercise", review_note: "This is a different progression."}]);
  render(<RankedUploadsDashboard />); await screen.findByText("This is a different progression.");
  expect(screen.getByText("This progression requires a review for every ranked upload.")).toBeTruthy();
  expect(screen.queryByRole("checkbox")).toBeNull();
  expect(screen.queryByRole("button", {name: "Approve upload"})).toBeNull();
  await waitFor(() => expect(document.querySelector("video")).not.toBeNull());
});

it("preserves validated precise timing and lets reviewers seek each boundary", async () => {
  const hold_timing = {start_ms: 1500, end_ms: 12499, duration_ms: 10999};
  const item = {...rankedUpload, claim: 10, hold_timing};
  expect(parseRankedUploadReviews([{...item, hold_timing: {...hold_timing, secret: "hidden"}}])[0].hold_timing).toEqual(hold_timing);
  for (const invalid of [{...hold_timing, start_ms: -1}, {...hold_timing, end_ms: 12500},
    {...hold_timing, duration_ms: 999}, {...hold_timing, end_ms: 2147483648}]) {
    expect(() => parseRankedUploadReviews([{...item, hold_timing: invalid}])).toThrow();
  }
  expect(() => parseRankedUploadReviews([{...item, metric: "reps"}])).toThrow();
  const pause = vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
  mockApi([item]); render(<RankedUploadsDashboard />);
  await screen.findByText("Selected hold: 10.999 s · credited 10 s");
  await waitFor(() => expect(document.querySelector("video")).not.toBeNull());
  fireEvent.click(screen.getByRole("button", {name: "Hold start · 1.500 s"}));
  expect(document.querySelector("video")!.currentTime).toBe(1.5);
  fireEvent.click(screen.getByRole("button", {name: "Hold end · 12.499 s"}));
  expect(document.querySelector("video")!.currentTime).toBe(12.499);
  expect(pause).toHaveBeenCalledTimes(2);
  expect((screen.getByRole("button", {name: "Approve upload"}) as HTMLButtonElement).disabled).toBe(true);
  pause.mockRestore();
});
