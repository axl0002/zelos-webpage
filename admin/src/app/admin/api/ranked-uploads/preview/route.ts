import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { checkMutation } from "@/lib/review-api";
import { privateResponse, rankedUploadFailure } from "@/lib/ranked-upload-api";
import { parsePrivateRankedPreview, parseRankedUploadPreview } from "@/lib/ranked-uploads";
export async function POST(request: NextRequest) {
  const invalid = checkMutation(request);
  if (invalid) return privateResponse(invalid);
  try {
    const auth = await requireAdmin();
    if (auth.response) return privateResponse(auth.response);
    const uploadId = parseRankedUploadPreview(await request.json().catch(() => null));
    if (!uploadId) return privateResponse(NextResponse.json({error: "Invalid upload ID."}, {status: 400}));
    const {data, error} = await auth.client.functions.invoke("review-upload-media", {
      body: {upload_id: uploadId, review_kind: "ranking"},
    });
    const preview = error ? null : parsePrivateRankedPreview(data);
    if (!preview) return privateResponse(NextResponse.json({error: "The private video could not be opened. Refresh and try again."}, {status: 503}));
    return privateResponse(NextResponse.json(preview));
  } catch { return rankedUploadFailure(); }
}
