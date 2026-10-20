import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { checkMutation, rpcFailure } from "@/lib/review-api";
import { privateResponse } from "@/lib/ranked-upload-api";
import { parseReportPreview, reportId } from "@/lib/moderation-reports";
export async function POST(request: NextRequest) {
  const invalid = checkMutation(request);
  if (invalid) return privateResponse(invalid);
  try {
    const auth = await requireAdmin();
    if (auth.response) return privateResponse(auth.response);
    const input = await request.json().catch(() => null);
    if (!reportId(input?.case_id)) return privateResponse(NextResponse.json({error: "Choose a valid report."}, {status: 400}));
    const {data, error} = await auth.client.rpc("get_review_post", {case_id: input.case_id});
    if (error) return privateResponse(rpcFailure(error));
    const preview = parseReportPreview(data);
    return privateResponse(preview ? NextResponse.json(preview) : NextResponse.json({error: "This post is no longer available for review."}, {status: 404}));
  } catch { return privateResponse(rpcFailure({})); }
}
