// @vitest-environment node
import {beforeEach,expect,it,vi} from "vitest";
import {NextRequest} from "next/server";
const client=vi.hoisted(()=>({auth:{getUser:vi.fn()},rpc:vi.fn()}));
vi.mock("../src/lib/supabase/server",()=>({serverClient:async()=>client}));
import {GET} from "../src/app/admin/api/ranking-flags/route";
import {POST} from "../src/app/admin/api/ranking-flags/decision/route";
function request(body:unknown,origin="http://localhost:3004") {return new NextRequest("http://localhost:3004/admin/api/ranking-flags/decision",{method:"POST",headers:{origin,"content-type":"application/json"},body:JSON.stringify(body)});}
const decision={report_id:"dddddddd-dddd-4ddd-8ddd-dddddddddddd",confirmed:true,review_note:"Bent arms",watched_video:true,rule_ids:[]};
beforeEach(()=>{vi.resetAllMocks();delete process.env.ADMIN_ORIGIN;});
it("blocks unauthenticated reads and non-admin decisions",async()=>{
 client.auth.getUser.mockResolvedValue({data:{user:null},error:null});expect((await GET()).status).toBe(401);expect(client.rpc).not.toHaveBeenCalled();
 client.auth.getUser.mockResolvedValue({data:{user:{id:"user"}},error:null});client.rpc.mockResolvedValue({error:{code:"42501",message:"admin_required"}});
 expect((await POST(request(decision))).status).toBe(403);expect(client.rpc).toHaveBeenCalledTimes(1);
});
it("requires same origin, viewing and explanation; strips forged fields",async()=>{
 expect((await POST(request(decision,"https://other.test"))).status).toBe(403);expect(client.auth.getUser).not.toHaveBeenCalled();
 client.auth.getUser.mockResolvedValue({data:{user:{id:"admin"}},error:null});client.rpc.mockResolvedValue({data:[],error:null});
 expect((await POST(request({...decision,watched_video:false}))).status).toBe(400);
 expect((await POST(request({...decision,review_note:""}))).status).toBe(400);
 expect((await POST(request({...decision,owner_id:"forged"}))).status).toBe(200);expect(client.rpc).toHaveBeenLastCalledWith("admin_resolve_ranking_flag",decision);
 expect((await GET()).headers.get("cache-control")).toBe("private, no-store");
});

it("returns frame reason and saved boundary evidence only through the admin queue",async()=>{
 const flag={id:"dddddddd-dddd-4ddd-8ddd-dddddddddddd",reason:"incorrect_hold_frames",reported_hold_start_ms:1000,reported_hold_end_ms:11500,hold_timing:{start_ms:1000,end_ms:11500,duration_ms:10500}};
 client.auth.getUser.mockResolvedValue({data:{user:{id:"admin"}},error:null});
 client.rpc.mockResolvedValue({data:[flag],error:null});
 const response=await GET();expect(response.status).toBe(200);
 expect(await response.json()).toEqual([flag]);
 expect(client.rpc).toHaveBeenCalledWith("admin_ranking_flags");
 expect(response.headers.get("cache-control")).toBe("private, no-store");
});
it("forwards an evidence-only dismissal for the database to check, never a false-viewed rejection",async()=>{
 client.auth.getUser.mockResolvedValue({data:{user:{id:"admin"}},error:null});client.rpc.mockResolvedValue({data:[],error:null});
 const dismiss={...decision,confirmed:false,watched_video:false,review_note:"Content no longer available"};
 expect((await POST(request(dismiss))).status).toBe(200);
 expect(client.rpc).toHaveBeenLastCalledWith("admin_resolve_ranking_flag",dismiss);
 expect((await POST(request({...dismiss,confirmed:true}))).status).toBe(400);
});
