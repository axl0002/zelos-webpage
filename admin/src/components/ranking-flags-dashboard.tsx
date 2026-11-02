"use client";
import RankingCorrectionEditor from "./ranking-correction-editor";
import HoldReviewTimeline from "./hold-review-timeline";
import {notifyAdminReviewCountsChanged} from "@/lib/admin-review-counts";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { mediaUrls } from "@/lib/review-media";
import { rankingFlagHoldTiming, rankingReasons, type RankingFlag } from "@/lib/ranking-flags";
import {parseRankingFlagGroupContext, parseRankingFlagGroupResult, type RankingFlagGroupContext} from "@/lib/ranking-flag-group";

async function api<T>(body?: unknown, signal?: AbortSignal): Promise<T> {
  const response = await fetch(`/admin/api/ranking-flags${body === undefined ? "" : "/decision"}`, {
    method: body === undefined ? "GET" : "POST", cache: "no-store", signal,
    headers: body === undefined ? undefined : {"Content-Type":"application/json"},
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Could not load ranking flags. Try again.");
  if (body !== undefined) notifyAdminReviewCountsChanged();
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
  return <div className="dashboard-content"><header className="page-header"><div><h1>Ranking flags</h1>
      <p className="muted">Check the reported exercise, result, hold frames or form before deciding.</p></div>
      <button className="button secondary" disabled={loading || busy} onClick={() => void refresh()}>Refresh queue</button>
    </header>
      {error && <p className="notice error" role="alert">{error}</p>}
      {notice && <p className="notice success" role="status">{notice}</p>}
      <div className="review-layout"><section className="queue-panel" aria-label="Ranking flags">
        {loading && !queue.length && <p className="empty">Loading flags…</p>}
        {!loading && !queue.length && <p className="empty">No ranking flags awaiting review.</p>}
        {queue.map(item => <button className={`candidate ${item.id === selected ? "selected" : ""}`} key={item.id}
          disabled={busy} aria-pressed={item.id === selected} onClick={() => setSelected(item.id)}><span className="candidate-copy"><strong>{item.username} · {item.board_name}</strong>
          <span>{rankingReasons[item.reason]}</span><small>Reported by: {item.reporter_username ? `@${item.reporter_username}` : "Username unavailable"}</small></span></button>)}
      </section>
        {current ? <FlagReview key={current.id} item={current} onBusy={setBusy} onSaved={(confirmed, resolvedIds) => {
          if(confirmed==="timing_updated"){void refresh();setNotice("Hold timing corrected. This flag is still open for its original issue.");return;}
          const closed = new Set(resolvedIds ?? [current.id]);
          setQueue(old => old.filter(item => !closed.has(item.id))); setSelected(null);
          if (resolvedIds) void refresh();
          setNotice(resolvedIds && resolvedIds.length > 1 ? `${resolvedIds.length} flags closed. ${confirmed ? "The ranking was rejected and the uploader received your reason once." : "The ranking stays unchanged."}` : confirmed === "corrected" ? "Ranking corrected. The video stays published and the uploader has been notified." : confirmed ? "Ranking rejected. The uploader has been notified with your reason." : "Flag dismissed. The ranking is unchanged.");
        }} /> : <section className="review-panel"><p className="empty">Select a ranking flag to review its evidence.</p></section>}
      </div>
    </div>;
}
function FlagReview({item, onSaved, onBusy}: {item: RankingFlag; onSaved: (confirmed: boolean|"corrected"|"timing_updated", resolvedIds?: string[]) => void; onBusy: (busy: boolean) => void}) {
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
  const [refreshRequired, setRefreshRequired] = useState(false);
  const savingRef = useRef(false);
  const [confirm, setConfirm] = useState<boolean | null>(null);
  const [related, setRelated] = useState<RankingFlagGroupContext | null>(null);
  const [checkingRelated, setCheckingRelated] = useState(false);
  const [relatedError, setRelatedError] = useState("");
  const [applyAll, setApplyAll] = useState(false);
  const [singleOnly, setSingleOnly] = useState(false);
  const relatedRequest = useRef<AbortController | null>(null);
  const relatedVersion = useRef(0);
  function closeConfirmation() {
    relatedVersion.current++; relatedRequest.current?.abort();
    setConfirm(null); setRelated(null); setApplyAll(false); setSingleOnly(false); setCheckingRelated(false); setRelatedError("");
  }
  async function loadRelated() {
    relatedRequest.current?.abort();
    const request = new AbortController(), version = ++relatedVersion.current;
    relatedRequest.current = request;
    setCheckingRelated(true); setRelated(null); setRelatedError(""); setApplyAll(false); setSingleOnly(false);
    const timeout = setTimeout(() => {
      if (relatedVersion.current === version) {
        setRelatedError("The related-flag check took too long. Retry or continue with this flag only."); setCheckingRelated(false);
      }
      request.abort();
    }, 15000);
    try {
      const response = await fetch(`/admin/api/ranking-flags/group-context?report_id=${encodeURIComponent(item.id)}`, {cache: "no-store", signal: request.signal});
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Related flags could not be checked.");
      const context = parseRankingFlagGroupContext(data, item.id);
      if (!context) throw new Error("Related flags could not be verified.");
      if (!request.signal.aborted && relatedVersion.current === version) setRelated(context);
    } catch (cause) {
      if (!request.signal.aborted && relatedVersion.current === version) setRelatedError((cause as Error).message);
    } finally {
      clearTimeout(timeout);
      if (!request.signal.aborted && relatedVersion.current === version) setCheckingRelated(false);
    }
  }
  function beginConfirmation(reject: boolean) {
    if (refreshRequired || savingRef.current || !watched) return;
    setConfirm(reject); void loadRelated();
  }
  useEffect(() => () => {relatedVersion.current++; relatedRequest.current?.abort();}, []);
  const [error, setError] = useState("");
  const urls = mediaUrls(item);
  const videoRef = useRef<HTMLVideoElement>(null);
  const timing = rankingFlagHoldTiming(item);
  const [source, setSource] = useState(0);
  useLayoutEffect(() => {
    // A successful refresh supplies a new evidence snapshot, even for the same
    // report. Retry its media and require review again; retain the edited note.
    setSource(0); setWatched(false); closeConfirmation(); setRefreshRequired(false); setError("");
  }, [item]);
  const unavailable = item.review_unavailable === true;
  const canReject = item.submission_status === "eligible" && !unavailable;
  async function decide() {
    if (confirm === null || refreshRequired || savingRef.current || checkingRelated || (!related && !singleOnly) || (applyAll && !related) || !watched || (!urls[source] && !unavailable) ||
      (confirm && (!canReject || !validRejection || (frameFlag && !timing)))) return;
    savingRef.current = true;
    setSaving(true); onBusy(true); setError("");
    try {
      const decision = {report_id: item.id, confirmed: confirm, review_note: note, watched_video: watched && !unavailable, rule_ids: confirm ? chosen.map(rule => rule.id) : []};
      if (applyAll && related) {
        const response = await fetch("/admin/api/ranking-flags/decision/group/v1", {method: "POST", cache: "no-store", headers: {"Content-Type": "application/json"}, body: JSON.stringify({...decision, expected_open_report_ids: related.open_report_ids})});
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "The group decision could not be saved. Refresh the queue before retrying.");
        const result = parseRankingFlagGroupResult(data, related.open_report_ids, confirm);
        if (!result) throw new Error("The saved group decision could not be verified. Refresh the queue before retrying.");
        notifyAdminReviewCountsChanged(); onSaved(confirm, result.resolved_report_ids);
      } else {await api(decision); onSaved(confirm);}
    }
    catch (cause) {
      if (applyAll) {
        setRefreshRequired(true); setWatched(false);
        setError((cause as Error).message);
      } else setError((cause as Error).message);
      closeConfirmation();
    }
    finally { savingRef.current = false; setSaving(false); onBusy(false); }
  }
  return <section className="review-panel ranking-flag-detail"><h2>{item.board_name}</h2>
    <p>Reported by: {item.reporter_username ? `@${item.reporter_username}` : "Username unavailable"}</p>
    <p>{item.username} · Current result: {item.claimed_value} {item.metric ?? item.board_metric}</p>
    {item.reported_value!=null&&item.reported_value!==item.claimed_value&&<p>Result when reported: {item.reported_value} {item.metric??item.board_metric}. This measurement has since changed.</p>}
    {source < urls.length ? <video ref={videoRef} key={urls[source]} controls playsInline preload="metadata" src={urls[source]}
      aria-label="Reported clip" onError={() => { setSource(old => old + 1); setWatched(false); closeConfirmation(); }} />
      : <p role="alert">Video unavailable. Refresh the queue before reviewing.</p>}
    {(item.metric ?? item.board_metric) === "seconds" && <HoldReviewTimeline key={`${item.id}:${item.measurement_revision}:${urls[source]}`} videoRef={videoRef} source={urls[source] ?? ""} timing={item.hold_timing} disabled={saving} label="Current upload hold frames" />}
    {timing?.snapshot && <div className="playback-tools hold-boundary-tools" aria-label="Reported hold timing">
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
    <label><input type="checkbox" checked={watched} disabled={saving || refreshRequired || (!urls[source] && !unavailable)}
      onChange={event => {setWatched(event.target.checked); closeConfirmation();}} /> {unavailable ? "I reviewed the available report evidence" : "I watched the clip and checked the reported issue"}</label>
    {choices.length > 0 && <fieldset disabled={saving}><legend>Rules verified as not met</legend>
      {choices.map(rule => <label className="check" key={rule.id}><input type="checkbox" checked={selectedRules.includes(rule.id)}
        disabled={saving || (selectedRules.length >= 8 && !selectedRules.includes(rule.id))}
        onChange={event => {setSelectedRules(old => event.target.checked ? [...old, rule.id] : old.filter(id => id !== rule.id)); closeConfirmation();}} />
        {rule.type === "form" ? "Form" : "Filming"}: {rule.text}</label>)}
    </fieldset>}
    <label htmlFor="ranking-rejection-note">Review note shown to the uploader</label>
    <textarea id="ranking-rejection-note" value={note} maxLength={1000} rows={4} disabled={saving}
      onChange={event => {setNote(event.target.value); closeConfirmation();}} />
    {canReject&&(item.board_metric==="seconds"||["incorrect_measurement","incorrect_start_frame","incorrect_end_frame","incorrect_hold_frames"].includes(item.reason))&&<RankingCorrectionEditor key={`${item.id}:${item.measurement_revision}:${item.media_fingerprint}:${urls[source]}`} item={item} videoRef={videoRef} watched={watched} note={note} disabled={saving||refreshRequired||!urls[source]} onBusy={value=>{setSaving(value);onBusy(value);}} onSaved={resolved=>onSaved(resolved?"corrected":"timing_updated")}/>}
    <p className="muted">Confirm only the issues you verified. Rejecting removes this result from rankings and hides the video from feeds and the athlete’s profile.</p>
    {error && <p role="alert" className="error">{error}</p>}
    {refreshRequired && <p className="muted">Refresh queue before trying another decision.</p>}
    <div className="actions"><button className="button secondary" disabled={!watched || saving || refreshRequired}
      onClick={() => beginConfirmation(false)}>Dismiss flag</button>
      <button className="button danger" disabled={!watched || saving || refreshRequired || !canReject || !validRejection || (frameFlag && !timing)}
        onClick={() => beginConfirmation(true)}>Reject ranking</button></div>
    {confirm !== null && <div className="dialog-backdrop"><div className="dialog" role="dialog" aria-modal="true" aria-label="Confirm ranking decision">
      <h2>{confirm ? "Reject this ranking?" : "Dismiss this flag?"}</h2>
      <ul>{confirm && chosen.map(rule => <li key={rule.id}>{rule.text}</li>)}</ul>
      <p>{confirm ? `The uploader will receive this reason: ${note.trim() || chosen.map(rule => rule.text).join("; ")}` : "The ranking stays unchanged."}</p>
      {checkingRelated && <p role="status">Checking other open flags for this submission…</p>}
      {related && related.other_open_count > 0 && <>
        <label className="check"><input type="checkbox" checked={applyAll} disabled={saving} onChange={event => setApplyAll(event.target.checked)} /> Apply to all {related.other_open_count} other {related.other_open_count === 1 ? "flag" : "flags"} for this submission</label>
        <p className="small muted">{applyAll ? confirm ? `Reject the ranking once and close all ${related.open_report_ids.length} flags. The uploader receives one notification.` : `Dismiss all ${related.open_report_ids.length} flags. The ranking stays unchanged.` : "Only this flag will be resolved unless you select the option above."}</p>
      </>}
      {related && related.other_open_count === 0 && <p className="small muted">There are no other open flags for this submission.</p>}
      {relatedError && <div><p role="alert">{relatedError}</p><p className="small muted">Retry the related-flag check, or explicitly continue with this flag only.</p>
        <button className="button secondary" disabled={saving} onClick={() => void loadRelated()}>Retry related flags</button>
        <button className="button secondary" disabled={saving || singleOnly} onClick={() => {setSingleOnly(true); setApplyAll(false);}}>Continue with this flag only</button>
        {singleOnly && <p>Only this flag will be resolved.</p>}
      </div>}
      <button className="button secondary" disabled={saving} onClick={closeConfirmation}>Cancel</button>
      <button className="button primary" disabled={saving || checkingRelated || (!related && !singleOnly)} onClick={() => void decide()}>{saving ? "Saving…" : "Confirm decision"}</button>
    </div></div>}
  </section>;
}
