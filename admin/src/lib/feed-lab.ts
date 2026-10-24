export const feedFields = {
 freshness:{label:'Freshness weight',min:0,max:100},exercise:{label:'Exercise interest weight',min:0,max:100},engagement:{label:'Engagement weight',min:0,max:100},following:{label:'Following weight',min:0,max:100},country:{label:'Same country weight',min:0,max:100},athlete:{label:'Athlete level weight',min:0,max:100},
 fresh_days:{label:'Recent upload window (days)',min:1,max:30},new_slots:{label:'Recent unseen slots in first 10',min:0,max:10},explore_percent:{label:'Exploration percent',min:0,max:30},author_cap:{label:'Author limit per 10',min:1,max:10},exercise_cap:{label:'Exercise limit per 10',min:1,max:10},delivery_hours:{label:'Delivery cooldown (hours)',min:0,max:168},seen_days:{label:'Seen repeat cooldown (days)',min:0,max:90},seen_ms:{label:'Seen playback threshold (milliseconds)',min:1000,max:10000},short_fraction:{label:'Short clip watch fraction',min:.1,max:1},session_size:{label:'Posts per feed session',min:25,max:300},
} as const;
export type FeedParams=Record<keyof typeof feedFields,number>;
export const weightKeys=['freshness','exercise','engagement','following','country','athlete'] as const;
const object=(v:unknown):v is Record<string,unknown>=>v!==null&&typeof v==='object'&&!Array.isArray(v);
export const uuid=(v:unknown):v is string=>typeof v==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(v);
export function parseFeedParams(v:unknown):FeedParams|null {
 if(!object(v)||Object.keys(v).length!==Object.keys(feedFields).length)return null;
 for(const [key,rule]of Object.entries(feedFields)){const n=v[key];if(typeof n!=='number'||!Number.isFinite(n)||n<rule.min||n>rule.max||(key!=='short_fraction'&&!Number.isInteger(n)))return null;}
 if(weightKeys.reduce((sum,k)=>sum+(v[k] as number),0)!==100)return null;return v as FeedParams;
}
export type FeedVersion={id:string;name:string;parameters:FeedParams;published:boolean};
export type FeedContext={config:{active_id:string;enabled:boolean;rollout_percent:number;revision:number};versions:FeedVersion[];history:{changed_at:string;new_config:{active_id:string;enabled:boolean;rollout_percent:number;revision:number}}[];stats:{seen_pairs:number;watching_users:number}};
export function parseFeedContext(v:unknown):FeedContext {
 if(!object(v)||!object(v.config)||!uuid(v.config.active_id)||typeof v.config.enabled!=='boolean'||!Number.isInteger(v.config.revision)||!Number.isInteger(v.config.rollout_percent)||!Array.isArray(v.versions)||!Array.isArray(v.history)||!object(v.stats)||!Number.isInteger(v.stats.seen_pairs)||!Number.isInteger(v.stats.watching_users))throw Error('Invalid feed settings');
 for(const version of v.versions)if(!object(version)||!uuid(version.id)||typeof version.name!=='string'||!parseFeedParams(version.parameters)||typeof version.published!=='boolean')throw Error('Invalid feed version');
 return v as FeedContext;
}
export type FeedAction={action:'save';name:string;parameters:FeedParams}|{action:'preview';version:string;viewer:string|null;seed?:string}|{action:'activate';version:string;revision:number;enabled:boolean;rollout:number;confirmation:'ACTIVATE'};
export function parseFeedAction(v:unknown):FeedAction|null {
 if(!object(v))return null;const exact=(keys:string[])=>Object.keys(v).length===keys.length&&keys.every(k=>k in v);
 if(v.action==='save'&&exact(['action','name','parameters'])&&typeof v.name==='string'&&v.name.trim().length>=1&&v.name.trim().length<=100){const parameters=parseFeedParams(v.parameters);if(parameters)return {action:'save',name:v.name.trim(),parameters};}
 if(v.action==='preview'&&(exact(['action','version','viewer'])||exact(['action','version','viewer','seed'])&&uuid(v.seed))&&uuid(v.version)&&(v.viewer===null||uuid(v.viewer)))return v as FeedAction;
 if(v.action==='activate'&&exact(['action','version','revision','enabled','rollout','confirmation'])&&uuid(v.version)&&Number.isSafeInteger(v.revision)&&Number(v.revision)>=1&&typeof v.enabled==='boolean'&&Number.isInteger(v.rollout)&&Number(v.rollout)>=0&&Number(v.rollout)<=100&&v.confirmation==='ACTIVATE')return v as FeedAction;
 return null;
}
