import {renderToStaticMarkup} from "react-dom/server";
import {afterEach,beforeEach,expect,it,vi} from "vitest";
import {cleanup,render,screen} from "@testing-library/react";
import fixture from "./fixtures/score-rules.json";
import weights from "./fixtures/score-weights.json";
import {explanationFixture} from "./fixtures/score-explanation";
const loaders=vi.hoisted(()=>({status:vi.fn(),weights:vi.fn(),explanation:vi.fn()}));
vi.mock("../src/lib/score-rules.server",()=>({getPublicScoreRules:loaders.status}));
vi.mock("../src/lib/score-weights.server",()=>({getPublicScoreWeights:loaders.weights}));
vi.mock("../src/lib/score-explanation.server",()=>({getPublicScoreExplanation:loaders.explanation}));
import Page,{metadata} from "../src/app/scoring/page";
beforeEach(()=>{loaders.status.mockResolvedValue({schema_version:2,mode:"scores_only",revision:74,updated_at:"2026-11-06T00:00:00Z"});loaders.weights.mockResolvedValue(weights);loaders.explanation.mockResolvedValue(explanationFixture());});
afterEach(()=>{cleanup();vi.resetAllMocks();});
it("server renders concise currentmath and currentPush/Pulltables withindependent revision labels",async()=>{
  const page=await Page();render(page);expect(screen.getByRole("heading",{name:"How your Elo is calculated"})).toBeTruthy();expect(screen.getAllByRole("table")).toHaveLength(2);
  expect(screen.getByText("Scoring status revision 74")).toBeTruthy();expect(screen.getByText(/Explanation revision 75/)).toBeTruthy();expect(screen.getByText(/Weights revision 70/)).toBeTruthy();
  const html=renderToStaticMarkup(page);expect(html).toContain("185.4");expect(html).toContain("24.01%");expect(html).not.toMatch(/N − R|smoothing|magnitude_cap|benchmark_map|kappa|Formula v/);
  expect(screen.queryByRole("spinbutton")).toBeNull();expect(screen.queryByRole("link",{name:"View current weights (JSON)"})).toBeNull();expect(screen.getByRole("link",{name:"Download current weights (CSV)"})).toBeTruthy();expect(metadata.alternates?.canonical).toBe("https://zelos.club/scoring");
});
it("keepsverified weights whenstatus/explanation fail without showing stale methodnumbers",async()=>{
  loaders.status.mockRejectedValue(Error("private status"));loaders.explanation.mockRejectedValue(Error("private implementation"));render(await Page());
  expect(screen.getByText("Live scoring status is temporarily unavailable.")).toBeTruthy();expect(screen.getByText("Scoring explanation is temporarily unavailable.")).toBeTruthy();expect(screen.getAllByRole("table")).toHaveLength(2);
  expect(screen.queryByText(/Scoring status revision/)).toBeNull();expect(screen.queryByText(/Explanation revision/)).toBeNull();expect(document.body.textContent).not.toMatch(/185.4|private status|private implementation/);
});
it("keepsverified explanation whenstatus/weights fail and never mislabels its revision",async()=>{
  loaders.status.mockRejectedValue(Error("unavailable"));loaders.weights.mockRejectedValue(Error("unavailable"));render(await Page());
  expect(screen.getByText(/Explanation revision 75/)).toBeTruthy();expect(screen.getByText("Current exercise weights are temporarily unavailable.")).toBeTruthy();expect(screen.queryByRole("table")).toBeNull();expect(screen.queryByText(/Weights revision|Scoring status revision/)).toBeNull();
});
it("shows honestindependent unavailable states if allguardedcontracts fail",async()=>{
  for(const load of Object.values(loaders))load.mockRejectedValue(Error("private failure"));render(await Page());
  expect(screen.getByText("Scoring explanation is temporarily unavailable.")).toBeTruthy();expect(screen.getByText("Current exercise weights are temporarily unavailable.")).toBeTruthy();expect(screen.queryByRole("table")).toBeNull();expect(document.body.textContent).not.toContain("private failure");
});
it("uses compact currentrank-only metadata without reviving oldguide/calculator orduplicating tables",async()=>{
  loaders.status.mockResolvedValue(fixture);loaders.explanation.mockResolvedValue(explanationFixture("rank_only",3,1));render(await Page());
  expect(screen.getByText(/leaderboard standing is scaled by its exercise weight/)).toBeTruthy();expect(screen.getAllByRole("table")).toHaveLength(2);expect(screen.queryByRole("math")).toBeNull();expect(screen.queryByLabelText("Your position")).toBeNull();expect(screen.queryByText(/Worked Examples|The Formula|Formula v/)).toBeNull();
});
