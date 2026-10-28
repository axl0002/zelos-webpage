// @vitest-environment node
import {beforeEach,expect,it,vi} from 'vitest';
import {NextRequest} from 'next/server';
const client=vi.hoisted(()=>({auth:{getUser:vi.fn()},rpc:vi.fn()}));
vi.mock('../src/lib/supabase/server',()=>({serverClient:async()=>client}));
import {POST as context} from '../src/app/admin/api/ranked-uploads/hold-context/route';
import {POST as correct} from '../src/app/admin/api/ranked-uploads/hold-correction/route';
const upload='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const body={upload_id:upload,expected_revision:4,expected_source_fingerprint:'a'.repeat(32),hold_start_ms:2000,hold_end_ms:11999,watched_video:true,review_note:'Verified correct frames'};
const ctx={upload_id:upload,revision:4,source_fingerprint:'a'.repeat(32),duration_ms:15000,max_value:600,claim:12,hold_timing:{start_ms:1000,end_ms:13999,duration_ms:12999}};
const receipt={ok:true,status:'corrected',value:9,revision:5,hold_timing:{start_ms:2000,end_ms:11999,duration_ms:9999}};
const post=(handler:typeof correct,value:unknown=body,origin='http://localhost:3004')=>handler(new NextRequest('http://localhost:3004/admin/api/ranked-uploads/hold-correction',{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify(value)}));
beforeEach(()=>{vi.resetAllMocks();delete process.env.ADMIN_ORIGIN;client.auth.getUser.mockResolvedValue({data:{user:{id:'admin'}},error:null});client.rpc.mockImplementation(async name=>({data:name==='admin_rank_review_context'?{}:name==='get_ranked_upload_hold_edit_context_v1'?ctx:receipt,error:null}));});
it('uses existing verified administrator and origin checks for private edit reads and writes',async()=>{
 for(const handler of [context,correct]){expect((await post(handler,body,'https://evil.test')).status).toBe(403);}
 expect(client.auth.getUser).not.toHaveBeenCalled();client.auth.getUser.mockResolvedValue({data:{user:null},error:null});expect((await post(correct)).status).toBe(401);expect(client.rpc).not.toHaveBeenCalled();
});
it('loads only allowlisted edit context with private no-store',async()=>{const r=await post(context,{upload_id:upload});expect(r.status).toBe(200);expect(r.headers.get('cache-control')).toBe('private, no-store');expect(await r.json()).toEqual(ctx);expect(client.rpc).toHaveBeenLastCalledWith('get_ranked_upload_hold_edit_context_v1',{upload_id:upload});});
it('forwards versioned correction contract without inventing a client result',async()=>{const r=await post(correct);expect(r.status).toBe(200);expect(client.rpc).toHaveBeenLastCalledWith('admin_correct_ranked_upload_hold_v1',body);expect(await r.json()).toEqual(receipt);expect(r.headers.get('cache-control')).toBe('private, no-store');});
it.each([{...body,corrected_value:9},{...body,hold_start_ms:-1},{...body,hold_end_ms:180001},{...body,hold_end_ms:2001},{...body,hold_start_ms:1.5},{...body,watched_video:false},{...body,expected_revision:0},{...body,expected_source_fingerprint:'bad'},{...body,review_note:'x'},{...body,review_note:'x'.repeat(1001)},{...body,actor:'forged'}])('rejects malformed/forged corrections %j',async v=>{expect((await post(correct,v)).status).toBe(400);expect(client.rpc.mock.calls.filter(([n])=>n!=='admin_rank_review_context')).toHaveLength(0);});
it('redacts database errors and requires a complete success receipt',async()=>{
 client.rpc.mockImplementation(async name=>({data:name==='admin_rank_review_context'?{}:null,error:name==='admin_rank_review_context'?null:{code:'40001',message:'review_conflict'}}));expect((await post(correct)).status).toBe(409);
 for(const invalid of [{...receipt,revision:9},{...receipt,value:12},{...receipt,hold_timing:null}]){client.rpc.mockImplementation(async name=>({data:name==='admin_rank_review_context'?{}:invalid,error:null}));expect((await post(correct)).status).toBe(503);}
});
it('rejects stale, malformed or mismatched source contexts',async()=>{for(const invalid of [{...ctx,upload_id:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'},{...ctx,duration_ms:0},{...ctx,source_fingerprint:'bad'},{...ctx,hold_timing:{...ctx.hold_timing,end_ms:15001}}]){client.rpc.mockImplementation(async name=>({data:name==='admin_rank_review_context'?{}:invalid,error:null}));expect((await post(context,{upload_id:upload})).status).toBe(503);}});
it('bounds chunked raw JSON before passing data to either new RPC',async()=>{for(const handler of [context,correct]){expect((await post(handler,{...body,review_note:'🙂'.repeat(5000)})).status).toBe(400);}expect(client.rpc.mock.calls.filter(([n])=>n!=='admin_rank_review_context')).toHaveLength(0);});
