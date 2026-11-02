import {NextRequest, NextResponse} from "next/server";
import {privateResponse} from "@/lib/ranked-upload-api";
import {requireAdmin} from "@/lib/require-admin";
import {checkMutation, rpcFailure} from "@/lib/review-api";
import {parseRankingFlagGroupDecision, parseRankingFlagGroupResult, readRankingFlagGroupCommand} from "@/lib/ranking-flag-group";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
export async function POST(request: NextRequest) {
  try {
    const invalid = checkMutation(request); if (invalid) return privateResponse(invalid);
    const auth = await requireAdmin(); if (auth.response) return privateResponse(auth.response);
    const decision = parseRankingFlagGroupDecision(await readRankingFlagGroupCommand(request));
    if (!decision) return privateResponse(NextResponse.json({error: "Check the selected flags and review details."}, {status: 400}));
    const {data, error} = await auth.client.rpc("admin_resolve_ranking_flag_group_v1", decision);
    if (error) return privateResponse(rpcFailure(error));
    const result = parseRankingFlagGroupResult(data, decision.expected_open_report_ids, decision.confirmed);
    return privateResponse(result ? NextResponse.json(result) : NextResponse.json({error: "The saved group decision could not be verified. Refresh the queue before retrying."}, {status: 503}));
  } catch {return privateResponse(NextResponse.json({error: "The group decision could not be verified. Refresh the queue before retrying."}, {status: 503}));}
}
