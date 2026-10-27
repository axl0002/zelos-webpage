// @vitest-environment node
import {beforeEach,expect,it,vi} from "vitest";
import {NextRequest} from "next/server";
const client=vi.hoisted(()=>({auth:{getUser:vi.fn()},rpc:vi.fn()}));
vi.mock("../src/lib/supabase/server",()=>({serverClient:async()=>client}));
import {GET} from "../src/app/admin/api/analytics/route";
import {analyticsFixture} from "./fixtures/analytics";
import {parseDailyAnalytics} from "../src/lib/admin-analytics";
const request=(query="")=>new NextRequest("https://zelos.club/admin/api/analytics"+query);
beforeEach(()=>{vi.resetAllMocks();client.auth.getUser.mockResolvedValue({data:{user:{id:"admin"}},error:null});client.rpc.mockImplementation(async(name,args)=>({data:name==="admin_rank_review_context"?{boards:[]}:analyticsFixture(args?.days??7,args?.timezone_name??"UTC"),error:null}));});
it("requires verified session and admin authorization before fetching aggregates",async()=>{
 client.auth.getUser.mockResolvedValue({data:{user:null},error:null});expect((await GET(request())).status).toBe(401);expect(client.rpc).not.toHaveBeenCalled();
 client.auth.getUser.mockResolvedValue({data:{user:{id:"athlete",user_metadata:{admin:true}}},error:null});client.rpc.mockResolvedValue({error:{code:"42501"}});
 const response=await GET(request());expect(response.status).toBe(403);expect(client.rpc).toHaveBeenCalledExactlyOnceWith("admin_rank_review_context");expect(response.headers.get("cache-control")).toBe("private, no-store");
});
it("calls only bounded aggregate RPC and returns allowlisted private fields",async()=>{
 const fixture=analyticsFixture(7,"Asia/Shanghai");client.rpc.mockImplementation(async(name)=>({data:name==="admin_rank_review_context"?{boards:[]}:{...fixture,email:"secret",daily:fixture.daily.map(row=>({...row,account_id:"private"})),coverage:{...fixture.coverage,object_key:"private"}},error:null}));
 const response=await GET(request("?days=7&tz=Asia%2FShanghai"));expect(response.status).toBe(200);expect(await response.json()).toEqual(fixture);expect(client.rpc).toHaveBeenLastCalledWith("admin_daily_analytics_v1",{days:7,timezone_name:"Asia/Shanghai"});
 expect(response.headers.get("cache-control")).toBe("private, no-store");expect(response.headers.get("x-content-type-options")).toBe("nosniff");
});
it.each(["?days=0","?days=1","?days=91","?days=7.0","?days=07","?days=30&days=7","?tz=Nope/Zone","?tz=","?tz=UTC&tz=UTC","?viewer_id=secret","?days=30&email=x"])("rejects invalid or extra query values before analytics RPC: %s",async query=>{
 const response=await GET(request(query));expect(response.status).toBe(400);expect(client.rpc).toHaveBeenCalledExactlyOnceWith("admin_rank_review_context");
});
it("defaults to7 UTC days and never exposes provider/internal errors",async()=>{
 let response=await GET(request());expect(response.status).toBe(200);expect(client.rpc).toHaveBeenLastCalledWith("admin_daily_analytics_v1",{days:7,timezone_name:"UTC"});
 client.rpc.mockImplementation(async name=>name==="admin_rank_review_context"?{data:{boards:[]},error:null}:{data:null,error:{code:"57014",message:"private SQL token"}});response=await GET(request());expect(response.status).toBe(503);expect(await response.text()).not.toContain("private SQL");
 client.rpc.mockImplementation(async name=>name==="admin_rank_review_context"?{data:{boards:[]},error:null}:{error:{code:"42501",message:"secret"}});expect((await GET(request())).status).toBe(403);
 client.auth.getUser.mockRejectedValue(new Error("private access key"));response=await GET(request());expect(response.status).toBe(503);expect(await response.text()).not.toContain("private access key");
});
it.each([null,[],{}, {...analyticsFixture(),schema_version:2},{...analyticsFixture(),days:90},{...analyticsFixture(),timezone:"Asia/Shanghai"}, {...analyticsFixture(),daily:[]}, {...analyticsFixture(),totals:{...analyticsFixture().totals,likes:999}}, {...analyticsFixture(),coverage:{...analyticsFixture().coverage,retained_records:false}}])("treats malformed or mismatched payload as unavailable, not zero (%j)",async payload=>{
 client.rpc.mockImplementation(async name=>({data:name==="admin_rank_review_context"?{boards:[]}:payload,error:null}));const response=await GET(request());expect(response.status).toBe(503);expect(response.headers.get("cache-control")).toBe("private, no-store");
});
it("validates zero-filled date continuity, real dates, integers and source coverage",()=>{
 const base=analyticsFixture(7);expect(parseDailyAnalytics(base)).toEqual(base);
 const invalid=[{...base,start_date:"2026-02-30"},{...base,generated_at:"invalid"},{...base,today_partial:false},{...base,coverage:{...base.coverage,data_start:"2026-10-21T00:00:00Z"}},{...base,coverage:{...base.coverage,upload_history_start:"bad"}},...[-1,1.5,NaN,Infinity,Number.MAX_SAFE_INTEGER+1,"0"].map(likes=>({...base,daily:base.daily.map((row,i)=>i===0?{...row,likes}:row)})),{...base,daily:[base.daily[1],...base.daily.slice(1)]}];
 for(const value of invalid)expect(()=>parseDailyAnalytics(value)).toThrow();
});
