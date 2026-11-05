import {reportId} from './moderation-reports';
import {parseExerciseRules, parseRuleIds, type ExerciseRule} from './exercise-rules';
import {rankedUploadReasons} from './ranked-uploads';

export type ClipTarget = {kind:'post'|'upload'; id:string};
export type ClipTrimStatus = {id:string; state:'queued'|'running'|'succeeded'|'failed'; start_ms:number|null; end_ms:number|null; error_code:string|null};
export type AdminClipContext = ClipTarget & {
  post_id:string|null; upload_id:string|null; author_id:string; username:string; country:string|null; title:string; state:string;
  can_trim:boolean; can_reject:boolean; can_report:boolean; can_report_ranking?:boolean; can_report_safety?:boolean; unavailable_reason:string|null;
  source_fingerprint:string|null; source_revision:number; duration_ms:number|null; claim:number|null; metric:'seconds'|'reps'|null;
  hold_timing:{start_ms:number;end_ms:number}|null; primary_url:string|null; renditions:Record<string,string>|null;
  latest_trim:ClipTrimStatus|null; rules:ExerciseRule[];
  report_evidence_range?:{start_ms:number|null;end_ms:number|null;fingerprint:string}|null;
};
const obj=(v:unknown):Record<string,unknown>|null=>v!==null&&typeof v==='object'&&!Array.isArray(v)?v as Record<string,unknown>:null;
const text=(v:unknown,max=1000):v is string=>typeof v==='string'&&v.length<=max;
const int=(v:unknown,min=0,max=2147483647):v is number=>Number.isSafeInteger(v)&&Number(v)>=min&&Number(v)<=max;
const fingerprint=(v:unknown):v is string=>typeof v==='string'&&/^[a-f0-9]{32}$/.test(v);
/** Public clip playback is limited to the Zelos CDN and its exact legacy Firebase bucket. */
export function safeClipMediaUrls(candidate:{primary_url:string|null;renditions:Record<string,string>|null}):string[]{
 const safe=(raw:string)=>{try{const u=new URL(raw);if(u.protocol!=='https:'||u.username||u.password||u.port||u.hash)return false;
 if(u.hostname==='media.zelos.club')return true;
 const bucket='zelos-prod.firebasestorage.app';
 if(u.hostname==='firebasestorage.googleapis.com'){const prefix=`/v0/b/${bucket}/o/`;return u.pathname.startsWith(prefix)&&u.pathname.length>prefix.length;}
 if(u.hostname==='storage.googleapis.com')return u.pathname.startsWith(`/${bucket}/`)&&u.pathname.length>bucket.length+2;
 return false;}catch{return false;}};
 const entries=Object.entries(candidate.renditions??{}).sort(([a],[b])=>(/720/.test(a)?0:/480/.test(a)?1:2)-(/720/.test(b)?0:/480/.test(b)?1:2));
 return [...new Set([...entries.map(([,v])=>v),...(candidate.primary_url?[candidate.primary_url]:[])].filter(safe))];
}
export function parseClipTarget(v:unknown):ClipTarget|null {const d=obj(v);return d&&(d.kind==='post'||d.kind==='upload')&&text(d.id,200)&&d.id.trim()===d.id&&d.id.length>0&&(d.kind!=='upload'||reportId(d.id))?{kind:d.kind,id:d.id}:null;}
export function parseClipTrimStatus(v:unknown):ClipTrimStatus|null {
 const d=obj(v);if(!d||!reportId(d.id)||!['queued','running','succeeded','failed'].includes(String(d.state)))return null;
 return {id:d.id,state:d.state as ClipTrimStatus['state'],start_ms:int(d.start_ms)?d.start_ms:null,end_ms:int(d.end_ms,1)?d.end_ms:null,error_code:text(d.error_code,100)?d.error_code:null};
}
/** Allowlist fields and public media hosts before returning privileged RPC data. */
export function parseAdminClipContext(v:unknown):AdminClipContext|null {
 const d=obj(v),target=parseClipTarget(v);if(!d||!target||!reportId(d.author_id)||!text(d.username,100)||!text(d.title)||!text(d.state,100)||!int(d.source_revision)||
 ['can_trim','can_reject','can_report'].some(k=>typeof d[k]!=='boolean')||!(d.source_fingerprint===null||fingerprint(d.source_fingerprint))||!(d.duration_ms===null||int(d.duration_ms,1,180000)))return null;
 const timing=obj(d.hold_timing);if(d.hold_timing!==null&&(!timing||!int(timing.start_ms)||!int(timing.end_ms,1)||timing.end_ms<=timing.start_ms||(d.duration_ms!==null&&timing.end_ms>d.duration_ms)))return null;
 if(d.metric!==null&&!['seconds','reps'].includes(String(d.metric)))return null;
 if(d.claim!==null&&(typeof d.claim!=='number'||!Number.isFinite(d.claim)||d.claim<=0))return null;
 if(d.can_trim&&!fingerprint(d.source_fingerprint))return null;
 const evidence=obj(d.report_evidence_range);
 if(d.report_evidence_range!=null&&(!evidence||!text(evidence.fingerprint,200)||!evidence.fingerprint||!(evidence.start_ms===null||int(evidence.start_ms))||!(evidence.end_ms===null||int(evidence.end_ms))||evidence.start_ms!==null&&evidence.end_ms!==null&&(evidence.end_ms as number)<(evidence.start_ms as number)))return null;
 const latest=d.latest_trim===null?null:parseClipTrimStatus(d.latest_trim);if(d.latest_trim!==null&&!latest)return null;
 const rend=obj(d.renditions);if(d.renditions!==null&&(!rend||Object.keys(rend).length>32||Object.values(rend).some(x=>!text(x,8192))))return null;
 const urls=safeClipMediaUrls({primary_url:text(d.primary_url,8192)?d.primary_url:null,renditions:rend as Record<string,string>|null});
 let rules:ExerciseRule[];try{rules=parseExerciseRules(d.rules??[]);}catch{return null;}
 return {...target,...(evidence?{report_evidence_range:{start_ms:evidence.start_ms as number|null,end_ms:evidence.end_ms as number|null,fingerprint:evidence.fingerprint as string}}:{}),author_id:d.author_id,username:d.username,title:d.title,state:d.state,post_id:text(d.post_id,200)?d.post_id:null,upload_id:reportId(d.upload_id)?d.upload_id:null,
 country:text(d.country,100)?d.country:null,...(typeof d.can_report_ranking==='boolean'?{can_report_ranking:d.can_report_ranking}:{}),...(typeof d.can_report_safety==='boolean'?{can_report_safety:d.can_report_safety}:{}),can_trim:d.can_trim===true,can_reject:d.can_reject===true,can_report:d.can_report===true,unavailable_reason:text(d.unavailable_reason,1000)?d.unavailable_reason:null,
 source_revision:d.source_revision,source_fingerprint:d.source_fingerprint as string|null,duration_ms:d.duration_ms as number|null,claim:d.claim as number|null,metric:d.metric as AdminClipContext['metric'],
 hold_timing:timing?{start_ms:timing.start_ms as number,end_ms:timing.end_ms as number}:null,primary_url:urls[0]??null,renditions:urls.length?Object.fromEntries(urls.map((u,i)=>[String(i),u])):null,latest_trim:latest,rules};
}
function commandBase(v:unknown){const d=obj(v);if(!d||!reportId(d.request_id))return null;const target=parseClipTarget({kind:d.target_kind,id:d.target_id});return target?{d,target}:null;}
function version(d:Record<string,unknown>){return int(d.expected_revision)&&fingerprint(d.expected_source_fingerprint);}
export function parseClipTrimCommand(v:unknown){
 const b=commandBase(v);if(!b)return null;const {d,target}=b;
 const allowed=['request_id','target_kind','target_id','expected_revision','expected_source_fingerprint','trim_start_ms','trim_end_ms','hold_start_ms','hold_end_ms','watched_video','review_note','reviewed_duration_ms'];
 if((d.reviewed_duration_ms!=null&&!int(d.reviewed_duration_ms,1,180000))||Object.keys(d).some(k=>!allowed.includes(k))||!version(d)||!int(d.trim_start_ms,0,180000)||!int(d.trim_end_ms,1,180000)||d.trim_end_ms-d.trim_start_ms<1000||d.watched_video!==true||!text(d.review_note)|| (d.review_note.trim().length>0&&d.review_note.trim().length<3))return null;
 if((d.hold_start_ms===null)!==(d.hold_end_ms===null))return null;
 if(d.hold_start_ms!==null&&(!int(d.hold_start_ms,0,180000)||!int(d.hold_end_ms,1,180000)||d.hold_end_ms-d.hold_start_ms<1000||d.hold_start_ms<d.trim_start_ms||d.hold_end_ms>d.trim_end_ms))return null;
 return {request_id:d.request_id as string,target_kind:target.kind,target_id:target.id,expected_revision:d.expected_revision as number,expected_source_fingerprint:d.expected_source_fingerprint as string,trim_start_ms:d.trim_start_ms,trim_end_ms:d.trim_end_ms,hold_start_ms:d.hold_start_ms as number|null,hold_end_ms:d.hold_end_ms as number|null,watched_video:true,review_note:d.review_note.trim(),reviewed_duration_ms:(d.reviewed_duration_ms as number|null|undefined)??null};
}
export const safetyClipReasons={spam:'Spam',harassment:'Harassment',explicit:'Explicit content',self_promotion:'Self promotion',hate:'Hateful content',violence:'Violence or dangerous content',scam:'Scam',other:'Other safety issue'} as const;
export function parseClipReportCommand(v:unknown){const b=commandBase(v);if(!b)return null;const {d,target}=b;const reasons=d.report_kind==='ranking'?rankedUploadReasons:d.report_kind==='safety'?safetyClipReasons:null;
 if(!reasons||typeof d.reason_code!=='string'||!Object.hasOwn(reasons,d.reason_code)||!text(d.details,800)||d.details.trim().length<3||Object.keys(d).some(k=>!['request_id','target_kind','target_id','report_kind','reason_code','details'].includes(k)))return null;
 return {request_id:d.request_id as string,target_kind:target.kind,target_id:target.id,report_kind:d.report_kind as 'ranking'|'safety',reason_code:d.reason_code,details:d.details.trim()};}
export function parseClipRejectCommand(v:unknown){const b=commandBase(v);if(!b)return null;const {d,target}=b;const rules=parseRuleIds(d.rule_ids);
 if(!version(d)||!rules||typeof d.reason_code!=='string'||!Object.hasOwn(rankedUploadReasons,d.reason_code)||d.watched_video!==true||!text(d.review_note)||d.review_note.trim().length<3||Object.keys(d).some(k=>!['request_id','target_kind','target_id','expected_revision','expected_source_fingerprint','reason_code','rule_ids','watched_video','review_note'].includes(k))||rules.length>0&&!['unacceptable_form','unacceptable_filming'].includes(d.reason_code))return null;
 return {request_id:d.request_id as string,target_kind:target.kind,target_id:target.id,expected_revision:d.expected_revision as number,expected_source_fingerprint:d.expected_source_fingerprint as string,reason_code:d.reason_code,rule_ids:rules,watched_video:true,review_note:d.review_note.trim()};}
export type AdminUserClipsPage={items:(AdminClipContext&{created_at:string})[];has_more:boolean;next_cursor:{created_at:string;id:string}|null};
export function parseAdminUserClipsPage(v:unknown):AdminUserClipsPage|null {
 const d=obj(v);if(!d||!Array.isArray(d.items)||d.items.length>20||typeof d.has_more!=='boolean')return null;
 const items:AdminUserClipsPage['items']=[];for(const raw of d.items){const c=parseAdminClipContext(raw);if(!c||!text(raw.created_at,80)||!Number.isFinite(Date.parse(raw.created_at)))return null;items.push({...c,created_at:raw.created_at});}
 const cursor=obj(d.next_cursor);if(d.next_cursor!==null&&(!cursor||!text(cursor.created_at,80)||!Number.isFinite(Date.parse(cursor.created_at))||!text(cursor.id,200)||!cursor.id))return null;
 if(d.has_more&&(!cursor||!items.length))return null;
 return {items,has_more:d.has_more,next_cursor:cursor?{created_at:cursor.created_at as string,id:cursor.id as string}:null};
}
