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
  expect(recordPoints(100, 10, 5, 10)).toBe(55);
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
it("shows every public weight and marks disabled boards", () => {
  render(<ScoringGuide rules={rules} />);
  for (const discipline of ["push", "pull"]) {
    const table = screen.getByRole("table", {
      name: `All ${discipline} exercise and progression weights`,
    });
    const headers = within(table).getAllByRole("columnheader");
    const rows = within(table).getAllByRole("row").slice(1);
    const weights = rows.map((row) => Number(within(row).getByRole("rowheader").textContent));
    expect(weights).toEqual([...weights].sort((a, b) => a - b));
    for (const board of rules.weights.filter((w) => w.discipline === discipline)) {
      const column = headers.findIndex((header) => header.textContent?.startsWith(board.exercise));
      expect(column).toBeGreaterThan(0);
      const row = rows.find((row) => within(row).getByRole("rowheader").textContent === String(board.weight))!;
      const cell = within(row).getAllByRole("cell")[column - 1];
      expect(cell.textContent).toContain(board.progression || board.exercise);
      if (!board.enabled) expect(cell.textContent).toContain("Disabled");
    }
  }
  expect(screen.getAllByText("Disabled")).toHaveLength(
    rules.weights.filter((w) => !w.enabled).length,
  );
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
