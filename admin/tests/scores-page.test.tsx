import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import fixture from "./fixtures/score-rules.json";
import weights from "./fixtures/score-weights.json";
const get = vi.hoisted(() => vi.fn());
const getWeights = vi.hoisted(() => vi.fn());
vi.mock("../src/lib/score-rules.server", () => ({ getPublicScoreRules: get }));
vi.mock("../src/lib/score-weights.server", () => ({ getPublicScoreWeights: getWeights }));
import Page, { metadata } from "../src/app/scoring/page";
afterEach(() => {
  cleanup();
  get.mockReset();
  getWeights.mockReset();
});
it("renders the formula and revision without requiring sign-in", async () => {
  get.mockResolvedValue(fixture);
  getWeights.mockResolvedValue(weights);
  const page = await Page();
  if (process.env.SCORES_RENDER_DIR) {
    const root = process.env.SCORES_RENDER_DIR;
    mkdirSync(root, { recursive: true });
    const css = readFileSync(resolve("public/styles.css"), "utf8");
    const markup = renderToStaticMarkup(page)
      .replace(/<link[^>]*rel="stylesheet"[^>]*>/g, "")
      .replaceAll(
        "/assets/",
        pathToFileURL(resolve("public/assets") + "/").href,
      );
    writeFileSync(
      `${root}/index.html`,
      `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style></head><body>${markup}</body></html>`,
    );
  }
  render(page);
  expect(screen.getByRole("heading", { level: 1 }).textContent).toContain(
    "Scoring",
  );
  expect(screen.getByRole("math")).toBeTruthy();
  expect(screen.getByText("Rules revision 1")).toBeTruthy();
  expect(metadata.alternates?.canonical).toBe("https://zelos.club/scoring");
});
it("shows an honest unavailable state instead of hardcoded stale scoring", async () => {
  get.mockRejectedValue(new Error("unavailable"));
  getWeights.mockRejectedValue(new Error("unavailable"));
  render(await Page());
  expect(
    screen.getByText("Scoring details are temporarily unavailable."),
  ).toBeTruthy();
  expect(screen.queryByRole("math")).toBeNull();
  expect(screen.queryByRole("table")).toBeNull();
});
it("renders current weight matrices in scores-only mode without revealing private algorithm math",async()=>{
 get.mockResolvedValue({schema_version:2,mode:"scores_only",revision:30,updated_at:"2026-10-23T00:00:00Z"});
 getWeights.mockResolvedValue(weights);
 const page=await Page();render(page);expect(screen.getByRole("heading",{name:"Your rankings"})).toBeTruthy();expect(screen.queryByRole("math")).toBeNull();expect(screen.getAllByRole("table")).toHaveLength(2);expect(screen.queryByText(/Formula v/)).toBeNull();expect(screen.queryByRole("spinbutton")).toBeNull();
 const html=renderToStaticMarkup(page);expect(html).not.toMatch(/W ×|N − R|smoothing|magnitude_cap|recordPoints/);expect(html).toContain("Weights revision 70");
});
it("keeps verified weights visible when status loading fails, without claiming weights are unavailable",async()=>{
 get.mockRejectedValue(Error("private status details"));getWeights.mockResolvedValue(weights);render(await Page());
 expect(screen.getByText("Scoring details are temporarily unavailable.")).toBeTruthy();expect(screen.getAllByRole("table")).toHaveLength(2);
 expect(screen.queryByText("Current exercise weights are temporarily unavailable.")).toBeNull();expect(screen.queryByRole("math")).toBeNull();expect(document.body.textContent).not.toContain("private status details");
});
it("shows independent weights error while keeping scores-only status available",async()=>{
 get.mockResolvedValue({schema_version:2,mode:"scores_only",revision:70,updated_at:weights.updated_at});getWeights.mockRejectedValue(Error("private weight details"));render(await Page());
 expect(screen.getByRole("heading",{name:"Your rankings"})).toBeTruthy();expect(screen.getByText("Current exercise weights are temporarily unavailable.")).toBeTruthy();expect(screen.queryByRole("table")).toBeNull();expect(screen.queryByRole("math")).toBeNull();expect(document.body.textContent).not.toContain("private weight details");
});
it("preserves the actual legacy rank-only guide without duplicate weight tables or a new-loader prerequisite",async()=>{
 get.mockResolvedValue(fixture);getWeights.mockRejectedValue(Error("new backend unavailable"));render(await Page());
 expect(screen.getByRole("math")).toBeTruthy();expect(screen.getByRole("region",{name:"Push weight comparison"})).toBeTruthy();expect(screen.getByRole("region",{name:"Pull weight comparison"})).toBeTruthy();
 expect(screen.queryByRole("heading",{name:"Current exercise weights"})).toBeNull();expect(screen.queryByText("Current exercise weights are temporarily unavailable.")).toBeNull();
});
