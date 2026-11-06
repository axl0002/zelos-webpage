'use client';
import {useEffect, useRef, useState} from 'react';
import type {RankedUploadReview} from '@/lib/ranked-uploads';
import {parseRankedUploadRepContext, type RankedUploadRepContext} from '@/lib/ranked-upload-reps';
export default function RankedUploadRepEditor({item, watched, disabled, onBusy, onOpenChange, onSaved, onRefresh}: {
  item: RankedUploadReview; watched: boolean; disabled: boolean;
  onBusy: (busy: boolean) => void; onOpenChange: (open: boolean) => void; onSaved: () => void; onRefresh: () => void;
}) {
  const [open, setOpen] = useState(false), [context, setContext] = useState<RankedUploadRepContext | null>(null);
  const [reps, setReps] = useState(String(item.claim)), [note, setNote] = useState(''), [error, setError] = useState('');
  const [loading, setLoading] = useState(false), [saving, setSaving] = useState(false), [confirm, setConfirm] = useState(false), [uncertain, setUncertain] = useState(false);
  const alive = useRef(true), request = useRef<AbortController | null>(null), savingRef = useRef(false);
  useEffect(() => {alive.current = true; return () => {alive.current = false; request.current?.abort();};}, []);
  useEffect(() => {
    if (!open) return;
    const c = new AbortController(); request.current = c; setLoading(true); setError('');
    void fetch('/admin/api/ranked-uploads/rep-context', {method: 'POST', cache: 'no-store', signal: c.signal,
      headers: {'Content-Type': 'application/json'}, body: JSON.stringify({upload_id: item.id})})
      .then(async r => {const v = await r.json(); if (!r.ok) throw Error(v.error || 'Could not load the rep count.');
        const parsed = parseRankedUploadRepContext(v);
        if (!parsed || parsed.upload_id !== item.id || parsed.revision !== item.revision || parsed.claim !== item.claim) throw Error('This upload changed. Refresh the queue.');
        if (!c.signal.aborted) setContext(parsed);
      }).catch(e => {if (!c.signal.aborted) setError((e as Error).message);})
      .finally(() => {if (!c.signal.aborted) setLoading(false);});
    return () => c.abort();
  }, [open, item.id, item.revision, item.claim]);
  const value = /^\d+$/.test(reps) ? Number(reps) : NaN;
  const ready = !!context && Number.isSafeInteger(value) && value >= 1 && value <= context.max_value && value !== item.claim &&
    watched && note.trim().length >= 3 && note.length <= 1000 && !disabled && !loading && !saving && !uncertain;
  function toggle() {const next = !open; setOpen(next); onOpenChange(next); setConfirm(false); setContext(null); setError(''); setReps(String(item.claim)); setNote('');}
  async function save() {
    if (!ready || !context || savingRef.current) return;
    savingRef.current = true; setSaving(true); onBusy(true); setError('');
    const c = new AbortController(); request.current = c; const timeout = setTimeout(() => c.abort(), 60000);
    try {
      const r = await fetch('/admin/api/ranked-uploads/rep-correction', {method: 'POST', cache: 'no-store', signal: c.signal,
        headers: {'Content-Type': 'application/json'}, body: JSON.stringify({upload_id: item.id, expected_revision: context.revision,
          expected_source_fingerprint: context.source_fingerprint, corrected_value: value, watched_video: true, review_note: note.trim()})});
      const v = await r.json(); if (!r.ok) throw Error(v.error || 'Could not save. Refresh the queue before retrying.');
      if (v.ok !== true || v.status !== 'corrected' || v.value !== value || v.revision !== context.revision + 1) throw Error('The saved correction could not be verified. Refresh the queue.');
      if (alive.current) onSaved();
    } catch (e) {if (alive.current) {setUncertain(true); setConfirm(false); setError(c.signal.aborted ? 'The request timed out and may have saved. Refresh the queue before retrying.' : (e as Error).message);}}
    finally {clearTimeout(timeout); savingRef.current = false; onBusy(false); if (alive.current) setSaving(false);}
  }
  return <section className="lab-panel" aria-label="Edit private upload reps">
    <button className="button secondary" disabled={disabled || saving || uncertain} aria-expanded={open} onClick={toggle}>{open ? 'Cancel rep edit' : 'Edit rep count'}</button>
    {open && <><h3>Correct reps before approval</h3><p>Save the whole rep count and a correction note. The projected rank updates; the upload stays private and still needs approval.</p>
      {loading && <p>Loading rep count…</p>}
      <label>Correct rep count<input type="number" min={1} max={context?.max_value} step={1} value={reps} disabled={disabled || saving || uncertain}
        onChange={e => {setReps(e.target.value); setConfirm(false);}} /></label>
      <label>Correction note<input value={note} maxLength={1000} disabled={disabled || saving || uncertain}
        onChange={e => {setNote(e.target.value); setConfirm(false);}} /></label>
      {error && <p role="alert" className="error">{error}</p>}
      {error && <button className="button secondary" disabled={saving} onClick={onRefresh}>Refresh upload review</button>}
      <button className="button primary" disabled={!ready} onClick={() => setConfirm(true)}>Review rep correction</button>
      {confirm && <div className="dialog-backdrop"><div className="dialog" role="dialog" aria-modal="true" aria-label="Confirm private rep correction"><h3>Save corrected reps?</h3>
        <p>{item.claim} → {value} reps. The upload stays private and awaiting review.</p><p>{note.trim()}</p>
        <button className="button secondary" disabled={saving} onClick={() => setConfirm(false)}>Cancel</button>
        <button className="button primary" disabled={!ready} onClick={() => void save()}>{saving ? 'Saving…' : 'Save rep correction'}</button>
      </div></div>}
    </>}
  </section>;
}
