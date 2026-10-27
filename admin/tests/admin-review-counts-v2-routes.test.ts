// @vitest-environment node
import {beforeEach,expect,it,vi} from "vitest";
const client=vi.hoisted(()=>({auth:{getUser:vi.fn()},rpc:vi.fn()}));
vi.mock("../src/lib/supabase/server",()=>({serverClient:async()=>client}));
import {GET} from "../src/app/admin/api/review-counts/v2/route";
const counts={current_reports:1,legacy_reports:2,user_reports:3,ranking_flags:4,ranked_uploads:5,upload_safety:6};
beforeEach(()=>{vi.resetAllMocks();client.auth.getUser.mockResolvedValue({data:{user:{id:"admin"}},error:null});client.rpc.mockImplementation(async name=>({data:name==="admin_rank_review_context"?{boards:[]}:counts,error:null}));});
it("checks verified session and admin before reading v2 counts",async()=>{
 client.auth.getUser.mockResolvedValue({data:{user:null},error:null});expect((await GET()).status).toBe(401);expect(client.rpc).not.toHaveBeenCalled();
 client.auth.getUser.mockResolvedValue({data:{user:{id:"member"}},error:null});client.rpc.mockResolvedValue({error:{code:"42501"}});expect((await GET()).status).toBe(403);expect(client.rpc).toHaveBeenCalledExactlyOnceWith("admin_rank_review_context");
});
it("returns only v2 numeric counts with private cache control",async()=>{
 client.rpc.mockImplementation(async name=>({data:name==="admin_rank_review_context"?{}:{...counts,email:"private",object_key:"private"},error:null}));
 const response=await GET();expect(response.status).toBe(200);expect(await response.json()).toEqual(counts);expect(response.headers.get("cache-control")).toBe("private, no-store");expect(client.rpc).toHaveBeenLastCalledWith("admin_review_counts_v2");
});
it.each([undefined,-1,1.5,"6",null,NaN,Number.MAX_SAFE_INTEGER+1])("reports missing/invalid safety count as unknown (%j)",async value=>{
 client.rpc.mockImplementation(async name=>({data:name==="admin_rank_review_context"?{}:{...counts,upload_safety:value},error:null}));const response=await GET();expect(response.status).toBe(503);expect(JSON.stringify(await response.json())).not.toContain('"upload_safety":0');
});
