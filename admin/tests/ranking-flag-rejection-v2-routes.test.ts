// @vitest-environment node
import {beforeEach,expect,it,vi} from 'vitest';
import {NextRequest} from 'next/server';
const client=vi.hoisted(()=>({auth:{getUser:vi.fn()},rpc:vi.fn()}));
vi.mock('../src/lib/supabase/server',()=>({serverClient:async()=>client}));
import {POST as single} from '../src/app/admin/api/ranking-flags/decision/v2/route';
import {POST as group} from '../src/app/admin/api/ranking-flags/decision/group/v2/route';
const report='dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const command={report_id:report,confirmed:true,reason_code:'incorrect_exercise',review_note:'Incorrect exercise or progression',watched_video:true,rule_ids:[]};
const grouped={...command,expected_open_report_ids:[report]};
const receipt={ok:true,status:'confirmed',resolved_report_ids:[report],resolved_count:1,other_resolved_count:0};
const post=(value:unknown)=>new NextRequest('http://localhost:3004/admin/api/ranking-flags/decision/v2',{method:'POST',headers:{origin:'http://localhost:3004','content-type':'application/json'},body:JSON.stringify(value)});
beforeEach(()=>{vi.resetAllMocks();delete process.env.ADMIN_ORIGIN;client.auth.getUser.mockResolvedValue({data:{user:{id:'admin'}},error:null});client.rpc.mockResolvedValue({data:receipt,error:null});});
it('uses separately named RPCs and preserves selected category and exact group scope',async()=>{
 const response=await single(post(command));expect(response.status).toBe(200);expect(response.headers.get('cache-control')).toBe('private, no-store');
 expect(client.rpc).toHaveBeenLastCalledWith('admin_resolve_ranking_flag_v2',command);
 expect((await group(post(grouped))).status).toBe(200);expect(client.rpc).toHaveBeenLastCalledWith('admin_resolve_ranking_flag_group_v2',grouped);
});
it('blocks unsupported reasons, forged fields, unchecked viewing and unrelated rule evidence',async()=>{
 for(const value of [{...command,reason_code:'invented'},{...command,watched_video:false},{...command,confirmed:false},{...command,owner_id:'forged'},{...command,rule_ids:['10000000-0000-4000-8000-000000000001']}])expect((await single(post(value))).status).toBe(400);
 expect(client.rpc.mock.calls.every(([name])=>name==='admin_rank_review_context')).toBe(true);
});
it('does not accept an unverified group receipt or retry a failed save',async()=>{
 client.rpc.mockResolvedValue({data:{...receipt,resolved_report_ids:[]},error:null});expect((await group(post(grouped))).status).toBe(503);
 client.rpc.mockImplementation(async(name:string)=>name==='admin_rank_review_context'?{data:{},error:null}:{data:null,error:{code:'40001',message:'review_conflict'}});expect((await single(post(command))).status).toBe(409);
 expect(client.rpc.mock.calls.filter(([name])=>name==='admin_resolve_ranking_flag_v2')).toHaveLength(1);
});
