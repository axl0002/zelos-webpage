import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { checkMutation } from "@/lib/review-api";
import { privateResponse, rankedUploadFailure } from "@/lib/ranked-upload-api";
import { parseRankedUploadDecision } from "@/lib/ranked-uploads";
export async function POST(request: NextRequest) {
  const invalid = checkMutation(request);
  if (invalid) return privateResponse(invalid);
  try {
    const auth = await requireAdmin();
    if (auth.response) return privateResponse(auth.response);
    const decision = parseRankedUploadDecision(await request.json().catch(() => null));
    if (!decision) return privateResponse(NextResponse.json({error: "Select a rejection reason, or confirm you watched the full video when approving."}, {status: 400}));
    const {error} = await auth.client.rpc("resolve_ranked_upload_review", decision);
    return error ? rankedUploadFailure(error) : privateResponse(NextResponse.json({ok: true}));
  } catch { return rankedUploadFailure(); }
}
