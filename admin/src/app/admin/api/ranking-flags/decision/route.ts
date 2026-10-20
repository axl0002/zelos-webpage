import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { checkMutation, rpcFailure } from "@/lib/review-api";
import { parseRankingFlagDecision } from "@/lib/ranking-flags";
export async function POST(request: NextRequest) {
  const invalid = checkMutation(request);
  if (invalid) return invalid;
  const auth = await requireAdmin();
  if (auth.response) return auth.response;
  const decision = parseRankingFlagDecision(await request.json().catch(() => null));
  if (!decision) return NextResponse.json({error: "Check the clip and select a rule or add a reason when rejecting the ranking."}, {status: 400});
  const { error } = await auth.client.rpc("admin_resolve_ranking_flag", decision);
  return error ? rpcFailure(error) : NextResponse.json({ok: true});
}
