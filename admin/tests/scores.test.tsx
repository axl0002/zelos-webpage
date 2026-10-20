import { afterEach, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  formatPoints,
  parseScoreRules,
  recordPoints,
} from "../src/lib/score-rules";
import ScoreCalculator from "../src/components/score-calculator";
import ScoringGuide from "../src/components/scoring-guide";
import fixture from "./fixtures/score-rules.json";
const rules = parseScoreRules(fixture);
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
it("calculates known results, bounds, zero smoothing and competition ties", () => {
  expect(recordPoints(100, 10, 1, 10)).toBe(75);
  expect(recordPoints(100, 10, 5, 10)).toBeCloseTo(55);
  expect(recordPoints(85, 1, 1, 10)).toBeCloseTo(46.36363636);
  expect(recordPoints(85, 10, 1, 0)).toBe(85);
  expect(recordPoints(100, 10, 3, 10)).toBe(65);
  for (let n = 1; n <= 100; n++)
    for (let rank = 1; rank <= n; rank++) {
      const score = recordPoints(85, n, rank, 10)!;
      expect(score).toBeGreaterThan(0);
      expect(score).toBeLessThanOrEqual(85);
      if (rank < n)
        expect(score).toBeGreaterThan(recordPoints(85, n, rank + 1, 10)!);
    }
  for (const [n, r] of [
    [0, 1],
    [10, 0],
    [10, 11],
    [10, 1.5],
    [1.5, 1],
    [NaN, 1],
    [Infinity, 1],
  ])
    expect(recordPoints(85, n, r, 10)).toBeNull();
});
it("compares every enabled progression at its weight and excludes disabled progressions", () => {
  render(<ScoringGuide rules={rules} />);
  for (const discipline of ["push", "pull"]) {
    const table = screen.getByRole("table", {
      name: `All ${discipline} exercise and progression weights`,
    });
    const headers = within(table).getAllByRole("columnheader");
    const rows = within(table).getAllByRole("row").slice(1);
    const weights = rows.map((row) => Number(within(row).getByRole("rowheader").textContent));
    expect(weights).toEqual([...weights].sort((a, b) => a - b));
    for (const board of rules.weights.filter((w) => w.discipline === discipline && w.enabled)) {
      const column = headers.findIndex((header) => header.textContent?.startsWith(board.exercise));
      expect(column).toBeGreaterThan(0);
      const row = rows.find((row) => within(row).getByRole("rowheader").textContent === String(board.weight))!;
      const cell = within(row).getAllByRole("cell")[column - 1];
      expect(cell.textContent).toContain(board.progression || board.exercise);
    }
  }
  const push = screen.getByRole("table", { name: "All push exercise and progression weights" });
  const pressColumn = within(push).getAllByRole("columnheader").findIndex((header) => header.textContent?.startsWith("Planche Press"));
  for (const weight of [35, 50]) {
    const row = within(push).getByRole("rowheader", { name: String(weight) }).closest("tr")!;
    expect(within(row).getAllByRole("cell")[pressColumn - 1].textContent).toBe("");
  }
  expect(within(push).getAllByRole("rowheader").map((header) => Number(header.textContent)))
    .toEqual(Array.from({ length: 49 }, (_, i) => 10 + i * 5));
  expect(within(push).getByRole("rowheader", { name: "15" }).closest("tr")?.textContent).toBe("15");
  expect(screen.queryByText("Disabled")).toBeNull();
  expect(screen.queryByText(/coming soon|coming-soon/i)).toBeNull();
  const pull = screen.getByRole("table", { name: "All pull exercise and progression weights" });
  expect(within(pull).getByRole("rowheader", { name: "250" }).closest("tr")?.textContent).toContain("SAT");
  expect(within(screen.getByLabelText("Exercise / progression")).getByRole("option", { name: /SAT/ })).toBeTruthy();
  expect(
    screen
      .getByRole("link", { name: /View scoring rules/ })
      .getAttribute("href"),
  ).toBe("/scoring/rules.json");
});
it("calculator updates locally and rejects impossible or partial inputs", () => {
  const fetch = vi.fn();
  vi.stubGlobal("fetch", fetch);
  render(<ScoreCalculator rules={rules} />);
  expect(screen.getByText("63.75")).toBeTruthy();
  fireEvent.change(screen.getByLabelText("Your position"), {
    target: { value: "5" },
  });
  expect(screen.getByText("46.75")).toBeTruthy();
  fireEvent.change(screen.getByLabelText("Athletes on this board"), {
    target: { value: "1" },
  });
  expect(screen.getByText(/Enter a whole-number/)).toBeTruthy();
  fireEvent.change(screen.getByLabelText("Your position"), {
    target: { value: "1" },
  });
  expect(screen.getByText("46.36")).toBeTruthy();
  fireEvent.change(screen.getByLabelText("Athletes on this board"), {
    target: { value: "" },
  });
  expect(screen.getByText(/Enter a whole-number/)).toBeTruthy();
  expect(fetch).not.toHaveBeenCalled();
});
it("accepts higher weights in the public contract, comparison tables and calculator", () => {
  const higher = parseScoreRules({
    ...fixture,
    weights: fixture.weights.map((w) => ({
      ...w,
      weight: w.id === "planche-hold-full" ? 150 : w.weight,
    })),
  });
  expect(recordPoints(150, 10, 1, 10)).toBe(112.5);
  expect(recordPoints(200, 10, 1, 10)).toBe(150);
  // Calculate the fraction first so a valid large weight does not overflow
  // from multiplication by the board size before division.
  expect(recordPoints(Number.MAX_VALUE, 10, 1, 10)).toBe(Number.MAX_VALUE * 0.75);
  render(<ScoringGuide rules={higher} />);
  const table = screen.getByRole("table", { name: "All push exercise and progression weights" });
  const row = within(table).getByRole("rowheader", { name: "150" }).closest("tr")!;
  const column = within(table).getAllByRole("columnheader")
    .findIndex((header) => header.textContent?.startsWith("Planche Hold"));
  expect(within(row).getAllByRole("cell")[column - 1].textContent).toBe("Full");
  expect(document.querySelector(".score-calculator-output strong")?.textContent).toBe("112.50");
  for (const weight of [-1, NaN, Infinity, -Infinity]) {
    expect(recordPoints(weight, 10, 1, 10)).toBeNull();
    expect(() => parseScoreRules({
      ...fixture,
      weights: [{ ...fixture.weights[0], weight }],
    })).toThrow();
  }
});
it("uses changed settings and weights for examples and top-K totals", () => {
  const changed = parseScoreRules({
    ...fixture,
    top_k: 2,
    smoothing: 0,
    weights: fixture.weights.map((w) => ({
      ...w,
      weight: w.id === "planche-hold-full" ? 80 : w.weight,
    })),
  });
  render(<ScoringGuide rules={changed} />);
  expect(
    screen.getByText(/Your best 2 exercise scores count/),
  ).toBeTruthy();
  expect(
    screen.getByText("Weight 80, 10 athletes, first place, smoothing 0."),
  ).toBeTruthy();
  expect(
    screen.getByRole("heading", {
      name: "Discipline total: your highest 2 exercise scores",
    }),
  ).toBeTruthy();
  const rows = within(
    screen.getByRole("table", { name: "Hypothetical Pull records" }),
  )
    .getAllByRole("row")
    .slice(1);
  const counted = rows.filter(
    (row) => !row.textContent?.includes("Outside best"),
  );
  expect(counted).toHaveLength(2);
  expect(
    screen.getByText(/Pull points/).closest("strong")?.textContent,
  ).toContain(
    formatPoints(
      counted.reduce(
        (sum, row) =>
          sum + Number(within(row).getAllByRole("cell").at(-1)!.textContent),
        0,
      ),
    ),
  );
});
it("escapes catalogue labels and strips unapproved response fields", () => {
  const malicious = parseScoreRules({
    ...fixture,
    private_token: "must-not-leak",
    weights: [
      {
        ...fixture.weights[0],
        exercise: "<script>alert(1)</script>",
        athlete_id: "private",
      },
    ],
  });
  expect(JSON.stringify(malicious)).not.toContain("must-not-leak");
  expect(JSON.stringify(malicious)).not.toContain("athlete_id");
  const html = renderToStaticMarkup(<ScoringGuide rules={malicious} />);
  expect(html).toContain("&lt;script&gt;");
  expect(html).not.toContain("<script>alert(1)</script>");
  for (const patch of [
    { algorithm: "new_formula" },
    { top_k: 0 },
    { prior: 0.8 },
    { formula: "execute SQL" },
    { smoothing: NaN },
  ])
    expect(() => parseScoreRules({ ...fixture, ...patch })).toThrow();
});

it("publishes review policy from the safe contract with cutoff, ties and pending record behavior", () => {
  const published = parseScoreRules({...fixture, review_policy: {
    enabled: true, top_percent: 10,
    always_review_boards: [{id: "sat", name: "SAT"}, {id: "maltese", name: "Maltese"}],
    private_admin_token: "must-not-leak",
  }});
  render(<ScoringGuide rules={published} />);
  const policy = document.querySelector("#publication-review")!;
  expect(policy.textContent).toContain("top 10%");
  expect(policy.textContent).toContain("cutoff of rank 2");
  expect(policy.textContent).toContain("all ties at the cutoff require review");
  expect(policy.textContent).toContain("same gender");
  expect(policy.textContent).toContain("Country filters do not affect");
  expect(policy.textContent).toContain("video stays private and earns no points");
  expect(policy.textContent).toContain("personal best remains in place");
  expect(within(policy as HTMLElement).getByText("SAT")).toBeTruthy();
  expect(JSON.stringify(published)).not.toContain("must-not-leak");
});
it("handles zero percentage, disabled review policy and older contracts without inventing defaults", () => {
  const old = parseScoreRules(fixture);
  expect(old.review_policy).toBeUndefined();
  const zero = parseScoreRules({...fixture, review_policy: {enabled: true, top_percent: 0,
    always_review_boards: [{id: "sat", name: "SAT"}]}});
  const {rerender} = render(<ScoringGuide rules={zero} />);
  expect(screen.getByText("The percentage-based review threshold is currently disabled.")).toBeTruthy();
  expect(document.querySelector("#publication-review")?.textContent).toContain("Every ranked upload on these progression boards requires review");
  rerender(<ScoringGuide rules={{...zero, review_policy: {...zero.review_policy!, enabled: false}}} />);
  expect(document.querySelector("#publication-review")?.textContent).toContain("review gate for projected ranking position and specified progression boards is currently disabled");
  rerender(<ScoringGuide rules={old} />);
  expect(document.querySelector("#publication-review")).toBeNull();
});
it("rejects malformed review policies and strips extra fields from board policy entries", () => {
  const policy = {enabled: true, top_percent: 10, always_review_boards: [{id: "sat", name: "SAT", athlete: "private"}]};
  expect(parseScoreRules({...fixture, review_policy: policy}).review_policy).toEqual({enabled: true, top_percent: 10,
    always_review_boards: [{id: "sat", name: "SAT"}]});
  for (const value of [null, {}, {...policy, enabled: "yes"}, {...policy, top_percent: -1},
    {...policy, top_percent: 101}, {...policy, top_percent: NaN}, {...policy, always_review_boards: null},
    {...policy, always_review_boards: [{id: "sat", name: "SAT"}, {id: "sat", name: "Duplicate"}]}]) {
    expect(() => parseScoreRules({...fixture, review_policy: value})).toThrow("Scoring rules unavailable");
  }
});

const clipPolicy = {ranked_hold_extra_seconds: 6, ranked_hold_min_extra_seconds: 1, scope: "new_uploads"};
it("explains the published hold length bounds, app trimming and new-upload scope", () => {
  const published = parseScoreRules({...fixture, clip_policy: clipPolicy});
  const {rerender} = render(<ScoringGuide rules={published} />);
  const policyText = () => document.querySelector("#ranked-clip-length")!.textContent;
  expect(policyText()).toContain("at least 1 second longer than the claimed hold");
  expect(policyText()).toContain("no more than 6 seconds longer");
  expect(policyText()).toContain("between 11 and 16 seconds long, inclusive");
  expect(policyText()).toContain("app’s video trim tool before uploading");
  expect(policyText()).toContain("Keep the full hold visible");
  expect(policyText()).toContain("Rep-based ranked clips and training clips keep their three-minute limit");
  expect(policyText()).toContain("Existing historical records are unaffected");
  // Examples follow the published settings without changing the scoring formula.
  const changed = parseScoreRules({...fixture, clip_policy: {...clipPolicy,
    ranked_hold_min_extra_seconds: 2, ranked_hold_extra_seconds: 6}});
  rerender(<ScoringGuide rules={changed} />);
  expect(policyText()).toContain("at least 2 seconds longer");
  expect(policyText()).toContain("no more than 6 seconds longer");
  expect(policyText()).toContain("between 12 and 16 seconds long, inclusive");
  expect(changed.formula).toBe(rules.formula);
  expect(changed.weights).toEqual(rules.weights);
});
it("keeps older scoring contracts usable without inventing a clip policy", () => {
  const old = parseScoreRules(fixture);
  expect(old.clip_policy).toBeUndefined();
  render(<ScoringGuide rules={old} />);
  expect(document.querySelector("#ranked-clip-length")).toBeNull();
  expect(screen.getByRole("heading", {name: "Which records are eligible?"})).toBeTruthy();
});
it("rejects invalid clip policies and allows only public length settings", () => {
  const published = parseScoreRules({...fixture, clip_policy: {...clipPolicy,
    service_role_key: "must-not-leak", private_object_key: "private-upload.mp4"}});
  expect(published.clip_policy).toEqual(clipPolicy);
  const html = renderToStaticMarkup(<ScoringGuide rules={published} />);
  expect(html).not.toContain("must-not-leak");
  expect(JSON.stringify(published)).not.toContain("private-upload.mp4");
  for (const value of [null, {}, [], "new_uploads",
    {...clipPolicy, scope: "all_records"}, {...clipPolicy, scope: "<script>private</script>"},
    {...clipPolicy, ranked_hold_extra_seconds: "5"},
    {...clipPolicy, ranked_hold_extra_seconds: NaN},
    {...clipPolicy, ranked_hold_extra_seconds: Infinity},
    {...clipPolicy, ranked_hold_extra_seconds: 181},
    {...clipPolicy, ranked_hold_extra_seconds: 0},
    {...clipPolicy, ranked_hold_min_extra_seconds: 0},
    {...clipPolicy, ranked_hold_min_extra_seconds: -1},
    {...clipPolicy, ranked_hold_min_extra_seconds: 7},
    {...clipPolicy, ranked_hold_min_extra_seconds: 1.5},
    {...clipPolicy, ranked_hold_min_extra_seconds: undefined}]) {
    expect(() => parseScoreRules({...fixture, clip_policy: value})).toThrow("Scoring rules unavailable");
  }
});

it("documents uncapped rep claims only from the validated public policy", () => {
  const claim_policy = {reps: "positive_integer_no_exercise_maximum", seconds: "positive_integer_board_maximum"};
  const updated = parseScoreRules({...fixture, claim_policy: {...claim_policy, private_key: "secret"}});
  expect(updated.claim_policy).toEqual(claim_policy);
  render(<ScoringGuide rules={updated} />);
  expect(screen.getByText(/no exercise-specific maximum/)).toBeTruthy();
  expect(screen.getByText(/Hold times remain subject/)).toBeTruthy();
  expect(() => parseScoreRules({...fixture, claim_policy: {...claim_policy, reps: "unbounded_numeric"}})).toThrow();
});
