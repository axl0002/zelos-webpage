import {afterEach,beforeEach,expect,it,vi} from "vitest";
import {act,cleanup,fireEvent,render,screen,waitFor} from "@testing-library/react";
const nav=vi.hoisted(()=>({path:"/admin",replace:vi.fn(),refresh:vi.fn()}));
vi.mock("next/navigation",()=>({usePathname:()=>nav.path,useRouter:()=>nav}));
vi.mock("next/link",()=>({default:({children,prefetch:_prefetch,...props}:React.PropsWithChildren<Record<string,unknown>>)=><a {...props}>{children}</a>}));
import AdminWorkspace from "../src/components/admin-workspace";
import RankedUploadsDashboard from "../src/components/ranked-uploads-dashboard";
import ModerationReportsDashboard from "../src/components/moderation-reports-dashboard";
import {rankedUpload, privatePreview} from "./fixtures/ranked-upload";
import {report} from "./fixtures/moderation-report";
import {notifyAdminReviewCountsChanged} from "../src/lib/admin-review-counts";
const counts={current_reports:51,legacy_reports:205,user_reports:256,ranking_flags:101,ranked_uploads:102};
const response=(value=counts)=>({ok:true,json:async()=>value});
const badge=(name:string)=>document.getElementById(screen.getByRole("link",{name}).getAttribute("aria-describedby")!)!;
const flush=async()=>{await act(async()=>{await Promise.resolve();await Promise.resolve();});};
beforeEach(()=>{nav.path="/admin";vi.spyOn(document,"visibilityState","get").mockReturnValue("visible");});
afterEach(()=>{cleanup();vi.useRealTimers();vi.restoreAllMocks();vi.unstubAllGlobals();});
it("distinguishes loading, nonzero backlog and quiet zero without changing accessible link names",async()=>{
 let resolve!:(value:unknown)=>void;
 vi.stubGlobal("fetch",vi.fn(()=>new Promise(r=>{resolve=r;})));
 render(<AdminWorkspace><p>Queue</p></AdminWorkspace>);
 expect(badge("User reports").textContent).toContain("…");
 await act(async()=>resolve(response({...counts,ranking_flags:0})));
 expect(badge("User reports").getAttribute("title")).toBe("256 unprocessed reports: 51 current, 205 legacy");
 expect(badge("Ranked uploads").textContent).toContain("102");
 expect(badge("Ranking flags").className).toContain("quiet");
 expect(screen.getByRole("link",{name:"Ranking flags"})).toBeTruthy();
});
it("fails closed as unknown on server failures or malformed metrics and recovers on focus",async()=>{
 const fetch=vi.fn().mockResolvedValueOnce(response()).mockResolvedValueOnce({ok:false}).mockResolvedValueOnce(response({...counts,user_reports:0})).mockResolvedValueOnce(response({...counts,ranking_flags:99}));
 vi.stubGlobal("fetch",fetch);render(<AdminWorkspace><p>Queue</p></AdminWorkspace>);
 await waitFor(()=>expect(badge("Ranking flags").textContent).toContain("101"));
 fireEvent.focus(window);await waitFor(()=>expect(badge("Ranking flags").getAttribute("title")).toContain("unavailable"));
 expect(badge("Ranking flags").textContent).toContain("?");
 fireEvent.focus(window);await flush();expect(badge("Ranking flags").getAttribute("title")).toContain("unavailable");
 fireEvent.focus(window);await waitFor(()=>expect(badge("Ranking flags").textContent).toContain("99"));
});
it("polls every 30 seconds only while visible, refreshes on return and route changes, and cleans up",async()=>{
 vi.useFakeTimers();const fetch=vi.fn(async()=>response());vi.stubGlobal("fetch",fetch);
 let visible=true;vi.spyOn(document,"visibilityState","get").mockImplementation(()=>visible?"visible":"hidden");
 const {rerender,unmount}=render(<AdminWorkspace><p>Queue</p></AdminWorkspace>);await flush();expect(fetch).toHaveBeenCalledTimes(1);
 await act(async()=>{await vi.advanceTimersByTimeAsync(30000);});expect(fetch).toHaveBeenCalledTimes(2);
 visible=false;fireEvent(document,new Event("visibilitychange"));
 await act(async()=>{await vi.advanceTimersByTimeAsync(60000);});fireEvent.focus(window);expect(fetch).toHaveBeenCalledTimes(2);
 visible=true;fireEvent(document,new Event("visibilitychange"));await flush();expect(fetch).toHaveBeenCalledTimes(3);
 nav.path="/admin/reports";rerender(<AdminWorkspace><p>Reports</p></AdminWorkspace>);await flush();expect(fetch).toHaveBeenCalledTimes(4);
 act(()=>notifyAdminReviewCountsChanged());await flush();expect(fetch).toHaveBeenCalledTimes(5);
 unmount();fireEvent.focus(window);act(()=>notifyAdminReviewCountsChanged());await vi.advanceTimersByTimeAsync(60000);expect(fetch).toHaveBeenCalledTimes(5);
});
it("aborts superseded requests and ignores their late responses",async()=>{
 const resolvers:((value:unknown)=>void)[]=[];
 const fetch=vi.fn(()=>new Promise(resolve=>resolvers.push(resolve)));vi.stubGlobal("fetch",fetch);
 const {rerender,unmount}=render(<AdminWorkspace><p>Queue</p></AdminWorkspace>);
 nav.path="/admin/reports";rerender(<AdminWorkspace><p>Reports</p></AdminWorkspace>);
 expect((fetch.mock.calls as unknown as [string,RequestInit][])[0][1].signal?.aborted).toBe(true);
 await act(async()=>resolvers[1](response({...counts,ranking_flags:3})));
 await act(async()=>resolvers[0](response({...counts,ranking_flags:900})));
 expect(badge("Ranking flags").getAttribute("title")).toBe("3 unprocessed ranking flags");
 fireEvent.focus(window);unmount();await act(async()=>resolvers[2](response()));
 expect((fetch.mock.calls as unknown as [string,RequestInit][])[2][1].signal?.aborted).toBe(true);
});
it("turns a timed out read into unavailable even when the transport ignores abort",async()=>{
 vi.useFakeTimers();let resolve!:(value:unknown)=>void;
 vi.stubGlobal("fetch",vi.fn(()=>new Promise(r=>{resolve=r;})));
 render(<AdminWorkspace><p>Queue</p></AdminWorkspace>);
 await act(async()=>{await vi.advanceTimersByTimeAsync(15000);});
 expect(badge("User reports").getAttribute("title")).toContain("unavailable");
 await act(async()=>resolve(response()));
 expect(badge("User reports").getAttribute("title")).toContain("unavailable");
});

it.each([false,true])("refreshes after a successful upload decision only, never preview or failed decision (fail: %s)",async fail=>{
 let countReads=0;
 const fetch=vi.fn(async (url:string)=>url==="/admin/api/review-counts" ? response({...counts,ranked_uploads:++countReads===1?102:101})
  : url.endsWith("/preview") ? {ok:true,json:async()=>privatePreview}
  : url.endsWith("/decision") ? {ok:!fail,json:async()=>fail?{error:"Try again"}:{ok:true}}
  : {ok:true,json:async()=>[rankedUpload]});
 vi.stubGlobal("fetch",fetch);render(<AdminWorkspace><RankedUploadsDashboard/></AdminWorkspace>);
 await screen.findByRole("heading",{name:rankedUpload.title});
 await waitFor(()=>expect(document.querySelector("video")).not.toBeNull());
 expect(countReads).toBe(1);
 fireEvent.change(screen.getByLabelText("Rejection reason"),{target:{value:"unacceptable_form"}});
 fireEvent.click(screen.getByRole("button",{name:"Reject upload"}));
 if(fail){await screen.findByText("Try again");expect(countReads).toBe(1);}
 else{await waitFor(()=>expect(countReads).toBe(2));expect(badge("Ranked uploads").getAttribute("title")).toBe("101 unprocessed ranked uploads");}
});
it("exposes legacy backlog beside the current reports queue and refreshes both after a saved report decision",async()=>{
 let countReads=0;
 vi.stubGlobal("fetch",vi.fn(async (url:string)=>url==="/admin/api/review-counts"?response(++countReads===1?counts:{...counts,current_reports:50,user_reports:255})
  : url.endsWith("/decision")?{ok:true,json:async()=>({ok:true})}
  : {ok:true,json:async()=>[{...report,target_kind:"profile",context:{username:"reported_athlete",body:"Report evidence"}}]}));
 render(<AdminWorkspace><ModerationReportsDashboard/></AdminWorkspace>);
 await screen.findByText("Report evidence",{selector:"p"});
 expect(document.getElementById("legacy-report-count")?.getAttribute("title")).toBe("205 unprocessed legacy reports");
 fireEvent.click(screen.getByLabelText("I reviewed the available content and report evidence."));
 fireEvent.click(screen.getByRole("button",{name:"Dismiss reports"}));
 fireEvent.click(screen.getByRole("button",{name:"Confirm decision"}));
 await waitFor(()=>expect(countReads).toBe(2));
 expect(badge("User reports").getAttribute("title")).toBe("255 unprocessed reports: 50 current, 205 legacy");
});
