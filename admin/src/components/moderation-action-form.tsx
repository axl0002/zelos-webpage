"use client";
import { useRef, useState } from "react";
export type ModerationAction = {id: string; label: string; effect: string; danger?: boolean};
/** Shared reason/confirmation flow. Retains the retry key after a transport failure. */
export default function ModerationActionForm({actions, onSubmit, onBusy, onSaved}: {
  actions: ModerationAction[]; onSubmit: (action: string, reason: string, requestId: string) => Promise<void>;
  onBusy: (busy: boolean) => void; onSaved: () => void;
}) {
  const [reason, setReason] = useState(""), [selected, setSelected] = useState<ModerationAction | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const pending = useRef(false), retry = useRef<{signature: string; id: string} | null>(null);
  async function save() {
    if (!selected || pending.current || reason.trim().length < 3) return;
    const signature = JSON.stringify([selected.id, reason.trim()]);
    if (retry.current?.signature !== signature) retry.current = {signature, id: crypto.randomUUID()};
    pending.current = true; setBusy(true); onBusy(true); setError("");
    try { await onSubmit(selected.id, reason.trim(), retry.current.id); setSelected(null); retry.current = null; onSaved(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "The action could not finish. Please try again."); }
    finally { pending.current = false; setBusy(false); onBusy(false); }
  }
  if (!actions.length) return null;
  return <section className="decision-form" aria-label="Moderation actions">
    <h3>Moderation actions</h3>
    <label>Action reason<textarea rows={3} maxLength={1000} value={reason} disabled={busy}
      onChange={event => {setReason(event.target.value); setSelected(null);}} /></label>
    <div className="decision-actions">{actions.map(action => <button key={action.id} className={`button ${action.danger ? "danger" : "secondary"}`}
      disabled={busy || reason.trim().length < 3} onClick={() => {setSelected(action); setError("");}}>{action.label}</button>)}</div>
    {selected && <div className="dialog-backdrop"><div className="dialog" role="dialog" aria-modal="true" aria-label="Confirm moderation action">
      <h2>{selected.label}?</h2><p>{selected.effect}</p><p className="review-rule-copy">{reason.trim()}</p>
      {error && <p role="alert" className="notice error">{error}</p>}
      <div className="decision-actions"><button className="button secondary" disabled={busy} onClick={() => setSelected(null)}>Cancel</button>
        <button className="button primary" disabled={busy} onClick={() => void save()}>{busy ? "Saving…" : "Confirm action"}</button></div>
    </div></div>}
  </section>;
}
