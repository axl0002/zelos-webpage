import {NextRequest,NextResponse} from "next/server";
import {privateResponse} from "@/lib/ranked-upload-api";
import {requireAdmin} from "@/lib/require-admin";
import {checkMutation,rpcFailure} from "@/lib/review-api";
import {parseRankingFlagRejectionV2} from "@/lib/ranking-flag-rejection-v2";
export async function POST(request:NextRequest){
 try{
  const invalid=checkMutation(request);if(invalid)return privateResponse(invalid);
  const auth=await requireAdmin();if(auth.response)return privateResponse(auth.response);
  const decision=parseRankingFlagRejectionV2(await request.json());
  if(!decision)return privateResponse(NextResponse.json({error:"Select a rejection reason and check the review details."},{status:400}));
  const {error}=await auth.client.rpc("admin_resolve_ranking_flag_v2",decision);
  return privateResponse(error?rpcFailure(error):NextResponse.json({ok:true}));
 }catch{return privateResponse(NextResponse.json({error:"The decision could not be saved. Your inputs are still here; try again."},{status:503}));}
}
