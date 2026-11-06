import {parseAnalyticsQuery, type AnalyticsQuery} from "./admin-analytics";

export const dauCoverageStart = "2026-10-22T00:00:00Z";
export type DailyActiveUsers = {
  schema_version:1; timezone:string; requested_days:number; start_date:string; end_date:string;
  generated_at:string; today_partial:true; coverage_start:string;
  daily:{date:string;active_users:number}[];
};
const fail = ():never => {throw Error("Daily active users unavailable");};
export function dauWindow(query:AnalyticsQuery, now:Date) {
  if(!parseAnalyticsQuery(new URLSearchParams({days:String(query.days),tz:query.timezone})) || !Number.isFinite(now.getTime())) return fail();
  const date=(instant:Date)=>{
    const parts=new Intl.DateTimeFormat("en-US",{timeZone:query.timezone,year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(instant);
    return ["year","month","day"].map(key=>parts.find(p=>p.type===key)!.value).join("-");
  };
  const end=date(now), launch=date(new Date(dauCoverageStart));
  const requested=new Date(Date.parse(end+"T00:00:00Z")-(query.days-1)*86400000).toISOString().slice(0,10);
  const start=requested>launch?requested:launch;
  if(start>end)return fail();
  const dates:string[]=[];
  for(let d=Date.parse(start+"T00:00:00Z");d<=Date.parse(end+"T00:00:00Z");d+=86400000)dates.push(new Date(d).toISOString().slice(0,10));
  return {start,end,dates};
}
/** Rebuild an aggregate-only contract; never relay provider query text or identities. */
export function parseDailyActiveUsers(value:unknown,expected:AnalyticsQuery):DailyActiveUsers {
  if(!value||typeof value!=="object"||Array.isArray(value))return fail();
  const v=value as Record<string,unknown>;
  if(v.schema_version!==1||v.timezone!==expected.timezone||v.requested_days!==expected.days||v.today_partial!==true||v.coverage_start!==dauCoverageStart||typeof v.generated_at!=="string"||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/.test(v.generated_at))return fail();
  const window=dauWindow(expected,new Date(v.generated_at));
  if(v.start_date!==window.start||v.end_date!==window.end||!Array.isArray(v.daily)||v.daily.length!==window.dates.length)return fail();
  const daily=v.daily.map((row:unknown,i:number)=>{
    if(!row||typeof row!=="object"||Array.isArray(row))return fail();
    const r=row as Record<string,unknown>;
    if(r.date!==window.dates[i]||!Number.isSafeInteger(r.active_users)||(r.active_users as number)<0)return fail();
    return {date:r.date as string,active_users:r.active_users as number};
  });
  return {schema_version:1,timezone:expected.timezone,requested_days:expected.days,start_date:window.start,end_date:window.end,generated_at:v.generated_at,today_partial:true,coverage_start:dauCoverageStart,daily};
}
