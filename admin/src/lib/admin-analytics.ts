export const analyticsMetricKeys = ["accounts_created", "training_uploads", "ranked_uploads", "training_posts", "ranked_posts", "likes", "comments", "failed_uploads"] as const;
export type AnalyticsCounts = Record<typeof analyticsMetricKeys[number], number>;
export type AnalyticsDay = AnalyticsCounts & {date:string};
export type DailyAnalytics = {
  schema_version:1; timezone:string; requested_days:number; days:number; start_date:string; end_date:string; generated_at:string; today_partial:true;
  totals:AnalyticsCounts; daily:AnalyticsDay[];
  coverage:{data_start:string;upload_history_start:string|null;posts_use_creation_date:true;retained_records:true};
};
export type AnalyticsQuery = {days:number;timezone:string};
const unavailable = () => new Error("Analytics response unavailable");
function object(value:unknown):Record<string,unknown> {if(!value||typeof value!=="object"||Array.isArray(value))throw unavailable();return value as Record<string,unknown>;}
function count(value:unknown):number {if(!Number.isSafeInteger(value)||(value as number)<0)throw unavailable();return value as number;}
function validTimezone(value:unknown):value is string {
  if(typeof value!=="string"||value.length>100||!value.length||!/^[-A-Za-z0-9_+/]+$/.test(value))return false;
  try {new Intl.DateTimeFormat("en-US",{timeZone:value}).format();return true;}catch{return false;}
}
export function parseAnalyticsQuery(params:URLSearchParams):AnalyticsQuery|null {
  if([...params.keys()].some(key=>!["days","tz"].includes(key)||params.getAll(key).length!==1))return null;
  const raw=params.get("days")??"7",timezone=params.get("tz")??"UTC";
  if(!["7","30","90"].includes(raw)||!validTimezone(timezone))return null;
  return {days:Number(raw),timezone};
}
function calendarDate(value:unknown):string {
  if(typeof value!=="string"||!/^\d{4}-\d{2}-\d{2}$/.test(value))throw unavailable();
  const date=new Date(value+"T00:00:00Z");if(!Number.isFinite(date.getTime())||date.toISOString().slice(0,10)!==value)throw unavailable();return value;
}
function timestamp(value:unknown):string {
  if(typeof value!=="string"||value.length>64||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value)||!Number.isFinite(Date.parse(value)))throw unavailable();return value;
}
function counts(value:unknown):AnalyticsCounts {
  const source=object(value), result={} as AnalyticsCounts;
  for(const key of analyticsMetricKeys)result[key]=count(source[key]);
  if(!Number.isSafeInteger(analyticsMetricKeys.reduce((n,key)=>n+result[key],0)))throw unavailable();
  if(result.failed_uploads>result.training_uploads+result.ranked_uploads)throw unavailable();
  return result;
}
/** Strip all non-contract fields before any aggregate reaches the browser. */
export function parseDailyAnalytics(value:unknown,expected?:AnalyticsQuery):DailyAnalytics {
  const source=object(value);
  if(source.schema_version!==1||source.today_partial!==true||!Number.isInteger(source.days)||(source.days as number)<1||!Number.isInteger(source.requested_days)||!([7,30,90].includes(source.requested_days as number))||(source.days as number)>(source.requested_days as number)||!validTimezone(source.timezone))throw unavailable();
  const days=source.days as number,requestedDays=source.requested_days as number,timezone=source.timezone;
  if(expected&&(expected.days!==requestedDays||expected.timezone!==timezone))throw unavailable();
  const coverage=object(source.coverage), dataStart=timestamp(coverage.data_start);
  if(Date.parse(dataStart)!==Date.parse("2026-10-22T00:00:00Z"))throw unavailable();
  const start=calendarDate(source.start_date),end=calendarDate(source.end_date),generated=timestamp(source.generated_at);
  const startMs=Date.parse(start+"T00:00:00Z");if(Date.parse(end+"T00:00:00Z")-startMs!==(days-1)*86400000)throw unavailable();
  const parts=new Intl.DateTimeFormat("en-US",{timeZone:timezone,year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(new Date(generated));
  const part=(name:string)=>parts.find(p=>p.type===name)?.value;
  if(end!==`${part("year")}-${part("month")}-${part("day")}`)throw unavailable();
  const launchParts=new Intl.DateTimeFormat("en-US",{timeZone:timezone,year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(new Date(dataStart));
  const launchPart=(name:string)=>launchParts.find(p=>p.type===name)?.value;
  const launchDate=`${launchPart("year")}-${launchPart("month")}-${launchPart("day")}`;
  const requestedStart=new Date(Date.parse(end+"T00:00:00Z")-(requestedDays-1)*86400000).toISOString().slice(0,10);
  if(start!==(requestedStart>launchDate?requestedStart:launchDate))throw unavailable();
  if(!Array.isArray(source.daily)||source.daily.length!==days)throw unavailable();
  const daily=source.daily.map((value,index)=>{const row=object(value),date=calendarDate(row.date);if(date!==new Date(startMs+index*86400000).toISOString().slice(0,10))throw unavailable();return {date,...counts(row)};});
  const totals=counts(source.totals);
  for(const key of analyticsMetricKeys)if(totals[key]!==daily.reduce((sum,row)=>sum+row[key],0))throw unavailable();
  if(coverage.posts_use_creation_date!==true||coverage.retained_records!==true)throw unavailable();
  const uploadStart=coverage.upload_history_start===null?null:timestamp(coverage.upload_history_start);
  return {schema_version:1,timezone,requested_days:requestedDays,days,start_date:start,end_date:end,generated_at:generated,today_partial:true,totals,daily,
    coverage:{data_start:dataStart,upload_history_start:uploadStart,posts_use_creation_date:true,retained_records:true}};
}
