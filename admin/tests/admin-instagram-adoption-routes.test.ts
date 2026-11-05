// @vitest-environment node
import {beforeEach,expect,it,vi} from "vitest";
import {NextRequest} from "next/server";
const client=vi.hoisted(()=>({auth:{getUser:vi.fn()},rpc:vi.fn()}));
vi.mock("../src/lib/supabase/server",()=>({serverClient:async()=>client}));
import {GET} from "../src/app/admin/api/analytics/instagram/route";
const fixture={schema_version:1,cohort_start:"2026-10-22T00:00:00Z",generated_at:"2026-11-05T12:00:00Z",signed_in_accounts:10,with_instagram:6,without_instagram:3,unanswered:1};
const request=(query="")=>new NextRequest("https://zelos.club/admin/api/analytics/instagram"+query);
beforeEach(()=>{vi.resetAllMocks();client.auth.getUser.mockResolvedValue({data:{user:{id:"admin"}},error:null});client.rpc.mockImplementation(async name=>({data:name==="admin_rank_review_context"?{boards:[]}:{...fixture,email:"private",instagram_handle:"secret"},error:null}));});
it("requires verified session and reviewer access",async()=>{
 client.auth.getUser.mockResolvedValue({data:{user:null},error:null});expect((await GET(request())).status).toBe(401);expect(client.rpc).not.toHaveBeenCalled();
 client.auth.getUser.mockResolvedValue({data:{user:{id:"athlete",user_metadata:{admin:true}}},error:null});client.rpc.mockResolvedValue({error:{code:"42501"}});
 const response=await GET(request());expect(response.status).toBe(403);expect(client.rpc).toHaveBeenCalledExactlyOnceWith("admin_rank_review_context");expect(response.headers.get("cache-control")).toBe("private, no-store");
});
it("returns aggregate allowlist using only the authorized RPC",async()=>{
 const response=await GET(request());expect(response.status).toBe(200);expect(await response.json()).toEqual(fixture);expect(client.rpc).toHaveBeenLastCalledWith("admin_instagram_adoption_v1");expect(response.headers.get("cache-control")).toBe("private, no-store");expect(response.headers.get("x-content-type-options")).toBe("nosniff");
});
it("rejects date filters or arbitrary IDs rather than silently changing cohort",async()=>{
 for(const query of ["?days=7","?tz=UTC","?user_id=private"]){expect((await GET(request(query))).status).toBe(400);}expect(client.rpc.mock.calls.every(([name])=>name==="admin_rank_review_context")).toBe(true);
});
it("fails closed without leaking provider details or fabricating zero results",async()=>{
 for(const code of ["42501","57014"]){client.rpc.mockImplementation(async name=>name==="admin_rank_review_context"?{data:{boards:[]}}:{error:{code,message:"private SQL"}});const response=await GET(request());expect(response.status).toBe(code==="42501"?403:503);expect(await response.text()).not.toContain("private SQL");}
 client.rpc.mockImplementation(async name=>({data:name==="admin_rank_review_context"?{boards:[]}:{...fixture,unanswered:0}}));expect((await GET(request())).status).toBe(503);
 client.auth.getUser.mockRejectedValue(new Error("private token"));const response=await GET(request());expect(response.status).toBe(503);expect(await response.text()).not.toContain("private token");
});
