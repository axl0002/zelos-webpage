"use client";
import { useCallback, useEffect, useRef, useState } from "react";
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
  // An older in-flight queue response must not restore a completed review.
  const completed = useRef(new Set<string>());
  async function refresh(signal?: AbortSignal) {
    setLoading(true); setError("");
    try {
      const items = await api<RankedUploadReview[]>("", undefined, signal);
      if (signal?.aborted) return;
      const pending = items.filter(item => item.state === "rank_review" && !completed.current.has(item.id));
      setQueue(pending);
      setSelected(old => pending.some(item => item.id === old) ? old : pending[0]?.id ?? null);
    } catch (cause) {
      if (!signal?.aborted) setError((cause as Error).message);
    } finally { if (!signal?.aborted) setLoading(false); }
  }
  useEffect(() => {
    const controller = new AbortController(); void refresh(controller.signal);
    return () => controller.abort();
  }, []);
  const current = queue.find(item => item.id === selected);
  function saved(approved: boolean) {
    if (!current) return;
    completed.current.add(current.id);
    setQueue(old => old.filter(item => item.id !== current.id));
    setSelected(queue.find(item => item.id !== current.id)?.id ?? null);
    setNotice(approved
      ? "Approved. The upload will finish publication checks before it can appear in the feed and rankings."
      : "Rejected. The uploader will see your reason. The video remains private.");
  }
  return <div className="dashboard-content">
      <header className="page-header"><div>
        <p className="eyebrow">BEFORE PUBLICATION</p><h1>Ranked uploads</h1>
        <p className="muted">Check the complete video against the exercise rules before it becomes public or earns points.</p>
      </div><button className="button secondary" disabled={loading || busy} onClick={() => void refresh()}>Refresh queue</button></header>
      {error && <p className="notice error" role="alert">{error}</p>}
      {notice && <p className="notice success" role="status">{notice}</p>}
      <div className="review-layout">
        <section className="queue-panel" aria-label="Ranked upload queue">
          {loading && !queue.length && <p className="empty">Loading ranked uploads…</p>}
          {!loading && !queue.length && <p className="empty">No ranked uploads awaiting review.</p>}
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
    </div>;
}
function RankedUploadDetail({item, onBusy, onSaved}: {
  item: RankedUploadReview; onBusy: (busy: boolean) => void;
  onSaved: (approve: boolean) => void;
}) {
  const [preview, setPreview] = useState<{url: string; expires_in: number} | null>(null);
  const [opening, setOpening] = useState(false);
  const [watched, setWatched] = useState(false);
  const [reason, setReason] = useState<RankedUploadReason | "">(item.rejection_reason ?? "");
  const [confirmation, setConfirmation] = useState<"approve" | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const previewRequest = useRef<AbortController | null>(null);
  const savingRef = useRef(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const awaiting = item.state === "rank_review";
  const validRejection = !!reason;

  const openPreview = useCallback(async () => {
    if (savingRef.current) return;
    previewRequest.current?.abort();
    const controller = new AbortController(); previewRequest.current = controller;
    setOpening(true); setError(""); setWatched(false); setPreview(null); setConfirmation(null);
    try {
      const result = await api<{url: string; expires_in: number}>("/preview", {upload_id: item.id}, controller.signal);
      if (!controller.signal.aborted) setPreview(result);
    } catch (cause) { if (!controller.signal.aborted) setError((cause as Error).message); }
    finally { if (!controller.signal.aborted) setOpening(false); }
  }, [item.id]);
  useEffect(() => {
    void openPreview();
    return () => previewRequest.current?.abort();
  }, [openPreview]);
  async function decide(approved: boolean) {
    if (savingRef.current || !awaiting ||
      (approved ? confirmation !== "approve" || !preview || !watched : !validRejection)) return;
    savingRef.current = true; setSaving(true); onBusy(true); setError("");
    try {
      await api("/decision", {upload_id: item.id, expected_revision: item.revision,
        approve: approved, watched_video: approved && watched,
        reason_code: approved ? null : reason, review_note: "", rule_ids: []});
      onSaved(approved);
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
        {preview ? <video ref={videoRef} key={preview.url} src={preview.url} autoPlay muted controls playsInline preload="auto" aria-label="Private ranked upload"
          onError={() => {setPreview(null); setWatched(false); setConfirmation(null); setError("The video could not play. Retry the video to get a fresh private link.");}} />
          : <button className="button secondary" disabled={opening || saving} onClick={() => void openPreview()}>{opening ? "Loading video…" : "Retry video"}</button>}
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
        {item.review_note && item.review_note !== (item.rejection_reason ? rankedUploadReasons[item.rejection_reason] : null) && <p className="review-rule-copy">{item.review_note}</p>}<ul>{item.rejection_rules.map(rule => <li key={rule.id}>{rule.text}</li>)}</ul><p>The upload remains private and earns no points.</p></div>
        : <>
          <label className="check"><input type="checkbox" checked={watched} disabled={!preview || saving}
            onChange={event => {setWatched(event.target.checked); setConfirmation(null);}} />
            I watched the full video and checked the exercise, result and form against these rules.</label>
          <label htmlFor="ranked-upload-reason">Rejection reason</label>
          <select id="ranked-upload-reason" value={reason} disabled={saving} onChange={event => {setReason(event.target.value as RankedUploadReason | ""); setConfirmation(null);}}>
            <option value="">Choose a reason if rejecting</option>
            {Object.entries(rankedUploadReasons).map(([code, label]) => <option key={code} value={code}>{label}</option>)}
          </select>
          <p className="small muted">While this review is pending, the video stays private, earns no points, and the athlete’s current personal best stays in place.</p>
          <div className="decision-actions"><button className="button secondary" disabled={saving || !validRejection}
            onClick={() => void decide(false)}>Reject upload</button>
            <button className="button primary" disabled={!watched || !preview || saving} onClick={() => setConfirmation("approve")}>Approve upload</button></div>
        </>}
      {error && <p className="notice error" role="alert">{error}</p>}
    </div></div>
    {confirmation && <div className="dialog-backdrop"><div className="dialog" role="dialog" aria-modal="true" aria-label="Confirm ranked upload decision">
      <h2>Approve this ranked upload?</h2>
      <p>The upload can be published and counted in rankings after the remaining publication checks pass.</p>
      <div className="decision-actions"><button className="button secondary" disabled={saving} onClick={() => setConfirmation(null)}>Cancel</button>
        <button className="button primary" disabled={saving} onClick={() => void decide(true)}>{saving ? "Saving…" : "Confirm decision"}</button></div>
    </div></div>}
  </section>;
}
