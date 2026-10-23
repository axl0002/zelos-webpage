"use client";
import {useEffect,useMemo,useRef,useState} from "react";
import {labFormula,parseLabDetail,parseLabResults,type LabAlgorithm,type LabDataset,type LabDetail,type LabResults,type LabRow,type LabRun} from "@/lib/scoring-lab";
import {LabError,labRequest} from "@/lib/scoring-lab-request";

type Discipline="push"|"pull";
type Gender="male"|"female";
type Read=(path:string,signal:AbortSignal)=>Promise<unknown>;
type ResultEntry={result?:LabResults;error?:string};
const pageSize=50,n=(v:number)=>v.toLocaleString(undefined,{maximumFractionDigits:3}),delta=(v:number)=>(v>0?"+":"")+n(v);
const title=(d:Discipline)=>d==="push"?"Push":"Pull";
const message=(error:unknown,fallback:string)=>error instanceof LabError?error.message:fallback;

// One queue for both disciplines and athlete comparisons: no more than four
// authenticated reads run at once, including when a filter replaces old work.
function createReader():Read {
 let active=0;
 const waiting:(()=>void)[]=[];
 function next(){while(active<4&&waiting.length)waiting.shift()!();}
 return (path,signal)=>new Promise((resolve,reject)=>{
  const aborted=()=>reject(new Error("Request aborted"));
  if(signal.aborted){aborted();return;}
  signal.addEventListener("abort",aborted,{once:true});
  waiting.push(()=>{
   signal.removeEventListener("abort",aborted);
   if(signal.aborted){aborted();return;}
   active++;
   void labRequest(path,signal).then(resolve,reject).finally(()=>{active--;next();});
  });
  next();
 });
}

export default function ScoringLabComparison({run,algorithms,dataset}:{run:LabRun;algorithms:LabAlgorithm[];dataset?:LabDataset}){
 const [gender,setGender]=useState<Gender>("male"),[country,setCountry]=useState(""),[pages,setPages]=useState({push:0,pull:0});
 const [focus,setFocus]=useState<{row:LabRow;algorithm:string}|null>(null);
 const focusOrigin=useRef<HTMLButtonElement|null>(null);
 const read=useMemo(createReader,[]),appliedCountry=country.length===2?country:"";
 const versions=run.algorithm_ids.map(id=>algorithms.find(a=>a.id===id)??{id,name:"Unavailable algorithm version",config:null,is_baseline:false});
 function filter(change:()=>void){setPages({push:0,pull:0});setFocus(null);change();}
 return <div className="lab-comparison">
  <div className="lab-grid">
   <div className="lab-gender-field"><span>Gender cohort</span><div className="lab-gender-toggle" role="group" aria-label="Gender cohort">{(["male","female"] as const).map(value=><button key={value} type="button" className={`button ${gender===value?"primary":"secondary"}`} aria-pressed={gender===value} onClick={()=>{if(gender!==value)filter(()=>setGender(value));}}>{value==="male"?"Male":"Female"}</button>)}</div></div>
   <label>Country filter (two-letter code)<input value={country} maxLength={2} onChange={e=>filter(()=>setCountry(e.target.value.toLowerCase().replace(/[^a-z]/g,"")))} placeholder="All countries"/></label>
  </div>
  <p className="small muted">Push and Pull Elo leaderboards for every algorithm in this frozen run are shown together. Scroll across the algorithm columns; select an athlete to compare their exact positions across every version, even outside the displayed page.</p>
  <p className="small muted">Filters preserve world ranks and scoring populations. Each discipline and gender is a separate ranking cohort. Ranks use unrounded scores and competition ties (1, 1, 3); positive movement means up. Hidden identities are withheld while frozen original ranks remain.</p>
  {focus&&<AthleteComparison key={`${run.id}:${focus.row.athlete_id}:${focus.row.discipline}:${gender}:${appliedCountry}`} run={run} row={focus.row} versions={versions} read={read} initialAlgorithm={focus.algorithm} onClose={()=>{setFocus(null);focusOrigin.current?.focus();}}/>}
  {(["push","pull"] as const).map(d=><DisciplineLeaderboards key={d} discipline={d} run={run} versions={versions} gender={gender} country={appliedCountry} offset={pages[d]} read={read} selectedAthlete={focus?.row.athlete_id} onPage={offset=>{setPages(p=>({...p,[d]:offset}));setFocus(null);}} onAthlete={(row,algorithm,trigger)=>{focusOrigin.current=trigger;setFocus({row,algorithm});}}/>)}
  <details><summary>Frozen run metadata and benchmark coverage</summary><pre className="lab-formula">{JSON.stringify(run.metadata,null,2)}</pre></details>
  <details><summary>Exact algorithm configurations in this comparison</summary>{versions.map(a=><section key={a.id}><h3>{a.name}</h3><pre className="lab-formula">{a.is_baseline?"Exact frozen production record points and captured production aggregation and discount":a.config?labFormula(a.config):"Version unavailable"}{"\n"}{JSON.stringify(a.is_baseline?{...a.config,captured_production_config:dataset?.metadata.config??"See source snapshot metadata"}:a.config,null,2)}</pre></section>)}</details>
 </div>;
}

type Version={id:string;name:string;config:LabAlgorithm["config"]|null;is_baseline:boolean};
function DisciplineLeaderboards({discipline,run,versions,gender,country,offset,read,selectedAthlete,onPage,onAthlete}:{discipline:Discipline;run:LabRun;versions:Version[];gender:Gender;country:string;offset:number;read:Read;selectedAthlete?:string;onPage:(offset:number)=>void;onAthlete:(row:LabRow,algorithm:string,trigger:HTMLButtonElement)=>void}){
 const [refresh,setRefresh]=useState(0),[state,setState]=useState<{key:string;entries:Record<string,ResultEntry>}>({key:"",entries:{}});
 const ids=run.algorithm_ids.join(","),key=`${run.id}:${run.dataset_id}:${ids}:${discipline}:${gender}:${country}:${offset}:${refresh}`;
 useEffect(()=>{
  const controller=new AbortController();let current=true;
  setState({key,entries:{}});
  const timer=setTimeout(()=>{
   current=false;controller.abort();
   setState(s=>s.key!==key?s:{key,entries:Object.fromEntries(run.algorithm_ids.map(id=>[id,s.entries[id]??{error:"This leaderboard took too long. Retry this discipline."}]))});
  },45000);
  void Promise.all(run.algorithm_ids.map(async id=>{
   let entry:ResultEntry;
   try{
    const result=parseLabResults(await read("?"+new URLSearchParams({view:"results",run:run.id,algorithm:id,discipline,gender,country,offset:String(offset)}),controller.signal));
    if(result.run_id!==run.id||result.dataset_id!==run.dataset_id||result.algorithm_id!==id||result.rows.some(r=>r.discipline!==discipline||r.gender!==gender))throw Error("Mismatched comparison response");
    entry={result};
   }catch(error){entry={error:message(error,"Could not load this leaderboard. Retry this discipline.")};}
   if(current&&!controller.signal.aborted)setState(s=>s.key===key?{key,entries:{...s.entries,[id]:entry}}:s);
  })).finally(()=>clearTimeout(timer));
  return()=>{current=false;clearTimeout(timer);controller.abort();};
 },[key,read,run]);
 const entries=state.key===key?state.entries:{},loading=run.algorithm_ids.some(id=>!entries[id]),failed=run.algorithm_ids.some(id=>!!entries[id]?.error);
 const maximum=Math.max(0,...run.algorithm_ids.map(id=>entries[id]?.result?.total??0));
 return <section className="lab-discipline" aria-label={`${title(discipline)} Elo leaderboards`}>
  <div className="lab-comparison-heading"><div><h3>{title(discipline)} Elo leaderboards</h3><p className="small muted">{gender==="male"?"Male":"Female"} · all {versions.length} algorithms · same snapshot and filters</p></div><button className="button secondary" disabled={loading} onClick={()=>setRefresh(v=>v+1)}>{failed?`Retry ${title(discipline)} leaderboards`:`Refresh ${title(discipline)} leaderboards`}</button></div>
  {loading&&<p role="status">Loading {title(discipline)} leaderboards…</p>}
  <div className="lab-leaderboard-scroll" tabIndex={0} role="region" aria-label={`${title(discipline)} algorithm columns`}>
   <div className="lab-leaderboard-columns">{versions.map(algorithm=>{
    const entry=entries[algorithm.id],result=entry?.result;
    return <article className="lab-leaderboard-card" key={algorithm.id} aria-label={`${algorithm.name} ${title(discipline)} Elo leaderboard`}>
     <header><h4>{algorithm.name}</h4>{algorithm.is_baseline&&<p className="small muted">Frozen production baseline</p>}</header>
     {!entry?<p role="status">Loading leaderboard…</p>:entry.error?<p role="alert" className="error">{entry.error}</p>:result&&<>
      <p className="small muted">{n(result.total)} visible · {n(result.summary.redacted_count)} withheld</p>
      <p className="small muted">Top-10 retention: {result.summary.top10_overlap===null?"—":`${n(result.summary.top10_overlap*100)}%`} · mean movement: {n(result.summary.mean_absolute_rank_movement)}</p>
      {!result.rows.length?<p className="muted">No visible {title(discipline)} athletes on this page.</p>:<div className="lab-leaderboard-rows"><table aria-label={`${algorithm.name} ${title(discipline)} Elo leaderboard`}><thead><tr><th scope="col">Rank</th><th scope="col">Athlete</th><th scope="col">Elo</th><th scope="col">Δ rank</th></tr></thead><tbody>{result.rows.map(row=><tr key={row.athlete_id} className={selectedAthlete===row.athlete_id?"lab-selected-athlete":undefined}><td>#{row.rank}</td><td><button className="lab-athlete-button" onClick={e=>onAthlete(row,algorithm.id,e.currentTarget)} aria-label={`Compare ${row.username} ${discipline} across algorithms`} aria-pressed={selectedAthlete===row.athlete_id}>@{row.username}</button><small>{row.gender} · {row.country?.toUpperCase()??"—"}</small></td><td className="lab-number">{n(row.score)}</td><td className={row.rank_delta>0?"lab-positive":""}>{delta(row.rank_delta)}</td></tr>)}</tbody></table></div>}
     </>}
    </article>;
   })}</div>
  </div>
  <div className="lab-actions"><button className="button secondary" disabled={offset===0||loading} onClick={()=>onPage(Math.max(0,offset-pageSize))}>{`Previous ${title(discipline)} page`}</button><span className="small">{maximum?`Visible rows ${offset+1}–${Math.min(offset+pageSize,maximum)} of up to ${n(maximum)} per algorithm`:"No visible rows loaded"}</span><button className="button secondary" disabled={loading||offset+pageSize>=maximum||offset+pageSize>10000} onClick={()=>onPage(offset+pageSize)}>{`Next ${title(discipline)} page`}</button></div>
  {failed&&<p className="small muted">Some versions could not load. Their positions are unavailable, not zero; other leaderboards remain visible.</p>}
 </section>;
}

function AthleteComparison({run,row,versions,read,initialAlgorithm,onClose}:{run:LabRun;row:LabRow;versions:Version[];read:Read;initialAlgorithm:string;onClose:()=>void}){
 const [refresh,setRefresh]=useState(0),[state,setState]=useState<{generation:number;details:Record<string,{value?:LabDetail;error?:string}>}>({generation:-1,details:{}}),[selected,setSelected]=useState<string|null>(initialAlgorithm);
 const generation=useRef(0),ids=run.algorithm_ids.join(",");
 const panel=useRef<HTMLElement|null>(null);
 useEffect(()=>{panel.current?.focus({preventScroll:true});panel.current?.scrollIntoView?.({block:"nearest",behavior:"smooth"});},[row.athlete_id,row.discipline,initialAlgorithm]);
 useEffect(()=>setSelected(initialAlgorithm),[initialAlgorithm]);
 useEffect(()=>{
  const g=++generation.current,controller=new AbortController();setState({generation:g,details:{}});
  const timer=setTimeout(()=>{controller.abort();setState(s=>s.generation!==g?s:{generation:g,details:Object.fromEntries(run.algorithm_ids.map(id=>[id,s.details[id]??{error:"This athlete comparison timed out. Retry the athlete."}]))});},45000);
  void Promise.all(run.algorithm_ids.map(async id=>{
   let entry:{value?:LabDetail;error?:string};
   try{const value=parseLabDetail(await read("?"+new URLSearchParams({view:"detail",run:run.id,algorithm:id,athlete:row.athlete_id,discipline:row.discipline}),controller.signal));if(value.athlete_id!==row.athlete_id||value.discipline!==row.discipline)throw Error("Mismatched athlete response");entry={value};}
   catch(error){entry={error:message(error,"This athlete result is unavailable. It may no longer be visible, or the read failed.")};}
   if(!controller.signal.aborted&&g===generation.current)setState(s=>s.generation===g?{generation:g,details:{...s.details,[id]:entry}}:s);
  })).finally(()=>clearTimeout(timer));
  return()=>{generation.current++;clearTimeout(timer);controller.abort();};
 },[run,row.athlete_id,row.discipline,ids,refresh,read]);
 const details=state.details,loading=run.algorithm_ids.some(id=>!details[id]),detail=selected?details[selected]?.value:null;
 return <section ref={panel} tabIndex={-1} className="lab-panel lab-athlete-comparison" aria-label="Athlete position comparison">
  <div className="lab-comparison-heading"><div><h3>@{row.username} · {title(row.discipline as Discipline)} positions</h3><p className="small muted">Exact frozen ranks across all algorithms, including positions outside the visible leaderboard pages. Cohort: {row.gender}.</p></div><button className="button secondary" onClick={onClose}>Close athlete comparison</button></div>
  {loading&&<p role="status">Loading athlete positions across algorithms…</p>}
  <div className="lab-scroll"><table aria-label="Athlete ranks across algorithms"><thead><tr><th>Algorithm</th><th>Rank</th><th>Elo</th><th>Baseline rank</th><th>Movement</th><th>Details</th></tr></thead><tbody>{versions.map(a=>{
   const entry=details[a.id],value=entry?.value;
   return <tr key={a.id}><th scope="row">{a.name}</th>{value?<><td>#{value.rank}</td><td>{n(value.score)}</td><td>#{value.baseline_rank}</td><td>{delta(value.baseline_rank-value.rank)}</td><td><button className="button secondary" onClick={()=>setSelected(a.id)} aria-pressed={selected===a.id}>Exercise breakdown · {a.name}</button></td></>:<td colSpan={5}>{entry?<span title={entry.error}>Unavailable</span>:"Loading…"}</td>}</tr>;
  })}</tbody></table></div>
  {!loading&&run.algorithm_ids.some(id=>!!details[id]?.error)&&<p className="small muted">Unavailable results are not treated as zero or as evidence of a missing submission. <button className="button secondary" onClick={()=>setRefresh(v=>v+1)}>Retry athlete positions</button></p>}
  {detail&&<section aria-label="Athlete scoring breakdown"><h4>{versions.find(a=>a.id===selected)?.name} · @{detail.username} · {detail.discipline}</h4><p>Baseline {n(detail.baseline_score)} (#{detail.baseline_rank}) → experimental {n(detail.score)} (#{detail.rank})</p><div className="lab-scroll"><table><thead><tr><th>Exercise / progression</th><th>Value</th><th>Weight</th><th>Board rank / athletes</th><th>Benchmark</th><th>Source</th><th>Magnitude</th><th>Baseline points</th><th>New points</th><th>Exercise score order</th><th>Contribution</th><th>Baseline contribution</th></tr></thead><tbody>{detail.records.map(r=><tr key={r.board_id}><td>{r.board_name} · {r.exercise_id}</td><td>{n(r.value)} {r.metric}</td><td>{n(r.weight)}</td><td>{r.position} / {r.participants}</td><td>{r.benchmark===null?"—":n(r.benchmark)}</td><td>{r.benchmark_source}</td><td>{r.magnitude===null?"—":n(r.magnitude)}</td><td>{n(r.baseline_points)}</td><td>{n(r.points)}</td><td>{r.selected_rank??"Not selected"}</td><td>{n(r.contribution)}</td><td>{n(r.baseline_contribution)}</td></tr>)}</tbody></table></div><p className="small muted">Contributions include the top-exercise cutoff and aggregation discount. Only distinct exercise entries count.</p></section>}
 </section>;
}
