import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { privateResponse } from "@/lib/ranked-upload-api";
import { rpcFailure } from "@/lib/review-api";
import { parseModerationReports } from "@/lib/moderation-reports";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    const auth = await requireAdmin();
    if (auth.response) return privateResponse(auth.response);
    const {data, error} = await auth.client.rpc("get_moderation_cases");
    return privateResponse(error ? rpcFailure(error) : NextResponse.json(parseModerationReports(data)));
  } catch { return privateResponse(rpcFailure({})); }
}
