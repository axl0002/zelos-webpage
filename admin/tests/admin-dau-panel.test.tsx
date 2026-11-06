import {afterEach,expect,it,vi} from "vitest";
import {cleanup,fireEvent,render,screen,waitFor,within} from "@testing-library/react";
import Panel from "../src/components/admin-daily-active-users";
import Dashboard from "../src/components/admin-analytics-dashboard";
import {dauWindow,type DailyActiveUsers} from "../src/lib/admin-dau";
import {analyticsFixture} from "./fixtures/analytics";
vi.mock("../src/components/admin-instagram-adoption",()=>({default:()=>null}));
const fixture=(days=7,timezone="UTC",now="2026-11-06T12:00:00Z"):DailyActiveUsers=>{
 const w=dauWindow({days,timezone},new Date(now));
 return {schema_version:1,timezone,requested_days:days,start_date:w.start,end_date:w.end,generated_at:now,today_partial:true,coverage_start:"2026-10-22T00:00:00Z",daily:w.dates.map((date,i)=>({date,active_users:i+10}))};
};
const response=(payload:unknown=fixture())=>({ok:true,json:async()=>payload});
afterEach(()=>{cleanup();vi.unstubAllGlobals();vi.restoreAllMocks();});
it("keeps the heading visible while loading and shows today's DAU, yesterday, unique-user definition and no additive total",async()=>{
 const fetch=vi.fn(async()=>response());vi.stubGlobal("fetch",fetch);render(<Panel days={7} timezone="UTC" refresh={0}/>);
 expect(screen.getByRole("heading",{name:"Daily active users (DAU)"})).toBeTruthy();expect(screen.getByRole("status",{name:"Loading daily active users"})).toBeTruthy();
 const card=(await screen.findByText("Active users today")).closest("section")!;expect(card.querySelector("strong")?.textContent).toBe("16");expect(card.textContent).toContain("Yesterday 15");expect(card.textContent).toContain("today is still in progress");
 expect(fetch).toHaveBeenCalledWith("/admin/api/analytics/dau?days=7&tz=UTC",expect.objectContaining({cache:"no-store",signal:expect.any(AbortSignal)}));
 expect(screen.getByText(/Each person counts once/)).toBeTruthy();expect(screen.getByText(/Daily counts cannot be added/)).toBeTruthy();expect(screen.getByText(/Opt-outs, offline use/)).toBeTruthy();expect(screen.queryByText("Period total")).toBeNull();
 fireEvent.click(screen.getByText("View daily active user counts"));expect(document.querySelectorAll("tbody tr")).toHaveLength(7);
});
it("shows genuine zeros only after valid data; unavailable/malformed data has retry instead of zero",async()=>{
 const zero=fixture();zero.daily.forEach(r=>r.active_users=0);
 const fetch=vi.fn().mockResolvedValueOnce({ok:false}).mockResolvedValueOnce(response({...zero,daily:[]})).mockResolvedValueOnce(response(zero));vi.stubGlobal("fetch",fetch);render(<Panel days={7} timezone="UTC" refresh={0}/>);
 expect(await screen.findByRole("alert")).toBeTruthy();expect(screen.queryByText("Active users today")).toBeNull();fireEvent.click(screen.getByRole("button",{name:"Retry daily active users"}));await screen.findByRole("alert");expect(screen.queryByText("Active users today")).toBeNull();
 fireEvent.click(screen.getByRole("button",{name:"Retry daily active users"}));const card=(await screen.findByText("Active users today")).closest("section")!;expect(card.querySelector("strong")?.textContent).toBe("0");
});
it("cancels stale range/timezone requests, hides old results immediately and aborts on unmount",async()=>{
 const pending:((v:unknown)=>void)[]=[],signals:AbortSignal[]=[];
 vi.stubGlobal("fetch",vi.fn((_url:string,o:RequestInit)=>{signals.push(o.signal as AbortSignal);return new Promise(resolve=>pending.push(resolve));}));
 const {rerender,unmount}=render(<Panel days={7} timezone="UTC" refresh={0}/>);rerender(<Panel days={30} timezone="Asia/Shanghai" refresh={0}/>);expect(signals[0].aborted).toBe(true);
 pending[1](response(fixture(30,"Asia/Shanghai")));await screen.findByText("Active users today");pending[0](response(fixture()));await waitFor(()=>expect(screen.getByText(/Asia\/Shanghai · today/)).toBeTruthy());
 rerender(<Panel days={7} timezone="UTC" refresh={1}/>);expect(screen.queryByText("Active users today")).toBeNull();expect(screen.getByRole("status")).toBeTruthy();unmount();expect(signals.at(-1)?.aborted).toBe(true);
});
it("uses keyboard chart inspection and handles a one-day launch window without invented yesterday",async()=>{
 vi.stubGlobal("fetch",vi.fn(async()=>response(fixture(7,"UTC","2026-10-22T12:00:00Z"))));render(<Panel days={7} timezone="UTC" refresh={0}/>);await screen.findByText("Active users today");expect(screen.getByText(/Yesterday/).textContent).toContain("—");
 const chart=screen.getByRole("img");fireEvent.keyDown(chart,{key:"Home"});expect(chart.closest("section")?.querySelector(".analytics-chart-readout")?.textContent).toContain("Oct 22");expect(chart.textContent).not.toContain("2.5");
});
it("shares dashboard range/timezone/refresh while keeping other analytics usable if DAU fails",async()=>{
 vi.spyOn(Intl.DateTimeFormat.prototype,"resolvedOptions").mockReturnValue({...new Intl.DateTimeFormat().resolvedOptions(),timeZone:"Asia/Shanghai"});
 const fetch=vi.fn(async(input:string)=>{const u=new URL(input,"https://fixture.test"),days=Number(u.searchParams.get("days")),tz=u.searchParams.get("tz")!;return u.pathname.endsWith("/dau")?{ok:false}:response(analyticsFixture(days,tz));});vi.stubGlobal("fetch",fetch);render(<Dashboard/>);
 await screen.findByRole("alert");await screen.findByRole("table");expect(screen.getByRole("heading",{name:"New accounts"})).toBeTruthy();fireEvent.click(screen.getByRole("button",{name:"30 days"}));await waitFor(()=>expect(fetch).toHaveBeenCalledWith("/admin/api/analytics/dau?days=30&tz=UTC",expect.anything()));
 fireEvent.change(screen.getByLabelText("Time zone"),{target:{value:"Asia/Shanghai"}});await waitFor(()=>expect(fetch).toHaveBeenCalledWith("/admin/api/analytics/dau?days=30&tz=Asia%2FShanghai",expect.anything()));await screen.findByRole("table");
 const before=fetch.mock.calls.filter(([url])=>url.includes("/dau?")).length;fireEvent.click(screen.getByRole("button",{name:"Refresh"}));await waitFor(()=>expect(fetch.mock.calls.filter(([url])=>url.includes("/dau?"))).toHaveLength(before+1));
 expect(within(screen.getByRole("table")).getByRole("row",{name:/Period total/})).toBeTruthy();
});
