// @vitest-environment node
import {createRequire} from "node:module";
import {readFileSync} from "node:fs";
import {createHash} from "node:crypto";
import vm from "node:vm";
import {afterEach, beforeEach, expect, it, vi} from "vitest";
import {unstable_getResponseFromNextConfig} from "next/experimental/testing/server";
const require = createRequire(import.meta.url);
const {JSDOM} = require("jsdom");
const nextConfig = require("../next.config.js");
beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://obnirsfjxcvyyiocwaii.supabase.co");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "sb_publishable_test-key");
});
afterEach(() => vi.unstubAllEnvs());

it.each(["/", "/about", "/stats", "/equipment", "/support", "/legal/privacy.html", "/scoring", "/profile/example", "/admin/login", "/admin/api/review"])("applies frame, MIME, referrer and capability protections at %s", async path => {
  const response = await unstable_getResponseFromNextConfig({url: "https://zelos.club" + path, nextConfig: nextConfig("phase-production-build")});
  expect(response.headers.get("x-frame-options")).toBe("DENY");
  expect(response.headers.get("x-content-type-options")).toBe("nosniff");
  expect(response.headers.get("referrer-policy")).toBe("no-referrer");
  expect(response.headers.get("permissions-policy")).toContain("camera=()");
  const policy = response.headers.get("content-security-policy");
  for (const directive of ["object-src 'none'", "frame-ancestors 'none'", "base-uri 'self'", "form-action 'self'"]) expect(policy).toContain(directive);
});

it.each(["index", "about", "support", "stats", "equipment", "legal/privacy", "legal/terms"])("permits the exact trusted inline scripts on %s without unsafe-inline scripts", async page => {
  const html = readFileSync(new URL("../public/" + page + ".html", import.meta.url), "utf8");
  const response = await unstable_getResponseFromNextConfig({url: `https://zelos.club/${page}.html`, nextConfig: nextConfig("phase-production-build")});
  const policy = response.headers.get("content-security-policy")!;
  expect(policy.split(";").find(d => d.trim().startsWith("script-src"))).not.toMatch(/unsafe-inline|unsafe-eval/);
  for (const match of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)) {
    if (match[1].trim()) expect(policy).toContain(`'sha256-${createHash("sha256").update(match[1]).digest("base64")}'`);
  }
});

it("renders stats failures as generic text instead of interpreting provider HTML", () => {
  const html = readFileSync(new URL("../public/stats.html", import.meta.url), "utf8");
  const dom = new JSDOM(html);
  let fail!: (error: unknown) => void;
  const source = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].find(m => m[1].includes("onSnapshot"))![1]
    .replace(/^\s*import\s[^;]+;\s*$/gm, "");
  try {
    vm.runInNewContext(source, {document: dom.window.document, initializeApp: () => ({}), initializeAppCheck: () => {}, ReCaptchaV3Provider: function() {}, getFirestore: () => ({}), doc: () => ({}), onSnapshot: (_ref: unknown, _ok: unknown, error: (error: unknown) => void) => {fail = error;}, console: {error: () => {}}});
    fail({code: "<img src=x onerror=alert(1)>", message: "<script>private-provider-error</script>"});
    expect(dom.window.document.querySelector("#updated")?.textContent).toBe("Statistics are temporarily unavailable. Please try again.");
    expect(dom.window.document.querySelector("#updated img")).toBeNull();
    expect(dom.window.document.body.textContent).not.toContain("private-provider-error");
    expect(dom.window.document.querySelector("#totalVoteCount")?.textContent).toBe("—");
  } finally {dom.window.close();}
});

it("pins the equipment page's external Three.js script with integrity and anonymous CORS", () => {
  const html = readFileSync(new URL("../public/equipment.html", import.meta.url), "utf8");
  const dom = new JSDOM(html);
  try {
    const script = dom.window.document.querySelector('script[src^="https://cdnjs.cloudflare.com/"]');
    expect(script.getAttribute("integrity")).toMatch(/^sha384-[A-Za-z0-9+/]{64}$/);
    expect(script.getAttribute("crossorigin")).toBe("anonymous");
  } finally {dom.window.close();}
});
