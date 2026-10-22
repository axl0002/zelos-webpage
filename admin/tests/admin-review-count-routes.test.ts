// @vitest-environment node
import {beforeEach,expect,it,vi} from "vitest";
const client=vi.hoisted(()=>({auth:{getUser:vi.fn()},rpc:vi.fn()}));
vi.mock("../src/lib/supabase/server",()=>({serverClient:async()=>client}));
import {GET} from "../src/app/admin/api/review-counts/route";
const counts={current_reports:51,legacy_reports:205,user_reports:256,ranking_flags:101,ranked_uploads:102};
beforeEach(()=>{
 vi.resetAllMocks();
 client.auth.getUser.mockResolvedValue({data:{user:{id:"admin"}},error:null});
 client.rpc.mockImplementation(async name=>({data:name==="admin_rank_review_context"?{boards:[]}:counts,error:null}));
});
it("requires a verified session and admin authorization before reading any counts",async()=>{
 client.auth.getUser.mockResolvedValue({data:{user:null},error:null});
 let response=await GET();expect(response.status).toBe(401);expect(client.rpc).not.toHaveBeenCalled();
 client.auth.getUser.mockResolvedValue({data:{user:{id:"athlete"}},error:null});
 client.rpc.mockResolvedValue({error:{code:"42501",message:"admin_required"}});
 response=await GET();expect(response.status).toBe(403);expect(client.rpc).toHaveBeenCalledExactlyOnceWith("admin_rank_review_context");
 expect(response.headers.get("cache-control")).toBe("private, no-store");
});
it("returns only validated unbounded numeric counts through a private zero-argument RPC",async()=>{
 client.rpc.mockImplementation(async name=>({data:name==="admin_rank_review_context"?{boards:[]}:{...counts,reporter_id:"secret",email:"secret"},error:null}));
 const response=await GET();expect(response.status).toBe(200);expect(await response.json()).toEqual(counts);
 expect(response.headers.get("cache-control")).toBe("private, no-store");
 expect(response.headers.get("x-content-type-options")).toBe("nosniff");
 expect(client.rpc).toHaveBeenLastCalledWith("admin_review_counts");
});
it.each([null,[],{}, {...counts,ranking_flags:-1},{...counts,ranking_flags:1.5},{...counts,ranked_uploads:"102"},{...counts,user_reports:0},{...counts,legacy_reports:NaN},{...counts,current_reports:Number.MAX_SAFE_INTEGER+1}])("reports invalid count payloads as unavailable rather than zero (%j)",async payload=>{
 client.rpc.mockImplementation(async name=>({data:name==="admin_rank_review_context"?{boards:[]}:payload,error:null}));
 const response=await GET();expect(response.status).toBe(503);
 expect(await response.json()).toHaveProperty("error");
 expect(response.headers.get("cache-control")).toBe("private, no-store");
});
it("preserves backend permission failures and hides internal service errors",async()=>{
 client.rpc.mockImplementation(async name=>name==="admin_rank_review_context"?{data:{boards:[]},error:null}:{error:{code:"42501",message:"private SQL"}});
 let response=await GET();expect(response.status).toBe(403);expect(JSON.stringify(await response.json())).not.toContain("private SQL");
 client.auth.getUser.mockRejectedValue(new Error("private credential"));response=await GET();expect(response.status).toBe(503);
 expect(JSON.stringify(await response.json())).not.toContain("private credential");
});
