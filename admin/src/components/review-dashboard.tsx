"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Board, Candidate, Decision, QueuePage } from "@/lib/review-types";
import { mediaUrls } from "@/lib/review-media";

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
  return data as T;
}
export default function ReviewDashboard({
  boards,
  email,
}: {
  boards: Board[];
  email: string;
}) {
  const [status, setStatus] = useState("pending"),
    [exercise, setExercise] = useState(""),
    [search, setSearch] = useState("");
  const [cursor, setCursor] = useState<string | null>(null),
    [history, setHistory] = useState<(string | null)[]>([]);
  const [page, setPage] = useState<QueuePage | null>(null),
    [selected, setSelected] = useState<string | null>(null);
  const [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const [refresh, setRefresh] = useState(0),
    [scanning, setScanning] = useState(false),
    [scanProgress, setScanProgress] = useState("");
  const scanAbort = useRef<AbortController | null>(null);
  const exercises = [
    ...new Map(boards.map((b) => [b.exercise_id, b.exercise_name])).entries(),
  ];
  useEffect(() => () => scanAbort.current?.abort(), []);
  useEffect(() => {
    const abort = new AbortController();
    setLoading(true);
    setError("");
    const q = new URLSearchParams({ status, exercise, q: search });
    if (cursor) q.set("after", cursor);
    api<QueuePage>(`review?${q}`, undefined, abort.signal)
      .then((data) => {
        setPage(data);
        setSelected((old) =>
          data.items.slice(0, 20).some((c) => c.post_id === old)
            ? old
            : data.items[0]?.post_id || null,
        );
      })
      .catch((e) => {
        if (!abort.signal.aborted) setError(e.message);
      })
      .finally(() => {
        if (!abort.signal.aborted) setLoading(false);
      });
    return () => abort.abort();
  }, [status, exercise, search, cursor, refresh]);
  function filter(action: () => void) {
    action();
    setCursor(null);
    setHistory([]);
    setSelected(null);
  }
  async function scan() {
    const abort = new AbortController();
    scanAbort.current = abort;
    setScanning(true);
    setError("");
    setNotice("");
    let after: string | null = null,
      scanned = 0,
      queued = 0;
    try {
      while (true) {
        const result: {
          cursor: string | null;
          scanned: number;
          queued: number;
          has_more: boolean;
        } = await api("review/scan", { after }, abort.signal);
        scanned += result.scanned;
        queued += result.queued;
        setScanProgress(
          `${scanned.toLocaleString()} clips checked · ${queued.toLocaleString()} candidates added or refreshed`,
        );
        if (!result.has_more) break;
        after = result.cursor;
      }
      setNotice(
        `Scan complete. ${scanned.toLocaleString()} imported training clips checked; ${queued.toLocaleString()} candidates added or refreshed. No rankings were changed.`,
      );
    } catch (e) {
      if (!abort.signal.aborted) setError((e as Error).message);
    } finally {
      if (!abort.signal.aborted) {
        setScanning(false);
        setRefresh((v) => v + 1);
      }
    }
  }
  const saved = useCallback((action: string, active: boolean) => {
    setNotice(
      action === "skip"
        ? "Clip skipped. The original post is unchanged."
        : active
          ? "Approved and added to the athlete’s leaderboard."
          : "Approved as a ranked clip. The athlete’s current leaderboard entry was preserved.",
    );
    setRefresh((v) => v + 1);
  }, []);
  const candidate = page?.items
    .slice(0, 20)
    .find((c) => c.post_id === selected);
  return (
    <div className="workspace">
      <aside className="sidebar">
        <a className="brand" href="/">
          zelos<span> / admin</span>
        </a>
        <p className="nav-label">CONTENT</p>
        <a href="/admin" className="nav-item active">
          <span>▤</span> Exercise review
        </a>
        <div className="sidebar-bottom">
          <span className="connection">
            <i /> Supabase
          </span>
          <p className="small truncate">{email}</p>
          <button
            className="button text"
            onClick={async () => {
              try {
                await api("auth/logout", {});
                window.location.assign("/admin/login");
              } catch (e) {
                setError((e as Error).message);
              }
            }}
          >
            Sign out ↗
          </button>
        </div>
      </aside>
      <main className="main">
        <header className="page-header">
          <div>
            <p className="eyebrow">HUMAN REVIEW</p>
            <h1>Find the next record.</h1>
            <p className="muted">
              Turn eligible training clips into exercise rankings. Every result
              is checked by a person.
            </p>
          </div>
          <button className="button primary" onClick={scan} disabled={scanning}>
            {scanning ? "Scanning…" : "Scan training clips"}
          </button>
        </header>
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
              onClick={() => setRefresh((v) => v + 1)}
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
                    : "Skipped"}
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
                : "Skipped clips"}
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
              onClick={() => setRefresh((v) => v + 1)}
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
                  onClick={() => setSelected(c.post_id)}
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
                  </span>
                  <span className="arrow">›</span>
                </button>
              ))
            ) : (
              <div className="empty">
                <span>✓</span>
                <h3>No clips in this view</h3>
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
                disabled={loading || !page || page.items.length <= 20}
                onClick={() => {
                  setHistory((v) => [...v, cursor]);
                  setCursor(page!.items[19].post_id);
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
                onSaved={saved}
              />
            ) : (
              <div className="empty">
                <h3>A little attention. A fairer ranking.</h3>
                <p>
                  Select a clip to watch it and check its exercise, progression
                  and result.
                </p>
              </div>
            )}
          </section>
        </div>
      </main>
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
    [error, setError] = useState(""),
    [confirm, setConfirm] = useState<"approve" | "skip" | null>(null);
  const [source, setSource] = useState(0);
  const urls = mediaUrls(c);
  const video = useRef<HTMLVideoElement>(null);
  const board = boards.find((b) => b.id === boardId),
    current = c.current_records.find((r) => r.exercise_id === exercise);
  const exercises = [
    ...new Map(boards.map((b) => [b.exercise_id, b.exercise_name])).entries(),
  ];
  const editable = c.status === "pending";
  const numeric = /^\d+$/.test(value) ? Number(value) : NaN;
  const tooLong =
    board?.metric === "seconds" &&
    (!c.duration_ms || (numeric + 1) * 1000 > c.duration_ms);
  const valid =
    !!board &&
    Number.isSafeInteger(numeric) &&
    numeric >= 1 &&
    numeric <= board.max_value &&
    !tooLong &&
    source < urls.length;
  function chooseExercise(id: string) {
    setExercise(id);
    const matches = boards.filter((b) => b.exercise_id === id);
    setBoardId(matches.length === 1 ? matches[0].id : "");
    setValue("");
    setReplace(false);
  }
  async function decide() {
    if (!confirm || busy) return;
    setBusy(true);
    setError("");
    const decision: Decision = {
      post_id: c.post_id,
      revision: c.revision,
      decision: confirm,
      board_id: confirm === "approve" ? boardId : null,
      value: confirm === "approve" ? numeric : null,
      note,
      // The final approval dialog confirms the review for the existing API.
      watched: confirm === "approve",
      replace_current: confirm === "approve" && !!current && replace,
    };
    try {
      const result = await api<{ active: boolean }>(
        "review/decision",
        decision,
      );
      video.current?.pause();
      onSaved(confirm, result.active);
      setConfirm(null);
    } catch (e) {
      setError((e as Error).message);
      setConfirm(null);
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
          {c.status === "pending" ? "Needs a human check" : c.status}
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
                playsInline
                preload="metadata"
                onError={() => setSource((s) => s + 1)}
              />
            ) : (
              <p role="alert">
                Video unavailable. Skip this clip or try again later.
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
                {c.status === "approved" ? "Approved ranking" : "Skipped"}
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
                max={board?.max_value}
                step="1"
                placeholder="Count from the video"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                disabled={!board || busy}
              />
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
                Review notes <span className="muted">(required to skip)</span>
              </label>
              <textarea
                id="notes"
                maxLength={1000}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Useful timestamps, form notes, or a reason to skip…"
                disabled={busy}
              />
              {error && (
                <p role="alert" className="error">
                  {error}
                </p>
              )}
              <div className="decision-actions">
                <button
                  className="button secondary"
                  disabled={busy || !note.trim()}
                  onClick={() => setConfirm("skip")}
                >
                  Skip clip
                </button>
                <button
                  className="button primary"
                  disabled={busy || !valid}
                  onClick={() => setConfirm("approve")}
                >
                  Approve ranking ↗
                </button>
              </div>
              <p className="small muted">
                Results are never inferred from the description. One clip can
                rank in one exercise.
              </p>
            </>
          )}
        </div>
      </div>
      {confirm && (
        <div className="dialog-backdrop">
          <section
            className="dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="confirm-title"
          >
            <h2 id="confirm-title">
              {confirm === "approve"
                ? "Approve this ranking?"
                : "Skip this clip?"}
            </h2>
            <p>
              {confirm === "approve"
                ? `${board?.name} · ${numeric}${board?.metric === "seconds" ? "s" : " reps"} for ${c.username}.`
                : "The clip stays a training post. Your reason is saved in the review history."}
            </p>
            {confirm === "approve" && current && (
              <p className="warning">
                {replace
                  ? "This will replace the athlete’s current entry for this exercise."
                  : "Their current leaderboard entry will be preserved."}
              </p>
            )}
            <div className="decision-actions">
              <button
                autoFocus
                className="button secondary"
                onClick={() => setConfirm(null)}
                disabled={busy}
              >
                Cancel
              </button>
              <button
                className="button primary"
                onClick={decide}
                disabled={busy}
              >
                {busy
                  ? "Saving…"
                  : confirm === "approve"
                    ? "Confirm approval"
                    : "Confirm skip"}
              </button>
            </div>
          </section>
        </div>
      )}
    </article>
  );
}
