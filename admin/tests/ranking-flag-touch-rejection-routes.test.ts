// @vitest-environment node
import {beforeEach,expect,it,vi} from 'vitest';
import {NextRequest} from 'next/server';
const client=vi.hoisted(()=>({auth:{getUser:vi.fn()},rpc:vi.fn()}));
vi.mock('../src/lib/supabase/server',()=>({serverClient:async()=>client}));
import {POST as single} from '../src/app/admin/api/ranking-flags/decision/v2/route';
import {POST as group} from '../src/app/admin/api/ranking-flags/decision/group/v2/route';
const report='dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const command={report_id:report,confirmed:true,reason_code:'unacceptable_form',review_note:'Unacceptable form',watched_video:true,rule_ids:['0994f1f7-a39e-d12b-cf93-9566fe52ee1b','f451ec75-95a3-880e-8b5c-8135d5377180']};
const receipt={ok:true,status:'confirmed',resolved_report_ids:[report],resolved_count:1,other_resolved_count:0};
const post=(value:unknown)=>new NextRequest('http://localhost:3004/admin/api/ranking-flags/decision/v2',{method:'POST',headers:{origin:'http://localhost:3004','content-type':'application/json'},body:JSON.stringify(value)});
beforeEach(()=>{vi.resetAllMocks();delete process.env.ADMIN_ORIGIN;client.auth.getUser.mockResolvedValue({data:{user:{id:'admin'}},error:null});client.rpc.mockImplementation(async name=>({data:name==='admin_rank_review_context'?{boards:[]}:receipt,error:null}));});
it('forwards both actual Full Front Lever Touch rules to single and group RPCs unchanged',async()=>{
 const response=await single(post(command));expect(response.status).toBe(200);expect(response.headers.get('cache-control')).toBe('private, no-store');
 expect(client.rpc).toHaveBeenLastCalledWith('admin_resolve_ranking_flag_v2',command);
 const grouped={...command,expected_open_report_ids:[report]};expect((await group(post(grouped))).status).toBe(200);expect(client.rpc).toHaveBeenLastCalledWith('admin_resolve_ranking_flag_group_v2',grouped);
});
it('preserves backend rule-membership checks and never retries a moderation write',async()=>{
 client.rpc.mockImplementation(async name=>name==='admin_rank_review_context'?{data:{boards:[]},error:null}:{error:{code:'22023',message:'invalid_rule_choices'}});
 expect((await single(post(command))).status).toBe(400);expect(client.rpc.mock.calls.filter(([name])=>name==='admin_resolve_ranking_flag_v2')).toHaveLength(1);
});
