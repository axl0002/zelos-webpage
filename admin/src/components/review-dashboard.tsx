"use client";
import {notifyAdminReviewCountsChanged} from "@/lib/admin-review-counts";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Board, Candidate, Decision, QueuePage } from "@/lib/review-types";
import { mediaUrls } from "@/lib/review-media";
import timingStyles from "./review-hold-timing.module.css";

async function api<T>(
  path: string,
  body?: unknown,
  signal?: AbortSignal,
): Promise<T> {
  const response = await fetch(`/admin/api/${path}`, {
    method: body === undefined ? "GET" : "POST",
    cache: "no-store",
    signal,
    headers:
      body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok)
    throw new Error(data.error || "Something went wrong. Try again.");
  if (path === "review/decision") notifyAdminReviewCountsChanged();
  return data as T;
}
export default function ReviewDashboard({
  boards,
}: {
  boards: Board[];
}) {
  const [status, setStatus] = useState("pending"),
    [exercise, setExercise] = useState(""),
    [search, setSearch] = useState("");
  const [cursor, setCursor] = useState<string | null>(null),
    [history, setHistory] = useState<(string | null)[]>([]);
  const [{ page, selected }, setQueue] = useState<{
    page: QueuePage | null;
    selected: string | null;
  }>({ page: null, selected: null });
  const [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const [refresh, setRefresh] = useState({ revision: 0, background: false }),
    [refreshing, setRefreshing] = useState(false),
    [scanning, setScanning] = useState(false),
    [scanProgress, setScanProgress] = useState("");
  const scanAbort = useRef<AbortController | null>(null);
  const loadedQuery = useRef<string | null>(null);
  const queryEpoch = useRef(0);
  function reload(background = false) {
    queryEpoch.current++;
    setRefresh((v) => ({ revision: v.revision + 1, background }));
  }
  const exercises = [
    ...new Map(boards.map((b) => [b.exercise_id, b.exercise_name])).entries(),
  ];
  useEffect(() => () => scanAbort.current?.abort(), []);
  useEffect(() => {
    const abort = new AbortController();
    const epoch = ++queryEpoch.current;
    const current = () => !abort.signal.aborted && epoch === queryEpoch.current;
    const q = new URLSearchParams({ status, exercise, q: search, order: "difficulty_v1" });
    if (cursor) q.set("cursor", cursor);
    setLoading(!refresh.background || loadedQuery.current !== q.toString());
    setRefreshing(true);
    setError("");
    api<QueuePage>(`review?${q}`, undefined, abort.signal)
      .then((data) => {
        if (!current()) return;
        loadedQuery.current = q.toString();
        setQueue((old) => ({
          page: data,
          selected: data.items.slice(0, 20).some((c) => c.post_id === old.selected)
            ? old.selected
            : data.items[0]?.post_id || null,
        }));
      })
      .catch((e) => {
        if (current()) setError(e.message);
      })
      .finally(() => {
        if (current()) {
          setLoading(false);
          setRefreshing(false);
        }
      });
    return () => abort.abort();
  }, [status, exercise, search, cursor, refresh]);
  function filter(action: () => void) {
    action();
    setCursor(null);
    setHistory([]);
    setQueue((old) => ({ ...old, selected: null }));
    reload();
  }
  async function scan() {
    const abort = new AbortController();
    scanAbort.current = abort;
    setScanning(true);
    setError("");
    setNotice("");
    const started = performance.now();
    let after: string | null = null,
      scanned = 0,
      queued = 0,
      rejected = 0;
    try {
      while (true) {
        const result: {
          cursor: string | null;
          scanned: number;
          queued: number;
          auto_rejected?: number;
          has_more: boolean;
        } = await api("review/scan", { after }, abort.signal);
        scanned += result.scanned;
        queued += result.queued;
        rejected += result.auto_rejected ?? 0;
        setScanProgress(
          `${scanned.toLocaleString()} clips checked · ${queued.toLocaleString()} candidates added or refreshed · ${rejected.toLocaleString()} automatically rejected`,
        );
        if (!result.has_more) break;
        after = result.cursor;
      }
      setNotice(
        `Scan complete in ${((performance.now() - started) / 1000).toFixed(1)}s. ${scanned.toLocaleString()} imported training clips checked; ${queued.toLocaleString()} candidates added or refreshed; ${rejected.toLocaleString()} automatically rejected for assistance, bad form, or added-weight keywords.`,
      );
    } catch (e) {
      if (!abort.signal.aborted) setError((e as Error).message);
    } finally {
      if (!abort.signal.aborted) {
        setScanning(false);
        reload(true);
      }
    }
  }
  const saved = useCallback((postId: string, action: string, active: boolean) => {
    // Invalidate older responses immediately, before React runs effect cleanup.
    queryEpoch.current++;
    setNotice(
      action === "skip"
        ? "Ranking rejected. The clip remains a training post."
        : active
          ? "Approved and added to the athlete’s leaderboard."
          : "Approved as a ranked clip. The athlete’s current leaderboard entry was preserved.",
    );
    setQueue((old) => {
      if (!old.page) return old;
      const index = old.page.items.findIndex((c) => c.post_id === postId && c.status === "pending");
      if (index < 0) return old;
      const items = old.page.items.filter((c) => c.post_id !== postId);
      const completedStatus = action === "approve" ? "approved" : "skipped";
      return {
        page: {
          ...old.page,
          items,
          stats: {
            ...old.page.stats,
            pending: Math.max(0, old.page.stats.pending - 1),
            [completedStatus]: old.page.stats[completedStatus] + 1,
          },
        },
        selected: old.selected === postId
          ? (items[index] ?? items[0])?.post_id ?? null
          : old.selected,
      };
    });
    setRefresh((v) => ({ revision: v.revision + 1, background: true }));
  }, []);
  const candidate = page?.items
    .slice(0, 20)
    .find((c) => c.post_id === selected);
  return (
    <div className="dashboard-content">
        <header className="page-header">
          <div>
            <p className="eyebrow">HUMAN REVIEW</p>
            <h1>Exercise review</h1>
            <p className="muted">
              Turn eligible training clips into exercise rankings. Every result
              is checked by a person.
            </p>
          </div>
          <button className="button primary" onClick={scan} disabled={scanning}>
            {scanning ? "Scanning…" : "Scan training clips"}
          </button>
        </header>
        <p className="small muted">Known difficulty and results first: hardest progression, then highest reps or hold time within each progression. Imported claims still need review; missing information follows.</p>
        {scanning && (
          <p role="status" className="notice">
            {scanProgress ||
              "Finding exercise names in titles, descriptions and existing tags…"}
          </p>
        )}
        {notice && (
          <p role="status" className="notice success">
            {notice}
          </p>
        )}
        {error && (
          <div role="alert" className="notice error">
            {error}{" "}
            <button
              className="button text"
              onClick={() => reload(true)}
            >
              Retry
            </button>
          </div>
        )}
        <div className="stats">
          {(["pending", "approved", "skipped"] as const).map((key) => (
            <button
              key={key}
              className={`stat ${status === key ? "selected" : ""}`}
              onClick={() => filter(() => setStatus(key))}
            >
              <span>
                {key === "pending"
                  ? "Awaiting review"
                  : key === "approved"
                    ? "Approved"
                    : "Rejected"}
              </span>
              <strong>{page ? page.stats[key].toLocaleString() : "—"}</strong>
            </button>
          ))}
        </div>
        <div className="toolbar">
          <h2>
            {status === "pending"
              ? "Review queue"
              : status === "approved"
                ? "Approved clips"
                : "Rejected rankings"}
          </h2>
          <div className="filter-controls">
            <select
              aria-label="Filter by exercise"
              value={exercise}
              onChange={(e) => filter(() => setExercise(e.target.value))}
            >
              <option value="">All exercises</option>
              {exercises.map(([id, name]) => (
                <option value={id} key={id}>
                  {name}
                </option>
              ))}
            </select>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                filter(() =>
                  setSearch(new FormData(e.currentTarget).get("q") as string),
                );
              }}
            >
              <input
                aria-label="Search clips"
                name="q"
                placeholder="Search title, description, athlete"
                maxLength={100}
              />
              <button className="button secondary">Search</button>
            </form>
            <button
              className="button secondary"
              onClick={() => reload()}
              disabled={loading}
            >
              Refresh
            </button>
          </div>
        </div>
        <div className="review-layout">
          <section
            className="queue-panel"
            aria-label="Candidate clips"
            aria-busy={loading}
          >
            {loading ? (
              <QueueSkeleton />
            ) : page?.items.length ? (
              page.items.slice(0, 20).map((c) => (
                <button
                  key={c.post_id}
                  className={`candidate ${selected === c.post_id ? "selected" : ""}`}
                  onClick={() => setQueue((old) => ({ ...old, selected: c.post_id }))}
                >
                  {c.poster_url ? (
                    <img src={c.poster_url} alt="" loading="lazy" />
                  ) : (
                    <span className="poster-placeholder">▷</span>
                  )}
                  <span className="candidate-copy">
                    <strong>{c.title || "Untitled clip"}</strong>
                    <span>{c.username}</span>
                    <small>
                      {c.suggestions.map((s) => s.name).join(" · ")}
                    </small>
                    {c.queue_sort?.board_name && <small>
                      {c.status === "pending" ? "Imported claim" : "Reviewed result"}: {c.queue_sort.board_name} · {c.queue_sort.measurement > 0
                        ? `${c.queue_sort.measurement}${c.queue_sort.metric === "seconds" ? "s" : " reps"}`
                        : "Result not recorded"}
                    </small>}
                  </span>
                  <span className="arrow">›</span>
                </button>
              ))
            ) : (
              <div className="empty">
                <span>✓</span>
                <h3>{refreshing ? "Loading next clips…" : "No clips in this view"}</h3>
                <p>
                  Try another filter or scan the copied training clips for more
                  candidates.
                </p>
              </div>
            )}
            <div className="pagination">
              <button
                className="button text"
                disabled={!history.length || loading}
                onClick={() => {
                  setCursor(history.at(-1) ?? null);
                  setHistory((v) => v.slice(0, -1));
                }}
              >
                ← Previous
              </button>
              <span className="small">Page {history.length + 1}</span>
              <button
                className="button text"
                disabled={loading || !page?.has_more || !page.next_cursor}
                onClick={() => {
                  setHistory((v) => [...v, cursor]);
                  setCursor(JSON.stringify(page!.next_cursor));
                }}
              >
                Next →
              </button>
            </div>
          </section>
          <section className="review-panel" aria-label="Review selected clip">
            {loading ? (
              <DetailSkeleton />
            ) : candidate ? (
              <CandidateReview
                key={`${candidate.post_id}:${candidate.revision}`}
                candidate={candidate}
                boards={boards}
                onSaved={(action, active) => saved(candidate.post_id, action, active)}
              />
            ) : (
              <div className="empty">
                <h3>{refreshing ? "Loading next clip…" : "A little attention. A fairer ranking."}</h3>
                <p>
                  Select a clip to watch it and check its exercise, progression
                  and result.
                </p>
              </div>
            )}
          </section>
        </div>
      </div>
  );
}
function QueueSkeleton() {
  return (
    <div className="queue-skeleton" aria-label="Loading clips">
      {Array.from({ length: 5 }, (_, i) => (
        <div className="candidate" key={i}>
          <div className="skeleton thumb" />
          <div className="grow">
            <div className="skeleton line" />
            <div className="skeleton line short" />
          </div>
        </div>
      ))}
    </div>
  );
}
function DetailSkeleton() {
  return (
    <div className="detail-skeleton" aria-label="Loading review">
      <div className="skeleton video" />
      <div className="skeleton line" />
      <div className="skeleton line" />
    </div>
  );
}
export function CandidateReview({
  candidate: c,
  boards,
  onSaved,
}: {
  candidate: Candidate;
  boards: Board[];
  onSaved: (action: string, active: boolean) => void;
}) {
  const initialExercise =
    c.suggestions.length === 1 ? c.suggestions[0].exercise_id : "";
  const [exercise, setExercise] = useState(initialExercise);
  const options = boards.filter((b) => b.exercise_id === exercise);
  const [boardId, setBoardId] = useState(
    c.board_id || (options.length === 1 ? options[0].id : ""),
  );
  const [value, setValue] = useState(c.value?.toString() || ""),
    [note, setNote] = useState(c.note || "");
  const [replace, setReplace] = useState(false);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [source, setSource] = useState(0);
  const [holdStart, setHoldStart] = useState<number | null>(null);
  const [holdEnd, setHoldEnd] = useState<number | null>(null);
  const urls = mediaUrls(c);
  const video = useRef<HTMLVideoElement>(null);
  const displayedFrame = useRef<number | null>(null);
  useEffect(() => {
    const element = video.current;
    displayedFrame.current = null;
    if (!element) return;
    let callback: number | undefined;
    const seeking = () => {displayedFrame.current = null;};
    element.addEventListener("seeking", seeking);
    if (typeof element.requestVideoFrameCallback === "function") {
      const rendered: VideoFrameRequestCallback = (_now, metadata) => {
        displayedFrame.current = Math.round(metadata.mediaTime * 1000);
        callback = element.requestVideoFrameCallback(rendered);
      };
      callback = element.requestVideoFrameCallback(rendered);
    }
    return () => {
      element.removeEventListener("seeking", seeking);
      if (callback !== undefined) element.cancelVideoFrameCallback(callback);
      displayedFrame.current = null;
    };
  }, [c.post_id, source]);
  function markHoldFrame(setPoint: (point: number) => void) {
    const element = video.current;
    if (!element || !Number.isFinite(element.currentTime) || element.readyState < 2 || element.seeking) {
      setError("Wait for the video to display the selected frame before marking it.");
      return;
    }
    element.pause();
    if (typeof element.requestVideoFrameCallback === "function" && displayedFrame.current === null) {
      setError("Play or scrub the video to display the frame, then mark it.");
      return;
    }
    setPoint(displayedFrame.current ?? Math.round(element.currentTime * 1000));
    setError("");
  }
  const board = boards.find((b) => b.id === boardId),
    current = c.current_records.find((r) => r.exercise_id === exercise);
  const exercises = [
    ...new Map(boards.map((b) => [b.exercise_id, b.exercise_name])).entries(),
  ];
  const editable = c.status === "pending";
  const isHold = board?.metric === "seconds";
  const timingValid = holdStart !== null && holdEnd !== null &&
    holdStart >= 0 && holdEnd - holdStart >= 1000 &&
    !!c.duration_ms && holdEnd <= c.duration_ms;
  const numeric = isHold
    ? timingValid ? Math.floor((holdEnd! - holdStart!) / 1000) : NaN
    : /^\d+$/.test(value) ? Number(value) : NaN;
  const tooLong =
    board?.metric === "seconds" &&
    (!c.duration_ms || (numeric + 1) * 1000 > c.duration_ms);
  const valid =
    !!board &&
    Number.isSafeInteger(numeric) &&
    numeric >= 1 &&
    numeric <= 2147483647 &&
    (board.metric !== "seconds" || numeric <= board.max_value) &&
    !tooLong &&
    source < urls.length;
  function chooseExercise(id: string) {
    setExercise(id);
    const matches = boards.filter((b) => b.exercise_id === id);
    setBoardId(matches.length === 1 ? matches[0].id : "");
    setValue("");
    setHoldStart(null);
    setHoldEnd(null);
    setReplace(false);
  }
  async function decide(action: Decision["decision"]) {
    if (busy || !editable || (action === "approve" && !valid)) return;
    setBusy(true);
    setError("");
    const decision: Decision = {
      post_id: c.post_id,
      revision: c.revision,
      decision: action,
      board_id: action === "approve" ? boardId : null,
      value: action === "approve" ? numeric : null,
      note,
      // Clicking Approve ranking confirms the review for the existing API.
      watched: action === "approve",
      replace_current: action === "approve" && !!current && replace,
      ...(action === "approve" && isHold ? {hold_timing: {
        start_ms: holdStart!, end_ms: holdEnd!,
        media: {primary_url: c.primary_url, duration_ms: c.duration_ms, renditions: c.renditions},
      }} : {}),
    };
    try {
      const result = await api<{ active: boolean }>(
        "review/decision",
        decision,
      );
      video.current?.pause();
      onSaved(action, result.active);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <article>
      <div className="clip-heading">
        <div>
          <p className="eyebrow">
            {c.username} · {new Date(c.created_at).toLocaleDateString()}
          </p>
          <h2>{c.title || "Untitled clip"}</h2>
        </div>
        <span className="badge">
          {c.status === "pending"
            ? "Needs a human check"
            : c.status === "skipped"
              ? "Rejected"
              : "Approved"}
        </span>
      </div>
      <div className="clip-grid">
        <div>
          <div className="video-frame">
            {source < urls.length ? (
              <video
                key={`${c.post_id}:${source}`}
                ref={video}
                src={urls[source]}
                poster={c.poster_url || undefined}
                controls
                autoPlay
                muted
                playsInline
                preload="auto"
                onError={() => setSource((s) => s + 1)}
              />
            ) : (
              <p role="alert">
                Video unavailable. Try again later, or reject its ranking.
              </p>
            )}
          </div>
          <div className="playback-tools">
            <label>
              Playback speed{" "}
              <select
                aria-label="Playback speed"
                defaultValue="1"
                onChange={(e) => {
                  if (video.current)
                    video.current.playbackRate = Number(e.target.value);
                }}
              >
                <option value="0.25">0.25×</option>
                <option value="0.5">0.5×</option>
                <option value="1">1×</option>
                <option value="2">2×</option>
              </select>
            </label>
            <span className="small muted">
              {c.duration_ms
                ? `${(c.duration_ms / 1000).toFixed(1)}s`
                : "Duration unknown"}
            </span>
          </div>
          <div className="description">
            <h3>Original description</h3>
            <p>{c.caption || "No description."}</p>
          </div>
          <div className="matches">
            <h3>Why this clip matched</h3>
            {c.suggestions.map((s) => (
              <div key={s.exercise_id}>
                <span>{s.name}</span>
                <small>{s.evidence.join(" + ")}</small>
              </div>
            ))}
          </div>
        </div>
        <div className="decision-form">
          {c.warnings.map((w) => (
            <p className="warning" key={w}>
              {w}
            </p>
          ))}
          {!editable ? (
            <div className="notice">
              <h3>
                {c.status === "approved" ? "Approved ranking" : c.result?.automatic ? "Automatically rejected" : "Ranking rejected"}
              </h3>
              <p>
                {boards.find((b) => b.id === c.board_id)?.name} {c.value ?? ""}
              </p>
              <p>{c.note}</p>
              <small>
                {c.reviewed_at && new Date(c.reviewed_at).toLocaleString()}
              </small>
            </div>
          ) : (
            <>
              <label htmlFor="exercise">Exercise</label>
              <select
                id="exercise"
                value={exercise}
                onChange={(e) => chooseExercise(e.target.value)}
                disabled={busy}
              >
                <option value="">Choose an exercise</option>
                {exercises.map(([id, name]) => (
                  <option value={id} key={id}>
                    {name}
                  </option>
                ))}
              </select>
              <label htmlFor="progression">Progression</label>
              <select
                id="progression"
                value={boardId}
                disabled={!exercise || busy}
                onChange={(e) => setBoardId(e.target.value)}
              >
                <option value="">Choose a progression</option>
                {options.map((b) => (
                  <option value={b.id} key={b.id}>
                    {b.progression || "Standard"}
                  </option>
                ))}
              </select>
              <label htmlFor="result">
                {board?.metric === "seconds"
                  ? "Hold time (whole seconds)"
                  : "Completed reps"}
              </label>
              <input
                id="result"
                type="number"
                min="1"
                max={board?.metric === "seconds" ? board.max_value : undefined}
                step="1"
                placeholder={isHold ? "Set start and end frames" : "Count from the video"}
                value={isHold ? Number.isFinite(numeric) ? numeric : "" : value}
                onChange={(e) => setValue(e.target.value)}
                disabled={!board || busy}
                readOnly={isHold}
              />
              {isHold && <fieldset disabled={busy || source >= urls.length} className={timingStyles.frames}>
                <legend>Hold start and end frames</legend>
                <p className="small muted">Pause the video at each boundary and set its frame. The result is the selected duration rounded down to whole seconds. Long training clips do not need trimming.</p>
                <div className="playback-tools">
                  <button type="button" className="button secondary" onClick={() => {
                    if (video.current) {video.current.pause(); displayedFrame.current = null; video.current.currentTime = Math.max(0, video.current.currentTime - 1 / 30);}
                  }}>Back 1/30s</button>
                  <button type="button" className="button secondary" onClick={() => {
                    if (video.current) {video.current.pause(); displayedFrame.current = null; video.current.currentTime = Math.min(c.duration_ms! / 1000, video.current.currentTime + 1 / 30);}
                  }}>Forward 1/30s</button>
                </div>
                <p className="small muted">Step controls move by 1/30 second; use the time fields for finer adjustments.</p>
                {(["start", "end"] as const).map(point => {
                  const selected = point === "start" ? holdStart : holdEnd;
                  const setPoint = point === "start" ? setHoldStart : setHoldEnd;
                  return <div key={point}>
                    <label htmlFor={`hold-${point}`}>Hold {point} (seconds)</label>
                    <input id={`hold-${point}`} type="number" min="0" step="0.001"
                      max={c.duration_ms ? c.duration_ms / 1000 : undefined}
                      value={selected === null ? "" : selected / 1000}
                      onChange={e => setPoint(e.target.value === "" ? null : Math.round(Number(e.target.value) * 1000))}/>
                    <div className="playback-tools">
                      <button type="button" className="button secondary" onClick={() => markHoldFrame(setPoint)}>Set hold {point} at playhead</button>
                      <button type="button" className="button text" disabled={selected === null} onClick={() => {
                        if (video.current && selected !== null) {video.current.pause(); displayedFrame.current = null; video.current.currentTime = selected / 1000;}
                      }}>View {point} frame</button>
                    </div>
                  </div>;
                })}
                <p aria-live="polite" className="small">{timingValid
                  ? `${((holdEnd! - holdStart!) / 1000).toFixed(3)}s selected → ${numeric} whole seconds`
                  : "Select start and end inside the clip, at least one second apart."}</p>
              </fieldset>}
              {tooLong && (
                <p className="error small">
                  The video must include at least one second beyond the hold.
                </p>
              )}
              {board && (
                <details className="guidelines">
                  <summary>Form & filming guidelines</summary>
                  <p>{board.form}</p>
                  <p>{board.camera}</p>
                </details>
              )}
              {current && (
                <div className="current-record">
                  <p className="eyebrow">CURRENT ENTRY</p>
                  <strong>
                    {current.name} · {current.value}
                    {current.metric === "seconds" ? "s" : " reps"}
                  </strong>
                  <label className="check">
                    <input
                      type="checkbox"
                      checked={replace}
                      onChange={(e) => setReplace(e.target.checked)}
                      disabled={busy}
                    />
                    <span>
                      Replace this athlete’s current entry with this clip.
                    </span>
                  </label>
                  <p className="small muted">
                    Leave unchecked to preserve their current leaderboard
                    selection.
                  </p>
                </div>
              )}
              <label htmlFor="notes">
                Review notes <span className="muted">(optional)</span>
              </label>
              <textarea
                id="notes"
                maxLength={1000}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Useful timestamps, form notes, or a reason to reject the ranking…"
                disabled={busy}
              />
              {error && (
                <p role="alert" className="error">
                  {error}
                </p>
              )}
              <div className="rejection-guidance small muted">
                <h3>Common reasons to reject</h3>
                <ul>
                  <li>Compilation of clips (single clip submissions only)</li>
                  <li>Video speed has been adjusted</li>
                  <li>Assisted exercise (using bands)</li>
                  <li>Bad form</li>
                </ul>
              </div>
              <div className="decision-actions">
                <button
                  className="button secondary"
                  disabled={busy}
                  onClick={() => decide("skip")}
                >
                  Reject ranking
                </button>
                <button
                  className="button primary"
                  disabled={busy || !valid}
                  onClick={() => decide("approve")}
                >
                  Approve ranking ↗
                </button>
              </div>
              {busy && <p role="status" className="small muted">Saving review…</p>}
              <p className="small muted">
                Results are never inferred from the description. One clip can
                rank in one exercise.
              </p>
            </>
          )}
        </div>
      </div>
    </article>
  );
}
