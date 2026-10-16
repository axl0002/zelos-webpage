// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  getRewrittenUrl,
  unstable_doesMiddlewareMatch,
  unstable_getResponseFromNextConfig,
} from "next/experimental/testing/server";
import { config as middlewareConfig } from "../src/middleware";

const require = createRequire(import.meta.url);
const { JSDOM } = require("jsdom");
const nextConfig = require("../next.config.js");
const publicDirectory = fileURLToPath(new URL("../public", import.meta.url));
const origin = "https://zelos.club";
const pages = [
  "/", "/index.html", "/about", "/about.html", "/support", "/support.html",
  "/stats", "/stats.html", "/equipment", "/equipment.html", "/privacy", "/terms",
  "/legal/privacy", "/legal/privacy.html", "/legal/terms", "/legal/terms.html",
];

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://obnirsfjxcvyyiocwaii.supabase.co");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "sb_publishable_test-public-key");
});
afterEach(() => vi.unstubAllEnvs());

async function resolvePublicUrl(url: string) {
  const response = await unstable_getResponseFromNextConfig({
    url, headers: { host: new URL(url).host }, nextConfig: nextConfig("phase-production-build"),
  });
  return { response, path: new URL(getRewrittenUrl(response) || url).pathname };
}

it.each(["/", "/support", "/support.html"])("redirects the support hostname at %s to the support page", async (path) => {
  const { response } = await resolvePublicUrl(`https://support.zelos.club${path}`);
  expect(response.status).toBe(308);
  expect(response.headers.get("location")).toBe("https://zelos.club/support");
});

it("keeps the static source and deployed public assets identical", () => {
  const legacyDirectory = fileURLToPath(new URL("../../site", import.meta.url));
  const files = (directory: string) => readdirSync(directory, { recursive: true })
    .map(String)
    .filter((name) => !name.endsWith(".DS_Store") && statSync(join(directory, name)).isFile())
    .sort();
  expect(files(publicDirectory)).toEqual(files(legacyDirectory));
  for (const name of files(legacyDirectory)) {
    expect(readFileSync(join(publicDirectory, name)).equals(readFileSync(join(legacyDirectory, name))), name).toBe(true);
  }
});

it.each(pages)("keeps %s and its linked local pages/assets public and available", async (pathname) => {
  const url = `${origin}${pathname}`;
  const { response, path } = await resolvePublicUrl(url);
  expect(response.headers.get("location")).toBeNull();
  expect(response.headers.get("cache-control")).toBeNull();
  expect(unstable_doesMiddlewareMatch({ config: middlewareConfig, url })).toBe(false);
  const html = readFileSync(join(publicDirectory, path), "utf8");
  // Parse without executing any page scripts or making network requests.
  const dom = new JSDOM(html, { url });
  const document = dom.window.document as Document;
  try {
    for (const element of document.querySelectorAll("[src], a[href], link[href]")) {
      const reference = element.getAttribute("src") || element.getAttribute("href");
      if (!reference) continue;
      const target = new URL(reference, url);
      if (target.origin !== origin) continue;
      const { path: asset } = await resolvePublicUrl(target.href);
      if (asset === "/scores") {
        expect(statSync(fileURLToPath(new URL("../src/app/scores/page.tsx", import.meta.url))).isFile()).toBe(true);
      } else {
        expect(statSync(join(publicDirectory, decodeURIComponent(asset))).isFile(), target.href).toBe(true);
      }
      expect(unstable_doesMiddlewareMatch({ config: middlewareConfig, url: target.href })).toBe(false);
    }
    if (["/", "/index.html", "/stats", "/stats.html", "/about", "/about.html", "/equipment", "/equipment.html"].includes(pathname)) {
      const shop = [...document.querySelectorAll("a")].find((a) => a.textContent?.trim() === "Shop");
      expect(shop?.href).toBe("https://shop.zelos.club/");
    }
    if (pathname === "/") {
      expect(document.title).toBe("Zelos - Calisthenics App");
      expect(document.querySelector('meta[name="robots"]')?.getAttribute("content")).toBe("index, follow");
    }
  } finally {
    dom.window.close();
  }
});

it.each([
  "/admin", "/admin/login", "/admin/auth/callback", "/admin/api/review",
  "/admin/api/review/decision", "/admin/api/review/scan", "/admin/api/auth/logout",
])("retains session handling and private responses for %s", async (pathname) => {
  const url = `${origin}${pathname}`;
  expect(unstable_doesMiddlewareMatch({ config: middlewareConfig, url })).toBe(true);
  const { response, path } = await resolvePublicUrl(url);
  expect(path).toBe(pathname);
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(response.headers.get("x-frame-options")).toBe("DENY");
});
