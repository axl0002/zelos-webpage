import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import RankingFlagsDashboard from "../src/components/ranking-flags-dashboard";
const item = {
 id:"dddddddd-dddd-4ddd-8ddd-dddddddddddd",post_id:"clip",reason:"unacceptable_form",
 details:"Unacceptable form: Bent arms",corrected_value:null,reported_value:10,metric:"seconds",
 rule_violations:[{id:"10000000-0000-4000-8000-000000000001",type:"form",text:"Keep arms straight.",position:0}],
 rules:[{id:"10000000-0000-4000-8000-000000000001",type:"form",text:"Keep arms straight.",position:0}],claimed_value:10,board_name:"Full Planche",board_metric:"seconds",
 username:"athlete",title:"Planche",created_at:"2026-10-16T00:00:00Z",submission_status:"eligible",
 primary_url:"https://media.zelos.club/clip.mp4",renditions:{},
};
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
it("requires review, explanation and confirmation before rejection",async()=>{
 const fetch=vi.fn(async(_input:string,options:RequestInit)=>({ok:true,json:async()=>options.method==="POST"?{ok:true}:[item]}));
 vi.stubGlobal("fetch",fetch);render(<RankingFlagsDashboard/>);await screen.findByText("Keep arms straight.");
 const reject=screen.getByRole("button",{name:"Reject ranking"}) as HTMLButtonElement;
 expect(reject.disabled).toBe(true);fireEvent.click(screen.getByLabelText("I watched the clip and checked the reported issue"));expect(reject.disabled).toBe(false);
 const note=screen.getByLabelText("Reason shown to the uploader if rejected");
 fireEvent.change(note,{target:{value:""}});expect(reject.disabled).toBe(false);
 fireEvent.click(screen.getByLabelText("Form: Keep arms straight."));expect(reject.disabled).toBe(true);
 fireEvent.click(screen.getByLabelText("Form: Keep arms straight."));
 fireEvent.change(note,{target:{value:"Arms bend during the hold."}});fireEvent.click(reject);
 expect(screen.getByRole("dialog")).toBeTruthy();expect(fetch.mock.calls.filter(([,o])=>o.method==="POST")).toHaveLength(0);
 fireEvent.click(screen.getByRole("button",{name:"Confirm decision"}));
 await screen.findByText("Ranking rejected. The uploader has been notified with your reason.");
 expect(JSON.parse(fetch.mock.calls.find(([,o])=>o.method==="POST")![1].body as string)).toEqual({report_id:item.id,confirmed:true,review_note:"Arms bend during the hold.",watched_video:true,rule_ids:[item.rules[0].id]});
});
it("retains edited notes after failure and resets review when changing reports",async()=>{
 vi.stubGlobal("fetch",vi.fn(async(_i:string,o:RequestInit)=>({ok:o.method!=="POST",json:async()=>o.method==="POST"?{error:"Connection failed"}:[item,{...item,id:"eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",username:"other",details:"Incorrect rep count"}]})));
 render(<RankingFlagsDashboard/>);await screen.findByText("Keep arms straight.");
 fireEvent.change(screen.getByLabelText("Reason shown to the uploader if rejected"),{target:{value:"Reviewed note"}});
 fireEvent.click(screen.getByLabelText("I watched the clip and checked the reported issue"));fireEvent.click(screen.getByRole("button",{name:"Reject ranking"}));fireEvent.click(screen.getByRole("button",{name:"Confirm decision"}));
 await screen.findByText("Connection failed");
 expect((screen.getByLabelText("Reason shown to the uploader if rejected") as HTMLTextAreaElement).value).toBe("Reviewed note");
 fireEvent.click(screen.getByRole("button",{name:/other · Full Planche/}));
 expect((screen.getByLabelText("I watched the clip and checked the reported issue") as HTMLInputElement).checked).toBe(false);
 expect((screen.getByLabelText("Reason shown to the uploader if rejected") as HTMLTextAreaElement).value).toBe("Incorrect rep count");
});
it("shows correction and blocks untrusted media",async()=>{
 vi.stubGlobal("fetch",vi.fn(async()=>({ok:true,json:async()=>[{...item,corrected_value:8.125,primary_url:"https://untrusted.test/video"}]})));
 const {container}=render(<RankingFlagsDashboard/>);await screen.findByText("Suggested correction: 8.125 seconds");
 expect(container.querySelector("video")).toBeNull();expect((screen.getByLabelText("I watched the clip and checked the reported issue") as HTMLInputElement).disabled).toBe(true);
});
