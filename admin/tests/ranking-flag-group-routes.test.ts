// @vitest-environment node
import {beforeEach,expect,it,vi} from 'vitest';
import {NextRequest} from 'next/server';
const client=vi.hoisted(()=>({auth:{getUser:vi.fn()},rpc:vi.fn()}));
vi.mock('../src/lib/supabase/server',()=>({serverClient:async()=>client}));
import {GET} from '../src/app/admin/api/ranking-flags/group-context/route';
import {POST} from '../src/app/admin/api/ranking-flags/decision/group/v1/route';
import {parseRankingFlagGroupContext,parseRankingFlagGroupDecision,parseRankingFlagGroupResult} from '../src/lib/ranking-flag-group';
const report='dddddddd-dddd-4ddd-8ddd-dddddddddddd',other='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',submission='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const context={report_id:report,submission_id:submission,open_report_ids:[report,other],other_open_count:1};
const command={report_id:report,expected_open_report_ids:[report,other],confirmed:true,review_note:'Verified form',watched_video:true,rule_ids:[]};
const receipt={ok:true,status:'confirmed',resolved_report_ids:[report,other],resolved_count:2,other_resolved_count:1};
const get=(id=report)=>new NextRequest(`http://localhost:3004/admin/api/ranking-flags/group-context?report_id=${id}`);
const post=(body:unknown,origin='http://localhost:3004')=>new NextRequest('http://localhost:3004/admin/api/ranking-flags/decision/group/v1',{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify(body)});
beforeEach(()=>{vi.resetAllMocks();delete process.env.ADMIN_ORIGIN;client.auth.getUser.mockResolvedValue({data:{user:{id:'admin'}},error:null});client.rpc.mockImplementation(async(name:string)=>({data:name==='admin_rank_review_context'?{}:name==='admin_ranking_flag_group_context_v1'?context:receipt,error:null}));});
it('checks admin auth and keeps all responses private/no-store',async()=>{
 client.auth.getUser.mockResolvedValue({data:{user:null},error:null});for(const response of [await GET(get()),await POST(post(command))]){expect(response.status).toBe(401);expect(response.headers.get('cache-control')).toBe('private, no-store');}expect(client.rpc).not.toHaveBeenCalled();
 client.auth.getUser.mockResolvedValue({data:{user:{id:'ordinary'}},error:null});client.rpc.mockResolvedValue({data:null,error:{code:'42501',message:'admin_required'}});expect((await GET(get())).status).toBe(403);expect((await POST(post(command))).status).toBe(403);
});
it('returns validated fresh context and forwards only the exact request contract',async()=>{
 const response=await GET(get());expect(response.status).toBe(200);expect(await response.json()).toEqual(context);expect(client.rpc).toHaveBeenLastCalledWith('admin_ranking_flag_group_context_v1',{report_id:report});expect(response.headers.get('cache-control')).toBe('private, no-store');
 const saved=await POST(post(command));expect(saved.status).toBe(200);expect(await saved.json()).toEqual(receipt);expect(client.rpc).toHaveBeenLastCalledWith('admin_resolve_ranking_flag_group_v1',command);
});
it('rejects origin mismatch before auth and malformed or oversized commands without mutation',async()=>{
 expect((await POST(post(command,'https://elsewhere.test'))).status).toBe(403);expect(client.auth.getUser).not.toHaveBeenCalled();
 for(const value of [{...command,apply_all:true},{...command,confirmed:true,watched_video:false},{...command,expected_open_report_ids:[other]},{...command,expected_open_report_ids:[report,report]},{...command,expected_open_report_ids:Array(1001).fill(report)},{...command,review_note:'x'.repeat(65537)}])expect((await POST(post(value))).status).toBe(400);
 expect(client.rpc.mock.calls.filter(([name])=>name==='admin_resolve_ranking_flag_group_v1')).toHaveLength(0);expect((await GET(get('bad'))).status).toBe(400);
});
it('handles a cap or stale sibling-set error explicitly without a mutation retry',async()=>{
 client.rpc.mockImplementation(async(name:string)=>name==='admin_rank_review_context'?{data:{},error:null}:{data:null,error:{code:name==='admin_ranking_flag_group_context_v1'?'54000':'40001',message:name==='admin_ranking_flag_group_context_v1'?'too_many_related_flags':'review_conflict'}});
 const response=await GET(get());expect(response.status).toBe(409);expect((await response.json()).error).toContain('this flag only');expect((await POST(post(command))).status).toBe(409);expect(client.rpc.mock.calls.filter(([name])=>name==='admin_resolve_ranking_flag_group_v1')).toHaveLength(1);
});
it('rejects mismatched primary/context counts and unverified receipts',async()=>{
 for(const value of [{...context,report_id:other},{...context,open_report_ids:[other]},{...context,other_open_count:9},{...context,submission_id:'bad'}]){client.rpc.mockImplementation(async(name:string)=>({data:name==='admin_rank_review_context'?{}:value,error:null}));expect((await GET(get())).status).toBe(503);}
 for(const value of [{...receipt,resolved_report_ids:[report]},{...receipt,resolved_count:1},{...receipt,status:'dismissed'},{...receipt,resolved_report_ids:[report,submission]}]){client.rpc.mockImplementation(async(name:string)=>({data:name==='admin_rank_review_context'?{}:value,error:null}));expect((await POST(post(command))).status).toBe(503);}
});
it('parses scope strictly, does not accept duplicates or forged selection, and permits evidence-only dismissal',()=>{
 expect(parseRankingFlagGroupContext(context,report)).toEqual(context);expect(parseRankingFlagGroupResult(receipt,[report,other],true)).toEqual(receipt);expect(parseRankingFlagGroupDecision(command)).toEqual(command);
 expect(parseRankingFlagGroupDecision({...command,confirmed:false,watched_video:false,rule_ids:[]})).toEqual({...command,confirmed:false,watched_video:false});
 expect(parseRankingFlagGroupDecision({...command,expected_open_report_ids:[report,report.toUpperCase()]})).toBeNull();expect(parseRankingFlagGroupDecision({...command,expected_open_report_ids:[other]})).toBeNull();expect(parseRankingFlagGroupDecision({...command,confirmed:false,rule_ids:['10000000-0000-4000-8000-000000000001']})).toBeNull();
});
