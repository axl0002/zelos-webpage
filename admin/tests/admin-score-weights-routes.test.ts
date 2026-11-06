// @vitest-environment node
import {beforeEach, expect, it, vi} from "vitest";
import {NextRequest} from "next/server";
const client=vi.hoisted(()=>({auth:{getUser:vi.fn()},rpc:vi.fn()}));
vi.mock("../src/lib/supabase/server",()=>({serverClient:async()=>client}));
import {GET,POST} from "../src/app/admin/api/scoring-weights/route";
import {weightContext,weightReceipt,requestId} from "./fixtures/admin-score-weights";
const url="http://localhost:3004/admin/api/scoring-weights";
const body={request_id:requestId,expected_fingerprint:weightContext.fingerprint,weights:weightContext.weights.map(row=>({board_id:row.id,weight:row.weight})),change_reason:"Reviewed complete difficulty weights",confirmation:"APPLY"};
const get=(query="")=>GET(new NextRequest(url+query));
const post=(value:unknown=body,origin="http://localhost:3004")=>POST(new NextRequest(url,{method:"POST",headers:{origin,"content-type":"application/json"},body:JSON.stringify(value)}));
beforeEach(()=>{vi.resetAllMocks();delete process.env.ADMIN_ORIGIN;client.auth.getUser.mockResolvedValue({data:{user:{id:"admin"}},error:null});
  client.rpc.mockImplementation(async name=>({data:name==="admin_rank_review_context"?{}:name==="admin_score_weights_context_v1"?weightContext:weightReceipt,error:null}));});
it("requires real admin sessions on reads and writes and denies cross-site/form writes before identity",async()=>{
  expect((await post(body,"https://evil.test")).status).toBe(403);expect(client.auth.getUser).not.toHaveBeenCalled();
  client.auth.getUser.mockResolvedValue({data:{user:null},error:null});expect((await get()).status).toBe(401);expect((await post()).status).toBe(401);expect(client.rpc).not.toHaveBeenCalled();
  client.auth.getUser.mockResolvedValue({data:{user:{id:"not-admin",user_metadata:{admin:true}}},error:null});client.rpc.mockResolvedValue({error:{code:"42501",message:"private"}});
  expect((await get()).status).toBe(403);expect(client.rpc).toHaveBeenCalledExactlyOnceWith("admin_rank_review_context");
});
it("returns only validated private context with no-store headers",async()=>{
  client.rpc.mockImplementation(async name=>({data:name==="admin_rank_review_context"?{}:{...weightContext,secret:"do-not-leak",formula:"private"},error:null}));
  const result=await get();expect(result.status).toBe(200);expect(result.headers.get("cache-control")).toBe("private, no-store");expect(await result.json()).toEqual(weightContext);
});
it("binds only versioned complete-weight apply arguments and retains identical request IDs on retry",async()=>{
  expect((await post()).status).toBe(200);expect((await post()).status).toBe(200);
  expect(client.rpc).toHaveBeenLastCalledWith("admin_apply_score_weights_v1",{request_id:requestId,expected_fingerprint:weightContext.fingerprint,
    weights:[...body.weights].sort((a,b)=>a.board_id.localeCompare(b.board_id)),change_reason:body.change_reason});
  expect(client.rpc.mock.calls.filter(([name])=>name==="admin_apply_score_weights_v1")).toHaveLength(2);
  expect(client.rpc.mock.calls.some(([name])=>name==="admin_score_weights_context_v1"),"no new context precheck may block idempotent retries").toBe(false);
});
it.each([{...body,confirmation:"yes"},{...body,request_id:"bad"},{...body,expected_fingerprint:"bad"},{...body,change_reason:"short"},
  {...body,sql:"select"},{...body,weights:[{board_id:"dip",weight:-1}]},{...body,weights:[{board_id:"dip",weight:1,exercise:"changed"}]},
  {...body,weights:[{board_id:"dip",weight:1},{board_id:"dip",weight:2}]}])("rejects malformed or extra apply inputs %j",async value=>{
  expect((await post(value)).status).toBe(400);expect(client.rpc.mock.calls.filter(([name])=>name!=="admin_rank_review_context")).toHaveLength(0);
});
it("bounds actual chunked bodies and rejects query input before any apply",async()=>{
  expect((await get("?sql=select")).status).toBe(400);
  expect((await post({...body,change_reason:"x".repeat(512*1024+1)})).status).toBe(400);expect(client.rpc.mock.calls.some(([name])=>name==="admin_apply_score_weights_v1")).toBe(false);
});
it.each([["40001",409],["23505",409],["22023",400],["42501",403],["57014",503]])("returns safe actionable %s failures without leaking SQL",async(code,status)=>{
  client.rpc.mockImplementation(async name=>name==="admin_rank_review_context"?{data:{},error:null}:{error:{code,message:"private SQL credentials"}});
  const result=await post();expect(result.status).toBe(status);expect(await result.text()).not.toContain("private SQL");
});
