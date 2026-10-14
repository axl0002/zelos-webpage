import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { CandidateReview } from "../src/components/review-dashboard";
import { parseDecision } from "../src/lib/review-api";
import { mediaUrls } from "../src/lib/review-media";
import type { Board, Candidate, Decision } from "../src/lib/review-types";
beforeEach(() => {
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
const boards: Board[] = [
  {
    id: "pull-up",
    exercise_id: "pull",
    exercise_name: "Pull Up",
    name: "Pull Up",
    progression: null,
    metric: "reps",
    max_value: 60,
    form: "Full range",
    camera: "Side view",
  },
  {
    id: "planche-full",
    exercise_id: "planche",
    exercise_name: "Planche Hold",
    name: "Planche Hold · Full",
    progression: "Full",
    metric: "seconds",
    max_value: 120,
    form: "Straight arms",
    camera: "Side view",
  },
];
const candidate: Candidate = {
  post_id: "clip-1",
  revision: 1,
  status: "pending",
  title: "20 pull ups?",
  caption: "Maybe 30 next time",
  username: "athlete",
  country: "gb",
  author_id: "athlete-id",
  created_at: "2026-01-01",
  duration_ms: 30000,
  primary_url: "https://media.zelos.club/original.mp4",
  poster_url: null,
  renditions: { "720p": "https://media.zelos.club/720.mp4" },
  suggestions: [{ exercise_id: "pull", name: "Pull Up", evidence: ["title"] }],
  warnings: [],
  current_records: [],
  board_id: null,
  value: null,
  note: "",
  reviewed_at: null,
  result: null,
};
const decision: Decision = {
  post_id: "clip-1",
  revision: 1,
  decision: "approve",
  board_id: "pull-up",
  value: 12,
  note: "",
  watched: true,
  replace_current: false,
};
describe("input boundary", () => {
  it("rejects guessed missing fractional and invalid counts", () => {
    for (const value of [null, 0, -1, 1.5, "2", Infinity])
      expect(parseDecision({ ...decision, value })).toBeNull();
    expect(parseDecision({ ...decision, watched: false })).toBeNull();
    expect(parseDecision({ ...decision, revision: 0 })).toBeNull();
    expect(parseDecision(decision)).toEqual(decision);
  });
  it("requires a reason for a skip and no hidden rank mutation", () => {
    expect(parseDecision({ ...decision, decision: "skip" })).toBeNull();
    expect(
      parseDecision({
        ...decision,
        decision: "skip",
        board_id: null,
        value: null,
        note: "No clear set",
      }),
    ).not.toBeNull();
  });
  it("only plays safe R2 URLs and prefers 720p", () => {
    expect(
      mediaUrls({
        ...candidate,
        renditions: {
          original: "https://evil.test/x",
          "480p": "https://media.zelos.club/480.mp4",
          "720p": candidate.renditions["720p"],
        },
      }),
    ).toEqual([
      "https://media.zelos.club/720.mp4",
      "https://media.zelos.club/480.mp4",
      candidate.primary_url,
    ]);
    expect(
      mediaUrls({
        primary_url: "https://firebasestorage.googleapis.com/x",
        renditions: {
          a: "https://media.zelos.club.evil.test/x",
          b: "https://media.zelos.club@evil.test/x",
        },
      }),
    ).toEqual([]);
  });
});
it("starts blank and only approves measured reviewed values after confirmation", async () => {
  const saved = vi.fn();
  const fetch = vi
    .fn()
    .mockResolvedValue({ ok: true, json: async () => ({ active: true }) });
  vi.stubGlobal("fetch", fetch);
  render(
    <CandidateReview candidate={candidate} boards={boards} onSaved={saved} />,
  );
  const count = screen.getByLabelText("Completed reps") as HTMLInputElement;
  expect(count.value).toBe("");
  expect(
    (screen.getByText("Approve ranking ↗") as HTMLButtonElement).disabled,
  ).toBe(true);
  fireEvent.change(count, { target: { value: "12" } });
  expect(screen.queryByRole("checkbox")).toBeNull();
  fireEvent.click(screen.getByText("Approve ranking ↗"));
  expect(fetch).not.toHaveBeenCalled();
  fireEvent.click(screen.getByText("Confirm approval"));
  await waitFor(() => expect(saved).toHaveBeenCalledWith("approve", true));
  expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual(decision);
});
it("keeps counts and notes after a server conflict", async () => {
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValue({
        ok: false,
        json: async () => ({ error: "Someone already reviewed this clip." }),
      }),
  );
  render(
    <CandidateReview candidate={candidate} boards={boards} onSaved={vi.fn()} />,
  );
  fireEvent.change(screen.getByLabelText("Completed reps"), {
    target: { value: "13" },
  });
  fireEvent.change(screen.getByLabelText(/Review notes/), {
    target: { value: "Checked at 00:05" },
  });
  fireEvent.click(screen.getByText("Approve ranking ↗"));
  fireEvent.click(screen.getByText("Confirm approval"));
  await screen.findByRole("alert");
  expect(
    (screen.getByLabelText("Completed reps") as HTMLInputElement).value,
  ).toBe("13");
  expect(
    (screen.getByLabelText(/Review notes/) as HTMLTextAreaElement).value,
  ).toBe("Checked at 00:05");
});
it("keeps the review after a temporary session-check failure and allows a manual retry", async () => {
  const saved = vi.fn();
  const fetch = vi.fn()
    .mockResolvedValueOnce({
      ok: false,
      json: async () => ({ error: "Sign-in service temporarily unavailable. Try again." }),
    })
    .mockResolvedValueOnce({ ok: true, json: async () => ({ active: true }) });
  vi.stubGlobal("fetch", fetch);
  render(<CandidateReview candidate={candidate} boards={boards} onSaved={saved} />);
  fireEvent.change(screen.getByLabelText("Completed reps"), { target: { value: "12" } });
  fireEvent.change(screen.getByLabelText(/Review notes/), { target: { value: "Checked at 00:05" } });
  fireEvent.click(screen.getByText("Approve ranking ↗"));
  fireEvent.click(screen.getByText("Confirm approval"));
  expect((await screen.findByRole("alert")).textContent).toContain("temporarily unavailable");
  expect(saved).not.toHaveBeenCalled();
  expect(fetch).toHaveBeenCalledTimes(1);
  expect((screen.getByLabelText("Completed reps") as HTMLInputElement).value).toBe("12");
  expect((screen.getByLabelText(/Review notes/) as HTMLTextAreaElement).value).toBe("Checked at 00:05");
  fireEvent.click(screen.getByText("Approve ranking ↗"));
  fireEvent.click(screen.getByText("Confirm approval"));
  await waitFor(() => expect(saved).toHaveBeenCalledWith("approve", true));
  expect(fetch.mock.calls[1][1].body).toBe(fetch.mock.calls[0][1].body);
});
it("preserves existing entry unless reviewer explicitly opts in", () => {
  render(
    <CandidateReview
      candidate={{
        ...candidate,
        current_records: [
          {
            exercise_id: "pull",
            board_id: "pull-up",
            name: "Pull Up",
            value: 10,
            metric: "reps",
            origin: "native",
            post_id: "native",
          },
        ],
      }}
      boards={boards}
      onSaved={vi.fn()}
    />,
  );
  expect(
    (screen.getByLabelText(/Replace this athlete/) as HTMLInputElement).checked,
  ).toBe(false);
});
it("changing exercise clears the prior count", () => {
  render(
    <CandidateReview candidate={candidate} boards={boards} onSaved={vi.fn()} />,
  );
  fireEvent.change(screen.getByLabelText("Completed reps"), {
    target: { value: "12" },
  });
  fireEvent.change(screen.getByLabelText("Exercise"), {
    target: { value: "planche" },
  });
  expect(
    (screen.getByLabelText("Hold time (whole seconds)") as HTMLInputElement)
      .value,
  ).toBe("");
  expect((screen.getByText("Approve ranking ↗") as HTMLButtonElement).disabled).toBe(true);
});
