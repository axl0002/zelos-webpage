import {parseRankedUploadReviews} from "../src/lib/ranked-uploads";
import {afterEach, expect, it, vi} from "vitest";
import {cleanup, fireEvent, render, screen, waitFor, within} from "@testing-library/react";
import RankedUploadsDashboard from "../src/components/ranked-uploads-dashboard";
import {rankedUpload, privatePreview} from "./fixtures/ranked-upload";
afterEach(() => {cleanup(); vi.unstubAllGlobals();});
it.each(["form", "filming"] as const)("sends the selected %s rule and preserves it after a failed rejection", async type => {
  const fetch = mockApi([rankedUpload], true); render(<RankedUploadsDashboard />);
  await screen.findByRole("heading", {name: rankedUpload.title});
  fireEvent.change(screen.getByLabelText("Rejection reason"), {target: {value: `unacceptable_${type}`}});
  const rule = rankedUpload.guidelines.rules.find(rule => rule.type === type)!;
  const choice = screen.getByRole("checkbox", {name: rule.text});
  fireEvent.click(choice);
  fireEvent.click(screen.getByRole("button", {name: "Reject upload"}));
  await screen.findByText("Connection failed. Try again.");
  expect(choice).toHaveProperty("checked", true);
  const body = JSON.parse(fetch.mock.calls.find(([path]) => path.endsWith("/decision"))![1].body as string);
  expect(body).toMatchObject({approve: false, reason_code: `unacceptable_${type}`, rule_ids: [rule.id]});
  fireEvent.change(screen.getByLabelText("Rejection reason"), {target: {value: "incorrect_exercise"}});
  expect(screen.queryByRole("checkbox", {name: rule.text})).toBeNull();
  fireEvent.click(screen.getByRole("button", {name: "Reject upload"}));
  await waitFor(() => expect(fetch.mock.calls.filter(([path]) => path.endsWith("/decision"))).toHaveLength(2));
  expect(JSON.parse(fetch.mock.calls.filter(([path]) => path.endsWith("/decision"))[1][1].body as string).rule_ids).toEqual([]);
});
it.each(["incorrect_start_frame", "incorrect_end_frame", "incorrect_hold_frames"])("rejects timed holds for %s without publishing or editing their times", async reason => {
  const item = {...rankedUpload, hold_timing: {start_ms: 1500, end_ms: 13999, duration_ms: 12499}};
  const fetch = mockApi([item]); render(<RankedUploadsDashboard />);
  await screen.findByRole("heading", {name: item.title});
  fireEvent.change(screen.getByLabelText("Rejection reason"), {target: {value: reason}});
  expect(screen.getByText(/which boundary is inaccurate/)).toBeTruthy();
  fireEvent.click(screen.getByRole("button", {name: "Reject upload"}));
  await screen.findByText("Rejected. The uploader will see your reason. The video remains private.");
  expect(JSON.parse(fetch.mock.calls.find(([path]) => path.endsWith("/decision"))![1].body as string)).toMatchObject({approve: false, reason_code: reason, rule_ids: []});
});
it.each(["seconds", "reps"] as const)("does not offer selected hold-boundary reasons for an untimed %s clip", async metric => {
  mockApi([{...rankedUpload, metric}]); render(<RankedUploadsDashboard />);
  await screen.findByRole("heading", {name: rankedUpload.title});
  expect(screen.queryByRole("option", {name: "Incorrect hold start frame"})).toBeNull();
  expect(screen.queryByRole("option", {name: "Incorrect hold end frame"})).toBeNull();
  expect(screen.queryByRole("option", {name: "Incorrect hold start and end frames"})).toBeNull();
});
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
it("rejects with only a selected reason, without video, note, rules or confirmation", async () => {
  let resolvePreview!: (value: unknown) => void;
  const fetch = vi.fn(async (path: string, _options: RequestInit) => path.endsWith("/preview")
    ? await new Promise(resolve => {resolvePreview = resolve;})
    : {ok: true, json: async () => path.endsWith("/decision") ? {ok: true} : [rankedUpload]});
  vi.stubGlobal("fetch", fetch); render(<RankedUploadsDashboard />);
  await screen.findByRole("heading", {name: rankedUpload.title});
  const reject = screen.getByRole("button", {name: "Reject upload"}) as HTMLButtonElement;
  expect(reject.disabled).toBe(true);
  expect((screen.getByRole("button", {name: "Approve upload"}) as HTMLButtonElement).disabled).toBe(true);
  expect(screen.queryByLabelText("Note shown to the uploader if rejected")).toBeNull();
  fireEvent.change(screen.getByLabelText("Rejection reason"), {target: {value: "unacceptable_form"}});
  expect(reject.disabled).toBe(false);
  fireEvent.click(reject); fireEvent.click(reject);
  await screen.findByText("Rejected. The uploader will see your reason. The video remains private.");
  expect(screen.queryByRole("dialog")).toBeNull();
  const decisions = fetch.mock.calls.filter(([path]) => path.endsWith("/decision"));
  expect(decisions).toHaveLength(1);
  expect(JSON.parse((decisions[0] as unknown as [string, RequestInit])[1].body as string)).toEqual({upload_id: rankedUpload.id,
    expected_revision: 4, approve: false, watched_video: false, reason_code: "unacceptable_form", review_note: "", rule_ids: []});
  expect(screen.queryByRole("heading", {name: rankedUpload.title})).toBeNull();
  expect(screen.getByText("No ranked uploads awaiting review.")).toBeTruthy();
  expect(screen.queryByRole("button", {name: "Approve upload"})).toBeNull();
  resolvePreview?.({ok: true, json: async () => privatePreview});
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
it("failed rejection retains selected reason and retries without another hurdle", async () => {
  mockApi([rankedUpload], true); render(<RankedUploadsDashboard />);
  await screen.findByRole("heading", {name: rankedUpload.title});
  fireEvent.change(screen.getByLabelText("Rejection reason"), {target: {value: "incorrect_measurement"}});
  fireEvent.click(screen.getByRole("button", {name: "Reject upload"}));
  await screen.findByText("Connection failed. Try again.");
  expect((screen.getByLabelText("Rejection reason") as HTMLSelectElement).value).toBe("incorrect_measurement");
  expect((screen.getByRole("button", {name: "Reject upload"}) as HTMLButtonElement).disabled).toBe(false);
  expect(screen.queryByRole("dialog")).toBeNull();
});
it("video failure clears watched confirmation and requires a fresh private preview", async () => {
  mockApi(); const {container} = render(<RankedUploadsDashboard />); await review();
  fireEvent.error(container.querySelector("video")!);
  expect((screen.getByLabelText("I watched the full video and checked the exercise, result and form against these rules.") as HTMLInputElement).checked).toBe(false);
  expect((screen.getByRole("button", {name: "Approve upload"}) as HTMLButtonElement).disabled).toBe(true);
  expect(screen.getByRole("button", {name: "Retry video"})).toBeTruthy();
  fireEvent.click(screen.getByRole("button", {name: "Retry video"}));
  await waitFor(() => expect(container.querySelector("video")).not.toBeNull());
  expect(container.querySelector("video")!.autoplay).toBe(true);
  expect(container.querySelector("video")!.muted).toBe(true);
  expect((screen.getByRole("button", {name: "Approve upload"}) as HTMLButtonElement).disabled).toBe(true);
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
  resolvePreview({ok: true, json: async () => ({...privatePreview, url: privatePreview.url + "&second=true"})});
  await waitFor(() => expect(container.querySelector("video")).not.toBeNull());
  expect(container.querySelector("video")!.autoplay).toBe(true);
  expect(container.querySelector("video")!.muted).toBe(true);
  expect(container.querySelector("video")!.playsInline).toBe(true);
  expect((screen.getByLabelText("I watched the full video and checked the exercise, result and form against these rules.") as HTMLInputElement).checked).toBe(false);
});
it("hides retained rejected uploads from the pending queue without loading their private video", async () => {
  const fetch = mockApi([{...rankedUpload, state: "rank_rejected", reason: "always_review", always_require_review: true,
    rejection_reason: "incorrect_exercise", review_note: "This is a different progression."}]);
  render(<RankedUploadsDashboard />); await screen.findByText("No ranked uploads awaiting review.");
  expect(screen.queryByText("This is a different progression.")).toBeNull();
  expect(screen.queryByRole("checkbox")).toBeNull();
  expect(screen.queryByRole("button", {name: "Approve upload"})).toBeNull();
  expect(fetch.mock.calls.filter(([path]) => path.endsWith("/preview"))).toHaveLength(0);
});

it("rejecting removes the entry, selects the next pending video and ignores stale entries on refresh", async () => {
  const next = {...rankedUpload, id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee", username: "other", title: "Next upload"};
  const fetch = mockApi([rankedUpload, next]);
  render(<RankedUploadsDashboard />);
  await screen.findByRole("heading", {name: rankedUpload.title});
  fireEvent.change(screen.getByLabelText("Rejection reason"), {target: {value: "incorrect_exercise"}});
  fireEvent.click(screen.getByRole("button", {name: "Reject upload"}));
  await screen.findByRole("heading", {name: next.title});
  expect(screen.queryByRole("button", {name: /athlete ·/})).toBeNull();
  expect(screen.queryByRole("heading", {name: rankedUpload.title})).toBeNull();
  fireEvent.click(screen.getByRole("button", {name: "Refresh queue"}));
  await waitFor(() => expect(fetch.mock.calls.filter(([path]) => !path.endsWith("/preview") && !path.endsWith("/decision"))).toHaveLength(2));
  await waitFor(() => expect((screen.getByRole("button", {name: "Refresh queue"}) as HTMLButtonElement).disabled).toBe(false));
  expect(screen.queryByRole("heading", {name: rankedUpload.title})).toBeNull();
  expect(screen.getByRole("heading", {name: next.title})).toBeTruthy();
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
it('requires and forwards a custom rejection reason for Other without changing other reason requests',async()=>{
 const fetch=mockApi([rankedUpload],true);render(<RankedUploadsDashboard/>);await screen.findByRole('heading',{name:rankedUpload.title});
 fireEvent.change(screen.getByLabelText('Rejection reason'),{target:{value:'other'}});
 const reject=screen.getByRole('button',{name:'Reject upload'}) as HTMLButtonElement;
 expect(reject.disabled).toBe(true);
 const reason=screen.getByLabelText('Custom rejection reason');fireEvent.change(reason,{target:{value:'  The hold is supported by the rail.  '}});expect(reject.disabled).toBe(false);
 fireEvent.click(reject);await screen.findByText('Connection failed. Try again.');
 expect((reason as HTMLTextAreaElement).value).toBe('  The hold is supported by the rail.  ');
 expect(JSON.parse(fetch.mock.calls.find(([p])=>p.endsWith('/decision'))![1].body as string)).toMatchObject({reason_code:'other',review_note:'The hold is supported by the rail.',rule_ids:[]});
 fireEvent.change(screen.getByLabelText('Rejection reason'),{target:{value:'incorrect_exercise'}});expect(screen.queryByLabelText('Custom rejection reason')).toBeNull();fireEvent.click(reject);
 await waitFor(()=>expect(fetch.mock.calls.filter(([p])=>p.endsWith('/decision'))).toHaveLength(2));expect(JSON.parse(fetch.mock.calls.filter(([p])=>p.endsWith('/decision'))[1][1].body as string).review_note).toBe('');
});

it.each(['incorrect_exercise', 'unacceptable_form', 'other'])(
  'disables approval for rejection intent %s and restores it only when cleared', async reason => {
    const fetch = mockApi([rankedUpload], true);
    render(<RankedUploadsDashboard />);
    await review();
    const approve = screen.getByRole('button', {name: 'Approve upload'}) as HTMLButtonElement;
    expect(approve.disabled).toBe(false);
    fireEvent.change(screen.getByLabelText('Rejection reason'), {target: {value: reason}});
    expect(approve.disabled).toBe(true);
    fireEvent.click(approve);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(fetch.mock.calls.filter(([path]) => path.endsWith('/decision'))).toHaveLength(0);
    if (reason !== 'other') {
      fireEvent.click(screen.getByRole('button', {name: 'Reject upload'}));
      await screen.findByText('Connection failed. Try again.');
      expect(approve.disabled).toBe(true);
    }
    fireEvent.change(screen.getByLabelText('Rejection reason'), {target: {value: ''}});
    expect(approve.disabled).toBe(false);
    fireEvent.click(approve);
    expect(screen.getByRole('dialog', {name: 'Confirm ranked upload decision'})).toBeTruthy();
    expect(fetch.mock.calls.filter(([path, options]) => path.endsWith('/decision') && JSON.parse(options.body as string).approve)).toHaveLength(0);
  },
);

it('selecting a rejection reason closes an existing approval confirmation', async () => {
  const fetch = mockApi(); render(<RankedUploadsDashboard />); await review();
  fireEvent.click(screen.getByRole('button', {name: 'Approve upload'}));
  expect(screen.getByRole('dialog')).toBeTruthy();
  fireEvent.change(screen.getByLabelText('Rejection reason'), {target: {value: 'incorrect_measurement'}});
  expect(screen.queryByRole('dialog')).toBeNull();
  expect((screen.getByRole('button', {name: 'Approve upload'}) as HTMLButtonElement).disabled).toBe(true);
  expect(fetch.mock.calls.filter(([path]) => path.endsWith('/decision'))).toHaveLength(0);
});
