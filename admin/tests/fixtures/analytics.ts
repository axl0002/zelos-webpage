import {analyticsMetricKeys, type DailyAnalytics} from "../../src/lib/admin-analytics";
export function analyticsFixture(requestedDays=7,timezone="UTC"):DailyAnalytics {
  const end=Date.parse("2026-10-27T00:00:00Z"),cutoff=Date.parse("2026-10-22T00:00:00Z");
  const cutoffParts=new Intl.DateTimeFormat("en-US",{timeZone:timezone,year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(new Date(cutoff));
  const part=(key:string)=>cutoffParts.find(p=>p.type===key)?.value;
  const launch=Date.parse(`${part("year")}-${part("month")}-${part("day")}T00:00:00Z`),start=Math.max(launch,end-(requestedDays-1)*86400000),days=(end-start)/86400000+1;
  const daily=Array.from({length:days},(_,index)=>({date:new Date(start+index*86400000).toISOString().slice(0,10),accounts_created:index%3,training_uploads:2,ranked_uploads:1,training_posts:1,ranked_posts:1,likes:index%5,comments:1,failed_uploads:index%2}));
  return {schema_version:1,timezone,requested_days:requestedDays,days,start_date:daily[0].date,end_date:daily.at(-1)!.date,generated_at:"2026-10-27T12:00:00.000Z",today_partial:true,daily,totals:Object.fromEntries(analyticsMetricKeys.map(key=>[key,daily.reduce((n,row)=>n+row[key],0)])) as DailyAnalytics["totals"],coverage:{data_start:"2026-10-22T00:00:00Z",upload_history_start:"2026-10-22T12:00:00Z",posts_use_creation_date:true,retained_records:true}};
}
