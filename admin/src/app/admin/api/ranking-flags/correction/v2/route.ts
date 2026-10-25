import {NextRequest,NextResponse} from "next/server";
import {requireAdmin} from "@/lib/require-admin";
import {checkMutation,rpcFailure} from "@/lib/review-api";
import {privateResponse} from "@/lib/ranked-upload-api";
import {parseRankingHoldCorrectionV2} from "@/lib/ranking-flags";
export const dynamic="force-dynamic";
export const maxDuration=60;
const bad=()=>privateResponse(NextResponse.json({error:"Check the corrected result, video frames and review note."},{status:400}));
export async function POST(request:NextRequest){try{
 const invalid=checkMutation(request);if(invalid)return privateResponse(invalid);const auth=await requireAdmin();if(auth.response)return privateResponse(auth.response);
 if(Number(request.headers.get('content-length')??0)>8192)return bad();const reader=request.body?.getReader();if(!reader)return bad();let raw='',bytes=0;const decoder=new TextDecoder();while(true){const {done,value}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>8192){await reader.cancel();return bad();}raw+=decoder.decode(value,{stream:true});}raw+=decoder.decode();let data;try{data=JSON.parse(raw);}catch{return bad();}
 const correction=parseRankingHoldCorrectionV2(data);if(!correction)return bad();const {data:result,error}=await auth.client.rpc('admin_correct_ranking_hold_v2',correction);
 if(error)return privateResponse(rpcFailure(error));if(!result||result.ok!==true||result.status!=='corrected'||result.value!==Math.floor((correction.hold_end_ms-correction.hold_start_ms)/1000)||result.measurement_revision!==correction.expected_revision+1||typeof result.flag_resolved!=='boolean')return privateResponse(NextResponse.json({error:'The saved correction could not be verified. Refresh the queue before retrying.'},{status:503}));return privateResponse(NextResponse.json({ok:true,status:'corrected',value:result.value,measurement_revision:result.measurement_revision,flag_resolved:result.flag_resolved}));
 }catch{return privateResponse(NextResponse.json({error:'The correction service is temporarily unavailable. Refresh the queue before retrying.'},{status:503}));}}
