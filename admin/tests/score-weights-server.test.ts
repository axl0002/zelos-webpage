// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { unstable_doesMiddlewareMatch } from "next/experimental/testing/server";
import { config } from "../src/middleware";
import { getPublicScoreWeights } from "../src/lib/score-weights.server";
import { GET } from "../src/app/scoring/weights.json/route";
import fixture from "./fixtures/score-weights.json";
beforeEach(()=>{
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL","https://obnirsfjxcvyyiocwaii.supabase.co");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY","sb_publishable_isolated");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY","private-service-key-never-used");
});
afterEach(()=>{vi.unstubAllEnvs();vi.unstubAllGlobals();});

it("calls only the fixed anonymous weights RPC with no session, formula fetch, cookies or user parameters",async()=>{
  const fetch=vi.fn(async()=>({ok:true,json:async()=>fixture}));vi.stubGlobal("fetch",fetch);
  expect(await getPublicScoreWeights()).toEqual(fixture);
  expect(fetch).toHaveBeenCalledExactlyOnceWith("https://obnirsfjxcvyyiocwaii.supabase.co/rest/v1/rpc/get_public_score_weights_v1",expect.objectContaining({
    method:"POST",body:"{}",cache:"no-store",headers:{apikey:"sb_publishable_isolated",Authorization:"Bearer sb_publishable_isolated","Content-Type":"application/json"},
  }));
  expect(JSON.stringify(fetch.mock.calls)).not.toContain("private-service-key");
  expect(unstable_doesMiddlewareMatch({config,url:"https://zelos.club/scoring/weights.json"})).toBe(false);
});

it("publishes only allowlisted coefficients and unranked metadata as no-store JSON",async()=>{
  vi.stubGlobal("fetch",vi.fn(async()=>({ok:true,json:async()=>({...fixture,
    formula:"private-formula",engine_hash:"private-hash",config:{alpha:.5},records:["private-athlete"],
    weights:fixture.weights.map(w=>({...w,service_role_key:"private-key"})),
  })})));
  const response=await GET();expect(response.status).toBe(200);expect(response.headers.get("cache-control")).toBe("no-store");
  expect(response.headers.get("x-content-type-options")).toBe("nosniff");const body=await response.text();
  expect(JSON.parse(body)).toEqual(fixture);expect(body).not.toMatch(/private-|alpha|engine_hash|service_role/);
});

it("fails closed on implementation-guard failure, network error or malformed data without stale fallback",async()=>{
  for(const response of [
    async()=>({ok:false,json:async()=>({message:"private implementation hash mismatch"})}),
    async()=>{throw Error("private upstream SQL");},
    async()=>({ok:true,json:async()=>({...fixture,weights:[{...fixture.weights[0],enabled:false}]})}),
  ]){
    const fetch=vi.fn(response);vi.stubGlobal("fetch",fetch);const result=await GET();expect(result.status).toBe(503);
    expect(result.headers.get("cache-control")).toBe("no-store");expect(await result.json()).toEqual({error:"Exercise weights are temporarily unavailable."});
    expect(fetch).toHaveBeenCalledTimes(1);expect(fetch).toHaveBeenCalledWith(expect.stringContaining("get_public_score_weights_v1"),expect.any(Object));
  }
});
