import {afterEach, expect, it, vi} from "vitest";
import {cleanup, fireEvent, render, screen, waitFor, within} from "@testing-library/react";
import Panel from "../src/components/admin-instagram-adoption";
import Dashboard from "../src/components/admin-analytics-dashboard";
import {analyticsFixture} from "./fixtures/analytics";
import {parseInstagramAdoption} from "../src/lib/admin-instagram-adoption";
const fixture = {schema_version:1,cohort_start:"2026-10-22T00:00:00Z",generated_at:"2026-11-05T12:00:00Z",signed_in_accounts:10,with_instagram:6,without_instagram:3,unanswered:1};
afterEach(()=>{cleanup();vi.unstubAllGlobals();vi.restoreAllMocks();});
const response=(payload:unknown=fixture)=>({ok:true,json:async()=>payload});
it("shows exact numerator, denominator, percentage, opt-outs and unanswered choices", async()=>{
 const fetch=vi.fn(async()=>response());vi.stubGlobal("fetch",fetch);render(<Panel refresh={0}/>);
 expect(screen.getByRole("status").textContent).toContain("Loading Instagram");
 expect(await screen.findByText("60%")).toBeTruthy();expect(screen.getByText("6 of 10 signed-in accounts")).toBeTruthy();
 expect(screen.getByText("No Instagram").closest("section")?.textContent).toContain("3");expect(screen.getByText("No response").closest("section")?.textContent).toContain("1");
 expect(screen.getByText(/Excludes deleted, banned/)).toBeTruthy();expect(screen.getByText(/independent of the date range/)).toBeTruthy();
 expect(fetch).toHaveBeenCalledWith("/admin/api/analytics/instagram",expect.objectContaining({cache:"no-store"}));
});
it("renders zero cohort as unavailable percentage rather than NaN or a fabricated zero conversion",async()=>{
 vi.stubGlobal("fetch",vi.fn(async()=>response({...fixture,signed_in_accounts:0,with_instagram:0,without_instagram:0,unanswered:0})));render(<Panel refresh={0}/>);
 expect(await screen.findByText("—")).toBeTruthy();expect(screen.getByText(/No eligible accounts/)).toBeTruthy();expect(document.body.textContent).not.toMatch(/NaN|Infinity/);
});
it("keeps failures separate from zero and retries safely",async()=>{
 const fetch=vi.fn().mockResolvedValueOnce({ok:false}).mockResolvedValueOnce(response());vi.stubGlobal("fetch",fetch);render(<Panel refresh={0}/>);
 expect(await screen.findByRole("alert")).toBeTruthy();expect(screen.queryByText("0 of 0 signed-in accounts")).toBeNull();fireEvent.click(screen.getByRole("button",{name:"Retry Instagram adoption"}));await screen.findByText("60%");
});
it("refresh aborts previous request and ignores its late response; unmount aborts pending fetch",async()=>{
 const pending:((value:unknown)=>void)[]=[],signals:AbortSignal[]=[];
 vi.stubGlobal("fetch",vi.fn((_url:string,options:RequestInit)=>{signals.push(options.signal as AbortSignal);return new Promise(resolve=>pending.push(resolve));}));
 const {rerender,unmount}=render(<Panel refresh={0}/>);rerender(<Panel refresh={1}/>);expect(signals[0].aborted).toBe(true);
 pending[1](response());await screen.findByText("60%");pending[0](response({...fixture,with_instagram:0,unanswered:7}));await waitFor(()=>expect(screen.getByText("60%")).toBeTruthy());unmount();expect(signals[1].aborted).toBe(true);
});
it("integrates with Analytics: date selection preserves all-v2 panel; Refresh updates both sources",async()=>{
 const fetch=vi.fn(async(input:string)=>{
  const url=new URL(input,"https://fixture.test");
  return response(url.pathname.endsWith("/instagram")?fixture:analyticsFixture(Number(url.searchParams.get("days")),url.searchParams.get("tz")!));
 });vi.stubGlobal("fetch",fetch);render(<Dashboard/>);await screen.findByRole("table");await screen.findByText("60%");
 fireEvent.click(screen.getByRole("button",{name:"30 days"}));await screen.findByRole("table");
 expect(fetch.mock.calls.filter(([url])=>url.endsWith("/instagram"))).toHaveLength(1);
 fireEvent.click(screen.getByRole("button",{name:"Refresh"}));await screen.findByRole("table");await screen.findByText("60%");
 expect(fetch.mock.calls.filter(([url])=>url.endsWith("/instagram"))).toHaveLength(2);
 expect(within(screen.getByRole("region",{name:"Instagram username adoption"})).getByText("6 of 10 signed-in accounts")).toBeTruthy();
});
it("rejects malformed counts, coverage and inconsistent partitions and strips sensitive extras",()=>{
 expect(parseInstagramAdoption({...fixture,email:"private",instagram_handle:"secret"})).toEqual(fixture);
 for(const value of [null,[],{}, {...fixture,schema_version:2},{...fixture,cohort_start:"2026-10-21T00:00:00Z"},{...fixture,generated_at:"bad"},{...fixture,generated_at:"2026-10-21T00:00:00Z"},{...fixture,signed_in_accounts:11},...[-1,0.1,"6",NaN,Infinity,Number.MAX_SAFE_INTEGER+1].map(with_instagram=>({...fixture,with_instagram}))])expect(()=>parseInstagramAdoption(value)).toThrow();
});
