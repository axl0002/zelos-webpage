"use client";

import { useEffect, useRef, useState } from "react";
import type { SafetyCase } from "@/lib/safety-review";

async function api<T>(path: string, body?: unknown, signal?: AbortSignal): Promise<T> {
  const response = await fetch(`/admin/api/safety${path}`, {
    method: body === undefined ? "GET" : "POST",
    cache: "no-store",
    signal,
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "The request failed. Try again.");
  return data as T;
}

function timeLabel(ms: number) {
  return `${(ms / 1000).toFixed(1)}s`;
}

export default function SafetyReviewDashboard({ email }: { email: string }) {
  const [queue, setQueue] = useState<SafetyCase[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [preview, setPreview] = useState<{ id: string; url: string } | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [watched, setWatched] = useState(false);
  const [note, setNote] = useState("");
  const [confirm, setConfirm] = useState<"approve" | "reject" | null>(null);
  const [saving, setSaving] = useState(false);
  const epoch = useRef(0);
  const current = queue.find((item) => item.id === selected) ?? null;
  const awaitingReview = current && (!current.state || current.state === "review");
  const statusLabel = (item: SafetyCase) => item.state === "rejected"
    ? "Rejected · retained" : item.state === "failed" ? "Scan failed · retained" : "Awaiting review";

  async function refresh(signal?: AbortSignal) {
    setLoading(true);
    setError("");
    try {
      const cases = await api<SafetyCase[]>("", undefined, signal);
      if (signal?.aborted) return;
      setQueue(cases);
      setSelected((old) => cases.some((item) => item.id === old) ? old : cases[0]?.id ?? null);
    } catch (cause) {
      if (!signal?.aborted) setError((cause as Error).message);
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }

  useEffect(() => {
    const controller = new AbortController();
    void refresh(controller.signal);
    return () => controller.abort();
  }, []);

  function choose(id: string) {
    epoch.current++;
    setSelected(id);
    setPreview(null);
    setPreviewLoading(false);
    setWatched(false);
    setNote("");
    setConfirm(null);
    setError("");
    setNotice("");
  }

  async function openPreview() {
    if (!current) return;
    const id = current.id;
    const requestEpoch = ++epoch.current;
    setPreviewLoading(true);
    setError("");
    try {
      const result = await api<{ url: string }>("/preview", { upload_id: id });
      if (requestEpoch === epoch.current) setPreview({ id, url: result.url });
    } catch (cause) {
      if (requestEpoch === epoch.current) setError((cause as Error).message);
    } finally {
      if (requestEpoch === epoch.current) setPreviewLoading(false);
    }
  }

  async function decide() {
    if (!current || !awaitingReview || !confirm || !watched) return;
    const id = current.id;
    setSaving(true);
    setError("");
    try {
      await api("/decision", {
        upload_id: id,
        approve: confirm === "approve",
        review_note: note,
      });
      epoch.current++;
      const remaining: SafetyCase[] = confirm === "approve"
        ? queue.filter((item) => item.id !== id)
        : queue.map((item) => item.id === id ? { ...item, state: "rejected", review_note: note } : item);
      setQueue(remaining);
      setSelected(remaining[0]?.id ?? null);
      setPreview(null);
      setWatched(false);
      setNote("");
      setConfirm(null);
      setNotice(confirm === "approve"
        ? "Approved. The worker will recheck and publish the clip."
        : "Rejected. The original is retained privately for inspection.");
    } catch (cause) {
      setError((cause as Error).message);
      setConfirm(null);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="workspace">
      <aside className="sidebar">
        <a className="brand" href="/">zelos<span> / admin</span></a>
        <p className="nav-label">CONTENT</p>
        <a href="/admin" className="nav-item"><span>▤</span> Exercise review</a>
        <a href="/admin/ranked-uploads" className="nav-item">Ranked uploads</a>
        <a href="/admin/ranking-flags" className="nav-item"><span>⚑</span> Ranking flags</a>
        <a href="/admin/safety" className="nav-item active"><span>◈</span> Upload safety</a>
        <div className="sidebar-bottom">
          <span className="connection"><i /> Supabase</span>
          <p className="small truncate">{email}</p>
          <button className="button text" onClick={async () => {
            try {
              const response = await fetch("/admin/api/auth/logout", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: "{}",
              });
              if (!response.ok) throw new Error("Sign out failed.");
              window.location.assign("/admin/login");
            } catch { setError("Sign out failed. Try again."); }
          }}>Sign out ↗</button>
        </div>
      </aside>
      <main className="main">
        <header className="page-header">
          <div>
            <p className="eyebrow">HUMAN REVIEW</p>
            <h1>Upload safety</h1>
            <p className="muted">Flagged, rejected and failed safety scans remain private for inspection.</p>
          </div>
          <button className="button secondary" onClick={() => void refresh()} disabled={loading}>Refresh queue</button>
        </header>
        {notice && <p role="status" className="notice success">{notice}</p>}
        {error && <p role="alert" className="notice error">{error}</p>}
        <div className="review-layout">
          <section className="queue-panel" aria-label="Safety reviews and retained uploads">
            {loading && queue.length === 0 && <p className="empty">Loading review queue…</p>}
            {!loading && queue.length === 0 && <p className="empty">No uploads awaiting review or retained for inspection.</p>}
            {queue.map((item) => (
              <button key={item.id} className={`candidate ${selected === item.id ? "selected" : ""}`}
                onClick={() => choose(item.id)}>
                <span className="poster-placeholder">▶</span>
                <span className="candidate-copy">
                  <strong>{item.title || (item.post_id ? "Untitled upload" : "Profile image")}</strong>
                  <span>{item.post_id ? `${item.evidence?.frame_count ?? "?"} sampled frames` : "Avatar image"}</span>
                  <span>{statusLabel(item)}</span>
                  <small>{new Date(item.created_at).toLocaleString()}</small>
                </span>
              </button>
            ))}
          </section>
          <section className="review-panel" aria-label="Safety review detail">
            {!current ? <div className="empty">Select a clip to review.</div> : <>
              <div className="clip-heading">
                <div><p className="eyebrow">PRIVATE UPLOAD</p><h2>{current.title || (current.post_id ? "Untitled upload" : "Profile image")}</h2></div>
                <span className="badge">{statusLabel(current)}</span>
              </div>
              <div className="clip-grid">
                <div>
                  <div className="video-frame">
                    {preview?.id === current.id
                      ? current.post_id
                        ? <video key={preview.url} src={preview.url} controls playsInline preload="metadata" />
                        : <img key={preview.url} src={preview.url} alt="Private profile image under review" />
                      : <button className="button secondary" onClick={() => void openPreview()} disabled={previewLoading}>
                          {previewLoading ? "Opening…" : `Open private ${current.post_id ? "video" : "image"}`}
                        </button>}
                  </div>
                  {preview && <button className="button text" onClick={() => void openPreview()}>Refresh video link</button>}
                  <p className="small muted">This link expires after two minutes. Refresh it if the preview stops.</p>
                </div>
                <div className="decision-form">
                  <h3>Frame signals</h3>
                  <p className="small muted">Automatic labels are clues. Check the full upload before deciding.</p>
                  <div className="safety-signals">
                    {(current.evidence?.frames ?? []).length === 0
                      ? <p className="small muted">No label details supplied.</p>
                      : current.evidence!.frames!.map((frame, index) => (
                        <div key={`${frame.time_ms}-${index}`}>
                          <strong>{timeLabel(frame.time_ms)}</strong>
                          {frame.labels.map((label, labelIndex) => <span key={labelIndex}>
                            {label.name} · {Math.round(label.confidence)}%
                          </span>)}
                        </div>
                      ))}
                  </div>
                  {!awaitingReview && <p className="notice">
                    {current.state === "rejected"
                      ? `This upload was rejected and remains unpublished. ${current.review_note || ""}`
                      : "The safety check did not complete. The original is retained for inspection; it has not been approved or published."}
                  </p>}
                  {awaitingReview && <><label className="check"><input type="checkbox" checked={watched}
                    onChange={(event) => setWatched(event.target.checked)} disabled={!preview} />
                    I reviewed the full {current.post_id ? "video" : "image"} and checked the flagged content.
                  </label>
                  <label htmlFor="safety-note">Review note</label>
                  <textarea id="safety-note" value={note} onChange={(event) => setNote(event.target.value)}
                    maxLength={2000} placeholder="Required if rejecting; optional if approving" />
                  <div className="decision-actions">
                    <button className="button secondary" disabled={!watched || !note.trim() || saving}
                      onClick={() => setConfirm("reject")}>Reject upload</button>
                    <button className="button primary" disabled={!watched || saving}
                      onClick={() => setConfirm("approve")}>Approve upload</button>
                  </div>
                  </>}
                </div>
              </div>
            </>}
          </section>
        </div>
      </main>
      {confirm && <div className="dialog-backdrop" role="presentation">
        <div className="dialog" role="dialog" aria-modal="true" aria-label="Confirm safety decision">
          <h2>{confirm === "approve" ? "Approve this upload?" : "Reject this upload?"}</h2>
          <p>{confirm === "approve"
            ? "The worker will reprocess the approved upload, then publish the post or profile image if processing succeeds."
            : "The upload will remain unpublished. Its original will be kept privately for later inspection."}</p>
          <div className="decision-actions">
            <button className="button secondary" onClick={() => setConfirm(null)} disabled={saving}>Cancel</button>
            <button className="button primary" onClick={() => void decide()} disabled={saving}>
              {saving ? "Saving…" : confirm === "approve" ? "Approve" : "Reject"}
            </button>
          </div>
        </div>
      </div>}
    </div>
  );
}
