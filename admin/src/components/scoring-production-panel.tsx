"use client";
import {useCallback,useEffect,useRef,useState} from "react";
import {LabError,labRequest} from "@/lib/scoring-lab-request";
import type {LabAlgorithm,LabRun} from "@/lib/scoring-lab";
import {parseScoringActivation,parseScoringPreview,parseScoringRegistry,parseScoringVersion,type ScoringPreview,type ScoringRegistry} from "@/lib/scoring-production";
const request=(signal:AbortSignal,body?:unknown)=>labRequest("",signal,body,"/admin/api/scoring-production");
const date=(s:string)=>new Date(s).toLocaleString();
const n=(v:number)=>v.toLocaleString(undefined,{maximumFractionDigits:3});
export default function ScoringProductionPanel({algorithms,runs}:{algorithms:LabAlgorithm[];runs:LabRun[]}){
 const [registry,setRegistry]=useState<ScoringRegistry|null>(null),[error,setError]=useState(""),[notice,setNotice]=useState(""),[busy,setBusy]=useState(false);
 const [target,setTarget]=useState(""),[preview,setPreview]=useState<ScoringPreview|null>(null),[confirmation,setConfirmation]=useState(""),[reason,setReason]=useState("");
 const [algorithm,setAlgorithm]=useState(""),[run,setRun]=useState(""),[note,setNote]=useState(""),[now,setNow]=useState(Date.now());
 const alive=useRef(true),pending=useRef(false),controller=useRef<AbortController|null>(null);
 const clearPreview=()=>{setPreview(null);setConfirmation("");setReason("");};
 const load=useCallback(async(signal:AbortSignal)=>{const next=parseScoringRegistry(await request(signal));if(!alive.current||signal.aborted)return;setRegistry(next);setTarget(t=>next.versions.some(v=>v.id===t&&v.id!==next.active_id)?t:"");},[]);
 useEffect(()=>{alive.current=true;const c=new AbortController();controller.current=c;pending.current=true;setBusy(true);void load(c.signal).catch(e=>{if(alive.current&&!c.signal.aborted)setError(e instanceof LabError?e.message:"Could not load production scoring settings.");}).finally(()=>{pending.current=false;if(alive.current&&!c.signal.aborted)setBusy(false);});return()=>{alive.current=false;controller.current?.abort();};},[load]);
 useEffect(()=>{if(!preview)return;const timer=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(timer);},[preview]);
 async function action(kind:"refresh"|"register"|"preview"|"activate"){
  if(pending.current)return;pending.current=true;setBusy(true);setError("");setNotice("");const c=new AbortController();controller.current=c;
  if(kind!=="preview")clearPreview();
  try{
   if(kind==="refresh"){await load(c.signal);return;}
   if(kind==="register"){
    const v=parseScoringVersion(await request(c.signal,{action:kind,algorithm,run,note}));if(c.signal.aborted||!alive.current)return;
    await load(c.signal);if(c.signal.aborted||!alive.current)return;setTarget(v.id);setNote("");setNotice(`Registered “${v.name}”. Active scoring has not changed.`);
   }else if(kind==="preview"){
    clearPreview();const p=parseScoringPreview(await request(c.signal,{action:kind,version:target}));if(c.signal.aborted||!alive.current)return;if(p.version_id!==target)throw Error();setNow(Date.now());setPreview(p);
   }else{
    if(!preview||!registry)throw Error();const p=parseScoringActivation(await request(c.signal,{action:kind,preview:preview.id,expected_active:registry.active_id,confirmation,reason}));if(c.signal.aborted||!alive.current)return;
    await load(c.signal);if(c.signal.aborted||!alive.current)return;setNotice(`Scoring activated. Ranking version ${p.rankings_version}. App scores update on their next refresh.`);
   }
  }catch(e){if(alive.current&&!c.signal.aborted){clearPreview();if(kind==="activate")setRegistry(null);setError(e instanceof LabError?e.message:"Could not finish. Refresh settings and check activation history before retrying.");}}
  finally{pending.current=false;if(alive.current&&!c.signal.aborted)setBusy(false);}
 }
 const active=registry?.versions.find(v=>v.id===registry.active_id),candidate=registry?.versions.find(v=>v.id===target),expired=!!preview&&Date.parse(preview.expires_at)<=now;
 const evidence=runs.filter(r=>r.algorithm_ids.includes(algorithm));
 return <div className="scoring-lab" style={{marginTop:16}}>
 <p>Register a tested algorithm, preview its effect on current eligible records, then explicitly activate it. Roll back by previewing and activating a previous version with current records.</p>
 <div className="lab-actions"><button className="button secondary" disabled={busy} onClick={()=>void action("refresh")}>Refresh production settings</button>{busy&&<span role="status">Loading scoring settings…</span>}</div>
 {error&&<p role="alert" className="error">{error}</p>}{notice&&<p role="status">{notice}</p>}
 {registry&&<>
 <div className="lab-notice"><strong>Active: {active?.name}</strong><p>Ranking version {registry.rankings_version}. Existing mobile score APIs are preserved.</p></div>
 <details><summary>Register a tested lab algorithm</summary><div className="scoring-lab" style={{marginTop:16}}>
 <label>Lab algorithm<select value={algorithm} disabled={busy} onChange={e=>{setAlgorithm(e.target.value);setRun("");}}><option value="">Select a saved algorithm</option>{algorithms.filter(a=>!a.is_baseline).map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</select></label>
 <label>Saved comparison evidence<select value={run} disabled={busy||!algorithm} onChange={e=>setRun(e.target.value)}><option value="">Select a comparison containing this algorithm</option>{evidence.map(r=><option key={r.id} value={r.id}>{date(r.created_at)} · {r.id}</option>)}</select></label>
 <label>Calibration and review note<textarea value={note} maxLength={2000} disabled={busy} onChange={e=>setNote(e.target.value)}/></label>
 <p className="small muted">Performance algorithms need explicit benchmarks for every active progression. Research defaults cannot be registered for production. Registering a version leaves active scoring unchanged.</p>
 <div><button className="button secondary" disabled={busy||!algorithm||!evidence.some(r=>r.id===run)||note.trim().length<10} onClick={()=>void action("register")}>Register version</button></div>
 </div></details>
 <label>Version to activate<select value={target} disabled={busy} onChange={e=>{setTarget(e.target.value);clearPreview();}}><option value="">Select an inactive version</option>{registry.versions.filter(v=>v.id!==registry.active_id).map(v=><option key={v.id} value={v.id} disabled={!v.ready}>{v.name}{!v.ready?" · requires engine or benchmark update":""}</option>)}</select></label>
 {candidate&&<details><summary>Selected version parameters and review</summary><pre className="lab-formula">{JSON.stringify({engine:candidate.engine,shrinkage:candidate.shrinkage,config:candidate.config},null,2)}</pre><p>{candidate.calibration_note}</p></details>}
 <div><button className="button secondary" disabled={busy||!candidate?.ready} onClick={()=>void action("preview")}>Preview current ranking changes</button></div>
 {preview&&candidate&&<section className="lab-notice" aria-labelledby="activation-title"><h3 id="activation-title">Activate {candidate.name}?</h3><p>Preview includes {n(preview.summary.record_count)} eligible records. Valid until {date(preview.expires_at)}. Changes to ranking inputs require a new preview.</p>
 <div className="lab-scroll"><table><thead><tr><th>Cohort</th><th>Athletes</th><th>Positions changed</th><th>Largest rank change</th><th>Largest score change</th><th>Top 10 overlap</th></tr></thead><tbody>{preview.summary.cohorts.map(c=><tr key={c.discipline+":"+c.gender}><td>{c.discipline} · {c.gender}</td><td>{n(c.athletes)}</td><td>{n(c.moved)}</td><td>{n(c.max_rank_change)}</td><td>{n(c.max_score_change)}</td><td>{c.top10_overlap===null?"—":`${n(c.top10_overlap*100)}%`}</td></tr>)}</tbody></table></div>
 <p>Activation changes production scores for everyone. Rankings and cache switch together; the audit history records this change.</p>
 <label>Reason for activation<textarea value={reason} maxLength={2000} disabled={busy} onChange={e=>setReason(e.target.value)}/></label>
 <label>Type ACTIVATE to confirm<input value={confirmation} autoComplete="off" disabled={busy} onChange={e=>setConfirmation(e.target.value)}/></label>
 {expired&&<p role="status">Preview expired. Create a new preview.</p>}
 <div className="lab-actions"><button className="button secondary" disabled={busy} onClick={clearPreview}>Cancel activation</button><button className="button primary" disabled={busy||expired||confirmation!=="ACTIVATE"||reason.trim().length<10} onClick={()=>void action("activate")}>Activate production scoring</button></div>
 </section>}
 <details><summary>Activation history</summary><div className="lab-scroll"><table><thead><tr><th>When</th><th>Version</th><th>Reason</th><th>Ranking version</th></tr></thead><tbody>{registry.history.map(h=><tr key={h.id}><td>{date(h.created_at)}</td><td>{registry.versions.find(v=>v.id===h.active_id)?.name??h.active_id}</td><td>{h.reason}</td><td>{h.rankings_version}</td></tr>)}</tbody></table></div></details>
 </>}
 </div>;
}
