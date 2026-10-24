import {NextRequest,NextResponse} from 'next/server';
import {requireAdmin} from '@/lib/require-admin';import {checkMutation} from '@/lib/review-api';import {privateResponse} from '@/lib/ranked-upload-api';import {parseFeedAction,parseFeedContext,uuid} from '@/lib/feed-lab';
export const dynamic='force-dynamic';export const maxDuration=30;
const json=(v:unknown,status=200)=>privateResponse(NextResponse.json(v,{status}));
const failure=(e:unknown)=>{const code=e&&typeof e==='object'?(e as {code?:string}).code:'';return json({error:code==='42501'?'This account cannot manage feed settings.':code==='40001'?'Feed settings changed. Refresh before activating.':code==='22023'||code==='23514'?'Check the feed parameters and preview user.':'Feed settings are temporarily unavailable. Refresh before retrying.'},code==='42501'?403:code==='40001'?409:code==='22023'||code==='23514'?400:503);};
export async function GET(request:NextRequest){try{const auth=await requireAdmin();if(auth.response)return privateResponse(auth.response);if([...request.nextUrl.searchParams].length)return json({error:'Unexpected query.'},400);const {data,error}=await auth.client.rpc('admin_feed_context');return error?failure(error):json(parseFeedContext(data));}catch{return failure({});}}
export async function POST(request:NextRequest){const invalid=checkMutation(request);if(invalid)return privateResponse(invalid);try{
 const auth=await requireAdmin();if(auth.response)return privateResponse(auth.response);if([...request.nextUrl.searchParams].length)return json({error:'Unexpected query.'},400);
 const reader=request.body?.getReader();if(!reader)return json({error:'Missing feed settings.'},400);let raw='',bytes=0;const decoder=new TextDecoder();while(true){const {done,value}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>8192){await reader.cancel();return json({error:'Feed settings are too large.'},413);}raw+=decoder.decode(value,{stream:true});}raw+=decoder.decode();
 const action=parseFeedAction(JSON.parse(raw));if(!action)return json({error:'Check the feed settings. Weights must total 100.'},400);
 const rpc=action.action==='save'?'admin_feed_save':action.action==='activate'?'admin_feed_activate':'admin_feed_preview';
 const args=action.action==='save'?{version_name:action.name,parameters:action.parameters}:action.action==='activate'?{version_id:action.version,expected_revision:action.revision,feed_enabled:action.enabled,rollout:action.rollout}:{version_id:action.version,viewer_id:action.viewer,sample_seed:action.seed??null};
 const {data,error}=await auth.client.rpc(rpc,args);if(error)return failure(error);
 if(action.action==='activate')return json(parseFeedContext(data));if(action.action==='save'){if(!uuid(data))throw Error();return json({id:data});}
 if(!data||typeof data!=='object'||!Array.isArray(data.items)||data.version_id!==action.version||data.delivery_or_seen_written!==false)throw Error();return json(data);
 }catch(e){return e instanceof SyntaxError?json({error:'Invalid feed settings.'},400):failure(e);}}
