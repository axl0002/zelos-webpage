import {NextRequest,NextResponse} from 'next/server';
import {requireAdmin} from './require-admin';
import {checkMutation} from './review-api';
import {privateResponse} from './ranked-upload-api';
import {readHoldCommand} from './ranked-upload-hold';
export function clipFailure(error?:{code?:string;message?:string}) {
 const requestConflict=error?.code==='23505'&&error?.message==='request_id_conflict';
 const conflict=error?.code==='40001'||requestConflict;
 return privateResponse(NextResponse.json({error:requestConflict?'This action changed. Refresh the clip and start a new attempt.':error?.message==='report_evidence_outside_trim'?'Keep the marked report evidence, or resolve those flags before trimming.':conflict?'This clip changed. Refresh the clip before trying again.':error?.code==='42501'?'This action is not available to your account.':error?.code==='22023'?'Check the selected clip, times and review details.':'The clip service could not finish. Your request may have saved; retry the same request to check.',code:requestConflict?'request_id_conflict':conflict?'clip_conflict':'clip_unavailable'},{status:conflict?409:error?.code==='42501'?403:error?.code==='22023'?400:503}));
}
export async function clipMutation<T extends object>(request:NextRequest,parse:(v:unknown)=>T|null,rpc:string,validate:(v:unknown,command:T)=>object|null){
 try{const invalid=checkMutation(request);if(invalid)return privateResponse(invalid);const auth=await requireAdmin();if(auth.response)return privateResponse(auth.response);
 const command=parse(await readHoldCommand(request));if(!command)return privateResponse(NextResponse.json({error:'Check the clip, confirmation and review details.'},{status:400}));
 const {data,error}=await auth.client.rpc(rpc,command);if(error)return clipFailure(error);const result=validate(data,command);if(!result)return clipFailure();return privateResponse(NextResponse.json(result));
 }catch{return clipFailure();}
}
export function clipActionReceipt(v:unknown){if(!v||typeof v!=='object'||Array.isArray(v))return null;return (v as Record<string,unknown>).ok===true?{ok:true}:null;}
