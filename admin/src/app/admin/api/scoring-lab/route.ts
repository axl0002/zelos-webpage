import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { checkMutation } from "@/lib/review-api";
import { privateResponse } from "@/lib/ranked-upload-api";
import {isLabId,object,parseLabAlgorithm,parseLabConfig,parseLabContext,parseLabDataset,parseLabDetail,parseLabResults,parseLabRun} from "@/lib/scoring-lab";
export const dynamic="force-dynamic";
const bad=()=>privateResponse(NextResponse.json({error:"Check the scoring experiment inputs and try again."},{status:400}));
function failure(error:unknown){const e=error&&typeof error==="object"?error as {code?:string;message?:string}:{};return privateResponse(NextResponse.json({error:e.code==="42501"?"This account cannot access the scoring lab.":e.code==="22023"?"The experiment could not run with these inputs. Check the selections and limits.":e.code==="54000"?"The scoring lab reached a storage or dataset limit. Use an existing snapshot or run.":e.code==="57014"?"The experiment took too long. Try a smaller comparison.":"The scoring lab is temporarily unavailable. Try again."},{status:e.code==="42501"?403:e.code==="22023"?400:e.code==="54000"?409:503}));}
const exact=(body:Record<string,unknown>,keys:string[])=>Object.keys(body).length===keys.length&&keys.every(key=>key in body);
export async function GET(request:NextRequest){
 try{
  const auth=await requireAdmin();if(auth.response)return privateResponse(auth.response);
  const q=request.nextUrl.searchParams;if(new Set(q.keys()).size!==[...q.keys()].length)return bad();const view=q.get("view")??"context";let name:string,args:Record<string,unknown>|undefined,parse:(value:unknown)=>unknown;
  if(view==="context"){if([...q.keys()].some(k=>k!=="view"))return bad();name="admin_scoring_lab_context";parse=parseLabContext;}
  else if(view==="results"){
   if([...q.keys()].some(k=>!["view","run","algorithm","discipline","gender","country","offset"].includes(k)))return bad();
   const run=q.get("run"),algorithm=q.get("algorithm"),discipline=q.get("discipline")||null,gender=q.get("gender")||null,country=q.get("country")||null,rawOffset=q.get("offset")??"0";
   if(!isLabId(run)||!isLabId(algorithm)||discipline!==null&&!["push","pull"].includes(discipline)||gender!==null&&(gender.length>30||/[\u0000-\u001f]/.test(gender))||country!==null&&!/^[a-z]{2}$/.test(country)||!/^\d{1,5}$/.test(rawOffset)||Number(rawOffset)>10000)return bad();
   name="admin_scoring_lab_results";args={target_run:run,target_algorithm:algorithm,filter_discipline:discipline,filter_gender:gender,filter_country:country,page_offset:Number(rawOffset),page_limit:50};parse=parseLabResults;
  }else if(view==="detail"){
   if([...q.keys()].some(k=>!["view","run","algorithm","athlete","discipline"].includes(k)))return bad();
   const run=q.get("run"),algorithm=q.get("algorithm"),athlete=q.get("athlete"),discipline=q.get("discipline");if(!isLabId(run)||!isLabId(algorithm)||!isLabId(athlete)||!["push","pull"].includes(discipline??""))return bad();
   name="admin_scoring_lab_detail";args={target_run:run,target_algorithm:algorithm,target_athlete:athlete,target_discipline:discipline};parse=parseLabDetail;
  }else return bad();
  const {data,error}=args?await auth.client.rpc(name,args):await auth.client.rpc(name);if(error)return failure(error);return privateResponse(NextResponse.json(parse(data)));
 }catch{return failure({});}
}
export async function POST(request:NextRequest){
 const invalid=checkMutation(request);if(invalid)return privateResponse(invalid);
 try{
  const auth=await requireAdmin();if(auth.response)return privateResponse(auth.response);
  // Stream limit prevents oversized chunked bodies bypassing Content-Length.
  if(Number(request.headers.get("content-length")??0)>32768)return bad();
  const reader=request.body?.getReader();if(!reader)return bad();let bytes=0,raw="";const decoder=new TextDecoder();
  while(true){const {done,value}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>32768){await reader.cancel();return bad();}raw+=decoder.decode(value,{stream:true});}raw+=decoder.decode();
  let body:Record<string,unknown>;try{body=object(JSON.parse(raw));}catch{return bad();}
  let name:string,args:Record<string,unknown>,parse:(value:unknown)=>unknown;
  if(body.action==="capture"&&exact(body,["action","label"])){
   if(typeof body.label!=="string"||!body.label.trim()||body.label.trim().length>100)return bad();
   name="admin_scoring_lab_capture";args={dataset_label:body.label.trim()};parse=parseLabDataset;
  }else if(body.action==="save"&&exact(body,["action","name","config"])){
   if(typeof body.name!=="string"||!body.name.trim()||body.name.trim().length>100)return bad();let config;try{config=parseLabConfig(body.config);}catch{return bad();}
   name="admin_scoring_lab_save_algorithm";args={algorithm_name:body.name.trim(),algorithm_config:config};parse=parseLabAlgorithm;
  }else if(body.action==="run"&&exact(body,["action","dataset","algorithms"])){
   if(!isLabId(body.dataset)||!Array.isArray(body.algorithms)||body.algorithms.length<1||body.algorithms.length>8||!body.algorithms.every(isLabId)||new Set(body.algorithms).size!==body.algorithms.length)return bad();
   name="admin_scoring_lab_run";args={target_dataset:body.dataset,selected_algorithms:body.algorithms};parse=parseLabRun;
  }else if(body.action==="delete_run"&&exact(body,["action","run"])&&isLabId(body.run)){
   name="admin_scoring_lab_delete_run";args={target_run:body.run};parse=value=>{const v=object(value);if(v.deleted!==true||v.id!==body.run)throw Error();return{deleted:true,id:v.id};};
  }else if(body.action==="delete_dataset"&&exact(body,["action","dataset"])&&isLabId(body.dataset)){
   name="admin_scoring_lab_delete_dataset";args={target_dataset:body.dataset};parse=value=>{const v=object(value);if(v.deleted!==true||v.id!==body.dataset)throw Error();return{deleted:true,id:v.id};};
  }else return bad();
  const {data,error}=await auth.client.rpc(name,args);if(error)return failure(error);return privateResponse(NextResponse.json(parse(data)));
 }catch{return failure({});}
}
