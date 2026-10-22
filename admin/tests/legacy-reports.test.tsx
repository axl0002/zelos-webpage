import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import LegacyReportsDashboard from "../src/components/legacy-reports-dashboard";
import { parseLegacyReports } from "../src/lib/legacy-reports";
const report = {id: "11111111-1111-4111-8111-111111111111", target_kind: "post", target_id: null, state: "open", revision: 1,
  created_at: "2026-06-01T00:00:00Z", username: "athlete", reason: "Fake content", details: "Original evidence", body: null,
  review_note: null, reporter_available: false, target_available: false, can_ban: true};
afterEach(cleanup);
beforeEach(() => {vi.restoreAllMocks();});
it("allows missing references but strips internal and reporter identifiers", () => {
  const [parsed] = parseLegacyReports([{...report, reporter_id: "private", owner_id: "private", source_id: "private"}]);
  expect(parsed.target_id).toBeNull(); expect(JSON.stringify(parsed)).not.toContain("private");
  expect(() => parseLegacyReports([{...report, revision: 0}])).toThrow();
});
it("shows missing references, requires reviewed evidence and notes, then removes a reviewed report from the open queue", async () => {
  let reviewed = false;
  const fetcher = vi.spyOn(globalThis, "fetch").mockImplementation(async (_url, init) => {
    if (init?.method === "POST") {reviewed = true; return new Response(JSON.stringify({ok: true}));}
    return new Response(JSON.stringify([{...report, state: reviewed ? "reviewed" : "open", revision: reviewed ? 2 : 1}]));
  });
  render(<LegacyReportsDashboard />);
  expect(await screen.findByText(/original report has no video ID/)).not.toBeNull();
  expect(screen.getByText(/original reporter account is unavailable/)).not.toBeNull();
  expect(screen.queryByRole("button", {name: "Open reported post"})).toBeNull();
  const button = screen.getByRole("button", {name: "Mark reviewed"}); expect((button as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(screen.getByRole("checkbox")); fireEvent.change(screen.getByLabelText("Review note"), {target: {value: "Missing video; checked evidence"}});
  fireEvent.click(button);
  await screen.findByText("No reports in this queue.");
  expect(JSON.parse(String(fetcher.mock.calls.find(([, init]) => init?.method === "POST")?.[1]?.body))).toEqual({report_id: report.id, expected_revision: 1, decision: "reviewed", note: "Missing video; checked evidence", reviewed_evidence: true});
  fireEvent.change(screen.getByLabelText("Show"), {target: {value: "all"}});
  expect(await screen.findByRole("heading", {name: "athlete"})).not.toBeNull();
  expect(screen.queryByRole("button", {name: "Mark reviewed"})).toBeNull();
});
it("keeps explicit ban confirmation mounted and retains the reason after a failed request", async () => {
  vi.spyOn(globalThis, "fetch").mockImplementation(async (_url, init) => init?.method === "POST"
    ? new Response(JSON.stringify({error: "Refresh the report and try again."}), {status: 409}) : new Response(JSON.stringify([report])));
  render(<LegacyReportsDashboard />); await screen.findByText(/original report has no video ID/);
  fireEvent.change(screen.getByLabelText("Ban reason (shown to the user)"), {target: {value: "Verified violation"}});
  fireEvent.click(screen.getByRole("button", {name: "Ban user"}));
  const dialog = screen.getByRole("dialog"); fireEvent.click(within(dialog).getByRole("button", {name: "Confirm action"}));
  await waitFor(() => expect(within(dialog).getByRole("alert").textContent).toContain("Refresh the report"));
  expect((screen.getByLabelText("Ban reason (shown to the user)") as HTMLTextAreaElement).value).toBe("Verified violation");
});
