import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { parseReviewQueueCursor } from "@/lib/review-queue-sort";
import { rpcFailure } from "@/lib/review-api";
export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) {
  const auth = await requireAdmin();
  if (auth.response) return auth.response;
  const p = request.nextUrl.searchParams;
  if (p.has("order")) {
    const bad = () => NextResponse.json({error:"Refresh the review queue before loading another page."}, {status:400,headers:{"Cache-Control":"private, no-store"}});
    if (p.get("order")!=="difficulty_v1" || p.has("after") || [...p.keys()].some(k=>!["status","exercise","q","order","cursor"].includes(k)) ||
        [...new Set(p.keys())].some(k=>p.getAll(k).length!==1)) return bad();
    let cursor = null;
    if (p.has("cursor")) {
      const raw=p.get("cursor")!;if(raw.length>2000)return bad();
      try {cursor=parseReviewQueueCursor(JSON.parse(raw));} catch {return bad();}
      if(!cursor || cursor.status!==(p.get("status")||"pending") || cursor.filter_exercise!==(p.get("exercise")||null) || cursor.search!==(p.get("q")||""))return bad();
    }
    const {data,error}=await auth.client.rpc("admin_rank_candidates_v2",{
      queue_status:p.get("status")||"pending",after_cursor:cursor,exercise_filter:p.get("exercise")||null,search_text:p.get("q")||"",
    });
    return error?rpcFailure(error,"load"):NextResponse.json(data,{headers:{"Cache-Control":"private, no-store"}});
  }
  const { data, error } = await auth.client.rpc("admin_rank_candidates", {
    queue_status: p.get("status") || "pending",
    after_post: p.get("after") || null,
    exercise_filter: p.get("exercise") || null,
    search_text: p.get("q") || "",
  });
  return error
    ? rpcFailure(error, "load")
    : NextResponse.json(data, {
        headers: { "Cache-Control": "private, no-store" },
      });
}
