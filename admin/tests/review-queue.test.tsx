import React from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import ReviewDashboard from "../src/components/review-dashboard";
import type { Board, Candidate, QueuePage } from "../src/lib/review-types";

const boards: Board[] = [{
  id: "pull-up", exercise_id: "pull", exercise_name: "Pull Up", name: "Pull Up",
  progression: null, metric: "reps", max_value: 60, form: "Full range", camera: "Side view",
}];
const clip = (id: number): Candidate => ({
  post_id: `clip-${id}`, revision: 1, status: "pending", title: `Clip ${id}`,
  caption: "Pull up set", username: "athlete", country: null, author_id: "athlete-id",
  created_at: "2026-01-01", duration_ms: 30000,
  primary_url: `https://media.zelos.club/${id}.mp4`, poster_url: null, renditions: {},
  suggestions: [{ exercise_id: "pull", name: "Pull Up", evidence: ["description"] }],
  warnings: [], current_records: [], board_id: null, value: null, note: "", reviewed_at: null, result: null,
});
const queue = (...ids: number[]): QueuePage => ({
  items: ids.map(clip), stats: { pending: ids.length, approved: 0, skipped: 0 },
});
const response = (data: unknown) => ({ ok: true, json: async () => data });
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => { resolve = r; });
  return { promise, resolve };
}
beforeEach(() => {
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

it.each(["approve", "skip"])("%s advances immediately while refill is pending and preserves the next form", async (action) => {
  const refill = deferred<ReturnType<typeof response>>();
  const fetch = vi.fn()
    .mockResolvedValueOnce(response(queue(1, 2, 3)))
    .mockResolvedValueOnce(response({ active: action === "approve" }))
    .mockReturnValueOnce(refill.promise);
  vi.stubGlobal("fetch", fetch);
  render(<ReviewDashboard boards={boards} email="reviewer@example.test" />);
  await screen.findByRole("heading", { name: "Clip 1" });
  if (action === "approve") {
    fireEvent.change(screen.getByLabelText("Completed reps"), { target: { value: "10" } });
  }
  fireEvent.click(screen.getByRole("button", { name: action === "approve" ? "Approve ranking ↗" : "Reject ranking" }));
  const next = await screen.findByRole("heading", { name: "Clip 2" });
  expect(screen.queryByLabelText("Loading review")).toBeNull();
  expect(screen.queryByLabelText("Loading clips")).toBeNull();
  expect(screen.queryByRole("button", { name: /Clip 1/ })).toBeNull();
  expect((screen.getByLabelText("Completed reps") as HTMLInputElement).value).toBe("");
  const video = next.closest("article")!.querySelector("video");
  fireEvent.change(screen.getByLabelText("Completed reps"), { target: { value: "9" } });
  await act(async () => { refill.resolve(response(queue(2, 3, 4))); });
  expect(screen.getByRole("heading", { name: "Clip 2" }).closest("article")!.querySelector("video")).toBe(video);
  expect((screen.getByLabelText("Completed reps") as HTMLInputElement).value).toBe("9");
  expect(fetch).toHaveBeenCalledTimes(3);
});

it("a failed save stays on the current clip with its inputs", async () => {
  const fetch = vi.fn()
    .mockResolvedValueOnce(response(queue(1, 2)))
    .mockResolvedValueOnce({ ok: false, json: async () => ({ error: "Try again." }) });
  vi.stubGlobal("fetch", fetch);
  render(<ReviewDashboard boards={boards} email="reviewer@example.test" />);
  await screen.findByRole("heading", { name: "Clip 1" });
  fireEvent.change(screen.getByLabelText(/Review notes/), { target: { value: "Bad form" } });
  fireEvent.click(screen.getByRole("button", { name: "Reject ranking" }));
  await screen.findByRole("alert");
  expect(screen.getByRole("heading", { name: "Clip 1" })).toBeTruthy();
  expect((screen.getByLabelText(/Review notes/) as HTMLTextAreaElement).value).toBe("Bad form");
  expect(fetch).toHaveBeenCalledTimes(2);
});

it("background refill failure keeps the next clip usable and retry preserves inputs", async () => {
  const fetch = vi.fn()
    .mockResolvedValueOnce(response(queue(1, 2)))
    .mockResolvedValueOnce(response({ active: false }))
    .mockResolvedValueOnce({ ok: false, json: async () => ({ error: "Queue unavailable" }) })
    .mockResolvedValueOnce(response(queue(2, 3)));
  vi.stubGlobal("fetch", fetch);
  render(<ReviewDashboard boards={boards} email="reviewer@example.test" />);
  await screen.findByRole("heading", { name: "Clip 1" });
  fireEvent.click(screen.getByRole("button", { name: "Reject ranking" }));
  await screen.findByText("Queue unavailable");
  expect(screen.getByRole("heading", { name: "Clip 2" })).toBeTruthy();
  expect(screen.queryByLabelText("Loading review")).toBeNull();
  fireEvent.change(screen.getByLabelText("Completed reps"), { target: { value: "8" } });
  fireEvent.click(screen.getByRole("button", { name: "Retry" }));
  await screen.findByRole("button", { name: /Clip 3/ });
  expect((screen.getByLabelText("Completed reps") as HTMLInputElement).value).toBe("8");
});

it("late background responses cannot reinsert completed clips or change the current clip", async () => {
  const first = deferred<ReturnType<typeof response>>();
  const second = deferred<ReturnType<typeof response>>();
  let reads = 0;
  const fetch = vi.fn((url: string) => {
    if (url.endsWith("/decision")) return Promise.resolve(response({ active: false }));
    reads++;
    return reads === 1 ? Promise.resolve(response(queue(1, 2, 3)))
      : reads === 2 ? first.promise : second.promise;
  });
  vi.stubGlobal("fetch", fetch);
  render(<ReviewDashboard boards={boards} email="reviewer@example.test" />);
  await screen.findByRole("heading", { name: "Clip 1" });
  fireEvent.click(screen.getByRole("button", { name: "Reject ranking" }));
  await screen.findByRole("heading", { name: "Clip 2" });
  await waitFor(() => expect(reads).toBe(2));
  fireEvent.click(screen.getByRole("button", { name: "Reject ranking" }));
  await screen.findByRole("heading", { name: "Clip 3" });
  await waitFor(() => expect(reads).toBe(3));
  await act(async () => { first.resolve(response(queue(2, 3))); });
  expect(screen.getByRole("heading", { name: "Clip 3" })).toBeTruthy();
  expect(screen.queryByRole("button", { name: /Clip 2/ })).toBeNull();
  await act(async () => { second.resolve(response(queue(3, 4))); });
  expect(screen.getByRole("heading", { name: "Clip 3" })).toBeTruthy();
});

it("scan reports elapsed time and auto rejections across all batches", async () => {
  const batches = [
    { scanned: 500, queued: 100, auto_rejected: 5, cursor: "clip-500", has_more: true },
    { scanned: 100, queued: 20, auto_rejected: 2, cursor: "clip-600", has_more: false },
  ];
  const fetch = vi.fn((url: string) => Promise.resolve(response(
    url.endsWith("/scan") ? batches.shift() : queue(1, 2),
  )));
  vi.stubGlobal("fetch", fetch);
  render(<ReviewDashboard boards={boards} email="reviewer@example.test" />);
  await screen.findByRole("heading", { name: "Clip 1" });
  fireEvent.click(screen.getByRole("button", { name: "Scan training clips" }));
  const notice = await screen.findByText(/Scan complete in/);
  expect(notice.textContent).toContain("600 imported training clips checked");
  expect(notice.textContent).toContain("7 automatically rejected");
  expect(notice.textContent).toContain("assistance, bad form, added weight, combo mentions, or multiple exercise tags");
  expect(fetch.mock.calls.filter(([url]) => url.endsWith("/scan"))).toHaveLength(2);
});

it("selecting the current queue filter reloads it without leaving the selection empty", async () => {
  const fetch = vi.fn()
    .mockResolvedValueOnce(response(queue(1, 2)))
    .mockResolvedValueOnce(response(queue(2, 3)));
  vi.stubGlobal("fetch", fetch);
  render(<ReviewDashboard boards={boards} email="reviewer@example.test" />);
  await screen.findByRole("heading", { name: "Clip 1" });
  fireEvent.click(screen.getByRole("button", { name: /Awaiting review/ }));
  await screen.findByRole("heading", { name: "Clip 2" });
  expect(fetch).toHaveBeenCalledTimes(2);
});
