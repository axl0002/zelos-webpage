// @vitest-environment node
import {beforeEach,expect,it,vi} from 'vitest';import {NextRequest} from 'next/server';
const client=vi.hoisted(()=>({auth:{getUser:vi.fn()},rpc:vi.fn()}));vi.mock('../src/lib/supabase/server',()=>({serverClient:async()=>client}));
import {GET} from '../src/app/admin/api/review/route';import {parseReviewQueueCursor} from '../src/lib/review-queue-sort';
const cursor={v:1,level:0,weight:85,exercise:'front_lever_hold',board:'front-lever-hold-full',measurement:10,post:'clip-last',status:'pending',filter_exercise:null,search:''};
const request=(params:Record<string,string>)=>new NextRequest('http://localhost:3004/admin/api/review?'+new URLSearchParams(params));
beforeEach(()=>{vi.resetAllMocks();client.auth.getUser.mockResolvedValue({data:{user:{id:'admin'}},error:null});client.rpc.mockResolvedValueOnce({data:{boards:[]},error:null}).mockResolvedValue({data:{items:[],stats:{pending:0,approved:0,skipped:0},has_more:false,next_cursor:null},error:null});});
it('released no-order requests keep the legacy function and post-ID cursor',async()=>{
 const r=await GET(request({status:'pending',after:'old-post',exercise:'pull_up',q:'set'}));expect(r.status).toBe(200);expect(client.rpc).toHaveBeenLastCalledWith('admin_rank_candidates',{queue_status:'pending',after_post:'old-post',exercise_filter:'pull_up',search_text:'set'});
});
it('new dashboard requests dispatch the explicit sort-key cursor to v2',async()=>{
 const r=await GET(request({status:'pending',order:'difficulty_v1',cursor:JSON.stringify(cursor)}));expect(r.status).toBe(200);expect(r.headers.get('cache-control')).toBe('private, no-store');expect(client.rpc).toHaveBeenLastCalledWith('admin_rank_candidates_v2',{queue_status:'pending',after_cursor:cursor,exercise_filter:null,search_text:''});
});
it('malformed or mixed/filter-mismatched cursors cannot restart legacy pagination',async()=>{
 for(const params of ([{order:'difficulty_v1',cursor:'broken'},{order:'difficulty_v1',after:'old'},{order:'difficulty_v1',cursor:JSON.stringify(cursor),exercise:'different'},{order:'difficulty_v1',cursor:JSON.stringify({...cursor,post:''})},{order:'other'}] as Record<string,string>[])){
  expect((await GET(request(params))).status).toBe(400);
 }
 expect(client.rpc.mock.calls.every(([rpc])=>rpc==='admin_rank_review_context')).toBe(true);
});
it('validates bounded primitive keys without trusting extra properties',()=>{
 expect(parseReviewQueueCursor(cursor)).toEqual(cursor);
 for(const change of [{v:2},{level:3},{weight:Infinity},{measurement:1.5},{measurement:2147483648},{post:''},{extra:true},{status:'other'},{filter_exercise:42}])expect(parseReviewQueueCursor({...cursor,...change})).toBeNull();
});
it('requires admin verification before either legacy or sorted queue reads',async()=>{
 client.auth.getUser.mockResolvedValue({data:{user:null},error:null});expect((await GET(request({order:'difficulty_v1'}))).status).toBe(401);expect(client.rpc).not.toHaveBeenCalled();
});
