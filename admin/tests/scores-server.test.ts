// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { getPublicScoreRules } from "../src/lib/score-rules.server";
import { GET } from "../src/app/scoring/rules.json/route";
import { unstable_doesMiddlewareMatch } from "next/experimental/testing/server";
import { config } from "../src/middleware";
import fixture from "./fixtures/score-rules.json";
import submissionPolicy from "./fixtures/submission-policy.json";
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
    ).toBe(path === "/scoring"); // Nonce headers only; no public session lookup.
});
it("returns only validated public JSON and no credential fields", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok: true,
      json: async () => ({ ...fixture, api_key: "secret", clip_policy: {
        ranked_hold_extra_seconds: 5, ranked_hold_min_extra_seconds: 1, scope: "new_uploads",
        service_role_key: "private-clip-key",
      } }),
    })),
  );
  const response = await GET();
  expect(response.status).toBe(200);
  expect(response.headers.get("x-content-type-options")).toBe("nosniff");
  const body = await response.text();
  expect(body).not.toContain("secret");
  expect(body).not.toContain("private-clip-key");
  expect(body).not.toContain("public-test-key");
  expect(JSON.parse(body).clip_policy).toEqual({ranked_hold_extra_seconds: 5,
    ranked_hold_min_extra_seconds: 1, scope: "new_uploads"});
});
it("fails closed on malformed clip policy without exposing its contents", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => ({ok: true, json: async () => ({...fixture,
    clip_policy: {ranked_hold_extra_seconds: 0, ranked_hold_min_extra_seconds: 1,
      scope: "new_uploads", service_role_key: "private-clip-key"}})})));
  const response = await GET();
  expect(response.status).toBe(503);
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(await response.json()).toEqual({error: "Scoring rules are temporarily unavailable."});
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

it("publishes only validated replacement metadata from the read-only scoring RPC", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => ({ok: true, json: async () => ({...fixture,
    submission_policy: {...submissionPolicy, private_account: "private-value"}})})));
  const response = await GET();
  expect(response.status).toBe(200);
  const body = await response.text();
  expect(JSON.parse(body).submission_policy).toEqual(submissionPolicy);
  expect(body).not.toContain("private-value");
});

it("fails closed when the replacement policy contradicts the published explanation", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => ({ok: true, json: async () => ({...fixture,
    submission_policy: {...submissionPolicy, selection: "highest_result", private_key: "private-value"}})})));
  const response = await GET();
  expect(response.status).toBe(503);
  expect(await response.json()).toEqual({error: "Scoring rules are temporarily unavailable."});
});
