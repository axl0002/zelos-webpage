// @vitest-environment node
import {beforeEach, expect, it, vi} from "vitest";
const load=vi.hoisted(()=>vi.fn());vi.mock("../src/lib/score-weights.server",()=>({getPublicScoreWeights:load}));
import {GET} from "../src/app/scoring/weights.csv/route";
import {parseWeightCsv} from "../src/lib/score-weights-csv";
import {parsePublicScoreWeights} from "../src/lib/score-weights";
import fixture from "./fixtures/score-weights.json";
beforeEach(()=>vi.resetAllMocks());
it("downloads current guarded weights as an attachment with stable complete CSV rows",async()=>{
  load.mockResolvedValue(parsePublicScoreWeights(fixture));const response=await GET();
  expect(response.status).toBe(200);expect(response.headers.get("content-type")).toContain("text/csv");expect(response.headers.get("content-disposition")).toContain("attachment");expect(response.headers.get("cache-control")).toBe("no-store");
  expect(parseWeightCsv(await response.text(),parsePublicScoreWeights(fixture).weights)).toHaveLength(26);expect(load).toHaveBeenCalledExactlyOnceWith();
});
it("fails closed instead of downloading stale or proposed weights if the guard cannot verify current data",async()=>{
  load.mockRejectedValue(Error("private SQL/implementation hash"));const response=await GET();expect(response.status).toBe(503);
  expect(await response.json()).toEqual({error:"Exercise weights are temporarily unavailable."});expect(response.headers.get("cache-control")).toBe("no-store");
});
