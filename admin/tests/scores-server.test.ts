// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { getPublicScoreRules } from "../src/lib/score-rules.server";
import { GET } from "../src/app/scoring/rules.json/route";
import { unstable_doesMiddlewareMatch } from "next/experimental/testing/server";
import { config } from "../src/middleware";
import fixture from "./fixtures/score-rules.json";
beforeEach(() => {
  vi.stubEnv(
    "NEXT_PUBLIC_SUPABASE_URL",
    "https://obnirsfjxcvyyiocwaii.supabase.co",
  );
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "public-test-key");
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
it("fetches only the fixed read-only public RPC without session cookies or user input", async () => {
  const fetch = vi.fn(async () => ({ ok: true, json: async () => fixture }));
  vi.stubGlobal("fetch", fetch);
  expect((await getPublicScoreRules()).weights).toHaveLength(
    fixture.weights.length,
  );
  expect(fetch).toHaveBeenCalledWith(
    "https://obnirsfjxcvyyiocwaii.supabase.co/rest/v1/rpc/get_public_score_rules",
    expect.objectContaining({
      method: "POST",
      body: "{}",
      cache: "no-store",
      headers: {
        apikey: "public-test-key",
        Authorization: "Bearer public-test-key",
        "Content-Type": "application/json",
      },
    }),
  );
  for (const path of ["/scoring", "/scoring/rules.json"])
    expect(
      unstable_doesMiddlewareMatch({
        config,
        url: `https://zelos.club${path}`,
      }),
    ).toBe(false);
});
it("returns only validated public JSON and no credential fields", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok: true,
      json: async () => ({ ...fixture, api_key: "secret" }),
    })),
  );
  const response = await GET();
  expect(response.status).toBe(200);
  expect(response.headers.get("x-content-type-options")).toBe("nosniff");
  const body = await response.text();
  expect(body).not.toContain("secret");
  expect(body).not.toContain("public-test-key");
});
it("fails closed for unavailable or unknown algorithms without leaking upstream errors", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok: true,
      json: async () => ({ ...fixture, algorithm: "unknown_v2" }),
    })),
  );
  expect((await GET()).status).toBe(503);
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      throw new Error("private database credentials and SQL error");
    }),
  );
  const response = await GET();
  expect(response.status).toBe(503);
  expect(await response.text()).toBe(
    '{"error":"Scoring rules are temporarily unavailable."}',
  );
  expect(response.headers.get("cache-control")).toBe("no-store");
});
