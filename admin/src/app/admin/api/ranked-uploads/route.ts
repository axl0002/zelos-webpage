import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { privateResponse, rankedUploadFailure } from "@/lib/ranked-upload-api";
import { parseRankedUploadReviews } from "@/lib/ranked-uploads";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    const auth = await requireAdmin();
    if (auth.response) return privateResponse(auth.response);
    const {data, error} = await auth.client.rpc("get_ranked_upload_reviews");
    return error ? rankedUploadFailure(error) : privateResponse(NextResponse.json(
      parseRankedUploadReviews(data).filter(item => item.state === "rank_review")));
  } catch { return rankedUploadFailure(); }
}
