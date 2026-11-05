'use client';
import {useEffect,useRef,useState} from 'react';
import styles from './admin-clip-tools.module.css';
import {parseAdminUserClipsPage,type AdminClipContext,type AdminUserClipsPage,safetyClipReasons} from '@/lib/admin-clip-tools';
import {rankedUploadReasons} from '@/lib/ranked-uploads';
import {holdTimingReasons} from '@/lib/ranked-review-reasons';
import {notifyAdminReviewCountsChanged} from '@/lib/admin-review-counts';
import AthleteIdentity from './athlete-identity';
import ClipTrimPanel from './clip-trim-panel';
export default function AdminUserClips({userId,disabled=false}:{userId:string;disabled?:boolean}){return <UserClips key={userId} userId={userId} disabled={disabled}/>;}
function UserClips({userId,disabled}:{userId:string;disabled:boolean}){
 const [items,setItems]=useState<AdminUserClipsPage['items']>([]),[selected,setSelected]=useState<string|null>(null),[page,setPage]=useState<AdminUserClipsPage|null>(null),[loading,setLoading]=useState(false),[error,setError]=useState(''),[revision,setRevision]=useState(0),[trimBusy,setTrimBusy]=useState(false),[actionBusy,setActionBusy]=useState(false);
 const request=useRef<AbortController|null>(null),busy=useRef(false);useEffect(()=>()=>{request.current?.abort();request.current=null;},[]);
 async function load(cursor:AdminUserClipsPage['next_cursor']=null){if(busy.current)return;busy.current=true;const controller=new AbortController();request.current=controller;setLoading(true);setError('');const timeout=setTimeout(()=>controller.abort(),15000);
 try{const p=new URLSearchParams({user_id:userId});if(cursor){p.set('cursor_time',cursor.created_at);p.set('cursor_id',cursor.id);}const r=await fetch(`/admin/api/users/clips?${p}`,{cache:'no-store',signal:controller.signal});const d=await r.json();if(!r.ok)throw Error(d.error||'The user’s clips could not load.');const parsed=parseAdminUserClipsPage(d);if(!parsed||parsed.items.some(x=>x.author_id!==userId))throw Error('The clip page could not be verified.');if(controller.signal.aborted)return;setPage(parsed);setItems(old=>cursor?[...old,...parsed.items.filter(n=>!old.some(x=>x.kind===n.kind&&x.id===n.id))]:parsed.items);if(!cursor)setSelected(old=>parsed.items.some(x=>`${x.kind}:${x.id}`===old)?old:parsed.items[0]?`${parsed.items[0].kind}:${parsed.items[0].id}`:null);
 }catch(e){if(request.current===controller)setError(controller.signal.aborted?'Loading clips took too long. Retry to continue.':(e as Error).message);}finally{clearTimeout(timeout);busy.current=false;if(request.current===controller)setLoading(false);}}
 useEffect(()=>{void load();return()=>request.current?.abort();},[userId,revision]); // Each user owns its own cursor and selected clip.
 const clip=items.find(x=>`${x.kind}:${x.id}`===selected);
 return <section className={styles.library} aria-label="User clips"><h3>Clips</h3><p className="muted">Inspect this athlete’s clips, trim the full attempt, or submit a separate moderation decision.</p>
 {error&&<p role="alert">{error}</p>}{loading&&<p role="status">Loading clips…</p>}{!loading&&!items.length&&<p>No clips found for this account.</p>}
 <div className={styles.clipList}>{items.map(item=><button className="button secondary" key={`${item.kind}:${item.id}`} disabled={disabled||trimBusy||actionBusy} aria-pressed={`${item.kind}:${item.id}`===selected} onClick={()=>setSelected(`${item.kind}:${item.id}`)}>{item.title||'Untitled clip'} · {item.state}</button>)}</div>
 {page?.has_more&&<button className="button secondary" disabled={disabled||loading||trimBusy||actionBusy} onClick={()=>void load(page.next_cursor)}>Load more clips</button>}
 <button className="button secondary" disabled={disabled||loading||trimBusy||actionBusy} onClick={()=>setRevision(x=>x+1)}>Refresh user clips</button>
 {clip&&<article className={styles.detail} key={`${clip.kind}:${clip.id}:${revision}`}><h4>{clip.title||'Untitled clip'}</h4><p><AthleteIdentity username={clip.username} country={clip.country}/> · {clip.state}</p>
 <ClipTrimPanel target={{kind:clip.kind,id:clip.id}} disabled={disabled||actionBusy} onBusy={setTrimBusy} onSaved={()=>{notifyAdminReviewCountsChanged();setRevision(x=>x+1);}}/>
 <ClipModerationActions context={clip} disabled={disabled||trimBusy} onBusy={setActionBusy} onSaved={()=>{notifyAdminReviewCountsChanged();setRevision(x=>x+1);}}/>
 </article>}
 </section>;
}
function ClipModerationActions({context:c,disabled,onSaved,onBusy}:{context:AdminClipContext;disabled:boolean;onSaved:()=>void;onBusy:(busy:boolean)=>void}){
 const ranking=c.can_report&&(c.can_report_ranking??(c.metric!==null&&c.claim!==null&&c.can_reject)),safety=c.can_report&&(c.can_report_safety??c.kind==='post');
 const [kind,setKind]=useState<'ranking'|'safety'>(ranking||c.can_reject?'ranking':'safety'),[reason,setReason]=useState(''),[note,setNote]=useState(''),[watched,setWatched]=useState(false),[rules,setRules]=useState<string[]>([]),[confirm,setConfirm]=useState<'report'|'reject'|null>(null),[saving,setSaving]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[conflict,setConflict]=useState(false);
 const pending=useRef<{key:string;id:string}|null>(null),savingRef=useRef(false),alive=useRef(true),controller=useRef<AbortController|null>(null);useEffect(()=>()=>{alive.current=false;controller.current?.abort();},[]);
 useEffect(()=>{onBusy(saving);return()=>onBusy(false);},[saving,onBusy]);
 const reasons=kind==='safety'?safetyClipReasons:rankedUploadReasons;
 function edit(){setConfirm(null);setError('');setNotice('');pending.current=null;}
 const canChooseTiming=c.metric==='seconds'&&c.hold_timing!==null;
 const valid=!!reason&&Object.hasOwn(reasons,reason)&&(!holdTimingReasons.has(reason)||canChooseTiming)&&note.trim().length>=3&&note.length<=1000;
 const reportValid=valid&&note.length<=800;
 const ruleType=kind==='ranking'?(reason==='unacceptable_form'?'form':reason==='unacceptable_filming'?'filming':null):null;
 const choices=ruleType===null?[]:c.rules.filter(rule=>rule.type===ruleType),chosen=choices.filter(rule=>rules.includes(rule.id));
 const canReject=c.can_reject&&watched&&kind==='ranking'&&valid&&(!ruleType||choices.length===0||chosen.length>0)&&!!c.source_fingerprint&&!conflict;
 async function save(){if(!confirm||savingRef.current||!valid||conflict||(confirm==='report'?!reportValid:!canReject))return;const action=confirm;
 const body=action==='report'?{target_kind:c.kind,target_id:c.id,report_kind:kind,reason_code:reason,details:note.trim()}:{target_kind:c.kind,target_id:c.id,expected_revision:c.source_revision,expected_source_fingerprint:c.source_fingerprint,reason_code:reason,rule_ids:chosen.map(rule=>rule.id),watched_video:true,review_note:note.trim()};
 const key=JSON.stringify({action,...body});if(pending.current?.key!==key)pending.current={key,id:crypto.randomUUID()};savingRef.current=true;setSaving(true);setError('');controller.current=new AbortController();const timer=setTimeout(()=>controller.current?.abort(),20000);
 try{const r=await fetch(`/admin/api/clip-tools/${action}`,{method:'POST',cache:'no-store',signal:controller.current.signal,headers:{'Content-Type':'application/json'},body:JSON.stringify({...body,request_id:pending.current.id})});const d=await r.json();if(r.status===409){setConflict(true);setConfirm(null);throw Error('This clip changed. Refresh user clips before deciding again.');}if(!r.ok||d.ok!==true)throw Error(d.error||'The decision may have saved. Retry this same request to check.');if(!alive.current)return;setConfirm(null);setNotice(action==='report'?'Report submitted for review.':'Ranking rejected.');onSaved();
 }catch(e){if(alive.current)setError((e as Error).message);}finally{clearTimeout(timer);savingRef.current=false;if(alive.current)setSaving(false);}}
 if(!c.can_report&&!c.can_reject)return <p className="muted">This clip has no available moderation actions.</p>;
 return <section className={styles.panel} aria-label="Clip moderation"><h3>Report or reject ranking</h3><p>Reports enter the review queue. Rejecting removes this ranking eligibility and sends the athlete your reason.</p>
 <label>Review category<select value={kind} disabled={disabled||saving||conflict} onChange={e=>{setKind(e.target.value as 'ranking'|'safety');setReason('');setRules([]);edit();}}>{(ranking||c.can_reject)&&<option value="ranking">Ranking</option>}{safety&&<option value="safety">Safety</option>}</select></label>
 <label>Clip review reason<select value={reason} disabled={disabled||saving||conflict} onChange={e=>{setReason(e.target.value);setRules([]);edit();}}><option value="">Select a reason</option>{Object.entries(reasons).filter(([code])=>!holdTimingReasons.has(code)||canChooseTiming).map(([id,label])=><option key={id} value={id}>{label}</option>)}</select></label>
 {ruleType&&<p className="small muted">Selected rules apply to ranking rejection only. To report an issue, describe its evidence in the review details.</p>}
 {choices.map(rule=><label className="check" key={rule.id}><input type="checkbox" checked={rules.includes(rule.id)} disabled={saving||disabled||conflict||!rules.includes(rule.id)&&rules.length>=8} onChange={e=>{setRules(old=>e.target.checked?[...old,rule.id]:old.filter(x=>x!==rule.id));edit();}}/>{rule.text}</label>)}
 <p className="small muted" id="clip-review-details-limit">Reports allow up to 800 characters; ranking rejection notes allow up to 1000.</p>
 {note.length>800&&<p className="small muted">Shorten the details to 800 characters or fewer to submit a report.</p>}
 <label>Clip review details<textarea aria-describedby="clip-review-details-limit" value={note} maxLength={1000} disabled={disabled||saving||conflict} onChange={e=>{setNote(e.target.value);edit();}}/></label>
 {c.can_reject&&kind==='ranking'&&<label className="check"><input type="checkbox" checked={watched} disabled={disabled||saving||conflict} onChange={e=>{setWatched(e.target.checked);edit();}}/> I watched the full video before rejecting</label>}
 {error&&<p role="alert">{error}</p>}{notice&&<p role="status">{notice}</p>}
 {c.can_report&&(kind==='ranking'?ranking:safety)&&<button className="button secondary" disabled={disabled||saving||!reportValid||conflict} onClick={()=>setConfirm('report')}>Review report</button>}
 {c.can_reject&&kind==='ranking'&&<button className="button danger" disabled={disabled||saving||!canReject} onClick={()=>setConfirm('reject')}>Review ranking rejection</button>}
 {confirm&&<div className="dialog-backdrop"><div className="dialog" role="dialog" aria-modal="true" aria-label={confirm==='report'?'Confirm clip report':'Confirm ranking rejection'}><h3>{confirm==='report'?'Submit this report?':'Reject this ranking?'}</h3><p>{confirm==='report'?kind==='safety'?'This safety report can immediately hide the post while it awaits moderation review. It does not trim the clip.':'This queues a separate ranking review; it does not reject or trim the clip.':'The athlete receives this rejection reason. Trimming is a separate action.'}</p><p>{note.trim()}</p>{confirm==='report'&&<p>Only the review details are included as report evidence. Selected rejection rules are not submitted with this report.</p>}<button className="button secondary" disabled={saving} onClick={()=>setConfirm(null)}>Cancel decision</button><button className="button primary" disabled={disabled||saving} onClick={()=>void save()}>Confirm {confirm==='report'?'report':'rejection'}</button></div></div>}
 </section>;
}
