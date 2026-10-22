import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { privateResponse } from "@/lib/ranked-upload-api";
import { rpcFailure } from "@/lib/review-api";
import { parseAdminReviewCounts } from "@/lib/admin-review-counts";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    const auth = await requireAdmin();
    if (auth.response) return privateResponse(auth.response);
    const {data, error} = await auth.client.rpc("admin_review_counts");
    return privateResponse(error ? rpcFailure(error, "load") : NextResponse.json(parseAdminReviewCounts(data)));
  } catch { return privateResponse(rpcFailure({}, "load")); }
}
