import {NextRequest, NextResponse} from "next/server";
import {privateResponse} from "@/lib/ranked-upload-api";
import {requireAdmin} from "@/lib/require-admin";
import {rpcFailure} from "@/lib/review-api";
import {parseRankingFlagGroupContext, rankingFlagId} from "@/lib/ranking-flag-group";
export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdmin(); if (auth.response) return privateResponse(auth.response);
    const id = rankingFlagId(request.nextUrl.searchParams.get("report_id"));
    if (!id) return privateResponse(NextResponse.json({error: "Select a valid ranking flag."}, {status: 400}));
    const {data, error} = await auth.client.rpc("admin_ranking_flag_group_context_v1", {report_id: id});
    if (error) {
      if (error.code === "54000") return privateResponse(NextResponse.json({error: "There are too many related flags for one group decision. You can still review this flag only."}, {status: 409}));
      return privateResponse(rpcFailure(error, "load"));
    }
    const context = parseRankingFlagGroupContext(data, id);
    return privateResponse(context ? NextResponse.json(context) : NextResponse.json({error: "Related flags could not be verified. Retry or continue with this flag only."}, {status: 503}));
  } catch {return privateResponse(NextResponse.json({error: "Related flags could not be loaded. Retry or continue with this flag only."}, {status: 503}));}
}
