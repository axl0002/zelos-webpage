"use client";
import {useCallback, useEffect, useRef, useState} from "react";
import {parseAdminWeightContext, parseWeightReceipt, type AdminWeightContext, type WeightApply, type WeightReceipt} from "@/lib/admin-score-weights";
import {exportWeightCsv, MAX_WEIGHT_CSV_BYTES, parseWeightCsv, type WeightEdit} from "@/lib/score-weights-csv";
import {weightRequest, WeightRequestError} from "@/lib/score-weight-request";

const fileText = (file: File) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader(); reader.onload = () => resolve(String(reader.result));
  reader.onerror = () => reject(Error("Could not read this CSV file.")); reader.readAsText(file, "utf-8");
});
export default function AdminScoreWeights() {
  const [context, setContext] = useState<AdminWeightContext | null>(null), [edits, setEdits] = useState<WeightEdit[] | null>(null);
  const [error, setError] = useState(""), [busy, setBusy] = useState(false), [reason, setReason] = useState(""), [confirmation, setConfirmation] = useState("");
  const [attempt, setAttempt] = useState<WeightApply | null>(null), [receipt, setReceipt] = useState<WeightReceipt | null>(null), [fileKey, setFileKey] = useState(0);
  const alive = useRef(true), pending = useRef(false), controller = useRef<AbortController | null>(null);
  const resetPreview = () => { setEdits(null); setReason(""); setConfirmation(""); setAttempt(null); setFileKey(key => key + 1); };
  const load = useCallback(async (signal: AbortSignal) => { const next = parseAdminWeightContext(await weightRequest(signal)); if (alive.current && !signal.aborted) setContext(next); }, []);
  useEffect(() => {
    alive.current = true; const c = new AbortController(); controller.current = c; pending.current = true; setBusy(true);
    void load(c.signal).catch(e => { if (alive.current && !c.signal.aborted) setError(e instanceof WeightRequestError ? e.message : "Could not load current weights."); })
      .finally(() => { pending.current = false; if (alive.current && !c.signal.aborted) setBusy(false); });
    return () => { alive.current = false; controller.current?.abort(); };
  }, [load]);
  async function refresh() {
    if (pending.current || attempt) return; pending.current = true; setBusy(true); setError(""); resetPreview();
    const c = new AbortController(); controller.current = c;
    try { await load(c.signal); } catch (e) { if (alive.current && !c.signal.aborted) setError(e instanceof WeightRequestError ? e.message : "Could not load current weights."); }
    finally { pending.current = false; if (alive.current && !c.signal.aborted) setBusy(false); }
  }
  async function choose(file?: File) {
    if (!file || !context || pending.current || attempt) return;
    pending.current = true; setBusy(true); setError(""); setReceipt(null); setEdits(null); setReason(""); setConfirmation("");
    try {
      if (file.size > MAX_WEIGHT_CSV_BYTES) throw Error("CSV must be no larger than 2 MiB.");
      const next = parseWeightCsv(await fileText(file), context.weights); if (alive.current) setEdits(next);
    } catch (e) { if (alive.current) setError(e instanceof Error ? e.message : "Check the CSV file."); }
    finally { pending.current = false; if (alive.current) setBusy(false); }
  }
  const changed = context && edits ? edits.flatMap(row => {
    const current = context.weights.find(board => board.id === row.board_id)!;
    return current.weight === row.weight ? [] : [{...current, next: row.weight}];
  }) : [];
  async function apply() {
    if (pending.current || !context || !edits || !changed.length || (!attempt && (confirmation !== "APPLY" || reason.trim().length < 10))) return;
    const payload: WeightApply = attempt ?? {request_id: crypto.randomUUID(), expected_fingerprint: context.fingerprint,
      weights: edits, change_reason: reason.trim(), confirmation: "APPLY"};
    setAttempt(payload); pending.current = true; setBusy(true); setError(""); const c = new AbortController(); controller.current = c;
    let saved = false;
    try {
      const result = parseWeightReceipt(await weightRequest(c.signal, payload));
      if (result.request_id !== payload.request_id) throw Error("Unexpected receipt.");
      if (!alive.current || c.signal.aborted) return;
      saved = true; setReceipt(result); resetPreview(); await load(c.signal);
    } catch (e) {
      if (!alive.current || c.signal.aborted) return;
      if (saved) { setContext(null); setError("Weights were saved. Refresh current weights to load the updated table."); }
      else if (e instanceof WeightRequestError && e.status === 409) {
        resetPreview(); setError(e.message); try { await load(c.signal); } catch { setContext(null); }
      } else {
        if (e instanceof WeightRequestError && e.status === 400) setAttempt(null);
        setError(e instanceof WeightRequestError ? e.message : "Could not confirm the change. Retry this same apply request before starting another change.");
      }
    } finally { pending.current = false; if (alive.current && !c.signal.aborted) setBusy(false); }
  }
  let previousCsv: string | null = null;
  if (context?.previous_weights && context.previous_weights.length === context.weights.length &&
      context.weights.every(row => context.previous_weights!.some(previous => previous.board_id === row.id))) {
    previousCsv = exportWeightCsv(context.weights.map(row => ({...row, weight: context.previous_weights!.find(previous => previous.board_id === row.id)!.weight})));
  }
  return <div className="scoring-lab"><header><h1>Scoring weights</h1>
    <p>Download the current CSV, change only its weight column, then upload it to preview. Applying changes recalculates production rankings.</p></header>
    <div className="lab-actions"><a className="button secondary" href="/scoring/weights.csv" download>Download current weights CSV</a>
      <button className="button secondary" disabled={busy || !!attempt} onClick={() => void refresh()}>Refresh current weights</button></div>
    {busy && <p role="status">Loading scoring weights…</p>}{error && <p role="alert" className="error">{error}</p>}
    {receipt && <section className="lab-notice" role="status"><h2>{receipt.changed ? "Weights applied" : "Weights unchanged"}</h2>
      <p>{receipt.changed_boards} boards changed. Ranking version {receipt.rankings_version}. Config version {receipt.config_version}.</p>
      <p>Request {receipt.request_id}. Download the current CSV above to review the saved values.</p></section>}
    {context && <><p>{context.weights.length} currently ranked boards · Config version {context.config_version} · Ranking version {context.rankings_version}</p>
      <label>Edited weights CSV<input key={fileKey} type="file" accept=".csv,text/csv" disabled={busy || !!attempt} onChange={event => void choose(event.target.files?.[0])}/></label>
      <p className="small muted">Keep every board and all labels unchanged. Weights may be zero or positive decimals. Uploading does not change production.</p>
      {edits && <section className="lab-notice"><h2>Preview weight changes</h2><p>{changed.length} of {edits.length} boards changed.</p>
        {changed.length ? <div className="lab-scroll"><table><caption className="sr-only">Current and edited exercise weights</caption><thead><tr><th>Exercise</th><th>Progression</th><th>Discipline</th><th>Current</th><th>Edited</th></tr></thead>
          <tbody>{changed.map(row => <tr key={row.id}><td>{row.exercise}</td><td>{row.progression ?? "—"}</td><td>{row.discipline}</td><td>{row.weight}</td><td>{row.next}</td></tr>)}</tbody></table></div> : <p>No weight changes to apply.</p>}
        <label>Reason for weight change<textarea value={reason} maxLength={2000} disabled={busy || !!attempt} onChange={event => setReason(event.target.value)}/></label>
        <label>Type APPLY to confirm<input value={confirmation} autoComplete="off" disabled={busy || !!attempt} onChange={event => setConfirmation(event.target.value)}/></label>
        {attempt && <p role="status">This request may already have finished. Retry sends the same request ID and exact changes.</p>}
        <button className="button primary" disabled={busy || !changed.length || (!attempt && (confirmation !== "APPLY" || reason.trim().length < 10))} onClick={() => void apply()}>{attempt ? "Retry this apply" : "Apply weight changes"}</button>
      </section>}
      {context.latest_change && <p className="small muted">Latest weight change: {new Date(context.latest_change.created_at).toLocaleString()} · {context.latest_change.reason}</p>}
      {previousCsv && <p><a href={"data:text/csv;charset=utf-8," + encodeURIComponent(previousCsv)} download="zelos-scoring-weights-previous.csv">Download previous weights CSV</a>. Restore it only by uploading and reviewing it against the current table.</p>}
    </>}
  </div>;
}
