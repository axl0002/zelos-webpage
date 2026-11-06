"use client";
import {useEffect,useState} from "react";
import ActivityChart from "./admin-activity-chart";
import {parseDailyActiveUsers,type DailyActiveUsers} from "@/lib/admin-dau";
const number=new Intl.NumberFormat("en-US");
const series=[{key:"active_users" as const,label:"Active users",color:"#6366f1"}];
export default function AdminDailyActiveUsers({days,timezone,refresh}:{days:number;timezone:string;refresh:number}){
  // Store the requested range alongside results so a prop change cannot flash
  // the previous timezone's counts before its effect starts.
  const key=`${days}:${timezone}:${refresh}`;
  const [result,setResult]=useState<{key:string;data:DailyActiveUsers|null;error:boolean}|null>(null);
  const [retry,setRetry]=useState(0);
  useEffect(()=>{
    const controller=new AbortController();setResult(null);
    void(async()=>{try{
      const response=await fetch(`/admin/api/analytics/dau?days=${days}&tz=${encodeURIComponent(timezone)}`,{cache:"no-store",signal:controller.signal});
      if(!response.ok)throw Error();
      const data=parseDailyActiveUsers(await response.json(),{days,timezone});
      if(!controller.signal.aborted)setResult({key,data,error:false});
    }catch{if(!controller.signal.aborted)setResult({key,data:null,error:true});}})();
    return ()=>controller.abort();
  },[days,timezone,refresh,retry,key]);
  const current=result?.key===key?result:null,data=current?.data;
  const today=data?.daily.at(-1),yesterday=data?.daily.at(-2);
  return <section aria-labelledby="dau-heading">
    <h2 id="dau-heading">Daily active users (DAU)</h2>
    <p className="muted small">Identified users who opened the app, viewed a screen or took an action. Each person counts once per calendar day.</p>
    {!current&&<p role="status" aria-label="Loading daily active users">Loading daily active users…</p>}
    {current?.error&&<div><p role="alert">Daily active users could not be loaded.</p><button type="button" className="button secondary" onClick={()=>{setResult(null);setRetry(n=>n+1);}}>Retry daily active users</button></div>}
    {data&&today&&<>
      <div className="analytics-charts">
        <section className="analytics-metric"><p>Active users today</p><strong>{number.format(today.active_users)}</strong><span className="analytics-metric-detail">{timezone} · today is still in progress</span><small>Yesterday <b>{yesterday?number.format(yesterday.active_users):"—"}</b></small></section>
        <ActivityChart key={`${key}:${retry}`} title="Daily active users" description={`Unique tracked people each day · ${timezone}`} rows={data.daily} series={series}/>
      </div>
      <details className="analytics-table-card"><summary>View daily active user counts</summary><div className="analytics-table-scroll" role="region" aria-label="Daily active user counts" tabIndex={0}><table><caption className="sr-only">Daily active users in {timezone}</caption><thead><tr><th scope="col">Date</th><th scope="col">Active users</th></tr></thead><tbody>{[...data.daily].reverse().map(row=><tr key={row.date}><th scope="row">{row.date}{row.date===data.end_date&&<small>Today · partial</small>}</th><td>{number.format(row.active_users)}</td></tr>)}</tbody></table></div></details>
      <p className="muted small">Production iOS and Android activity tracked since 22 Oct 2026. Excludes anonymous, debug and background-only activity. Opt-outs, offline use and missing events can lower counts; recent events may arrive late. Daily counts cannot be added to get unique users for the whole period.</p>
    </>}
  </section>;
}
