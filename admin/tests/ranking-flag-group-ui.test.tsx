import {afterEach, expect, it, vi} from "vitest";
import {act, cleanup, fireEvent, render, screen, waitFor} from "@testing-library/react";
import RankingFlagsDashboard from "../src/components/ranking-flags-dashboard";
import type {RankingFlag} from "../src/lib/ranking-flags";
const primary = "dddddddd-dddd-4ddd-8ddd-dddddddddddd", sibling = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", sibling2 = "cccccccc-cccc-4ccc-8ccc-cccccccccccc", unrelated = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const submission = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const item: RankingFlag = {id:primary,post_id:"post",submission_id:submission,reason:"unacceptable_form",details:"Arms bent on the attempt.",corrected_value:null,reported_value:10,metric:"reps",board_metric:"reps",rule_violations:[],rules:[],claimed_value:10,board_name:"Full Planche",username:"athlete",title:"Planche",created_at:"2026-11-02",submission_status:"eligible",primary_url:"https://media.zelos.club/clip.mp4",renditions:{}};
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
function fixture(ids = [primary, sibling, sibling2]) {
 const state = {ids, contextError:"", groupError:"", malformed:false, pending: null as Promise<void>|null, contextPending:null as Promise<void>|null};
 const closed = new Set<string>();
 const queue = [item, {...item,id:sibling}, {...item,id:sibling2}, {...item,id:unrelated,submission_id:"ffffffff-ffff-4fff-8fff-ffffffffffff",post_id:"other",username:"other"}];
 const fetch=vi.fn(async(path:string,options?:RequestInit)=>{
  if(path.includes('/group-context?')) {
   await state.contextPending;
   if(state.contextError)return {ok:false,json:async()=>({error:state.contextError})};
   return {ok:true,json:async()=>({report_id:primary,submission_id:submission,open_report_ids:state.ids,other_open_count:state.ids.length-1})};
  }
  if(path.endsWith('/decision/group/v1')) {
   await state.pending;
   if(state.groupError)return {ok:false,json:async()=>({error:state.groupError})};
   const command=JSON.parse(options!.body as string);for(const id of command.expected_open_report_ids)closed.add(id);
   return {ok:true,json:async()=>({ok:true,status:command.confirmed?'confirmed':'dismissed',resolved_report_ids:state.malformed?[primary]:command.expected_open_report_ids,resolved_count:command.expected_open_report_ids.length,other_resolved_count:command.expected_open_report_ids.length-1})};
  }
  if(path.endsWith('/decision')) {closed.add(primary);return {ok:true,json:async()=>({ok:true})};}
  return {ok:true,json:async()=>queue.filter(row=>!closed.has(row.id)).map(row=>({...row}))};
 });
 vi.stubGlobal('fetch',fetch);render(<RankingFlagsDashboard/>);
 const mutations=()=>fetch.mock.calls.filter(([path])=>path.endsWith('/decision')||path.endsWith('/decision/group/v1'));
 return {state,fetch,mutations};
}
async function begin(reject=false) {
 await screen.findByRole('heading',{name:'Full Planche'});
 fireEvent.click(screen.getByLabelText('I watched the clip and checked the reported issue'));
 fireEvent.click(screen.getByRole('button',{name:reject?'Reject ranking':'Dismiss flag'}));
 await waitFor(()=>expect((screen.getByRole('button',{name:'Confirm decision'}) as HTMLButtonElement).disabled).toBe(false));
}
function groupChoice(count:number){return screen.getByRole('checkbox',{name:`Apply to all ${count} other ${count===1?'flag':'flags'} for this submission`}) as HTMLInputElement;}
it('zero siblings keeps the exact legacy single decision contract',async()=>{
 const {mutations}=fixture([primary]);await begin();expect(screen.getByText('There are no other open flags for this submission.')).toBeTruthy();expect(screen.queryByRole('checkbox',{name:/Apply to/})).toBeNull();
 fireEvent.click(screen.getByRole('button',{name:'Confirm decision'}));await screen.findByText('Flag dismissed. The ranking is unchanged.');
 expect(mutations()).toHaveLength(1);expect(mutations()[0][0]).toBe('/admin/api/ranking-flags/decision');expect(JSON.parse(mutations()[0][1]!.body as string)).toEqual({report_id:primary,confirmed:false,review_note:item.details,watched_video:true,rule_ids:[]});
});
it('one other flag is offered unchecked and opting out leaves it open',async()=>{
 const {mutations}=fixture([primary,sibling]);await begin();expect(groupChoice(1).checked).toBe(false);expect(mutations()).toHaveLength(0);
 fireEvent.click(screen.getByRole('button',{name:'Confirm decision'}));await screen.findByText('Flag dismissed. The ranking is unchanged.');expect(mutations()[0][0]).toBe('/admin/api/ranking-flags/decision');expect(screen.getAllByRole('button',{name:/athlete · Full Planche/})).toHaveLength(2);
});
for(const reject of [false,true])it(`explicit opt-in applies ${reject?'rejection':'dismissal'} to exactly the context group`,async()=>{
 const {mutations,fetch}=fixture();await begin(reject);expect(groupChoice(2).checked).toBe(false);fireEvent.click(groupChoice(2));expect(mutations()).toHaveLength(0);
 fireEvent.click(screen.getByRole('button',{name:'Confirm decision'}));await screen.findByText(reject?'3 flags closed. The ranking was rejected and the uploader received your reason once.':'3 flags closed. The ranking stays unchanged.');
 expect(mutations()).toHaveLength(1);expect(mutations()[0][0]).toBe('/admin/api/ranking-flags/decision/group/v1');expect(JSON.parse(mutations()[0][1]!.body as string)).toEqual({report_id:primary,confirmed:reject,review_note:item.details,watched_video:true,rule_ids:[],expected_open_report_ids:[primary,sibling,sibling2]});
 expect(screen.queryByRole('button',{name:/athlete · Full Planche/})).toBeNull();expect(screen.getByRole('button',{name:/other · Full Planche/})).toBeTruthy();expect(fetch.mock.calls.filter(([path])=>path==='/admin/api/ranking-flags')).toHaveLength(2);
});
it('uses a server count that includes flags outside the visible queue',async()=>{
 const ids=[primary,sibling,sibling2,'11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222'];fixture(ids);await begin();expect(groupChoice(4)).toBeTruthy();
});
it('context failure requires an explicit single-only fallback, which never calls group mutation',async()=>{
 const {state,mutations}=fixture();state.contextError='Too many related flags for one group decision.';
 await screen.findByRole('heading',{name:'Full Planche'});fireEvent.click(screen.getByLabelText('I watched the clip and checked the reported issue'));fireEvent.click(screen.getByRole('button',{name:'Dismiss flag'}));await screen.findByText(state.contextError);
 expect((screen.getByRole('button',{name:'Confirm decision'}) as HTMLButtonElement).disabled).toBe(true);expect(mutations()).toHaveLength(0);
 fireEvent.click(screen.getByRole('button',{name:'Continue with this flag only'}));fireEvent.click(screen.getByRole('button',{name:'Confirm decision'}));await screen.findByText('Flag dismissed. The ranking is unchanged.');expect(mutations()).toHaveLength(1);expect(mutations()[0][0]).toBe('/admin/api/ranking-flags/decision');
});
it('retry loads a fresh count and never retains an earlier opt-in',async()=>{
 const {state,fetch}=fixture();await begin();fireEvent.click(groupChoice(2));fireEvent.click(screen.getByRole('button',{name:'Cancel'}));state.ids=[primary,sibling];
 fireEvent.click(screen.getByRole('button',{name:'Dismiss flag'}));await screen.findByRole('checkbox',{name:'Apply to all 1 other flag for this submission'});expect(groupChoice(1).checked).toBe(false);expect(fetch.mock.calls.filter(([path])=>path.includes('/group-context?'))).toHaveLength(2);
});
it('a stale group fails without silently reducing scope or retrying a mutation',async()=>{
 const {state,mutations}=fixture();state.groupError='Someone already reviewed or updated this item. Refresh before trying again.';await begin(true);fireEvent.click(groupChoice(2));fireEvent.click(screen.getByRole('button',{name:'Confirm decision'}));await screen.findByText(state.groupError);expect(screen.getByText("Refresh queue before trying another decision.")).toBeTruthy();
 expect(mutations()).toHaveLength(1);expect(screen.queryByRole('dialog')).toBeNull();expect((screen.getByLabelText('Review note shown to the uploader') as HTMLTextAreaElement).value).toBe(item.details);expect((screen.getByRole('button',{name:'Reject ranking'}) as HTMLButtonElement).disabled).toBe(true);expect((screen.getByRole('button',{name:'Dismiss flag'}) as HTMLButtonElement).disabled).toBe(true);expect((screen.getByLabelText('I watched the clip and checked the reported issue') as HTMLInputElement).disabled).toBe(true);
 fireEvent.click(screen.getByRole('button',{name:'Refresh queue'}));await waitFor(()=>expect((screen.getByLabelText('I watched the clip and checked the reported issue') as HTMLInputElement).disabled).toBe(false));fireEvent.click(screen.getByLabelText('I watched the clip and checked the reported issue'));expect((screen.getByRole('button',{name:'Reject ranking'}) as HTMLButtonElement).disabled).toBe(false);
});
it('an unverified success does not claim that the group closed',async()=>{
 const {state,mutations}=fixture();state.malformed=true;await begin();fireEvent.click(groupChoice(2));fireEvent.click(screen.getByRole('button',{name:'Confirm decision'}));await screen.findByText('The saved group decision could not be verified. Refresh the queue before retrying.');expect(mutations()).toHaveLength(1);expect(screen.queryByText(/3 flags closed/)).toBeNull();
});
it('double confirmation clicks submit the group once',async()=>{
 const {state,mutations}=fixture();let complete!:()=>void;state.pending=new Promise<void>(resolve=>{complete=resolve});await begin();fireEvent.click(groupChoice(2));const button=screen.getByRole('button',{name:'Confirm decision'});fireEvent.click(button);fireEvent.click(button);expect(mutations()).toHaveLength(1);await act(async()=>complete());await screen.findByText('3 flags closed. The ranking stays unchanged.');expect(mutations()).toHaveLength(1);
});
it('cancelling an in-flight context read cannot reopen or apply a late result',async()=>{
 const {state,mutations}=fixture();let complete!:()=>void;state.contextPending=new Promise<void>(resolve=>{complete=resolve});await screen.findByRole('heading',{name:'Full Planche'});fireEvent.click(screen.getByLabelText('I watched the clip and checked the reported issue'));fireEvent.click(screen.getByRole('button',{name:'Dismiss flag'}));expect(screen.getByText('Checking other open flags for this submission…')).toBeTruthy();fireEvent.click(screen.getByRole('button',{name:'Cancel'}));await act(async()=>complete());expect(screen.queryByRole('dialog')).toBeNull();expect(mutations()).toHaveLength(0);
});
