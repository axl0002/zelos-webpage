// @vitest-environment node
import {beforeEach, expect, it, vi} from 'vitest';
import {NextRequest} from 'next/server';
const client=vi.hoisted(()=>({auth:{getUser:vi.fn()},rpc:vi.fn()}));
vi.mock('../src/lib/supabase/server',()=>({serverClient:async()=>client}));
import {POST as context} from '../src/app/admin/api/ranked-uploads/rep-context/route';
import {POST as correct} from '../src/app/admin/api/ranked-uploads/rep-correction/route';
const upload='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const body={upload_id:upload,expected_revision:4,expected_source_fingerprint:'a'.repeat(32),corrected_value:8,watched_video:true,review_note:'Counted eight complete reps'};
const ctx={upload_id:upload,revision:4,source_fingerprint:'a'.repeat(32),claim:10,max_value:2147483647};
const receipt={ok:true,status:'corrected',value:8,revision:5};
const post=(handler:typeof correct,value:unknown=body,origin='http://localhost:3004')=>handler(new NextRequest('http://localhost:3004/admin/api/ranked-uploads/rep-correction',{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify(value)}));
beforeEach(()=>{vi.resetAllMocks();delete process.env.ADMIN_ORIGIN;client.auth.getUser.mockResolvedValue({data:{user:{id:'admin'}},error:null});client.rpc.mockImplementation(async name=>({data:name==='admin_rank_review_context'?{}:name==='get_ranked_upload_rep_edit_context_v1'?ctx:receipt,error:null}));});
it('requires the existing verified admin and same-origin JSON for reads and writes',async()=>{
 for(const h of [context,correct])expect((await post(h,h===context?{upload_id:upload}:body,'https://evil.test')).status).toBe(403);
 expect(client.auth.getUser).not.toHaveBeenCalled();client.auth.getUser.mockResolvedValue({data:{user:null},error:null});expect((await post(correct)).status).toBe(401);expect(client.rpc).not.toHaveBeenCalled();
});
it('returns only the private context allowlist and no-store',async()=>{
 client.rpc.mockImplementation(async name=>({data:name==='admin_rank_review_context'?{}:{...ctx,object_key:'private',source_sha256:'secret'},error:null}));
 const r=await post(context,{upload_id:upload});expect(r.status).toBe(200);expect(r.headers.get('cache-control')).toBe('private, no-store');expect(await r.json()).toEqual(ctx);expect(client.rpc).toHaveBeenLastCalledWith('get_ranked_upload_rep_edit_context_v1',{upload_id:upload});
});
it('forwards the exact additive correction contract and allowlists the receipt',async()=>{
 const r=await post(correct);expect(r.status).toBe(200);expect(client.rpc).toHaveBeenLastCalledWith('admin_correct_ranked_upload_reps_v1',body);expect(await r.json()).toEqual(receipt);expect(r.headers.get('cache-control')).toBe('private, no-store');
});
it.each([0,-1,8.5,2147483648,'8',null])('rejects invalid rep count %s',async value=>{
 expect((await post(correct,{...body,corrected_value:value})).status).toBe(400);expect(client.rpc.mock.calls.filter(([n])=>n!=='admin_rank_review_context')).toHaveLength(0);
});
it.each([{...body,watched_video:false},{...body,review_note:'x'},{...body,review_note:'x'.repeat(1001)},
 {...body,expected_revision:0},{...body,expected_source_fingerprint:'bad'},{...body,hold_start_ms:0},{...body,actor:'forged'}])('rejects incomplete or forged corrections %j',async value=>{
 expect((await post(correct,value)).status).toBe(400);expect(client.rpc.mock.calls.filter(([n])=>n!=='admin_rank_review_context')).toHaveLength(0);
});
it('supports the same maximum integer as normal rep uploads',async()=>{
 client.rpc.mockImplementation(async name=>({data:name==='admin_rank_review_context'?{}:{...receipt,value:2147483647},error:null}));expect((await post(correct,{...body,corrected_value:2147483647})).status).toBe(200);
});
it('maps stale revisions to conflict and never exposes raw database errors',async()=>{
 client.rpc.mockImplementation(async name=>({data:name==='admin_rank_review_context'?{}:null,error:name==='admin_rank_review_context'?null:{code:'40001',message:'private detail'}}));const r=await post(correct);expect(r.status).toBe(409);expect(JSON.stringify(await r.json())).not.toContain('private detail');
});
it('rejects mismatched or unverified success receipts',async()=>{
 for(const bad of [{...receipt,value:10},{...receipt,revision:4},{...receipt,ok:false},{...receipt,status:'approved'},{}]){
  client.rpc.mockImplementation(async name=>({data:name==='admin_rank_review_context'?{}:bad,error:null}));expect((await post(correct)).status).toBe(503);
 }
});
it('rejects stale or malformed context and bounds oversized/chunked JSON',async()=>{
 for(const bad of [{...ctx,upload_id:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'},{...ctx,claim:1.5},{...ctx,max_value:0},{...ctx,revision:-1},{...ctx,source_fingerprint:'bad'}]){
  client.rpc.mockImplementation(async name=>({data:name==='admin_rank_review_context'?{}:bad,error:null}));expect((await post(context,{upload_id:upload})).status).toBe(503);
 }
 for(const h of [context,correct])expect((await post(h,{...body,review_note:'🙂'.repeat(5000)})).status).toBe(400);
 expect((await post(context,{upload_id:upload,actor:'forged'})).status).toBe(400);
});
