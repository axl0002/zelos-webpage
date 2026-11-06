import {dauCoverageStart,dauWindow,parseDailyActiveUsers,type DailyActiveUsers} from "./admin-dau";
import type {AnalyticsQuery} from "./admin-analytics";

// Verified against the existing Zelos mobile ingestion project. Never accept a
// project, host, event name or arbitrary SQL from an admin browser request.
export const dauProjectId = "99683";
export function dailyActiveUsersQuery(query:AnalyticsQuery,now:Date) {
  const window=dauWindow(query,now);
  // dauWindow validates the timezone with the shared restricted IANA parser.
  return `SELECT toDate(toTimeZone(timestamp, '${query.timezone}')) AS day,
    count(DISTINCT person_id) AS active_users
  FROM events
  WHERE timestamp >= greatest(toDateTime('${window.start} 00:00:00', '${query.timezone}'), toDateTime('2026-10-22 00:00:00', 'UTC'))
    AND timestamp <= toDateTime('${now.toISOString().slice(0,19).replace('T',' ')}', 'UTC')
    AND properties.environment = 'production'
    AND properties.backend = 'supabase'
    AND properties.$app_namespace = 'club.zelos.app'
    AND properties.$is_identified = true
    AND (event IN ('$screen', 'Application Opened')
      OR (event = 'app_action' AND properties.action != 'bootstrapSession'))
  GROUP BY day ORDER BY day LIMIT 91`;
}
export function dauFromQueryResponse(value:unknown,query:AnalyticsQuery,now:Date):DailyActiveUsers {
  const fail=():never=>{throw Error("Daily active users unavailable");};
  if(!value||typeof value!=="object"||Array.isArray(value))return fail();
  const v=value as Record<string,unknown>,window=dauWindow(query,now);
  if(v.error||v.hasMore===true||v.has_more===true||!Array.isArray(v.columns)||v.columns.length!==2||v.columns[0]!=="day"||v.columns[1]!=="active_users"||!Array.isArray(v.results)||v.results.length>window.dates.length)return fail();
  const counts=new Map<string,number>();
  for(const row of v.results){
    if(!Array.isArray(row)||row.length!==2||typeof row[0]!=="string"||!window.dates.includes(row[0])||counts.has(row[0])||!Number.isSafeInteger(row[1])||row[1]<1)return fail();
    counts.set(row[0],row[1]);
  }
  return parseDailyActiveUsers({schema_version:1,timezone:query.timezone,requested_days:query.days,start_date:window.start,end_date:window.end,generated_at:now.toISOString(),today_partial:true,coverage_start:dauCoverageStart,daily:window.dates.map(date=>({date,active_users:counts.get(date)??0}))},query);
}
export async function getDailyActiveUsers(query:AnalyticsQuery) {
  const key=process.env.POSTHOG_PERSONAL_API_KEY;
  if(!key||!/^phx_[A-Za-z0-9_-]+$/.test(key)|| (process.env.POSTHOG_PROJECT_ID && process.env.POSTHOG_PROJECT_ID!==dauProjectId))throw Error("Daily active users unavailable");
  const now=new Date(Math.floor(Date.now()/1000)*1000);
  const response=await fetch(`https://eu.posthog.com/api/projects/${dauProjectId}/query/`,{
    method:"POST",cache:"no-store",redirect:"error",signal:AbortSignal.timeout(12000),
    headers:{Authorization:`Bearer ${key}`,"Content-Type":"application/json"},
    body:JSON.stringify({name:"zelos_admin_daily_active_users_v1",refresh:"force_blocking",query:{kind:"HogQLQuery",query:dailyActiveUsersQuery(query,now)}}),
  });
  if(!response.ok)throw Error("Daily active users unavailable");
  return dauFromQueryResponse(await response.json(),query,now);
}
