// @vitest-environment node
import {beforeEach,expect,it,vi} from "vitest";
import {NextRequest} from "next/server";
const client=vi.hoisted(()=>({auth:{getUser:vi.fn()},rpc:vi.fn()}));
const get=vi.hoisted(()=>vi.fn());
vi.mock("../src/lib/supabase/server",()=>({serverClient:async()=>client}));
vi.mock("../src/lib/admin-dau.server",()=>({getDailyActiveUsers:get}));
import {GET} from "../src/app/admin/api/analytics/dau/route";
const request=(q="?days=7&tz=UTC")=>new NextRequest("https://zelos.club/admin/api/analytics/dau"+q);
beforeEach(()=>{vi.resetAllMocks();client.auth.getUser.mockResolvedValue({data:{user:{id:"admin"}},error:null});client.rpc.mockResolvedValue({data:{boards:[]},error:null});get.mockResolvedValue({schema_version:1,daily:[]});});
it("checks verified session and admin permission before reading vendor data",async()=>{
 client.auth.getUser.mockResolvedValue({data:{user:null},error:null});expect((await GET(request())).status).toBe(401);expect(get).not.toHaveBeenCalled();expect(client.rpc).not.toHaveBeenCalled();
 client.auth.getUser.mockResolvedValue({data:{user:{id:"athlete",user_metadata:{admin:true}}},error:null});client.rpc.mockResolvedValue({error:{code:"42501"}});expect((await GET(request())).status).toBe(403);expect(get).not.toHaveBeenCalled();
});
it("validates allowed ranges and timezones, rejects SQL, project IDs, duplicate params and arbitrary dates",async()=>{
 for(const q of ["?days=1","?days=7&days=30","?project_id=other","?sql=SELECT","?tz=Invalid/Zone","?start=2026-10-01"]){expect((await GET(request(q))).status).toBe(400);}expect(get).not.toHaveBeenCalled();
});
it("returns private aggregate-only data and sanitizes all vendor errors",async()=>{
 const response=await GET(request("?days=30&tz=Asia%2FShanghai"));expect(response.status).toBe(200);expect(get).toHaveBeenCalledExactlyOnceWith({days:30,timezone:"Asia/Shanghai"});expect(response.headers.get("cache-control")).toBe("private, no-store");expect(response.headers.get("x-content-type-options")).toBe("nosniff");
 get.mockRejectedValue(new Error("phx_secret SQL identities"));const failed=await GET(request());expect(failed.status).toBe(503);expect(await failed.text()).not.toMatch(/phx_secret|SQL|identities/);expect(failed.headers.get("cache-control")).toBe("private, no-store");
});
