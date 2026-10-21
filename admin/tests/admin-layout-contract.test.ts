// @vitest-environment node
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { expect, it } from "vitest";
import postcss from "postcss";

const css = postcss.parse(readFileSync(resolve("src/app/admin/globals.css"), "utf8"));
function declarations(selector: string, media?: string) {
  const result: Record<string, string> = {};
  css.walkRules(selector, rule => {
    const parentMedia = rule.parent?.type === "atrule" ? (rule.parent as postcss.AtRule).params : undefined;
    if (parentMedia !== media) return;
    rule.walkDecls(declaration => {result[declaration.prop] = declaration.value;});
  });
  return result;
}
it("retains navigation on desktop and narrow screens with bounded scrolling instead of hiding links", () => {
  expect(declarations(".sidebar")).toMatchObject({position: "sticky", height: "100dvh", "overflow-y": "auto"});
  expect(declarations(".sidebar", "(max-width: 800px)")).toMatchObject({position: "sticky", "max-height": "50dvh"});
  expect(declarations(".nav-item", "(max-width: 800px)").display).toBe("flex");
  expect(declarations(".admin-navigation", "(max-width: 800px)")["grid-template-columns"]).toContain("repeat(3");
  expect(declarations(".admin-navigation", "(max-width: 420px)")["grid-template-columns"]).toContain("repeat(2");
  css.walkRules(rule => {
    if (rule.selector.split(",").some(selector => [".sidebar", ".nav-item", ".admin-navigation"].includes(selector.trim()))) {
      rule.walkDecls("display", declaration => expect(declaration.value).not.toBe("none"));
    }
  });
});
it("keeps narrow review actions and long dialogs usable without viewport overflow", () => {
  expect(declarations(".page-header")["flex-wrap"]).toBe("wrap");
  expect(declarations(".decision-actions")["flex-wrap"]).toBe("wrap");
  expect(declarations(".dialog")).toMatchObject({"overflow-y": "auto", "max-height": "calc(100dvh - 48px)", "overflow-wrap": "anywhere"});
  expect(declarations(".dialog", "(max-width: 420px)")["max-height"]).toBe("calc(100dvh - 24px)");
});
it("all six authenticated pages use one route-group layout without changing public URLs or including login", () => {
  const workspace = resolve("src/app/admin/(workspace)");
  for (const route of ["", "ranked-uploads/", "ranking-flags/", "reports/", "safety/", "users/"]) {
    const page = readFileSync(resolve(workspace, route + "page.tsx"), "utf8");
    expect(page).toContain("requireAdmin()");
    expect(page).not.toContain('className="sidebar"');
  }
  expect(readFileSync(resolve(workspace, "layout.tsx"), "utf8")).toContain("<AdminWorkspace>");
  expect(readdirSync(workspace)).not.toContain("login");
  expect(readFileSync(resolve("src/app/admin/login/page.tsx"), "utf8")).not.toContain("AdminWorkspace");
  expect(readFileSync(resolve("src/app/scoring/page.tsx"), "utf8")).not.toContain("AdminWorkspace");
});
