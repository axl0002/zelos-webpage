import {afterEach,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import Dashboard from '../src/components/ranking-flags-dashboard';
import {parseRankingFlagRejectionV2} from '../src/lib/ranking-flag-rejection-v2';
const report='dddddddd-dddd-4ddd-8ddd-dddddddddddd',sibling='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const rules=[{id:'0994f1f7-a39e-d12b-cf93-9566fe52ee1b',type:'form',text:'Keep your stomach in contact with the bar throughout the hold.',position:2},{id:'f451ec75-95a3-880e-8b5c-8135d5377180',type:'form',text:'Keep the line through your feet, hips and shoulders parallel to the ground throughout the hold.',position:1}];
const item={id:report,post_id:'touch-fixture',reason:'incorrect_exercise',details:'Check progression',corrected_value:null,reported_value:10,metric:'seconds',rule_violations:[],rules,claimed_value:10,board_name:'Full Front Lever Touch',board_metric:'seconds',username:'fixture_athlete',title:'Touch',created_at:'2026-11-05T00:00:00Z',submission_status:'eligible',primary_url:'https://media.zelos.club/touch-fixture.mp4',renditions:{}};
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
for(const grouped of [false,true])it(`changes incorrect exercise to form and submits both deployed rule IDs through the real parser (group: ${grouped})`,async()=>{
 const ids=grouped?[report,sibling]:[report];
 const fetch=vi.fn(async(path:string,options:RequestInit={})=>{
  if(path.includes('/group-context?'))return {ok:true,json:async()=>({report_id:report,submission_id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',open_report_ids:ids,other_open_count:ids.length-1})};
  if(options.method==='POST'){
   const parsed=parseRankingFlagRejectionV2(JSON.parse(options.body as string),grouped);
   return {ok:!!parsed,json:async()=>parsed?(grouped?{ok:true,status:'confirmed',resolved_report_ids:ids,resolved_count:2,other_resolved_count:1}:{ok:true}):{error:'Select a rejection reason and check the review details.'}};
  }
  return {ok:true,json:async()=>[item]};
 });vi.stubGlobal('fetch',fetch);render(<Dashboard/>);await screen.findByRole('heading',{name:'Full Front Lever Touch'});
 fireEvent.change(screen.getByLabelText('Rejection reason'),{target:{value:'unacceptable_form'}});
 for(const rule of rules)fireEvent.click(screen.getByLabelText('Form: '+rule.text));
 fireEvent.click(screen.getByLabelText('I watched the clip and checked the reported issue'));
 fireEvent.click(screen.getByRole('button',{name:'Reject ranking'}));
 if(grouped)fireEvent.click(await screen.findByLabelText('Apply to all 1 other flag for this submission'));
 const confirm=screen.getByRole('button',{name:'Confirm decision'});await waitFor(()=>expect((confirm as HTMLButtonElement).disabled).toBe(false));fireEvent.click(confirm);
 await screen.findByText(grouped?'2 flags closed. The ranking was rejected and the uploader received your reason once.':'Ranking rejected. The uploader has been notified with your reason.');
 const [path,options]=fetch.mock.calls.find(([,o])=>o.method==='POST')!;expect(path).toBe(grouped?'/admin/api/ranking-flags/decision/group/v2':'/admin/api/ranking-flags/decision/v2');
 expect(JSON.parse(options.body as string)).toEqual({report_id:report,confirmed:true,review_note:'Unacceptable form',watched_video:true,rule_ids:rules.map(r=>r.id),reason_code:'unacceptable_form',...(grouped?{expected_open_report_ids:ids}:{})});
 expect(screen.queryByText('Select a rejection reason and check the review details.')).toBeNull();
});
