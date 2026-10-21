import { expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import SharedProfile, { generateMetadata } from "../src/app/profile/[id]/page";
vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("not found"); } }));
const id = "11111111-1111-4111-8111-111111111111";
it("offers an app destination and both store fallbacks without fetching profile data", async () => {
  render(await SharedProfile({ params: Promise.resolve({ id }) }));
  expect(screen.getByRole("link", { name: "Open in Zelos" }).getAttribute("href")).toBe(`club.zelos.app://profile/${id}`);
  expect(screen.getByRole("link", { name: "App Store" }).getAttribute("href")).toContain("6751625048");
  expect(screen.getByRole("link", { name: "Google Play" }).getAttribute("href")).toContain("club.zelos.app");
  const meta = await generateMetadata({ params: Promise.resolve({ id }) });
  expect(meta.other?.["apple-itunes-app"]).toContain(`app-argument=https://app.zelos.club/profile/${id}`);
});
it("rejects malformed profile identifiers", async () => {
  await expect(SharedProfile({ params: Promise.resolve({ id: "bad-id" }) })).rejects.toThrow("not found");
});
it("associates only shared profile paths with the existing iOS app", () => {
  const data = JSON.parse(readFileSync("public/.well-known/apple-app-site-association", "utf8"));
  expect(data.applinks.details).toEqual([{ appIDs: ["MK29ZT8FZ7.club.zelos.app"], components: [{ "/": "/profile/*", comment: "Shared Zelos athlete profiles" }] }]);
});
it("publishes registered Android certificate fingerprints", () => {
  const data = JSON.parse(readFileSync("public/.well-known/assetlinks.json", "utf8"));
  expect(data[0].target.package_name).toBe("club.zelos.app");
  expect(data[0].target.sha256_cert_fingerprints).toHaveLength(3);
  for (const value of data[0].target.sha256_cert_fingerprints) expect(value).toMatch(/^([A-F0-9]{2}:){31}[A-F0-9]{2}$/);
});
