import { afterEach, expect, it } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { parsePublicScoreWeights } from "../src/lib/score-weights";
import ScoringWeights from "../src/components/scoring-weights";
import ScoreWeightTable from "../src/components/score-weight-table";
import fixture from "./fixtures/score-weights.json";
afterEach(cleanup);

it("allowlists current public coefficients and keeps unranked metadata separate from weights", () => {
  const parsed = parsePublicScoreWeights({ ...fixture, formula: "private formula", config: { alpha: .5 },
    athlete_records: ["private athlete"], weights: fixture.weights.map(w => ({ ...w, account_id: "private account" })),
    unranked_exercises: fixture.unranked_exercises.map(e => ({ ...e, weight: 0, secret: "private metadata" })),
  });
  expect(parsed).toEqual(fixture);
  expect(JSON.stringify(parsed)).not.toMatch(/private|alpha|account_id|athlete_records/);
  expect(parsed.weights.filter(w => w.exercise === "Front Lever Press").map(w => w.weight).sort((a,b)=>a-b)).toEqual([45,65,95]);
  expect(parsed.unranked_exercises.find(e => e.id === "pelican")).not.toHaveProperty("weight");
});

it("fails closed on invalid versions, coefficients, availability, duplicates and metadata", () => {
  const board = fixture.weights[0], unranked = fixture.unranked_exercises[0];
  for (const patch of [{schema_version:2},{revision:0},{revision:1.5},{updated_at:"invalid"},{weights:null},
    {weights:[board,board]},{weights:Array.from({length:501},()=>board)},
    ...[-1,NaN,Infinity,"85"].map(weight=>({weights:[{...board,weight}]})),
    ...[{enabled:false},{availability:"coming_soon"},{availability:undefined},{progression:undefined},
      {discipline:"freestyle"},{metric:"points"},{exercise:" "}].map(change=>({weights:[{...board,...change}]})),
    {unranked_exercises:null},{unranked_exercises:[unranked,unranked]},
    {unranked_exercises:[{...unranked,availability:"active"}]},
  ]) expect(()=>parsePublicScoreWeights({...fixture,...patch})).toThrow("Exercise weights unavailable");
  for(const bad of [null,[],"private formula"]) expect(()=>parsePublicScoreWeights(bad)).toThrow();
});

it("places every currently ranked progression in the correct Push/Pull matrix with live Press45/65/95", () => {
  const published=parsePublicScoreWeights(fixture);render(<ScoringWeights weights={published}/>);
  for(const discipline of ["push","pull"] as const){
    const table=screen.getByRole("table",{name:`All ${discipline} exercise and progression weights`});
    const headers=within(table).getAllByRole("columnheader");
    for(const board of published.weights.filter(w=>w.discipline===discipline)){
      const column=headers.findIndex(h=>h.textContent?.startsWith(board.exercise));expect(column).toBeGreaterThan(0);
      const row=within(table).getByRole("rowheader",{name:String(board.weight)}).closest("tr")!;
      expect(within(row).getAllByRole("cell")[column-1].textContent).toContain(board.progression||board.exercise);
    }
    expect(within(table).queryByRole("rowheader",{name:"0"})).toBeNull();
    expect(within(table).queryByRole("columnheader",{name:/Pelican|Maltese|SAT/})).toBeNull();
  }
  const pull=screen.getByRole("table",{name:"All pull exercise and progression weights"});
  const pressColumn=within(pull).getAllByRole("columnheader").findIndex(h=>h.textContent?.startsWith("Front Lever Press"));
  for(const [weight,name]of [[45,"Adv Tuck"],[65,"Straddle"],[95,"Full"]]){
    const row=within(pull).getByRole("rowheader",{name:String(weight)}).closest("tr")!;
    expect(within(row).getAllByRole("cell")[pressColumn-1].textContent).toBe(name);
  }
  expect(screen.getByText(/difficulty coefficient/)).toBeTruthy();expect(screen.getByText(/not the final Elo/)).toBeTruthy();
  expect(screen.getByText(/Available for training, with ranking not yet enabled/).textContent).toContain("Pelican");
  expect(screen.getByRole("link",{name:"View current weights (JSON)"}).getAttribute("href")).toBe("/scoring/weights.json");
  expect(screen.queryByRole("math")).toBeNull();expect(screen.queryByRole("spinbutton")).toBeNull();
});

it("supports the minimal table interface, empty disciplines and escaped labels", () => {
  const parsed=parsePublicScoreWeights({...fixture,weights:[],unranked_exercises:[]});
  render(<ScoringWeights weights={parsed}/>);expect(screen.queryByRole("table")).toBeNull();
  expect(screen.getByText("No ranked Push exercises are currently available.")).toBeTruthy();
  expect(screen.getByText("No ranked Pull exercises are currently available.")).toBeTruthy();
  const safe=parsePublicScoreWeights({...fixture,weights:[{...fixture.weights[0],exercise:"<script>private()</script>"}]});
  const html=renderToStaticMarkup(<ScoreWeightTable rules={{weights:safe.weights}} discipline="push"/>);
  expect(html).toContain("&lt;script&gt;");expect(html).not.toContain("<script>private()");
});
