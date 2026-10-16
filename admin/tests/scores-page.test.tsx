import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import fixture from "./fixtures/score-rules.json";
const get = vi.hoisted(() => vi.fn());
vi.mock("../src/lib/score-rules.server", () => ({ getPublicScoreRules: get }));
import Page, { metadata } from "../src/app/scoring/page";
afterEach(() => {
  cleanup();
  get.mockReset();
});
it("renders the formula and revision without requiring sign-in", async () => {
  get.mockResolvedValue(fixture);
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
  render(await Page());
  expect(
    screen.getByText("Scoring details are temporarily unavailable."),
  ).toBeTruthy();
  expect(screen.queryByRole("math")).toBeNull();
  expect(screen.queryByRole("table")).toBeNull();
});
