import { expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import SharedProfile, { generateMetadata } from "../src/app/profile/[id]/page";
vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("not found"); } }));
const id = "11111111-1111-4111-8111-111111111111";
it("offers an app destination and both store fallbacks without fetching profile data", async () => {
  render(await SharedProfile({ params: Promise.resolve({ id }) }));
  expect(screen.getByRole("link", { name: "Open in Zelos" }).getAttribute("href")).toBe(`club.zelos.app://profile/${id}`);
  expect(screen.getByRole("link", { name: "Download on the App Store" }).getAttribute("href")).toContain("6751625048");
  expect(screen.getByRole("link", { name: "Get it on Google Play" }).getAttribute("href")).toContain("club.zelos.app");
  const meta = await generateMetadata({ params: Promise.resolve({ id }) });
  expect(meta.other?.["apple-itunes-app"]).toContain(`app-argument=https://app.zelos.club/profile/${id}`);
});
it("rejects malformed profile identifiers", async () => {
  await expect(SharedProfile({ params: Promise.resolve({ id: "bad-id" }) })).rejects.toThrow("not found");
});
it("preserves profile association and adds battle paths for the existing iOS app", () => {
  const data = JSON.parse(readFileSync("public/.well-known/apple-app-site-association", "utf8"));
  expect(data.applinks.details).toEqual([{ appIDs: ["MK29ZT8FZ7.club.zelos.app"], components: [{ "/": "/profile/*", comment: "Shared Zelos athlete profiles" }, { "/": "/battle/*", comment: "Shared Zelos battles" }] }]);
});
it("publishes registered Android certificate fingerprints", () => {
  const data = JSON.parse(readFileSync("public/.well-known/assetlinks.json", "utf8"));
  expect(data[0].target.package_name).toBe("club.zelos.app");
  expect(data[0].target.sha256_cert_fingerprints).toHaveLength(3);
  for (const value of data[0].target.sha256_cert_fingerprints) expect(value).toMatch(/^([A-F0-9]{2}:){31}[A-F0-9]{2}$/);
});

it("uses safe display hints without changing the app destination", async () => {
  const props = { params: Promise.resolve({ id }), searchParams: Promise.resolve({ username: "xinweiway", country: "gb" }) };
  const { container } = render(await SharedProfile(props));
  expect(container.querySelector("h1")?.textContent).toBe("View xinweiway 🇬🇧 in Zelos");
  expect(container.querySelector(".page-intro")?.textContent).toBe("See their athlete records and training clips in the app.");
  expect(container.querySelector(".profile-open-button")?.getAttribute("href")).toBe(`club.zelos.app://profile/${id}`);
  expect((await generateMetadata(props)).title).toBe("View xinweiway 🇬🇧 in Zelos");
  const invalid = { params: Promise.resolve({ id }), searchParams: Promise.resolve({ username: '<script>alert(1)</script>', country: 'gb' }) };
  expect((await generateMetadata(invalid)).title).toBe("View profile in Zelos");
});
