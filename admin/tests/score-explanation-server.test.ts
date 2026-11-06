// @vitest-environment node
import {afterEach,beforeEach,expect,it,vi} from "vitest";
import {getPublicScoreExplanation} from "../src/lib/score-explanation.server";
import {explanationFixture} from "./fixtures/score-explanation";
beforeEach(()=>{vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL","https://obnirsfjxcvyyiocwaii.supabase.co");vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY","sb_publishable_isolated");});
afterEach(()=>{vi.unstubAllEnvs();vi.unstubAllGlobals();});
it("fetches only fixed read-only anonymous explanationRPC without session/user inputs",async()=>{
  const fetch=vi.fn(async()=>({ok:true,json:async()=>explanationFixture()}));vi.stubGlobal("fetch",fetch);
  expect(await getPublicScoreExplanation()).toEqual(explanationFixture());expect(fetch).toHaveBeenCalledExactlyOnceWith(
    "https://obnirsfjxcvyyiocwaii.supabase.co/rest/v1/rpc/get_public_score_explanation_v1",expect.objectContaining({method:"POST",body:"{}",cache:"no-store",headers:{apikey:"sb_publishable_isolated",Authorization:"Bearer sb_publishable_isolated","Content-Type":"application/json"}}));
});
it("does not fall back to anold explanation afterguard/network/unknown-kind failures",async()=>{
  for(const response of [async()=>({ok:false,json:async()=>({message:"private engine hash mismatch"})}),async()=>{throw Error("private SQL");},async()=>({ok:true,json:async()=>({...explanationFixture(),method:{kind:"unknown"}})})]){
    const fetch=vi.fn(response);vi.stubGlobal("fetch",fetch);await expect(getPublicScoreExplanation()).rejects.toThrow();expect(fetch).toHaveBeenCalledTimes(1);
  }
});
