// @vitest-environment node
import { afterEach, expect, it, vi } from "vitest";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { validatePublicEnvironment } = require("../public-env.cjs");
const nextConfig = require("../next.config.js");
afterEach(() => vi.unstubAllEnvs());

const url = "https://obnirsfjxcvyyiocwaii.supabase.co";
const jwt = (role: string, ref = "obnirsfjxcvyyiocwaii") =>
  `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({ role, ref })).toString("base64url")}.test-signature`;

it.each([jwt("anon"), "sb_publishable_test-public-key"])("accepts a public client key", (key) => {
  expect(() => validatePublicEnvironment({ NEXT_PUBLIC_SUPABASE_URL: url, NEXT_PUBLIC_SUPABASE_ANON_KEY: key })).not.toThrow();
});
it.each([
  jwt("service_role"), jwt("authenticated"), jwt("anon", "another-project"),
  "sb_secret_test-private-key", "sbp_test-management-token", undefined,
])("rejects private, wrong-project or missing keys before bundling", (key) => {
  expect(() => validatePublicEnvironment({ NEXT_PUBLIC_SUPABASE_URL: url, NEXT_PUBLIC_SUPABASE_ANON_KEY: key })).toThrow("public anon/publishable key");
});
it("stops Next.js config loading when a private key is put in the public variable", () => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", url);
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", jwt("service_role"));
  expect(() => nextConfig("phase-production-build")).toThrow("must never be used");
});
