"use client";
import ReviewQueueNav from "./review-queue-nav";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { mediaUrls } from "@/lib/review-media";
import { rankingFlagHoldTiming, rankingReasons, type RankingFlag } from "@/lib/ranking-flags";

async function api<T>(body?: unknown, signal?: AbortSignal): Promise<T> {
  const response = await fetch(`/admin/api/ranking-flags${body === undefined ? "" : "/decision"}`, {
    method: body === undefined ? "GET" : "POST", cache: "no-store", signal,
    headers: body === undefined ? undefined : {"Content-Type":"application/json"},
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Could not load ranking flags. Try again.");
  return data;
}
export default function RankingFlagsDashboard() {
  const [queue, setQueue] = useState<RankingFlag[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  async function refresh(signal?: AbortSignal) {
    setLoading(true); setError("");
    try {
      const items = await api<RankingFlag[]>(undefined, signal);
      if (signal?.aborted) return;
      setQueue(items);
      setSelected(old => items.some(item => item.id === old) ? old : items[0]?.id ?? null);
    } catch (cause) { if (!signal?.aborted) setError((cause as Error).message); }
    finally { if (!signal?.aborted) setLoading(false); }
  }
  useEffect(() => {
    const controller = new AbortController(); void refresh(controller.signal);
    return () => controller.abort();
  }, []);
  const current = queue.find(item => item.id === selected);
  return <div className="workspace">
    <aside className="sidebar"><a className="brand" href="/admin">Zelos</a>
      <a href="/admin" className="nav-item">Exercise review</a>
      <a href="/admin/safety" className="nav-item">Upload safety</a>
      <a href="/admin/ranked-uploads" className="nav-item">Ranked uploads</a>
        <a href="/admin/ranking-flags" className="nav-item active">Ranking flags</a>
      <a href="/admin/users" className="nav-item">Users</a>
      <a href="/admin/reports" className="nav-item">User reports</a>
    </aside>
    <main className="main"><header className="page-header"><div><h1>Ranking flags</h1>
      <p className="muted">Check the reported exercise, result, hold frames or form before deciding.</p></div>
      <button className="button secondary" disabled={loading || busy} onClick={() => void refresh()}>Refresh queue</button>
    </header>
      <ReviewQueueNav active="/admin/ranking-flags" />
      {error && <p className="error" role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}
      <div className="review-layout"><section className="queue-panel" aria-label="Ranking flags">
        {loading && !queue.length && <p className="empty">Loading flags…</p>}
        {!loading && !queue.length && <p className="empty">No ranking flags awaiting review.</p>}
        {queue.map(item => <button className={`candidate ${item.id === selected ? "selected" : ""}`} key={item.id}
          disabled={busy} aria-pressed={item.id === selected} onClick={() => setSelected(item.id)}><span className="candidate-copy"><strong>{item.username} · {item.board_name}</strong>
          <span>{rankingReasons[item.reason]}</span></span></button>)}
      </section>
        {current && <FlagReview key={current.id} item={current} onBusy={setBusy} onSaved={confirmed => {
          setQueue(old => old.filter(item => item.id !== current.id)); setSelected(null);
          setNotice(confirmed ? "Ranking rejected. The uploader has been notified with your reason." : "Flag dismissed. The ranking is unchanged.");
        }} />}
      </div>
    </main>
  </div>;
}
function FlagReview({item, onSaved, onBusy}: {item: RankingFlag; onSaved: (confirmed: boolean) => void; onBusy: (busy: boolean) => void}) {
  const [note, setNote] = useState(item.details || rankingReasons[item.reason] || "");
  const ruleType = item.reason === "unacceptable_form" ? "form" : item.reason === "unacceptable_filming" ? "filming" : null;
  const frameFlag = ["incorrect_start_frame", "incorrect_end_frame", "incorrect_hold_frames"].includes(item.reason);
  const choices = frameFlag ? [] : item.rules.filter(rule => ruleType === null || rule.type === ruleType);
  const [selectedRules, setSelectedRules] = useState<string[]>(item.rule_violations
    .filter(rule => choices.some(current => current.id === rule.id)).map(rule => rule.id));
  const chosen = choices.filter(rule => selectedRules.includes(rule.id));
  const validRejection = (ruleType && choices.length > 0 ? chosen.length > 0 : note.trim().length >= 3 || chosen.length > 0);
  const [watched, setWatched] = useState(false);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const [confirm, setConfirm] = useState<boolean | null>(null);
  const [error, setError] = useState("");
  const urls = mediaUrls(item);
  const videoRef = useRef<HTMLVideoElement>(null);
  const timing = rankingFlagHoldTiming(item);
  const [source, setSource] = useState(0);
  useLayoutEffect(() => {
    // A successful refresh supplies a new evidence snapshot, even for the same
    // report. Retry its media and require review again; retain the edited note.
    setSource(0); setWatched(false); setConfirm(null); setError("");
  }, [item]);
  const unavailable = item.review_unavailable === true;
  const canReject = item.submission_status === "eligible" && !unavailable;
  async function decide() {
    if (confirm === null || savingRef.current || !watched || (!urls[source] && !unavailable) ||
      (confirm && (!canReject || !validRejection || (frameFlag && !timing)))) return;
    savingRef.current = true;
    setSaving(true); onBusy(true); setError("");
    try { await api({ report_id: item.id, confirmed: confirm, review_note: note, watched_video: watched && !unavailable, rule_ids: confirm ? chosen.map(rule => rule.id) : [] }); onSaved(confirm); }
    catch (cause) { setError((cause as Error).message); setConfirm(null); }
    finally { savingRef.current = false; setSaving(false); onBusy(false); }
  }
  return <section className="review-panel ranking-flag-detail"><h2>{item.board_name}</h2>
    <p>{item.username} · Listed result: {item.reported_value ?? item.claimed_value} {item.metric ?? item.board_metric}</p>
    {source < urls.length ? <video ref={videoRef} key={urls[source]} controls playsInline preload="metadata" src={urls[source]}
      aria-label="Reported clip" onError={() => { setSource(old => old + 1); setWatched(false); setConfirm(null); }} />
      : <p role="alert">Video unavailable. Refresh the queue before reviewing.</p>}
    {timing && <div className="playback-tools" aria-label="Reported hold timing">
      <p>{timing.snapshot ? "Reported hold boundaries" : "Selected hold boundaries"} · {(timing.duration_ms / 1000).toFixed(3)} s</p>
      {(["start_ms", "end_ms"] as const).map(boundary => <button key={boundary}
        className="button secondary" disabled={saving || !urls[source]}
        onClick={() => {
          const video = videoRef.current;
          if (video) {
            video.pause();
            video.currentTime = timing[boundary] / 1000;
          }
        }}>{boundary === "start_ms" ? "Hold start" : "Hold end"} · {(timing[boundary] / 1000).toFixed(3)} s</button>)}
    </div>}
    {frameFlag && !timing && <p role="alert">The reported hold boundaries are unavailable. Refresh the queue before reviewing.</p>}
    <h3>{rankingReasons[item.reason]}</h3>
    {item.corrected_value !== null && <p>Suggested correction: {item.corrected_value} {item.metric}</p>}
    {item.rule_violations.length > 0 && <ul>{item.rule_violations.map(rule => <li key={rule.id}>{rule.text}</li>)}</ul>}
    {item.details && <p>{item.details}</p>}
    {!canReject && <p>{unavailable ? "The ranked content is no longer available for review. You can inspect the report evidence and dismiss the flag; this does not change rankings." : "This result is no longer eligible for ranking. You can dismiss this flag."}</p>}
    <label><input type="checkbox" checked={watched} disabled={saving || (!urls[source] && !unavailable)}
      onChange={event => {setWatched(event.target.checked); setConfirm(null);}} /> {unavailable ? "I reviewed the available report evidence" : "I watched the clip and checked the reported issue"}</label>
    {choices.length > 0 && <fieldset disabled={saving}><legend>Rules verified as not met</legend>
      {choices.map(rule => <label className="check" key={rule.id}><input type="checkbox" checked={selectedRules.includes(rule.id)}
        disabled={saving || (selectedRules.length >= 8 && !selectedRules.includes(rule.id))}
        onChange={event => {setSelectedRules(old => event.target.checked ? [...old, rule.id] : old.filter(id => id !== rule.id)); setConfirm(null);}} />
        {rule.type === "form" ? "Form" : "Filming"}: {rule.text}</label>)}
    </fieldset>}
    <label htmlFor="ranking-rejection-note">Reason shown to the uploader if rejected</label>
    <textarea id="ranking-rejection-note" value={note} maxLength={1000} rows={4} disabled={saving}
      onChange={event => {setNote(event.target.value); setConfirm(null);}} />
    <p className="muted">Confirm only the issues you verified. Rejecting removes this result from rankings; the post and video remain available.</p>
    {error && <p role="alert" className="error">{error}</p>}
    <div className="actions"><button className="button secondary" disabled={!watched || saving}
      onClick={() => setConfirm(false)}>Dismiss flag</button>
      <button className="button danger" disabled={!watched || saving || !canReject || !validRejection || (frameFlag && !timing)}
        onClick={() => setConfirm(true)}>Reject ranking</button></div>
    {confirm !== null && <div className="dialog-backdrop"><div className="dialog" role="dialog" aria-modal="true" aria-label="Confirm ranking decision">
      <h2>{confirm ? "Reject this ranking?" : "Dismiss this flag?"}</h2>
      <ul>{confirm && chosen.map(rule => <li key={rule.id}>{rule.text}</li>)}</ul>
      <p>{confirm ? `The uploader will receive this reason: ${note.trim() || chosen.map(rule => rule.text).join("; ")}` : "The ranking stays unchanged."}</p>
      <button className="button secondary" disabled={saving} onClick={() => setConfirm(null)}>Cancel</button>
      <button className="button primary" disabled={saving} onClick={() => void decide()}>{saving ? "Saving…" : "Confirm decision"}</button>
    </div></div>}
  </section>;
}
