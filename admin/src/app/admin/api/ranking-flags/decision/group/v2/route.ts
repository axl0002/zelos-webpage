import {NextRequest,NextResponse} from "next/server";
import {privateResponse} from "@/lib/ranked-upload-api";
import {requireAdmin} from "@/lib/require-admin";
import {checkMutation,rpcFailure} from "@/lib/review-api";
import {parseRankingFlagRejectionV2} from "@/lib/ranking-flag-rejection-v2";
import {parseRankingFlagGroupResult,readRankingFlagGroupCommand} from "@/lib/ranking-flag-group";
export const dynamic="force-dynamic";
export const maxDuration=60;
export async function POST(request:NextRequest){
 try{
  const invalid=checkMutation(request);if(invalid)return privateResponse(invalid);
  const auth=await requireAdmin();if(auth.response)return privateResponse(auth.response);
  const decision=parseRankingFlagRejectionV2(await readRankingFlagGroupCommand(request),true);
  if(!decision||!("expected_open_report_ids" in decision))return privateResponse(NextResponse.json({error:"Check the selected flags and rejection reason."},{status:400}));
  const {data,error}=await auth.client.rpc("admin_resolve_ranking_flag_group_v2",decision);
  if(error)return privateResponse(rpcFailure(error));
  const result=parseRankingFlagGroupResult(data,decision.expected_open_report_ids as string[],decision.confirmed);
  return privateResponse(result?NextResponse.json(result):NextResponse.json({error:"The saved decision could not be verified. Refresh the queue before retrying."},{status:503}));
 }catch{return privateResponse(NextResponse.json({error:"The group decision could not be verified. Refresh the queue before retrying."},{status:503}));}
}
