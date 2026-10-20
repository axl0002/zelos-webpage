import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import SafetyReviewDashboard from "../src/components/safety-review-dashboard";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it.each(["rejected", "failed"])("retained %s uploads can be previewed without a new approval action", async (state) => {
  vi.stubGlobal("fetch", vi.fn(async (input: string) => ({
    ok: true,
    json: async () => input.endsWith("/preview") ? { url: "https://private.example/retained" } : [{
      id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd", owner_id: "owner", post_id: "post",
      title: "Retained clip", state, error_code: state === "failed" ? "safety_unavailable" : null,
      review_note: "Review decision", created_at: "2026-10-15T00:00:00Z", evidence: null,
    }],
  })));
  const { container } = render(<SafetyReviewDashboard email="admin@example.test" />);
  await screen.findByRole("heading", { name: "Retained clip" });
  expect(screen.queryByRole("button", { name: "Approve upload" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Reject upload" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Open private video" }));
  await waitFor(() => expect(container.querySelector("video")?.src).toBe("https://private.example/retained"));
});

it("previews a flagged avatar as an image and requires review before approval", async () => {
  const requests: string[] = [];
  vi.stubGlobal("fetch", vi.fn(async (input: string) => {
    requests.push(input);
    const data = input.endsWith("/preview")
      ? { url: "https://private.example/avatar", expires_in: 120 }
      : input.endsWith("/decision")
        ? { ok: true }
        : [{
            id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
            owner_id: "owner",
            post_id: null,
            title: null,
            created_at: "2026-10-15T00:00:00Z",
            evidence: { frame_count: 1, frames: [] },
          }];
    return { ok: true, json: async () => data };
  }));
  render(<SafetyReviewDashboard email="admin@example.test" />);
  await screen.findByRole("heading", { name: "Profile image" });
  const approve = screen.getByRole("button", { name: "Approve upload" }) as HTMLButtonElement;
  expect(approve.disabled).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "Open private image" }));
  const image = await screen.findByAltText("Private profile image under review");
  expect(image.tagName).toBe("IMG");
  fireEvent.click(screen.getByRole("checkbox"));
  expect(approve.disabled).toBe(false);
  fireEvent.click(approve);
  expect(screen.getByRole("dialog")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: /^Approve$/ }));
  await waitFor(() => expect(requests.some((path) => path.endsWith("/decision"))).toBe(true));
});

const pendingUpload = {
  id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd", owner_id: "owner", post_id: "post",
  title: "Flagged upload", state: "review", created_at: "2026-10-15T00:00:00Z", evidence: null,
};
async function openReview() {
  await screen.findByRole("heading", {name: "Flagged upload"});
  fireEvent.click(screen.getByRole("button", {name: "Open private video"}));
  await waitFor(() => expect(document.querySelector("video")).not.toBeNull());
  fireEvent.click(screen.getByRole("checkbox"));
}
it("requires explicit rejection, persists the exact reason once and retains the private rejected original", async () => {
  const fetch = vi.fn(async (path: string, options: RequestInit) => ({ok: true,
    json: async () => path.endsWith("/preview") ? {url: "https://private.example/video"} : path.endsWith("/decision") ? {ok: true} : [pendingUpload]}));
  vi.stubGlobal("fetch", fetch); render(<SafetyReviewDashboard email="admin@example.test" />); await openReview();
  expect((screen.getByRole("button", {name: "Reject upload"}) as HTMLButtonElement).disabled).toBe(true);
  fireEvent.change(screen.getByLabelText("Review note"), {target: {value: "Explicit material verified."}});
  fireEvent.click(screen.getByRole("button", {name: "Reject upload"}));
  expect(fetch.mock.calls.filter(([path]) => path.endsWith("/decision"))).toHaveLength(0);
  const save = within(screen.getByRole("dialog")).getByRole("button", {name: "Reject"}); fireEvent.click(save); fireEvent.click(save);
  await screen.findByText("Rejected. The original is retained privately for inspection.");
  const calls = fetch.mock.calls.filter(([path]) => path.endsWith("/decision")); expect(calls).toHaveLength(1);
  expect(JSON.parse(calls[0][1].body as string)).toEqual({upload_id: pendingUpload.id, approve: false, review_note: "Explicit material verified."});
  expect(screen.queryByRole("button", {name: "Approve upload"})).toBeNull();
  expect(screen.getByRole("button", {name: "Open private video"})).toBeTruthy();
});
it("blocks queue changes while saving and preserves all inputs after a failed decision", async () => {
  let finish!: (value: unknown) => void;
  const fetch = vi.fn(async (path: string) => path.endsWith("/decision") ? new Promise(resolve => {finish = resolve;})
    : {ok: true, json: async () => path.endsWith("/preview") ? {url: "https://private.example/video"} : [pendingUpload, {...pendingUpload, id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee", title: "Other upload"}]});
  vi.stubGlobal("fetch", fetch); render(<SafetyReviewDashboard email="admin@example.test" />); await openReview();
  fireEvent.change(screen.getByLabelText("Review note"), {target: {value: "Keep my decision note"}});
  fireEvent.click(screen.getByRole("button", {name: "Approve upload"})); fireEvent.click(screen.getByRole("button", {name: /^Approve$/}));
  expect((screen.getByRole("button", {name: /Other upload/}) as HTMLButtonElement).disabled).toBe(true);
  expect((screen.getByRole("button", {name: "Refresh queue"}) as HTMLButtonElement).disabled).toBe(true);
  finish({ok: false, json: async () => ({error: "Upload changed. Refresh before deciding."})});
  await screen.findByRole("alert"); expect((screen.getByLabelText("Review note") as HTMLTextAreaElement).value).toBe("Keep my decision note");
  expect((screen.getByRole("checkbox") as HTMLInputElement).checked).toBe(true);
  expect(screen.queryByRole("status")).toBeNull(); expect(screen.queryByRole("dialog")).toBeNull();
});
it("clears watched confirmation on playback failure, renewed links and queue refresh", async () => {
  vi.stubGlobal("fetch", vi.fn(async (path: string) => ({ok: true, json: async () => path.endsWith("/preview") ? {url: "https://private.example/video"} : [pendingUpload]})));
  const {container} = render(<SafetyReviewDashboard email="admin@example.test" />); await openReview();
  fireEvent.error(container.querySelector("video")!);
  expect((screen.getByRole("checkbox") as HTMLInputElement).checked).toBe(false);
  expect((screen.getByRole("button", {name: "Approve upload"}) as HTMLButtonElement).disabled).toBe(true);
  await openReview(); fireEvent.click(screen.getByRole("button", {name: "Refresh video link"}));
  await waitFor(() => expect(container.querySelector("video")).not.toBeNull());
  expect((screen.getByRole("checkbox") as HTMLInputElement).checked).toBe(false);
  fireEvent.click(screen.getByRole("checkbox")); fireEvent.click(screen.getByRole("button", {name: "Refresh queue"}));
  await waitFor(() => expect(screen.getByRole("button", {name: "Refresh queue"}).hasAttribute("disabled")).toBe(false));
  expect(container.querySelector("video")).toBeNull(); expect((screen.getByRole("checkbox") as HTMLInputElement).checked).toBe(false);
});
