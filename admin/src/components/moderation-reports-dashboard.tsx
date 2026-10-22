"use client";
import {notifyAdminReviewCountsChanged} from "@/lib/admin-review-counts";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {ReviewCountBadge} from "./admin-review-counts";
import type { ModerationReport } from "@/lib/moderation-reports";
import ModerationActionForm from "./moderation-action-form";

async function api<T>(path = "", body?: unknown, signal?: AbortSignal): Promise<T> {
  const response = await fetch(`/admin/api/reports${path}`, {
    method: body === undefined ? "GET" : "POST", cache: "no-store", signal,
    headers: body === undefined ? undefined : {"Content-Type": "application/json"},
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "The reports could not load. Please try again.");
  if (path === "/decision" || path === "/action") notifyAdminReviewCountsChanged();
  return data;
}
type Preview = {title: string; caption: string; username: string; urls: string[]};
export default function ModerationReportsDashboard() {
  const [queue, setQueue] = useState<ModerationReport[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [loading, setLoading] = useState(true), [busy, setBusy] = useState(false);
  const [error, setError] = useState(""), [notice, setNotice] = useState("");
  async function refresh(signal?: AbortSignal, preferredId?: string) {
    setLoading(true); setError("");
    try {
      const items = await api<ModerationReport[]>("", undefined, signal);
      if (signal?.aborted) return;
      setQueue(items); setSelected(old => items.some(item => item.id === (preferredId ?? old)) ? preferredId ?? old : items[0]?.id ?? null);
    } catch (cause) { if (!signal?.aborted) setError((cause as Error).message); }
    finally { if (!signal?.aborted) setLoading(false); }
  }
  useEffect(() => {
    const controller = new AbortController(); void refresh(controller.signal);
    return () => controller.abort();
  }, []);
  const current = queue.find(item => item.id === selected);
  return <div className="dashboard-content"><header className="page-header"><div><p className="eyebrow">CONTENT MODERATION</p><h1>User reports</h1>
      <p className="muted">Reports about posts, comments and profiles, including the original answers and timestamps. Up to 50 recent cases are shown, with open reports first.</p></div>
      <Link className="button secondary" href="/admin/reports/legacy" aria-label="Legacy reports" aria-describedby="legacy-report-count">Legacy reports <ReviewCountBadge kind="legacy_reports" id="legacy-report-count" /></Link>
      <button className="button secondary" disabled={loading || busy} onClick={() => void refresh()}>Refresh queue</button>
    </header>
      {error && <p role="alert" className="notice error">{error}</p>}
      {notice && <p role="status" className="notice success">{notice}</p>}
      <div className="review-layout"><section className="queue-panel" aria-label="User report queue">
        {loading && !queue.length && <p className="empty">Loading reports…</p>}
        {!loading && !queue.length && <p className="empty">No user reports.</p>}
        {queue.map(item => <button key={item.id} disabled={busy} aria-pressed={item.id === selected}
          className={`candidate ${item.id === selected ? "selected" : ""}`} onClick={() => {setSelected(item.id); setNotice("");}}>
          <span className="candidate-copy"><strong>{item.target_kind} · {item.context?.username || item.target_id}</strong>
            <span>{item.report_count} report{item.report_count === 1 ? "" : "s"} · {item.state === "open" ? "Awaiting review" : item.state}</span>
            <small>{new Date(item.created_at).toLocaleString()}</small></span>
        </button>)}
      </section>
        {current ? <ReportDetail key={`${current.id}:${current.revision}:${current.state}`} item={current} onBusy={setBusy} onActionSaved={() => {
          setQueue([]); setSelected(null); setNotice("Moderation action saved."); void refresh(undefined, current.id);
        }} onSaved={(confirmed, note) => {
          setQueue([]); setSelected(null); void refresh(undefined, current.id);
          setNotice(confirmed ? "Violation confirmed. The moderation decision was saved." : "Reports dismissed. Content hidden by these reports can be restored.");
        }} /> : <section className="review-panel"><p className="empty">Select a report to review.</p></section>}
      </div>
    </div>;
}
function ReportDetail({item, onBusy, onSaved, onActionSaved}: {item: ModerationReport; onBusy: (value: boolean) => void; onSaved: (confirmed: boolean, note: string) => void; onActionSaved: () => void}) {
  const [preview, setPreview] = useState<Preview | null>(null), [opening, setOpening] = useState(false);
  const [source, setSource] = useState(0), [reviewed, setReviewed] = useState(false);
  const [note, setNote] = useState(item.decision_note ?? ""), [confirm, setConfirm] = useState<boolean | null>(null);
  const [saving, setSaving] = useState(false), [error, setError] = useState("");
  const previewRequest = useRef<AbortController | null>(null), savingRef = useRef(false), video = useRef<HTMLVideoElement | null>(null);
  const open = item.state === "open";
  const available = item.target_kind === "post" ? !!preview?.urls[source] : !!item.context;
  useEffect(() => () => previewRequest.current?.abort(), []);
  async function loadPreview() {
    previewRequest.current?.abort(); const controller = new AbortController(); previewRequest.current = controller;
    setOpening(true); setError(""); setReviewed(false); setConfirm(null); setPreview(null); setSource(0);
    try { const result = await api<Preview>("/preview", {case_id: item.id}, controller.signal); if (!controller.signal.aborted) setPreview(result); }
    catch (cause) { if (!controller.signal.aborted) setError((cause as Error).message); }
    finally { if (!controller.signal.aborted) setOpening(false); }
  }
  async function decide() {
    if (confirm === null || savingRef.current || !open || !reviewed || (confirm && (!available || note.trim().length < 3))) return;
    savingRef.current = true; setSaving(true); onBusy(true); setError("");
    try {
      await api("/decision", {case_id: item.id, expected_revision: item.revision, confirmed: confirm, decision_note: note.trim(), reviewed_content: true});
      onSaved(confirm, note.trim());
    } catch (cause) { setError((cause as Error).message); setConfirm(null); }
    finally { savingRef.current = false; setSaving(false); onBusy(false); }
  }
  const effect = item.target_kind === "post" ? "The post is removed from public access and rankings. A confirmed post violation awards one strike."
    : item.target_kind === "comment" ? "The comment is removed from public access."
      : "This records the confirmed profile report and notifies the account owner. Profile restrictions are not applied automatically.";
  return <section className="review-panel" aria-label="User report detail">
    <div className="clip-heading"><div><p className="eyebrow">{item.target_kind.toUpperCase()} REPORT</p><h2>{item.context?.username || item.target_id}</h2></div>
      <span className="badge">{open ? "Awaiting review" : item.state}</span></div>
    {item.target_kind === "post" ? <>
      {preview?.urls[source] ? <div className="video-frame"><video key={preview.urls[source]} ref={video} controls playsInline preload="metadata"
        src={preview.urls[source]} aria-label="Reported post" onError={() => {setSource(old => old + 1); setReviewed(false); setConfirm(null);}} /></div>
        : <button className="button secondary" disabled={opening || saving} onClick={() => void loadPreview()}>{opening ? "Opening…" : "Open reported post"}</button>}
      {preview && <><h3>{preview.title}</h3><p>{preview.username}</p><p className="review-rule-copy">{preview.caption}</p>
        {!preview.urls[source] && <p role="alert">Video unavailable. Open the post again before reviewing.</p>}</>}
    </> : <div className="notice"><p className="review-rule-copy">{item.context?.body || "This content is no longer available for review."}</p></div>}
    <h3>Report evidence</h3>
    {item.reports.map(report => <article className="notice" key={report.id}>
      <strong>{report.answers_snapshot.category?.label || report.reason}</strong>
      <p>Reported by: {report.reporter_username ? `@${report.reporter_username}` : "Username unavailable"}</p>
      <ul>{report.answers_snapshot.options.map((option, index) => <li key={index}>{option.label}</li>)}</ul>
      {report.answers_snapshot.locations.length > 0 && <p>Location: {report.answers_snapshot.locations.map(location => location.label).join(", ")}</p>}
      {report.timestamp_ms !== null && <button className="button text" disabled={!preview?.urls[source] || saving} onClick={() => {
        if (video.current) {video.current.pause(); video.current.currentTime = report.timestamp_ms! / 1000;}
      }}>Timestamp: {(report.timestamp_ms / 1000).toFixed(3)} s</button>}
      {report.details && <p className="review-rule-copy">{report.details}</p>}
      <small>{new Date(report.created_at).toLocaleString()}</small>
    </article>)}
    {item.report_count > item.reports.length && <p className="muted">Showing the latest {item.reports.length} of {item.report_count} reports for this content.</p>}
    <p className="muted">{effect}</p>
    {open ? <div className="decision-form">
      <label className="check"><input type="checkbox" disabled={saving} checked={reviewed} onChange={event => {setReviewed(event.target.checked); setConfirm(null);}} />I reviewed the available content and report evidence.</label>
      <label htmlFor="report-decision-note">Decision note</label><textarea id="report-decision-note" rows={4} maxLength={2000} disabled={saving} value={note}
        placeholder="Required when confirming a violation" onChange={event => {setNote(event.target.value); setConfirm(null);}} />
      <div className="decision-actions"><button className="button secondary" disabled={!reviewed || saving} onClick={() => setConfirm(false)}>Dismiss reports</button>
        <button className="button danger" disabled={!reviewed || !available || saving || note.trim().length < 3} onClick={() => setConfirm(true)}>Confirm violation</button></div>
    </div> : <p className="notice">Decision: {item.state}. {item.decision_note}</p>}
    {item.context?.post_state && <p>Post status: {item.context.post_state}</p>}
    {item.context?.owner_banned && <p>Account status: Banned</p>}
    <ModerationActionForm onBusy={onBusy} onSaved={onActionSaved} onSubmit={async (action, reason, requestId, durationDays) => {
      await api("/action", {case_id: item.id, expected_revision: item.revision, action, reason, request_id: requestId, duration_days: durationDays});
    }} actions={[
      ...(item.context?.can_hide ? [{id: "hide", label: "Hide video", effect: "Hide this video from public feeds and rankings. An administrator can restore it later."}] : []),
      ...(item.context?.can_restore ? [{id: "restore", label: "Restore video", effect: "Remove this manual video restriction. Other safety decisions, reports and account bans still apply."}] : []),
      ...(item.context?.can_delete ? [{id: "delete", label: "Delete video", danger: true, effect: "Permanently remove this video from the new Zelos app and rankings. It cannot be restored. Newly uploaded media is queued for deletion; shared legacy media remains for existing app users."}] : []),
      ...(item.context?.can_ban ? [{id: "ban", label: "Ban user", danger: true, effect: "Ban the owner of the reported content from Zelos and hide their posts from public feeds and rankings."}] : []),
    ]} />
    {error && <p role="alert" className="notice error">{error}</p>}
    {confirm !== null && <div className="dialog-backdrop"><div className="dialog" role="dialog" aria-modal="true" aria-label="Confirm report decision">
      <h2>{confirm ? "Confirm this violation?" : "Dismiss these reports?"}</h2><p>{confirm ? effect : "Content hidden by these reports can be restored; other moderation decisions still apply."}</p>
      {confirm && <p className="review-rule-copy">{note.trim()}</p>}
      <div className="decision-actions"><button className="button secondary" disabled={saving} onClick={() => setConfirm(null)}>Cancel</button>
        <button className="button primary" disabled={saving} onClick={() => void decide()}>{saving ? "Saving…" : "Confirm decision"}</button></div>
    </div></div>}
  </section>;
}
