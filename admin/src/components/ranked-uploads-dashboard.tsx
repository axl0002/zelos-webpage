"use client";
import ReviewQueueNav from "./review-queue-nav";
import type {ExerciseRule} from "@/lib/exercise-rules";
import { useEffect, useRef, useState } from "react";
import {
  rankedUploadReasons,
  type RankedUploadReason,
  type RankedUploadReview,
} from "@/lib/ranked-uploads";

async function api<T>(path = "", body?: unknown, signal?: AbortSignal): Promise<T> {
  const response = await fetch(`/admin/api/ranked-uploads${path}`, {
    method: body === undefined ? "GET" : "POST", cache: "no-store", signal,
    headers: body === undefined ? undefined : {"Content-Type": "application/json"},
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "Could not load ranked uploads. Try again.");
  return result;
}
export default function RankedUploadsDashboard() {
  const [queue, setQueue] = useState<RankedUploadReview[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  async function refresh(signal?: AbortSignal) {
    setLoading(true); setError("");
    try {
      const items = await api<RankedUploadReview[]>("", undefined, signal);
      if (signal?.aborted) return;
      setQueue(items);
      setSelected(old => items.some(item => item.id === old) ? old : items[0]?.id ?? null);
    } catch (cause) {
      if (!signal?.aborted) setError((cause as Error).message);
    } finally { if (!signal?.aborted) setLoading(false); }
  }
  useEffect(() => {
    const controller = new AbortController(); void refresh(controller.signal);
    return () => controller.abort();
  }, []);
  const current = queue.find(item => item.id === selected);
  function saved(approved: boolean, note: string, reason: RankedUploadReason | null, rules: ExerciseRule[]) {
    if (!current) return;
    if (approved) {
      setQueue(old => old.filter(item => item.id !== current.id));
      setSelected(queue.find(item => item.id !== current.id)?.id ?? null);
    } else {
      setQueue(old => old.map(item => item.id === current.id ? {
        ...item, state: "rank_rejected", review_note: note,
        rejection_reason: reason, rejection_rules: rules, revision: item.revision + 1,
      } : item));
    }
    setNotice(approved
      ? "Approved. The upload will finish publication checks before it can appear in the feed and rankings."
      : "Rejected. The uploader will see your reason. The video remains private.");
  }
  return <div className="workspace">
    <aside className="sidebar">
      <a className="brand" href="/">zelos<span> / admin</span></a>
      <p className="nav-label">CONTENT</p>
      <a href="/admin" className="nav-item">Exercise review</a>
      <a href="/admin/ranked-uploads" className="nav-item active" aria-current="page">Ranked uploads</a>
      <a href="/admin/ranking-flags" className="nav-item">Ranking flags</a>
      <a href="/admin/users" className="nav-item">Users</a>
      <a href="/admin/reports" className="nav-item">User reports</a>
      <a href="/admin/safety" className="nav-item">Upload safety</a>
    </aside>
    <main className="main">
      <header className="page-header"><div>
        <p className="eyebrow">BEFORE PUBLICATION</p><h1>Ranked uploads</h1>
        <p className="muted">Check the complete video against the exercise rules before it becomes public or earns points.</p>
      </div><button className="button secondary" disabled={loading || busy} onClick={() => void refresh()}>Refresh queue</button></header>
      <ReviewQueueNav active="/admin/ranked-uploads" />
      {error && <p className="notice error" role="alert">{error}</p>}
      {notice && <p className="notice success" role="status">{notice}</p>}
      <div className="review-layout">
        <section className="queue-panel" aria-label="Ranked upload queue">
          {loading && !queue.length && <p className="empty">Loading ranked uploads…</p>}
          {!loading && !queue.length && <p className="empty">No ranked uploads awaiting review or retained after rejection.</p>}
          {queue.map(item => <button key={item.id} className={`candidate ${item.id === selected ? "selected" : ""}`}
            disabled={busy} aria-pressed={item.id === selected} onClick={() => {setSelected(item.id); setNotice("");}}>
            <span className="candidate-copy"><strong>{item.username} · {item.board_name}</strong>
              <span>{item.claim} {item.metric} · {item.state === "rank_review" ? "Awaiting review" : "Rejected · private"}</span>
              <small>{item.reason === "always_review" ? "Always requires review" : `Projected top ${item.top_percent}%`}</small>
            </span>
          </button>)}
        </section>
        {current ? <RankedUploadDetail key={`${current.id}:${current.revision}`} item={current} onBusy={setBusy} onSaved={saved} />
          : <section className="review-panel"><p className="empty">Select an upload to review.</p></section>}
      </div>
    </main>
  </div>;
}
function RankedUploadDetail({item, onBusy, onSaved}: {
  item: RankedUploadReview; onBusy: (busy: boolean) => void;
  onSaved: (approve: boolean, note: string, reason: RankedUploadReason | null, rules: ExerciseRule[]) => void;
}) {
  const [preview, setPreview] = useState<{url: string; expires_in: number} | null>(null);
  const [opening, setOpening] = useState(false);
  const [watched, setWatched] = useState(false);
  const [note, setNote] = useState(item.review_note ?? "");
  const [reason, setReason] = useState<RankedUploadReason | "">(item.rejection_reason ?? "");
  const [selectedRules, setSelectedRules] = useState<string[]>([]);
  const [confirmation, setConfirmation] = useState<"approve" | "reject" | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const previewRequest = useRef<AbortController | null>(null);
  const savingRef = useRef(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const awaiting = item.state === "rank_review";
  const ruleType = reason === "unacceptable_form" ? "form" : reason === "unacceptable_filming" ? "filming" : null;
  const choices = item.guidelines.rules.filter(rule => rule.type === ruleType);
  const chosen = choices.filter(rule => selectedRules.includes(rule.id));
  const validRejection = !!reason && (ruleType && choices.length > 0
    ? chosen.length > 0 : note.trim().length >= 3);

  useEffect(() => () => previewRequest.current?.abort(), []);
  async function openPreview() {
    if (opening || saving) return;
    previewRequest.current?.abort();
    const controller = new AbortController(); previewRequest.current = controller;
    setOpening(true); setError(""); setWatched(false); setPreview(null); setConfirmation(null);
    try {
      const result = await api<{url: string; expires_in: number}>("/preview", {upload_id: item.id}, controller.signal);
      if (!controller.signal.aborted) setPreview(result);
    } catch (cause) { if (!controller.signal.aborted) setError((cause as Error).message); }
    finally { if (!controller.signal.aborted) setOpening(false); }
  }
  async function decide() {
    if (!confirmation || savingRef.current || !awaiting || !preview || !watched ||
      (confirmation === "reject" && !validRejection)) return;
    savingRef.current = true; setSaving(true); onBusy(true); setError("");
    const approved = confirmation === "approve";
    try {
      await api("/decision", {upload_id: item.id, expected_revision: item.revision,
        approve: approved, watched_video: true, reason_code: approved ? null : reason,
        review_note: note.trim(), rule_ids: approved ? [] : chosen.map(rule => rule.id)});
      onSaved(approved, note.trim() || `Rules not met: ${chosen.map(rule => rule.text).join("; ")}`, approved ? null : reason as RankedUploadReason, approved ? [] : chosen);
    } catch (cause) { setError((cause as Error).message); setConfirmation(null); }
    finally { savingRef.current = false; setSaving(false); onBusy(false); }
  }
  const g = item.guidelines;
  return <section className="review-panel" aria-label="Ranked upload detail">
    <div className="clip-heading"><div><p className="eyebrow">PRIVATE RANKED UPLOAD</p>
      <h2>{item.title || item.board_name}</h2><p>{item.username} · {item.board_name} · {item.claim} {item.metric}</p>
    </div><span className="badge">{awaiting ? "Awaiting review" : "Rejected · private"}</span></div>
    <div className="clip-grid"><div>
      <div className="video-frame">
        {preview ? <video ref={videoRef} key={preview.url} src={preview.url} controls playsInline preload="metadata" aria-label="Private ranked upload"
          onError={() => {setPreview(null); setWatched(false); setConfirmation(null); setError("The video could not play. Open a new private video link before reviewing.");}} />
          : <button className="button secondary" disabled={opening || saving} onClick={() => void openPreview()}>{opening ? "Opening…" : "Open private video"}</button>}
      </div>
      {item.hold_timing && <div className="playback-tools" aria-label="Selected hold timing">
        <p>Selected hold: {(item.hold_timing.duration_ms / 1000).toFixed(3)} s · credited {item.claim} s</p>
        {(["start_ms", "end_ms"] as const).map(boundary => <button key={boundary}
          className="button secondary" disabled={!preview || opening || saving}
          onClick={() => {
            if (videoRef.current) {
              videoRef.current.pause();
              videoRef.current.currentTime = item.hold_timing![boundary] / 1000;
            }
          }}>{boundary === "start_ms" ? "Hold start" : "Hold end"} · {(item.hold_timing![boundary] / 1000).toFixed(3)} s</button>)}
      </div>}
      {preview && <button className="button text" disabled={opening || saving} onClick={() => void openPreview()}>Refresh video link</button>}
      <p className="small muted">The preview link is temporary. Refresh it if playback stops. This video has not been published.</p>
      <div className="notice">
        {item.reason === "always_review" ? <p>This progression requires a review for every ranked upload.</p>
          : <p>This result is projected into the top {item.top_percent}% of its worldwide progression and gender board.</p>}
        {item.projected_rank !== null && item.participants !== null && <p>Projected rank: #{item.projected_rank} of {item.participants} athletes.</p>}
        {item.cutoff !== null && item.reason === "top_percent" && <p>Review cutoff: rank {item.cutoff}. The percentage is rounded up; tied results share a rank.</p>}
      </div>
    </div><div className="decision-form">
      <h3>Exercise rules</h3>
      <p className="small muted">Check the declared exercise, progression, result, form and filming.</p>
      {(["form", "filming"] as const).map(type => <div key={type}>
        <h4>{type === "form" ? "Form" : "Filming"}</h4>
        <ul>{g.rules.filter(rule => rule.type === type).map(rule => <li key={rule.id}>{rule.text}</li>)}</ul>
      </div>)}
      {!awaiting ? <div className="notice"><h3>{item.rejection_reason ? rankedUploadReasons[item.rejection_reason] : "Rejected"}</h3>
        <p className="review-rule-copy">{item.review_note}</p><ul>{item.rejection_rules.map(rule => <li key={rule.id}>{rule.text}</li>)}</ul><p>The upload remains private and earns no points.</p></div>
        : <>
          <label className="check"><input type="checkbox" checked={watched} disabled={!preview || saving}
            onChange={event => {setWatched(event.target.checked); setConfirmation(null);}} />
            I watched the full video and checked the exercise, result and form against these rules.</label>
          <label htmlFor="ranked-upload-reason">Rejection reason</label>
          <select id="ranked-upload-reason" value={reason} disabled={saving} onChange={event => {setReason(event.target.value as RankedUploadReason | ""); setSelectedRules([]); setConfirmation(null);}}>
            <option value="">Choose a reason if rejecting</option>
            {Object.entries(rankedUploadReasons).map(([code, label]) => <option key={code} value={code}>{label}</option>)}
          </select>
          {choices.length > 0 && <fieldset disabled={saving}><legend>Rules not met</legend>
            {choices.map(rule => <label className="check" key={rule.id}><input type="checkbox"
              checked={selectedRules.includes(rule.id)} disabled={saving || (selectedRules.length >= 8 && !selectedRules.includes(rule.id))}
              onChange={event => {setSelectedRules(old => event.target.checked ? [...old, rule.id] : old.filter(id => id !== rule.id)); setConfirmation(null);}} />
              {rule.text}</label>)}
            <p className="small muted">Select the requirements the clip does not meet, up to 8.</p>
          </fieldset>}
          <label htmlFor="ranked-upload-note">Note shown to the uploader if rejected</label>
          <textarea id="ranked-upload-note" rows={4} maxLength={1000} value={note} disabled={saving}
            placeholder="Add context or explain how to correct the issue. Optional when a rule is selected."
            onChange={event => {setNote(event.target.value); setConfirmation(null);}} />
          <p className="small muted">While this review is pending, the video stays private, earns no points, and the athlete’s current personal best stays in place.</p>
          <div className="decision-actions"><button className="button secondary" disabled={!watched || !preview || saving || !validRejection}
            onClick={() => setConfirmation("reject")}>Reject upload</button>
            <button className="button primary" disabled={!watched || !preview || saving} onClick={() => setConfirmation("approve")}>Approve upload</button></div>
        </>}
      {error && <p className="notice error" role="alert">{error}</p>}
    </div></div>
    {confirmation && <div className="dialog-backdrop"><div className="dialog" role="dialog" aria-modal="true" aria-label="Confirm ranked upload decision">
      <h2>{confirmation === "approve" ? "Approve this ranked upload?" : "Reject this ranked upload?"}</h2>
      <p>{confirmation === "approve" ? "The upload can be published and counted in rankings after the remaining publication checks pass."
        : "The video will stay private and earn no points. The uploader will receive this reason:"}</p>
      {confirmation === "reject" && <><strong>{reason ? rankedUploadReasons[reason] : ""}</strong><ul>{chosen.map(rule => <li key={rule.id}>{rule.text}</li>)}</ul><p className="review-rule-copy">{note.trim()}</p></>}
      <div className="decision-actions"><button className="button secondary" disabled={saving} onClick={() => setConfirmation(null)}>Cancel</button>
        <button className="button primary" disabled={saving} onClick={() => void decide()}>{saving ? "Saving…" : "Confirm decision"}</button></div>
    </div></div>}
  </section>;
}
