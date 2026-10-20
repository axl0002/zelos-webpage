import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
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
