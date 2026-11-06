import {afterEach,expect,it} from "vitest";
import {cleanup,render,screen} from "@testing-library/react";
import {renderToStaticMarkup} from "react-dom/server";
import ScoringExplanation from "../src/components/scoring-explanation";
import {parseScoreExplanation} from "../src/lib/score-explanation";
import {explanationFixture} from "./fixtures/score-explanation";
afterEach(cleanup);
it("renders current50/50 blend, oneactive progression, top5rates and engine-evaluated185.4example concisely",()=>{
  render(<ScoringExplanation explanation={parseScoreExplanation(explanationFixture())}/>);
  const text=document.body.textContent!;expect(text).toContain("Push and Pull are scored separately");expect(text).toContain("50% leaderboard standing and 50% performance against an expert reference");
  expect(text).toContain("One active progression counts per exercise");expect(text).toContain("Up to 5 highest exercise scores contribute 100%, 70%, 49%, 34.3% and 24.01%");
  expect(text).toContain("Example exercise scores: 100 Elo + 80 Elo × 70% + 60 Elo × 49% = 185.4 overall Elo");expect(screen.queryByRole("spinbutton")).toBeNull();
  expect(text).not.toContain("further reduce the blended score");expect(text).not.toContain("component is capped");
  expect(screen.getByRole("heading",{name:"How your Elo is calculated"}).nextElementSibling!.textContent!.split(/\s+/).length).toBeLessThan(90);
});
it("derives changed shares/topK/discount/example fromcontract instead of using today's numbers",()=>{
  render(<ScoringExplanation explanation={parseScoreExplanation(explanationFixture("additive_log",2,.5,.25))}/>);
  const text=document.body.textContent!;expect(text).toContain("25% leaderboard standing and 75% performance");expect(text).toContain("Up to 2 highest exercise scores contribute 100% and 50%");expect(text).toContain("100 Elo + 80 Elo × 50% = 140 overall Elo");expect(text).not.toContain("185.4");
});
it("explains the top-three setting with explicit exercise and overall Elo units",()=>{
  render(<ScoringExplanation explanation={parseScoreExplanation(explanationFixture("additive_log",3,.7,.5))}/>);
  const text=document.body.textContent!;expect(text).toContain("Up to 3 highest exercise scores contribute 100%, 70% and 49%");
  expect(text).toContain("Example exercise scores: 100 Elo + 80 Elo × 70% + 60 Elo × 49% = 185.4 overall Elo");
  expect(text).not.toContain("34.3%");
});
it("describes rank-only accurately without performance/gating/diminishing claims or a calculator",()=>{
  render(<ScoringExplanation explanation={parseScoreExplanation(explanationFixture("rank_only",3,1))}/>);
  const text=document.body.textContent!;expect(text).toContain("leaderboard standing is scaled by its exercise weight");expect(text).toContain("100 Elo + 80 Elo × 100% + 60 Elo × 100% = 240 overall Elo");expect(text).not.toMatch(/expert reference|diminishing|gates|50%/);expect(screen.queryByRole("math")).toBeNull();
});
it("shows gating/capping onlywhenpublished and keeps large topK copy bounded",()=>{
  const value=explanationFixture("gated_log",30,.8,.3);value.method.performance_capped=true;render(<ScoringExplanation explanation={parseScoreExplanation(value)}/>);
  const text=document.body.textContent!;expect(text).toContain("Performance can further reduce the blended score");expect(text).toContain("performance component is capped");expect(text).toContain("Up to 30 highest");expect(text).toContain("each next rate is 80% of the previous rate");expect(text.length).toBeLessThan(1000);
});
it("strips privatefields and rejects unknown or incoherent explanation data",()=>{
  const base=explanationFixture(),safe=parseScoreExplanation({...base,config:{kappa:"private"},benchmarks:{secret:5},method:{...base.method,benchmark_map:{secret:5}},example:{...base.example,athletes:["private"]}});
  expect(JSON.stringify(safe)).not.toMatch(/private|benchmark|kappa|athletes|config/);expect(renderToStaticMarkup(<ScoringExplanation explanation={safe}/>)).not.toMatch(/benchmark|kappa|private/);
  for(const patch of [{schema_version:2},{revision:0},{updated_at:"bad"},{method:{...base.method,kind:"unknown"}},
    {method:{...base.method,performance_gate:true}},{method:{...base.method,rank_share:.9}},{aggregation:{...base.aggregation,discount:0}},
    {aggregation:{...base.aggregation,contribution_multipliers:[1]}},{aggregation:{...base.aggregation,selection:"best_ever"}},
    {example:{...base.example,total:123}},{example:{...base.example,contributions:[100,80,60]}},
  ])expect(()=>parseScoreExplanation({...base,...patch})).toThrow("Scoring explanation unavailable");
});
it("fails closed without stale explanation or synthetic hardcoded fallback",()=>{
  render(<ScoringExplanation explanation={null}/>);expect(screen.getByText("Scoring explanation is temporarily unavailable.")).toBeTruthy();expect(document.body.textContent).not.toMatch(/50%|185.4/);
});
