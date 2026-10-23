import {NextRequest,NextResponse} from "next/server";
import {requireAdmin} from "@/lib/require-admin";
import {checkMutation} from "@/lib/review-api";
import {privateResponse} from "@/lib/ranked-upload-api";
import {isLabId,object} from "@/lib/scoring-lab";
import {parseScoringActivation,parseScoringPreview,parseScoringRegistry,parseScoringVersion} from "@/lib/scoring-production";
export const dynamic="force-dynamic";
const json=(v:unknown,status=200)=>privateResponse(NextResponse.json(v,{status}));
const bad=()=>json({error:"Check the scoring settings and try again."},400);
const exact=(v:Record<string,unknown>,keys:string[])=>Object.keys(v).length===keys.length&&keys.every(k=>k in v);
const note=(v:unknown):v is string=>typeof v==="string"&&v.trim().length>=10&&v.trim().length<=2000;
function failure(error:unknown){const e=error&&typeof error==="object"?error as {code?:string}:{};
 return json({error:e.code==="42501"?"This account cannot manage production scoring.":e.code==="40001"?"Scoring inputs changed. Refresh settings and create a new preview before activating.":e.code==="22023"?"Check the saved comparison, complete progression benchmarks, confirmation and reason. The preview may have expired.":e.code==="55000"?"This version needs an engine update before it can be activated.":e.code==="54000"?"The scoring settings limit was reached. Use an existing version or retry later.":"Scoring settings are temporarily unavailable. Refresh settings and check activation history before retrying."},e.code==="42501"?403:e.code==="22023"?400:["40001","55000","54000"].includes(e.code??"")?409:503);
}
export async function GET(request:NextRequest){try{const auth=await requireAdmin();if(auth.response)return privateResponse(auth.response);if([...request.nextUrl.searchParams].length)return bad();const {data,error}=await auth.client.rpc("admin_scoring_versions");return error?failure(error):json(parseScoringRegistry(data));}catch{return failure({});}}
export async function POST(request:NextRequest){
 const invalid=checkMutation(request);if(invalid)return privateResponse(invalid);
 try{const auth=await requireAdmin();if(auth.response)return privateResponse(auth.response);
 if([...request.nextUrl.searchParams].length||Number(request.headers.get("content-length")??0)>8192)return bad();
 const reader=request.body?.getReader();if(!reader)return bad();let raw="",bytes=0;const decoder=new TextDecoder();while(true){const {done,value}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>8192){await reader.cancel();return bad();}raw+=decoder.decode(value,{stream:true});}raw+=decoder.decode();
 let body:Record<string,unknown>;try{body=object(JSON.parse(raw));}catch{return bad();}
 let rpc:string,args:Record<string,unknown>,parse:(value:unknown)=>unknown;
 if(body.action==="register"&&exact(body,["action","algorithm","run","note"])&&isLabId(body.algorithm)&&isLabId(body.run)&&note(body.note)){
 rpc="admin_scoring_register";args={target_algorithm:body.algorithm,evidence_run:body.run,calibration_note:body.note.trim()};parse=parseScoringVersion;
 }else if(body.action==="preview"&&exact(body,["action","version"])&&isLabId(body.version)){
 rpc="admin_scoring_preview";args={target_version:body.version};parse=value=>{const p=parseScoringPreview(value);if(p.version_id!==body.version)throw Error();return p;};
 }else if(body.action==="activate"&&exact(body,["action","preview","expected_active","confirmation","reason"])&&isLabId(body.preview)&&isLabId(body.expected_active)&&body.confirmation==="ACTIVATE"&&note(body.reason)){
 rpc="admin_scoring_activate";args={target_preview:body.preview,expected_active:body.expected_active,confirmation:body.confirmation,change_reason:body.reason.trim()};parse=parseScoringActivation;
 }else return bad();
 const {data,error}=await auth.client.rpc(rpc,args);return error?failure(error):json(parse(data));
 }catch{return failure({});}
}
