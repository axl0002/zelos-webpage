import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import {rankingFlagHoldTiming, rankingReasons, type RankingFlag} from "../src/lib/ranking-flags";
import RankingFlagsDashboard from "../src/components/ranking-flags-dashboard";
const item: RankingFlag = {
 id:"dddddddd-dddd-4ddd-8ddd-dddddddddddd",post_id:"clip",reason:"unacceptable_form",
 details:"Unacceptable form: Bent arms",corrected_value:null,reported_value:10,metric:"seconds",
 rule_violations:[{id:"10000000-0000-4000-8000-000000000001",type:"form",text:"Keep arms straight.",position:0}],
 rules:[{id:"10000000-0000-4000-8000-000000000001",type:"form",text:"Keep arms straight.",position:0}],claimed_value:10,board_name:"Full Planche",board_metric:"seconds",
 username:"athlete",title:"Planche",created_at:"2026-10-16T00:00:00Z",submission_status:"eligible",
 primary_url:"https://media.zelos.club/clip.mp4",renditions:{},
};
function mockFetch(fetcher: (...args: any[]) => unknown) {
 vi.stubGlobal("fetch", (path: string, ...args: any[]) => {
  if (path.includes("/group-context?")) {
   const reportId = new URL(path, "https://fixture.test").searchParams.get("report_id")!;
   return Promise.resolve({ok:true,json:async()=>({report_id:reportId,submission_id:"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",open_report_ids:[reportId],other_open_count:0})});
  }
  return fetcher(path,...args);
 });
}
async function confirmDecision() {
 const button = screen.getByRole("button", {name:"Confirm decision"}) as HTMLButtonElement;
 await waitFor(()=>expect(button.disabled).toBe(false));fireEvent.click(button);
}
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
for (const changedUrl of [false, true]) {
 it(`retries exhausted media after refresh (changed URL: ${changedUrl})`,async()=>{
  let gets=0;
  const refreshedUrl=changedUrl?"https://media.zelos.club/refreshed.mp4":item.primary_url;
  const fetch=vi.fn(async()=>({ok:true,json:async()=>[{...item,primary_url:++gets===1?item.primary_url:refreshedUrl}]}));
  mockFetch(fetch);
  const {container}=render(<RankingFlagsDashboard/>);
  await screen.findByText("Keep arms straight.");
  fireEvent.error(container.querySelector("video")!);
  await screen.findByText("Video unavailable. Refresh the queue before reviewing.");
  fireEvent.click(screen.getByRole("button",{name:"Refresh queue"}));
  await waitFor(()=>expect(container.querySelector("video")?.getAttribute("src")).toBe(refreshedUrl));
  expect(gets).toBe(2);
  expect((screen.getByLabelText("I watched the clip and checked the reported issue") as HTMLInputElement).checked).toBe(false);
  expect((screen.getByRole("button",{name:"Reject ranking"}) as HTMLButtonElement).disabled).toBe(true);
 });
}
it("requires fresh review after refreshing evidence while preserving edited notes",async()=>{
 mockFetch(vi.fn(async()=>({ok:true,json:async()=>[{...item}]})));
 render(<RankingFlagsDashboard/>);await screen.findByText("Keep arms straight.");
 const note=screen.getByLabelText("Review note shown to the uploader");
 fireEvent.change(note,{target:{value:"My reviewed explanation"}});
 fireEvent.click(screen.getByLabelText("I watched the clip and checked the reported issue"));
 fireEvent.click(screen.getByRole("button",{name:"Reject ranking"}));
 expect(screen.getByRole("dialog")).toBeTruthy();
 fireEvent.click(screen.getByRole("button",{name:"Refresh queue"}));
 await waitFor(()=>expect(screen.queryByRole("dialog")).toBeNull());
 expect((screen.getByLabelText("I watched the clip and checked the reported issue") as HTMLInputElement).checked).toBe(false);
 expect((screen.getByRole("button",{name:"Reject ranking"}) as HTMLButtonElement).disabled).toBe(true);
 expect((screen.getByLabelText("Review note shown to the uploader") as HTMLTextAreaElement).value).toBe("My reviewed explanation");
});
it("requires review, explanation and confirmation before rejection",async()=>{
 const fetch=vi.fn(async(_input:string,options:RequestInit)=>({ok:true,json:async()=>options.method==="POST"?{ok:true}:[item]}));
 mockFetch(fetch);render(<RankingFlagsDashboard/>);await screen.findByText("Keep arms straight.");
 const reject=screen.getByRole("button",{name:"Reject ranking"}) as HTMLButtonElement;
 expect(reject.disabled).toBe(true);fireEvent.click(screen.getByLabelText("I watched the clip and checked the reported issue"));expect(reject.disabled).toBe(false);
 const note=screen.getByLabelText("Review note shown to the uploader");
 fireEvent.change(note,{target:{value:""}});expect(reject.disabled).toBe(false);
 fireEvent.click(screen.getByLabelText("Form: Keep arms straight."));expect(reject.disabled).toBe(true);
 fireEvent.click(screen.getByLabelText("Form: Keep arms straight."));
 fireEvent.change(note,{target:{value:"Arms bend during the hold."}});fireEvent.click(reject);
 expect(screen.getByRole("dialog")).toBeTruthy();expect(fetch.mock.calls.filter(([,o])=>o.method==="POST")).toHaveLength(0);
 await confirmDecision();
 await screen.findByText("Ranking rejected. The uploader has been notified with your reason.");
 expect(JSON.parse(fetch.mock.calls.find(([,o])=>o.method==="POST")![1].body as string)).toEqual({report_id:item.id,confirmed:true,review_note:"Arms bend during the hold.",watched_video:true,rule_ids:[item.rules[0].id]});
});
it("retains edited notes after failure and resets review when changing reports",async()=>{
 mockFetch(vi.fn(async(_i:string,o:RequestInit)=>({ok:o.method!=="POST",json:async()=>o.method==="POST"?{error:"Connection failed"}:[item,{...item,id:"eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",username:"other",details:"Incorrect rep count"}]})));
 render(<RankingFlagsDashboard/>);await screen.findByText("Keep arms straight.");
 fireEvent.change(screen.getByLabelText("Review note shown to the uploader"),{target:{value:"Reviewed note"}});
 fireEvent.click(screen.getByLabelText("I watched the clip and checked the reported issue"));fireEvent.click(screen.getByRole("button",{name:"Reject ranking"}));await confirmDecision();
 await screen.findByText("Connection failed");
 expect((screen.getByLabelText("Review note shown to the uploader") as HTMLTextAreaElement).value).toBe("Reviewed note");
 fireEvent.click(screen.getByRole("button",{name:/other · Full Planche/}));
 expect((screen.getByLabelText("I watched the clip and checked the reported issue") as HTMLInputElement).checked).toBe(false);
 expect((screen.getByLabelText("Review note shown to the uploader") as HTMLTextAreaElement).value).toBe("Incorrect rep count");
});
it("shows correction and blocks untrusted media",async()=>{
 mockFetch(vi.fn(async()=>({ok:true,json:async()=>[{...item,corrected_value:8.125,primary_url:"https://untrusted.test/video"}]})));
 const {container}=render(<RankingFlagsDashboard/>);await screen.findByText("Suggested correction: 8.125 seconds");
 expect(container.querySelector("video")).toBeNull();expect((screen.getByLabelText("I watched the clip and checked the reported issue") as HTMLInputElement).disabled).toBe(true);
});

for (const reason of ["incorrect_start_frame", "incorrect_end_frame", "incorrect_hold_frames"]) {
 it(`shows and seeks exact submitted frame evidence for ${reason}`,async()=>{
  const frame = {...item, reason, details:"Check the submitted hold frames.", rule_violations:[],
   reported_hold_start_ms:1000,reported_hold_end_ms:11500,
   hold_timing:{start_ms:1500,end_ms:11999,duration_ms:10499}};
  const fetch=vi.fn(async(_input:string,options:RequestInit)=>({ok:true,json:async()=>options.method==="POST"?{ok:true}:[frame]}));
  mockFetch(fetch);
  const {container}=render(<RankingFlagsDashboard/>);
  await screen.findByRole("heading",{name:rankingReasons[reason]});
  expect(screen.getByText("Reported hold boundaries · 10.500 s")).toBeTruthy();
  const video=container.querySelector("video")!;
  const pause=vi.fn();Object.defineProperty(video,"pause",{value:pause});
  fireEvent.click(screen.getByRole("button",{name:"Hold start · 1.000 s"}));
  expect(pause).toHaveBeenCalledTimes(1);expect(video.currentTime).toBe(1);
  fireEvent.click(screen.getByRole("button",{name:"Hold end · 11.500 s"}));
  expect(pause).toHaveBeenCalledTimes(2);expect(video.currentTime).toBe(11.5);
  expect((screen.getByLabelText("I watched the clip and checked the reported issue") as HTMLInputElement).checked).toBe(false);
  expect(screen.queryByText("Rules verified as not met")).toBeNull();
  fireEvent.click(screen.getByLabelText("I watched the clip and checked the reported issue"));
  fireEvent.click(screen.getByRole("button",{name:"Reject ranking"}));
  await confirmDecision();
  await screen.findByText("Ranking rejected. The uploader has been notified with your reason.");
  expect(JSON.parse(fetch.mock.calls.find(([,o])=>o.method==="POST")![1].body as string)).toEqual({report_id:item.id,confirmed:true,review_note:frame.details,watched_video:true,rule_ids:[]});
 });
}
it("keeps frame rejection disabled when reported evidence is unavailable",async()=>{
 mockFetch(vi.fn(async()=>({ok:true,json:async()=>[{...item,reason:"incorrect_start_frame",rule_violations:[],hold_timing:{start_ms:1000,end_ms:11500,duration_ms:10500}}]})));
 render(<RankingFlagsDashboard/>);await screen.findByText("The reported hold boundaries are unavailable. Refresh the queue before reviewing.");
 fireEvent.click(screen.getByLabelText("I watched the clip and checked the reported issue"));
 expect((screen.getByRole("button",{name:"Reject ranking"}) as HTMLButtonElement).disabled).toBe(true);
 expect(screen.queryByRole("button",{name:/Hold start ·/})).toBeNull();
});
it("validates frame evidence while retaining legacy flags without timing",()=>{
 expect(rankingFlagHoldTiming(item)).toBeNull();
 expect(rankingFlagHoldTiming({...item,hold_timing:{start_ms:1000,end_ms:11500,duration_ms:10500}})).toEqual({start_ms:1000,end_ms:11500,duration_ms:10500,snapshot:false});
 for(const [start,end] of [[-1,11500],[1000,1200],[1000.1,11500],[1000,Infinity],[1000,2147483648]]){
  expect(rankingFlagHoldTiming({...item,reason:"incorrect_hold_frames",reported_hold_start_ms:start,reported_hold_end_ms:end})).toBeNull();
 }
 expect(rankingFlagHoldTiming({...item,metric:"reps",reported_hold_start_ms:1000,reported_hold_end_ms:11500})).toBeNull();
});
it("dismisses a flag once without rejecting the ranking, then moves the completed flag out of the queue",async()=>{
 const fetch=vi.fn(async(_path:string,o:RequestInit)=>({ok:true,json:async()=>o.method==="POST"?{ok:true}:[item]}));
 mockFetch(fetch);render(<RankingFlagsDashboard/>);await screen.findByText("Keep arms straight.");
 fireEvent.click(screen.getByLabelText("I watched the clip and checked the reported issue"));
 fireEvent.click(screen.getByRole("button",{name:"Dismiss flag"}));
 const save=screen.getByRole("button",{name:"Confirm decision"}) as HTMLButtonElement;await waitFor(()=>expect(save.disabled).toBe(false));fireEvent.click(save);fireEvent.click(save);
 await screen.findByText("Flag dismissed. The ranking is unchanged.");
 const calls=fetch.mock.calls.filter(([,o])=>o.method==="POST");expect(calls).toHaveLength(1);
 expect(JSON.parse(calls[0][1].body as string)).toEqual({report_id:item.id,confirmed:false,review_note:item.details,watched_video:true,rule_ids:[]});
 expect(screen.queryByRole("button",{name:"Reject ranking"})).toBeNull();
});
it("invalidates a pending ranking confirmation when playback fails",async()=>{
 const fetch=vi.fn(async()=>({ok:true,json:async()=>[item]}));mockFetch(fetch);
 const {container}=render(<RankingFlagsDashboard/>);await screen.findByText("Keep arms straight.");
 fireEvent.click(screen.getByLabelText("I watched the clip and checked the reported issue"));fireEvent.click(screen.getByRole("button",{name:"Reject ranking"}));
 expect(screen.getByRole("dialog")).toBeTruthy();fireEvent.error(container.querySelector("video")!);
 await waitFor(()=>expect(screen.queryByRole("dialog")).toBeNull());
 expect((screen.getByRole("button",{name:"Reject ranking"}) as HTMLButtonElement).disabled).toBe(true);
 expect(fetch).toHaveBeenCalledTimes(1);
});
it("lets admins explicitly close a server-confirmed unavailable flag without pretending to watch missing media",async()=>{
 const fetch=vi.fn(async(_path:string,o:RequestInit)=>({ok:true,json:async()=>o.method==="POST"?{ok:true}:[{...item,primary_url:null,renditions:null,review_unavailable:true,submission_status:"removed"}]}));
 mockFetch(fetch);const {container}=render(<RankingFlagsDashboard/>);
 await screen.findByText(/The ranked content is no longer available for review/);
 expect(container.querySelector("video")).toBeNull();
 fireEvent.click(screen.getByLabelText("I reviewed the available report evidence"));
 expect((screen.getByRole("button",{name:"Reject ranking"}) as HTMLButtonElement).disabled).toBe(true);
 fireEvent.click(screen.getByRole("button",{name:"Dismiss flag"}));await confirmDecision();
 await screen.findByText("Flag dismissed. The ranking is unchanged.");
 const call=fetch.mock.calls.find(([,o])=>o.method==="POST")!;
 expect(JSON.parse(call[1].body as string)).toEqual({report_id:item.id,confirmed:false,review_note:item.details,watched_video:false,rule_ids:[]});
});

it("shows reporter usernames separately from the reported athlete and handles unavailable names", async () => {
 mockFetch(vi.fn(async()=>({ok:true,json:async()=>[{...item,reporter_username:"flag_author"},{...item,id:"eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",reporter_username:null}]})));
 render(<RankingFlagsDashboard/>);
 await screen.findByText("Keep arms straight.");
 expect(screen.getAllByText("Reported by: @flag_author")).toHaveLength(2);
 expect(screen.getAllByText("Reported by: Username unavailable")).toHaveLength(1);
 expect(screen.getByText("athlete · Current result: 10 seconds")).toBeTruthy();
 fireEvent.click(screen.getByRole("button",{name:/Username unavailable/}));
 expect(screen.getAllByText("Reported by: Username unavailable")).toHaveLength(2);
 expect(screen.queryByText("Reported by: @athlete")).toBeNull();
});
