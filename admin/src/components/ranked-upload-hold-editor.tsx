'use client';
import {useEffect, useRef, useState, type RefObject} from 'react';
import type {RankedUploadReview} from '@/lib/ranked-uploads';
import {parseRankedUploadHoldContext, type RankedUploadHoldContext} from '@/lib/ranked-upload-hold';

export default function RankedUploadHoldEditor({item, videoRef, watched, disabled, onBusy, onSaved}: {
  item: RankedUploadReview; videoRef: RefObject<HTMLVideoElement | null>; watched: boolean; disabled: boolean;
  onBusy: (value: boolean) => void; onSaved: () => void;
}) {
  const [open,setOpen] = useState(false), [context,setContext] = useState<RankedUploadHoldContext|null>(null);
  const [start,setStart] = useState<number|null>(item.hold_timing?.start_ms ?? null), [end,setEnd] = useState<number|null>(item.hold_timing?.end_ms ?? null);
  const [note,setNote] = useState(''), [error,setError] = useState(''), [loading,setLoading] = useState(false), [saving,setSaving] = useState(false), [confirm,setConfirm] = useState(false), [slow,setSlow] = useState(false), [reload,setReload] = useState(0), [uncertain,setUncertain] = useState(false);
  const alive=useRef(true), request=useRef<AbortController|null>(null), savingRef=useRef(false), frame=useRef<number|null>(null);
  useEffect(()=>{alive.current=true;return()=>{alive.current=false;request.current?.abort();};},[]);
  useEffect(()=>{
    if(!open)return;const c=new AbortController();request.current=c;setLoading(true);setError('');
    void fetch('/admin/api/ranked-uploads/hold-context',{method:'POST',cache:'no-store',signal:c.signal,headers:{'Content-Type':'application/json'},body:JSON.stringify({upload_id:item.id})})
      .then(async r=>{const v=await r.json();if(!r.ok)throw Error(v.error||'Could not load hold timing.');const parsed=parseRankedUploadHoldContext(v);if(!parsed||parsed.upload_id!==item.id||parsed.revision!==item.revision)throw Error('This upload changed. Refresh the queue.');if(!c.signal.aborted)setContext(parsed);})
      .catch(e=>{if(!c.signal.aborted)setError((e as Error).message);}).finally(()=>{if(!c.signal.aborted)setLoading(false);});
    return()=>c.abort();
  },[open,item.id,item.revision,reload]);
  useEffect(()=>{
    if(!open)return;const video=videoRef.current;if(!video)return;let callback:number|undefined;
    const seeking=()=>{frame.current=null;};video.addEventListener('seeking',seeking);
    if(typeof video.requestVideoFrameCallback==='function'){const rendered:VideoFrameRequestCallback=(_now,metadata)=>{frame.current=Math.round(metadata.mediaTime*1000);callback=video.requestVideoFrameCallback(rendered);};callback=video.requestVideoFrameCallback(rendered);}
    return()=>{video.removeEventListener('seeking',seeking);if(callback!==undefined)video.cancelVideoFrameCallback(callback);frame.current=null;};
  },[open,videoRef]);
  const value=start!==null&&end!==null?Math.floor((end-start)/1000):null;
  const valid=context!==null&&start!==null&&end!==null&&start>=0&&end<=context.duration_ms&&end-start>=1000&&value!==null&&value>=1&&value<=context.max_value&&
    (start!==item.hold_timing?.start_ms||end!==item.hold_timing?.end_ms)&&context.duration_ms>=(value+1)*1000&&context.duration_ms<=(value+6)*1000;
  const ready=valid&&watched&&note.trim().length>=3&&note.length<=1000&&!disabled&&!loading&&!saving&&!uncertain;
  function changed(){setConfirm(false);setError('');}
  function mark(which:'start'|'end'){
    const video=videoRef.current;if(!video||video.readyState<2||video.seeking)return;video.pause();
    if(typeof video.requestVideoFrameCallback==='function'&&frame.current===null){setError('Play or scrub to display a frame, then mark it.');return;}
    const time=frame.current??Math.round(video.currentTime*1000);if(which==='start')setStart(time);else setEnd(time);changed();
  }
  async function save(){
    if(!ready||savingRef.current||!context||start===null||end===null)return;savingRef.current=true;setSaving(true);onBusy(true);setError('');
    const c=new AbortController();request.current=c;const timeout=setTimeout(()=>c.abort(),60000);
    try{
      const r=await fetch('/admin/api/ranked-uploads/hold-correction',{method:'POST',cache:'no-store',signal:c.signal,headers:{'Content-Type':'application/json'},body:JSON.stringify({upload_id:item.id,expected_revision:context.revision,expected_source_fingerprint:context.source_fingerprint,hold_start_ms:start,hold_end_ms:end,watched_video:true,review_note:note.trim()})});
      const v=await r.json();if(!r.ok)throw Error(v.error||'Could not save. Refresh the queue before retrying.');
      if(v.ok!==true||v.status!=='corrected'||v.value!==value||v.revision!==context.revision+1||v.hold_timing?.start_ms!==start||v.hold_timing?.end_ms!==end)throw Error('The saved correction could not be verified. Refresh the queue.');
      if(alive.current)onSaved();
    }catch(e){if(alive.current){setUncertain(true);setError(c.signal.aborted?'The request timed out and may have saved. Refresh the queue before retrying.':(e as Error).message);setConfirm(false);}}
    finally{clearTimeout(timeout);savingRef.current=false;onBusy(false);if(alive.current){setSaving(false);}}
  }
  return <section className="lab-panel" aria-label="Edit private upload hold frames">
    <button className="button secondary" disabled={disabled||saving} aria-expanded={open} onClick={()=>{setOpen(v=>!v);setConfirm(false);}}>Edit hold start and end frames</button>
    {open&&<><h3>Correct this hold before approval</h3><p>Save the correct start and end frames. Whole seconds and the projected rank are recalculated. The video stays private and still needs a separate approval.</p>
      {loading&&<p>Loading source timeline…</p>}
      <div className="actions"><button className="button secondary" disabled={disabled||saving||loading} onClick={()=>mark('start')}>Use paused frame as start</button><button className="button secondary" disabled={disabled||saving||loading} onClick={()=>mark('end')}>Use paused frame as end</button>
      <button className="button secondary" disabled={disabled||saving} onClick={()=>{const v=videoRef.current;if(v){v.pause();v.currentTime=Math.max(0,v.currentTime-.1);}changed();}}>Back 0.1s</button><button className="button secondary" disabled={disabled||saving} onClick={()=>{const v=videoRef.current;if(v&&Number.isFinite(v.duration)){v.pause();v.currentTime=Math.min(v.duration,v.currentTime+.1);}changed();}}>Forward 0.1s</button>
      <button className="button secondary" disabled={disabled||saving} onClick={()=>{if(videoRef.current){videoRef.current.playbackRate=slow?1:.25;setSlow(!slow);}}}>{slow?'Playback 1×':'Playback 0.25×'}</button></div>
      <div className="lab-grid">{(['start','end'] as const).map(which=><label key={which}>Correct {which} (seconds)<input type="number" min={0} step="0.001" disabled={disabled||saving} value={(which==='start'?start:end)===null?'':(which==='start'?start!:end!)/1000} onChange={e=>{const v=e.target.value===''||!Number.isFinite(e.target.valueAsNumber)?null:Math.round(e.target.valueAsNumber*1000);if(which==='start')setStart(v);else setEnd(v);changed();}}/></label>)}</div>
      <p aria-live="polite">Selected duration: {start!==null&&end!==null?`${((end-start)/1000).toFixed(3)} seconds`:'Choose both frames'}. Counted hold: {value!==null&&value>0?`${value} whole seconds`:'—'}.</p>
      <p className="small muted">The existing clip must be 1–6 seconds longer than the corrected whole-second result. A clip outside that allowance needs a trimmed resubmission.</p>
      <label>Correction note<input value={note} maxLength={1000} disabled={disabled||saving} onChange={e=>{setNote(e.target.value);changed();}} placeholder="Required audit note"/></label>
      {error&&<p role="alert" className="error">{error}</p>}
      {!context&&!loading&&<button className="button secondary" disabled={disabled||saving} onClick={()=>setReload(n=>n+1)}>Retry hold timeline</button>}
      <button className="button primary" disabled={!ready} onClick={()=>setConfirm(true)}>Review hold correction</button>
      {confirm&&<div className="dialog-backdrop"><div className="dialog" role="dialog" aria-modal="true" aria-label="Confirm private hold correction"><h3>Save corrected hold?</h3><p>{item.claim} → {value} seconds. Start {(start!/1000).toFixed(3)} s, end {(end!/1000).toFixed(3)} s. The upload stays private and awaiting review.</p><p>{note.trim()}</p><button className="button secondary" disabled={saving} onClick={()=>setConfirm(false)}>Cancel</button><button className="button primary" disabled={!ready} onClick={()=>void save()}>{saving?'Saving…':'Save hold correction'}</button></div></div>}
    </>}
  </section>;
}
