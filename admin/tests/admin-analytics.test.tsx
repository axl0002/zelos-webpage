import {afterEach,expect,it,vi} from "vitest";
import {cleanup,fireEvent,render,screen,waitFor,within} from "@testing-library/react";
import Dashboard from "../src/components/admin-analytics-dashboard";
import {analyticsFixture} from "./fixtures/analytics";
import {analyticsMetricKeys} from "../src/lib/admin-analytics";
vi.mock("../src/components/admin-instagram-adoption",()=>({default:()=>null}));
afterEach(()=>{cleanup();vi.unstubAllGlobals();vi.restoreAllMocks();});
function mockFetch(){const fn=vi.fn(async(url:string)=>{const p=new URL(url,"https://fixture.test").searchParams;return {ok:true,json:async()=>analyticsFixture(Number(p.get("days")),p.get("tz")!)};});vi.stubGlobal("fetch",fn);return fn;}
it("shows simple period metrics, charts, coverage and exact daily totals without plan tiers",async()=>{
 const fetch=mockFetch();render(<Dashboard/>);expect(screen.getByRole("status",{name:"Loading analytics"})).toBeTruthy();await screen.findByRole("table");
 expect(fetch).toHaveBeenCalledWith("/admin/api/analytics?days=7&tz=UTC",expect.objectContaining({cache:"no-store",signal:expect.any(AbortSignal)}));
 expect(screen.getByRole("heading",{name:"Analytics"})).toBeTruthy();expect(screen.getAllByRole("img")).toHaveLength(4);expect(screen.getByText(/Today is still in progress/)).toBeTruthy();
 expect(screen.getByRole("table").querySelectorAll("tbody tr")).toHaveLength(6);expect(screen.getByText(/Data starts 22 Oct/).textContent).toContain("Earlier activity is excluded");
 const text=document.body.textContent!;expect(text).not.toMatch(/Pro Users|Free Users|subscription|paywall|Daily active users/);expect(text).toContain("original creation day");expect(text).toContain("finalized videos");
 const row=within(screen.getByRole("table")).getByRole("row",{name:/Period total/});expect(row.textContent).toContain(String(analyticsFixture().totals.likes));
});
it("changes periods, uses timezone selection and refreshes the same selected query",async()=>{
 vi.spyOn(Intl.DateTimeFormat.prototype,"resolvedOptions").mockReturnValue({...new Intl.DateTimeFormat().resolvedOptions(),timeZone:"Asia/Shanghai"});
 const fetch=mockFetch();render(<Dashboard/>);await screen.findByRole("table");fireEvent.click(screen.getByRole("button",{name:"30 days"}));await waitFor(()=>expect(screen.getByRole("table").querySelectorAll("tbody tr")).toHaveLength(6));
 fireEvent.change(screen.getByLabelText("Time zone"),{target:{value:"Asia/Shanghai"}});await waitFor(()=>expect(fetch).toHaveBeenLastCalledWith("/admin/api/analytics?days=30&tz=Asia%2FShanghai",expect.anything()));await screen.findByRole("table");
 fireEvent.click(screen.getByRole("button",{name:"Refresh"}));await waitFor(()=>expect(fetch).toHaveBeenCalledTimes(4));await screen.findByRole("table");expect(screen.getByRole("button",{name:"30 days"}).getAttribute("aria-pressed")).toBe("true");
});
it("zero-fills real zero data and keeps errors distinct from empty results",async()=>{
 const zero=analyticsFixture();for(const row of zero.daily)for(const key of analyticsMetricKeys)row[key]=0;for(const key of analyticsMetricKeys)zero.totals[key]=0;
 vi.stubGlobal("fetch",vi.fn().mockResolvedValueOnce({ok:false,json:async()=>({error:"secret SQL"})}).mockResolvedValueOnce({ok:true,json:async()=>zero}));render(<Dashboard/>);
 expect((await screen.findByRole("alert")).textContent).toBe("Analytics could not be loaded. Please try again.");expect(screen.queryByRole("table")).toBeNull();expect(document.body.textContent).not.toContain("secret SQL");fireEvent.click(screen.getByRole("button",{name:"Try again"}));
 await screen.findByRole("table");expect(screen.getByText("No recorded activity in this date window.")).toBeTruthy();expect(screen.getByRole("table").querySelectorAll("tbody tr")).toHaveLength(6);
});
it("aborts stale requests and prevents previous-period results replacing the current selection",async()=>{
 const pending:((value:unknown)=>void)[]=[],signals:AbortSignal[]=[];vi.stubGlobal("fetch",vi.fn((_url:string,options:RequestInit)=>{signals.push(options.signal as AbortSignal);return new Promise(resolve=>pending.push(resolve));}));
 const {unmount}=render(<Dashboard/>);fireEvent.click(screen.getByRole("button",{name:"30 days"}));expect(signals[0].aborted).toBe(true);pending[1]({ok:true,json:async()=>analyticsFixture(30)});await screen.findByRole("table");pending[0]({ok:true,json:async()=>analyticsFixture(7)});await waitFor(()=>expect(screen.getByRole("table").querySelectorAll("tbody tr")).toHaveLength(6));
 unmount();expect(signals[1].aborted).toBe(true);
});
it("lets keyboard users inspect chart days and retains the accessible daily data table",async()=>{
 mockFetch();render(<Dashboard/>);await screen.findByRole("table");const chart=screen.getAllByRole("img")[0];const card=chart.closest("section")!;
 expect(card.textContent).toContain("Oct 27");fireEvent.keyDown(chart,{key:"Home"});expect(card.querySelector(".analytics-chart-readout")?.textContent).toContain("Oct 22");fireEvent.keyDown(chart,{key:"ArrowRight"});expect(card.querySelector(".analytics-chart-readout")?.textContent).toContain("Oct 23");fireEvent.keyDown(chart,{key:"End"});expect(card.querySelector(".analytics-chart-readout")?.textContent).toContain("Oct 27");
 expect(screen.getByRole("region",{name:"Daily analytics table"}).getAttribute("tabindex")).toBe("0");
});
it("renders a single launch day without duplicate dates, fractional count ticks or invented prior data",async()=>{
 const base=analyticsFixture(),row=base.daily[0];const fixture={...base,days:1,start_date:row.date,end_date:row.date,generated_at:"2026-10-22T12:00:00Z",daily:[row],totals:Object.fromEntries(analyticsMetricKeys.map(key=>[key,row[key]]))};
 const error=vi.spyOn(console,"error").mockImplementation(()=>{});vi.stubGlobal("fetch",vi.fn(async()=>({ok:true,json:async()=>fixture})));render(<Dashboard/>);await screen.findByRole("table");
 expect(screen.getByRole("table").querySelectorAll("tbody tr")).toHaveLength(1);
 for(const chart of screen.getAllByRole("img")){
  expect([...chart.querySelectorAll("text")].filter(n=>n.textContent==="Oct 22")).toHaveLength(1);
  expect([...chart.querySelectorAll("text")].map(n=>n.textContent).join(" ")).not.toContain("2.5");
 }
 expect(error.mock.calls.flat().join()).not.toMatch(/same key|unique.*key/);expect(document.querySelector(".analytics-metric small")?.textContent).toContain("Yesterday —");
});
