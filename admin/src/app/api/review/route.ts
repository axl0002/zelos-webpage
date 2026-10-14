import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { rpcFailure } from "@/lib/review-api";
export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) {
  const auth = await requireAdmin();
  if (auth.response) return auth.response;
  const p = request.nextUrl.searchParams;
  const { data, error } = await auth.client.rpc("admin_rank_candidates", {
    queue_status: p.get("status") || "pending",
    after_post: p.get("after") || null,
    exercise_filter: p.get("exercise") || null,
    search_text: p.get("q") || "",
  });
  return error
    ? rpcFailure(error)
    : NextResponse.json(data, {
        headers: { "Cache-Control": "private, no-store" },
      });
}
