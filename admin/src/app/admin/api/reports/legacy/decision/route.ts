import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { privateResponse } from "@/lib/ranked-upload-api";
import { checkMutation, rpcFailure } from "@/lib/review-api";
import { parseLegacyDecision } from "@/lib/legacy-reports";
export async function POST(request: NextRequest) {
  const invalid = checkMutation(request);
  if (invalid) return privateResponse(invalid);
  try {
    const auth = await requireAdmin();
    if (auth.response) return privateResponse(auth.response);
    const input = parseLegacyDecision(await request.json().catch(() => null));
    if (!input) return privateResponse(NextResponse.json({error: "Review the report and complete the required fields."}, {status: 400}));
    const {error} = await auth.client.rpc("admin_review_legacy_report", input);
    return privateResponse(error ? rpcFailure(error) : NextResponse.json({ok: true}));
  } catch { return privateResponse(rpcFailure({})); }
}
