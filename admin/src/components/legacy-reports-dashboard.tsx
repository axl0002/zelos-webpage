"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { LegacyReport } from "@/lib/legacy-reports";
import ModerationActionForm from "./moderation-action-form";
async function api(path = "", body?: unknown, signal?: AbortSignal) {
  const response = await fetch(`/admin/api/reports/legacy${path}`, {method: body === undefined ? "GET" : "POST", cache: "no-store", signal,
    headers: body === undefined ? undefined : {"Content-Type": "application/json"}, body: body === undefined ? undefined : JSON.stringify(body)});
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "The reports could not load. Please try again.");
  return data;
}
export default function LegacyReportsDashboard() {
  const [items, setItems] = useState<LegacyReport[]>([]), [selected, setSelected] = useState<string | null>(null);
  const [all, setAll] = useState(false), [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [error, setError] = useState("");
  async function refresh(signal?: AbortSignal) {
    setLoading(true); setError("");
    try {const rows: LegacyReport[] = await api("", undefined, signal); if (!signal?.aborted) setItems(rows);}
    catch (cause) {if (!signal?.aborted) setError((cause as Error).message);}
    finally {if (!signal?.aborted) setLoading(false);}
  }
  useEffect(() => {const controller = new AbortController(); void refresh(controller.signal); return () => controller.abort();}, []);
  const visible = items.filter(item => all || item.state === "open"), current = visible.find(item => item.id === selected) ?? visible[0];
  return <div className="dashboard-content"><header className="page-header"><div><p className="eyebrow">CONTENT MODERATION</p><h1>Legacy reports</h1>
    <p className="muted">Reports imported from the previous app. Missing content references are retained for manual triage.</p></div>
    <Link className="button secondary" href="/admin/reports">Current reports</Link>
    <button className="button secondary" disabled={loading || busy} onClick={() => void refresh()}>Refresh queue</button></header>
    {error && <p role="alert" className="notice error">{error}</p>}
    <label>Show<select value={all ? "all" : "open"} disabled={busy} onChange={e => setAll(e.target.value === "all")}><option value="open">Open reports</option><option value="all">All reports</option></select></label>
    <p className="muted">{visible.length} reports · {items.filter(item => item.state === "open").length} open</p>
    <div className="review-layout"><section className="queue-panel" aria-label="Legacy report queue">
      {loading && !items.length && <p className="empty">Loading reports…</p>}
      {!loading && !visible.length && <p className="empty">No reports in this queue.</p>}
      {visible.map(item => <button key={item.id} disabled={busy || loading} aria-pressed={item.id === current?.id} className={`candidate ${item.id === current?.id ? "selected" : ""}`} onClick={() => setSelected(item.id)}>
        <span className="candidate-copy"><strong>{item.target_kind === "post" ? "Video" : item.target_kind} · {item.username}</strong><span>{item.reason} · {item.state}</span>
          <small>{new Date(item.created_at).toLocaleString()}</small></span></button>)}
    </section>{current ? <Detail key={`${current.id}:${current.revision}`} item={current} locked={busy || loading} onBusy={setBusy} onSaved={() => void refresh()} />
      : <section className="review-panel"><p className="empty">Select a report to review.</p></section>}</div></div>;
}
function Detail({item, locked, onBusy, onSaved}: {item: LegacyReport; locked: boolean; onBusy: (v: boolean) => void; onSaved: () => void}) {
  const [note, setNote] = useState(item.review_note ?? ""), [reviewed, setReviewed] = useState(false), [error, setError] = useState("");
  const pending = useRef(false);
  async function decide(decision: "reviewed" | "dismissed") {
    if (pending.current || locked || !reviewed || note.trim().length < 3) return;
    pending.current = true; onBusy(true); setError("");
    try {await api("/decision", {report_id: item.id, expected_revision: item.revision, decision, note: note.trim(), reviewed_evidence: true}); onSaved();}
    catch (cause) {setError((cause as Error).message);}
    finally {pending.current = false; onBusy(false);}
  }
  return <section className="review-panel" aria-label="Legacy report detail"><div className="clip-heading"><h2>{item.username}</h2><span className="badge">{item.state}</span></div>
    <h3>{item.reason}</h3><p className="muted">{new Date(item.created_at).toLocaleString()}</p>
    {item.details && <p className="review-rule-copy">{item.details}</p>}
    {!item.target_id ? <p className="notice">{item.target_kind === "post" ? "The original report has no video ID. The reported video cannot be identified safely." : "The reported content is no longer available or could not be matched safely."}</p>
      : !item.target_available ? <p className="notice">The reported content is no longer available.</p> : <p className="review-rule-copy">{item.body || "No text attached to this content."}</p>}
    {!item.reporter_available && <p className="muted small">The original reporter account is unavailable. Their report evidence has been preserved.</p>}
    {item.state === "open" ? <><p className="muted">Marking a report reviewed or dismissed records your triage decision. It does not hide content, issue a strike or notify the user.</p>
      <label><input type="checkbox" checked={reviewed} disabled={locked} onChange={e => setReviewed(e.target.checked)} /> I reviewed the available evidence and missing references.</label>
      <label>Review note<textarea value={note} maxLength={2000} rows={3} disabled={locked} onChange={e => setNote(e.target.value)} /></label>
      {error && <p role="alert" className="notice error">{error}</p>}
      <div className="decision-actions"><button className="button primary" disabled={locked || !reviewed || note.trim().length < 3} onClick={() => void decide("reviewed")}>Mark reviewed</button>
        <button className="button secondary" disabled={locked || !reviewed || note.trim().length < 3} onClick={() => void decide("dismissed")}>Dismiss report</button></div>
      {item.can_ban && <fieldset disabled={locked} style={{border: 0, padding: 0, minWidth: 0}}><ModerationActionForm actions={[{id: "ban", label: "Ban user", effect: "Restricts this reported account. Posts and interactions remain stored; an administrator can reverse the ban.", danger: true}]}
        onBusy={onBusy} onSaved={onSaved} onSubmit={async (_action, reason, requestId, durationDays) => {await api("/ban", {report_id: item.id, expected_revision: item.revision, reason, request_id: requestId, duration_days: durationDays});}} /></fieldset>}
    </> : <p className="review-rule-copy">{item.review_note}</p>}
  </section>;
}
