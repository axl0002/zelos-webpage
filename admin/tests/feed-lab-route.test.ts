// @vitest-environment node
import {beforeEach,expect,it,vi} from 'vitest';import {NextRequest} from 'next/server';
const client=vi.hoisted(()=>({auth:{getUser:vi.fn()},rpc:vi.fn()}));vi.mock('../src/lib/supabase/server',()=>({serverClient:async()=>client}));
import {GET,POST} from '../src/app/admin/api/feed-lab/route';import {parseFeedParams,parseFeedAction} from '../src/lib/feed-lab';
const id='99999999-9999-4999-8999-999999999999';
const params={freshness:35,exercise:25,engagement:20,following:10,country:5,athlete:5,fresh_days:7,new_slots:3,explore_percent:10,author_cap:2,exercise_cap:4,delivery_hours:24,seen_days:7,seen_ms:3000,short_fraction:.7,session_size:200};
const context={config:{active_id:id,enabled:true,rollout_percent:10,revision:1},versions:[{id,name:'Unseen',parameters:params,published:true}],history:[],stats:{seen_pairs:0,watching_users:0}};
const request=(body:unknown,origin='http://localhost:3004')=>new NextRequest('http://localhost:3004/admin/api/feed-lab',{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify(body)});
beforeEach(()=>{vi.resetAllMocks();delete process.env.ADMIN_ORIGIN;client.auth.getUser.mockResolvedValue({data:{user:{id}},error:null});client.rpc.mockResolvedValue({data:context,error:null});});
it('requires verified admin membership and keeps responses private',async()=>{
 const r=await GET(new NextRequest('http://localhost:3004/admin/api/feed-lab'));expect(r.status).toBe(200);expect(r.headers.get('cache-control')).toBe('private, no-store');expect(client.rpc).toHaveBeenLastCalledWith('admin_feed_context');
 client.auth.getUser.mockResolvedValue({data:{user:null},error:null});expect((await GET(new NextRequest('http://localhost:3004/admin/api/feed-lab'))).status).toBe(401);
});
it('rejects cross-origin and unbounded bodies before a settings mutation',async()=>{
 expect((await POST(request({action:'activate'},'https://evil.example'))).status).toBe(403);expect(client.rpc).not.toHaveBeenCalled();
 const large=await POST(request({padding:'x'.repeat(9000)}));expect(large.status).toBe(413);expect(client.rpc).toHaveBeenCalledTimes(1);
});
it('validates weight totals, every bounded parameter and unknown fields',()=>{
 expect(parseFeedParams(params)).toEqual(params);for(const p of [{...params,country:6},{...params,seen_ms:0},{...params,athlete:NaN},{...params,extra:1},{...params,freshness:undefined,other:35}])expect(parseFeedParams(p)).toBeNull();
 expect(parseFeedAction({action:'activate',version:id,revision:1,enabled:true,rollout:100})).toBeNull();
});
it('activation dispatches only the version and guarded expected revision',async()=>{
 const r=await POST(request({action:'activate',version:id,revision:1,enabled:false,rollout:0,confirmation:'ACTIVATE'}));expect(r.status).toBe(200);expect(client.rpc).toHaveBeenLastCalledWith('admin_feed_activate',{version_id:id,expected_revision:1,feed_enabled:false,rollout:0});
});
it('saves a validated immutable version without activating it',async()=>{
 client.rpc.mockResolvedValueOnce({data:{},error:null}).mockResolvedValueOnce({data:id,error:null});const r=await POST(request({action:'save',name:' Test ',parameters:params}));expect(r.status).toBe(200);expect(await r.json()).toEqual({id});expect(client.rpc).toHaveBeenLastCalledWith('admin_feed_save',{version_name:'Test',parameters:params});
});
it('preview dispatches without a delivery or watch mutation',async()=>{
 client.rpc.mockResolvedValueOnce({data:{},error:null}).mockResolvedValueOnce({data:{version_id:id,items:[],delivery_or_seen_written:false},error:null});const r=await POST(request({action:'preview',version:id,viewer:null}));expect(r.status).toBe(200);expect(client.rpc).toHaveBeenLastCalledWith('admin_feed_preview',{version_id:id,viewer_id:null,sample_seed:null});
});
it('stale activation and provider errors have safe copy',async()=>{
 client.rpc.mockResolvedValueOnce({data:{},error:null}).mockResolvedValueOnce({data:null,error:{code:'40001',message:'private SQL details'}});const r=await POST(request({action:'activate',version:id,revision:1,enabled:true,rollout:10,confirmation:'ACTIVATE'}));expect(r.status).toBe(409);expect(JSON.stringify(await r.json())).not.toContain('private SQL');
});
