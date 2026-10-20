import { privateResponse } from "@/lib/ranked-upload-api";
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { checkMutation } from "@/lib/review-api";
import { parseSafetyPreview } from "@/lib/safety-review";

export async function POST(request: NextRequest) {
  return privateResponse(await handler(request));
}

async function handler(request: NextRequest) {
  try {
  const invalid = checkMutation(request);
  if (invalid) return invalid;
  const auth = await requireAdmin();
  if (auth.response) return auth.response;
  const uploadId = parseSafetyPreview(await request.json().catch(() => null));
  if (!uploadId)
    return NextResponse.json({ error: "Invalid upload ID." }, { status: 400 });
  const { data, error } = await auth.client.functions.invoke("review-upload-media", {
    body: { upload_id: uploadId },
  });
  if (error || !data || typeof data.url !== "string")
    return NextResponse.json(
      { error: "The private clip could not be opened. Refresh and try again." },
      { status: 503 },
    );
  return NextResponse.json(
    { url: data.url, expires_in: data.expires_in },
    { headers: { "Cache-Control": "private, no-store" } },
  );
  } catch { return NextResponse.json({error: "The review service is temporarily unavailable. Your inputs are still here; try again."}, {status: 503}); }
}
