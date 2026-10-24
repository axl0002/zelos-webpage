// @vitest-environment node
import {beforeEach,expect,it,vi} from "vitest";
import {NextRequest} from "next/server";
const client=vi.hoisted(()=>({auth:{getUser:vi.fn()},rpc:vi.fn()}));
vi.mock("../src/lib/supabase/server",()=>({serverClient:async()=>client}));
import {POST} from "../src/app/admin/api/review/decision/route";
beforeEach(()=>{vi.resetAllMocks();delete process.env.ADMIN_ORIGIN;client.auth.getUser.mockResolvedValue({data:{user:{id:"admin"}},error:null});client.rpc.mockResolvedValueOnce({data:{boards:[]},error:null}).mockResolvedValueOnce({data:{active:true,value:16},error:null});});
const media={primary_url:"https://media.zelos.club/hold.mp4",duration_ms:90000,renditions:{}};
const body={post_id:"legacy",revision:3,decision:"approve",board_id:"front-lever-hold-full",value:16,note:"Checked",watched:true,replace_current:false,hold_timing:{start_ms:1250,end_ms:17750,media}};
const request=(data:unknown)=>new NextRequest("http://localhost:3004/admin/api/review/decision",{method:"POST",headers:{origin:"http://localhost:3004","content-type":"application/json"},body:JSON.stringify(data)});
it("dispatches timed approval to distinct guarded RPC without trusting the browser's value",async()=>{
 const response=await POST(request({...body,author_id:"forged",claim:99}));expect(response.status).toBe(200);expect(response.headers.get("cache-control")).toBe("private, no-store");
 expect(client.rpc).toHaveBeenLastCalledWith("admin_approve_rank_candidate_timed",{target_post:"legacy",expected_revision:3,selected_board:body.board_id,hold_start_ms:1250,hold_end_ms:17750,expected_media:media,review_note:"Checked",watched_video:true,replace_current:false});
});
it("invalid or partial timing cannot fall back to the old approval API",async()=>{
 expect((await POST(request({...body,hold_timing:{start_ms:1000}}))).status).toBe(400);expect(client.rpc).toHaveBeenCalledTimes(1);
});
