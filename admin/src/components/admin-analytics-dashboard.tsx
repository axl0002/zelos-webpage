"use client";
import {useEffect, useRef, useState} from "react";
import ActivityChart from "@/components/admin-activity-chart";
import AdminDailyActiveUsers from "@/components/admin-daily-active-users";
import AdminInstagramAdoption from "@/components/admin-instagram-adoption";
import {analyticsMetricKeys, parseDailyAnalytics, type AnalyticsCounts, type DailyAnalytics} from "@/lib/admin-analytics";
const number = new Intl.NumberFormat("en-US");
function dateLabel(value: string, long = false) {return new Intl.DateTimeFormat("en-US", {month: "short", day: "numeric", ...(long ? {year: "numeric"} : {}), timeZone: "UTC"}).format(new Date(value + "T12:00:00Z"));}
type Series = {key: keyof AnalyticsCounts; label: string; color: string};
const accountSeries: Series[] = [{key:"accounts_created",label:"New accounts",color:"#6366f1"}];
const uploadSeries: Series[] = [{key:"training_uploads",label:"Training",color:"#6366f1"},{key:"ranked_uploads",label:"Ranked",color:"#14b8a6"}];
const postSeries: Series[] = [{key:"training_posts",label:"Training",color:"#6366f1"},{key:"ranked_posts",label:"Ranked",color:"#14b8a6"}];
const engagementSeries: Series[] = [{key:"likes",label:"Likes",color:"#6366f1"},{key:"comments",label:"Comments",color:"#f59e0b"}];
function MetricCard({label,value,detail,today,yesterday}: {label:string;value:number;detail:string;today:number;yesterday?:number}) {
  return <section className="analytics-metric"><p>{label}</p><strong>{number.format(value)}</strong><span className="analytics-metric-detail">{detail}</span><small>Today <b>{number.format(today)}</b><span aria-hidden="true"> · </span>Yesterday <b>{yesterday===undefined?"—":number.format(yesterday)}</b></small></section>;
}
export default function AdminAnalyticsDashboard() {
  const [days,setDays]=useState(7),[timezone,setTimezone]=useState("UTC"),[localZone,setLocalZone]=useState("UTC"),[refresh,setRefresh]=useState(0);
  const [data,setData]=useState<DailyAnalytics|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState("");
  const sequence=useRef(0);
  useEffect(()=>{try {setLocalZone(Intl.DateTimeFormat().resolvedOptions().timeZone||"UTC");}catch{/* UTC remains usable. */}},[]);
  useEffect(()=>{
    const controller=new AbortController(), request=++sequence.current;setLoading(true);setError("");setData(null);
    void (async()=>{try {
      const response=await fetch(`/admin/api/analytics?days=${days}&tz=${encodeURIComponent(timezone)}`,{cache:"no-store",signal:controller.signal});
      if(!response.ok)throw new Error("Analytics could not be loaded. Please try again.");
      const result=parseDailyAnalytics(await response.json(),{days,timezone});
      if(!controller.signal.aborted&&sequence.current===request)setData(result);
    }catch{if(!controller.signal.aborted&&sequence.current===request)setError("Analytics could not be loaded. Please try again.");}
    finally{if(!controller.signal.aborted&&sequence.current===request)setLoading(false);}})();
    return ()=>controller.abort();
  },[days,timezone,refresh]);
  const today=data?.daily.at(-1),yesterday=data?.daily.at(-2);
  function chooseDays(value:number) {if(value===days)return;setData(null);setError("");setLoading(true);setDays(value);}
  function chooseTimezone(value:string) {setData(null);setError("");setLoading(true);setTimezone(value);}
  function reload() {setData(null);setError("");setLoading(true);setRefresh(n=>n+1);}
  const sum=(row:AnalyticsCounts|undefined,...keys:(keyof AnalyticsCounts)[])=>keys.reduce((n,key)=>n+(row?.[key]??0),0);
  return <div className="dashboard-content analytics-dashboard">
    <header className="page-header analytics-header"><div><p className="eyebrow">DAILY ACTIVITY</p><h1>Analytics</h1><p className="muted">Account growth, uploads and community activity.</p><span className="analytics-period-badge">Since Zelos v2 · 22 Oct 2026 UTC</span></div>
      <div className="analytics-controls"><div className="analytics-range" role="group" aria-label="Date range">{[7,30,90].map(value=><button key={value} type="button" aria-pressed={days===value} onClick={()=>chooseDays(value)}>{value} days</button>)}</div>
        <div className="analytics-secondary-controls"><label>Time zone<select value={timezone} onChange={e=>chooseTimezone(e.target.value)}><option value="UTC">UTC</option>{localZone!=="UTC"&&<option value={localZone}>{localZone} (local)</option>}</select></label><button type="button" className="button secondary" disabled={loading} onClick={reload}>Refresh</button></div>
      </div></header>
    <AdminDailyActiveUsers days={days} timezone={timezone} refresh={refresh}/>
    <AdminInstagramAdoption refresh={refresh}/>
    {loading&&<section className="analytics-loading" role="status" aria-label="Loading analytics"><div className="analytics-skeleton-grid">{Array.from({length:6},(_,i)=><div className="analytics-skeleton" key={i}/>)}</div><p>Loading analytics…</p></section>}
    {error&&<section className="analytics-error"><p role="alert">{error}</p><button className="button primary" onClick={reload}>Try again</button></section>}
    {data&&<>
      <div className="analytics-status"><p>{dateLabel(data.start_date,true)} – {dateLabel(data.end_date,true)} · {data.days} calendar days in {data.timezone}. {data.today_partial&&"Today is still in progress."}</p><span>Updated <time dateTime={data.generated_at}>{new Intl.DateTimeFormat("en-US",{hour:"numeric",minute:"2-digit",timeZone:data.timezone}).format(new Date(data.generated_at))}</time></span></div>
      <div className="analytics-metrics">
        <MetricCard label="New accounts" value={data.totals.accounts_created} detail="Original account creation date" today={sum(today,"accounts_created")} yesterday={yesterday?sum(yesterday,"accounts_created"):undefined}/>
        <MetricCard label="Uploads received" value={sum(data.totals,"training_uploads","ranked_uploads")} detail={`${number.format(data.totals.training_uploads)} training · ${number.format(data.totals.ranked_uploads)} ranked`} today={sum(today,"training_uploads","ranked_uploads")} yesterday={yesterday?sum(yesterday,"training_uploads","ranked_uploads"):undefined}/>
        <MetricCard label="Published posts" value={sum(data.totals,"training_posts","ranked_posts")} detail={`${number.format(data.totals.training_posts)} training · ${number.format(data.totals.ranked_posts)} ranked`} today={sum(today,"training_posts","ranked_posts")} yesterday={yesterday?sum(yesterday,"training_posts","ranked_posts"):undefined}/>
        <MetricCard label="Likes" value={data.totals.likes} detail="Dated likes still retained" today={sum(today,"likes")} yesterday={yesterday?sum(yesterday,"likes"):undefined}/>
        <MetricCard label="Comments" value={data.totals.comments} detail="Dated comments still retained" today={sum(today,"comments")} yesterday={yesterday?sum(yesterday,"comments"):undefined}/>
        <MetricCard label="Processing failed" value={data.totals.failed_uploads} detail="Current failures by receipt date" today={sum(today,"failed_uploads")} yesterday={yesterday?sum(yesterday,"failed_uploads"):undefined}/>
      </div>
      {analyticsMetricKeys.every(key=>data.totals[key]===0)&&<p className="analytics-empty" role="status">No recorded activity in this date window.</p>}
      <div className="analytics-charts"><ActivityChart key={`accounts-${days}-${timezone}`} title="New accounts" description="Accounts created each day since Zelos v2 launched." rows={data.daily} series={accountSeries}/><ActivityChart key={`uploads-${days}-${timezone}`} title="Uploads received" description="Finalized video uploads, including those awaiting review." rows={data.daily} series={uploadSeries} stacked/><ActivityChart key={`engagement-${days}-${timezone}`} title="Likes & comments" description="Retained interactions grouped by the day they were created." rows={data.daily} series={engagementSeries}/><ActivityChart key={`posts-${days}-${timezone}`} title="Published posts" description="Visible posts grouped by their original creation day." rows={data.daily} series={postSeries} stacked/></div>
      <AnalyticsCoverage data={data}/>
      <section className="analytics-table-card"><header><h2>Daily breakdown</h2><p className="muted small">Newest first · {data.timezone} · today is a partial day</p></header><div className="analytics-table-scroll" role="region" aria-label="Daily analytics table" tabIndex={0}><table><caption className="sr-only">Daily activity counts from {data.start_date} to {data.end_date} in {data.timezone}</caption><thead><tr>{["Date","New accounts","Training uploads","Ranked uploads","Training posts","Ranked posts","Likes","Comments","Processing failed"].map(label=><th scope="col" key={label}>{label}</th>)}</tr></thead><tbody>{[...data.daily].reverse().map(row=><tr key={row.date}><th scope="row">{dateLabel(row.date,true)}{row.date===data.end_date&&data.today_partial&&<small>Today · partial</small>}</th>{analyticsMetricKeys.map(key=><td key={key}>{number.format(row[key])}</td>)}</tr>)}</tbody><tfoot><tr><th scope="row">Period total</th>{analyticsMetricKeys.map(key=><td key={key}>{number.format(data.totals[key])}</td>)}</tr></tfoot></table></div></section>
    </>}
  </div>;
}
function AnalyticsCoverage({data}: {data:DailyAnalytics}) {
  const c=data.coverage;
  return <section className="analytics-coverage" aria-label="Metric definitions"><h2>About these numbers</h2>
    <p>Uploads received are finalized videos, including pending reviews. Published posts are visible posts grouped by their original creation day; later approvals or removals can change past days.</p>
    <p>Likes count retained post likes; unlikes reduce past counts. Comments include replies and retained removed or moderated comments. These are retained-record counts, not an immutable event history.</p>
    <p className="muted small">Data starts 22 Oct 2026 at 00:00 UTC. Earlier activity is excluded. The first day can be partial in your selected time zone. {c.upload_history_start ? <>Received-upload history starts {dateLabel(new Date(c.upload_history_start).toISOString().slice(0,10),true)} (UTC).</> : "No received uploads have been recorded since v2 launched."}</p>
  </section>;
}
