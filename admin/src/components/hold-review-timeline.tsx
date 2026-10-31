"use client";
import {useEffect, useRef, useState, type CSSProperties, type RefObject} from "react";
import styles from "./hold-review-timeline.module.css";

type Timing = {start_ms: number; end_ms: number};
export default function HoldReviewTimeline({videoRef, source, timing, disabled = false, label = "Uploader-selected hold frames"}: {
  videoRef: RefObject<HTMLVideoElement | null>; source: string; timing?: Timing | null; disabled?: boolean; label?: string;
}) {
  const [duration, setDuration] = useState(0), [position, setPosition] = useState(0), [error, setError] = useState("");
  const dragging = useRef(false), resume = useRef(false);
  useEffect(() => {
    const video = videoRef.current;
    dragging.current = false; resume.current = false; setDuration(0); setPosition(0); setError("");
    if (!video || !source) return;
    const update = () => {
      setDuration(Number.isFinite(video.duration) && video.duration > 0 ? Math.round(video.duration * 1000) : 0);
      if (!dragging.current) setPosition(Number.isFinite(video.currentTime) ? Math.round(video.currentTime * 1000) : 0);
    };
    const reset = () => {resume.current = false; dragging.current = false; setDuration(0); setPosition(0);};
    const hide = () => {if (document.hidden) {resume.current = false; dragging.current = false; video.pause();}};
    const events = ["loadedmetadata", "durationchange", "timeupdate", "seeked"];
    events.forEach(event => video.addEventListener(event, update));
    video.addEventListener("emptied", reset); video.addEventListener("error", reset);
    document.addEventListener("visibilitychange", hide); update();
    return () => {
      dragging.current = false; resume.current = false;
      events.forEach(event => video.removeEventListener(event, update));
      video.removeEventListener("emptied", reset); video.removeEventListener("error", reset);
      document.removeEventListener("visibilitychange", hide);
    };
  }, [videoRef, source]);
  const valid = timing && Number.isSafeInteger(timing.start_ms) && Number.isSafeInteger(timing.end_ms) && timing.start_ms >= 0 && timing.end_ms - timing.start_ms >= 1000;
  const fits = valid && duration > 0 && timing.end_ms <= duration;
  const ready = !!source && !disabled && duration > 0;
  function seek(ms: number) {
    const video = videoRef.current;
    if (!video || !ready || !Number.isFinite(ms)) return;
    try {video.pause(); video.currentTime = Math.max(0, Math.min(duration, ms)) / 1000; setPosition(Math.round(video.currentTime * 1000)); setError("");}
    catch {resume.current = false; setError("Could not seek this preview. Refresh the video before checking frames.");}
  }
  function finish() {
    const shouldResume = resume.current;
    resume.current = false; dragging.current = false;
    if (shouldResume && ready && !document.hidden && position < duration) {
      void videoRef.current?.play().catch(() => {});
    }
  }
  const start = fits ? timing.start_ms / duration * 100 : 0, end = fits ? timing.end_ms / duration * 100 : 0;
  const elapsed = fits ? Math.max(0, Math.min(timing.end_ms - timing.start_ms, position - timing.start_ms)) : 0;
  return <section className={styles.timeline} aria-label={label}>
    <div className={styles.heading}><strong>{label}</strong>{fits && <output aria-label="Hold elapsed time">{(Math.floor(elapsed / 100) / 10).toFixed(1)} s / {((timing.end_ms - timing.start_ms) / 1000).toFixed(3)} s</output>}</div>
    {!valid && <p className="small muted">No saved uploader hold frames are available for this clip.</p>}
    {valid && duration > 0 && !fits && <p role="status" className="small muted">Saved hold frames do not fit this video. Refresh before reviewing the measurement.</p>}
    {valid && <div className={styles.boundaries}>
      <button type="button" className="button secondary" disabled={!ready || !fits} onClick={() => {resume.current = false; seek(timing.start_ms);}}>Uploader start · {(timing.start_ms / 1000).toFixed(3)} s</button>
      <button type="button" className="button secondary" disabled={!ready || !fits} onClick={() => {resume.current = false; seek(timing.end_ms);}}>Uploader end · {(timing.end_ms / 1000).toFixed(3)} s</button>
    </div>}
    <div className={`${styles.track} ${fits ? styles.hasRange : ""}`} style={{"--hold-start":`${start}%`, "--hold-end":`${end}%`} as CSSProperties}>
      {fits && <div className={styles.range} aria-hidden="true" />}
      <input type="range" aria-label="Scrub review video" min={0} max={duration || 1} step={1} value={Math.min(position, duration)} disabled={!ready}
        aria-valuetext={`${(position / 1000).toFixed(3)} of ${(duration / 1000).toFixed(3)} seconds`}
        onPointerDown={() => {dragging.current = true; resume.current = videoRef.current?.paused === false;}}
        onChange={event => seek(Number(event.target.value))} onPointerUp={finish}
        onPointerCancel={() => {dragging.current = false; resume.current = false;}}
        onBlur={() => {dragging.current = false; resume.current = false;}} />
    </div>
    <output className={styles.clock} aria-label="Video position">{(position / 1000).toFixed(3)} / {(duration / 1000).toFixed(3)} s</output>
    {error && <p role="alert">{error}</p>}
  </section>;
}
