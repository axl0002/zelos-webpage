"use client";
import { useRef, useState } from "react";
export type ModerationAction = {id: string; label: string; effect: string; danger?: boolean};
/** Shared reason/confirmation flow. Retains the retry key after a transport failure. */
export default function ModerationActionForm({actions, onSubmit, onBusy, onSaved}: {
  actions: ModerationAction[]; onSubmit: (action: string, reason: string, requestId: string, durationDays: number | null) => Promise<void>;
  onBusy: (busy: boolean) => void; onSaved: () => void;
}) {
  const [reason, setReason] = useState(""), [selected, setSelected] = useState<ModerationAction | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [duration, setDuration] = useState("indefinite"), [days, setDays] = useState("");
  const durationDays = duration === "temporary" ? Number(days) : null;
  const validDays = durationDays === null || (/^\d+$/.test(days) && Number.isSafeInteger(durationDays) && durationDays >= 1 && durationDays <= 3650);
  const pending = useRef(false), retry = useRef<{signature: string; id: string} | null>(null);
  const banOnly = actions.length === 1 && actions[0].id === "ban";
  async function save() {
    if (!selected || pending.current || reason.trim().length < 3 || (selected.id === "ban" && !validDays)) return;
    const signature = JSON.stringify([selected.id, reason.trim(), selected.id === "ban" ? durationDays : null]);
    if (retry.current?.signature !== signature) retry.current = {signature, id: crypto.randomUUID()};
    pending.current = true; setBusy(true); onBusy(true); setError("");
    try { await onSubmit(selected.id, reason.trim(), retry.current.id, selected.id === "ban" ? durationDays : null); setSelected(null); retry.current = null; onSaved(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "The action could not finish. Please try again."); }
    finally { pending.current = false; setBusy(false); onBusy(false); }
  }
  if (!actions.length) return null;
  return <section className="decision-form" aria-label="Moderation actions">
    <h3>Moderation actions</h3>
    <label>{banOnly ? "Ban reason (shown to the user)" : "Action reason"}<textarea rows={3} maxLength={1000} value={reason} disabled={busy}
      onChange={event => {setReason(event.target.value); setSelected(null);}} /></label>
    {!banOnly && actions.some(action => action.id === "ban") && <p className="muted small">When banning an account, this reason is shown to the user.</p>}
    {actions.some(action => action.id === "ban") && <>
      <label>Ban duration<select value={duration} disabled={busy} onChange={event => {setDuration(event.target.value); setSelected(null);}}>
        <option value="indefinite">Indefinite</option><option value="temporary">Temporary</option>
      </select></label>
      {duration === "temporary" && <><label>Number of days<input type="number" inputMode="numeric" min={1} max={3650} step={1}
        value={days} disabled={busy} aria-invalid={!validDays} aria-describedby="ban-days-help"
        onChange={event => {setDays(event.target.value); setSelected(null);}} /></label>
        <p id="ban-days-help" className={validDays ? "muted small" : "notice error"}>Enter a whole number of days from 1 to 3650.</p></>}
    </>}
    <div className="decision-actions">{actions.map(action => <button key={action.id} className={`button ${action.danger ? "danger" : "secondary"}`}
      disabled={busy || reason.trim().length < 3 || (action.id === "ban" && !validDays)} onClick={() => {setSelected(action); setError("");}}>{action.label}</button>)}</div>
    {selected && <div className="dialog-backdrop"><div className="dialog" role="dialog" aria-modal="true" aria-label="Confirm moderation action">
      <h2>{selected.label}?</h2><p>{selected.effect}</p><p className="review-rule-copy">{reason.trim()}</p>
      {selected.id === "ban" && <><p>{durationDays === null ? "Ban duration: indefinite, until an administrator removes it." : `Ban duration: ${durationDays} ${durationDays === 1 ? "day" : "days"} from confirmation. It expires automatically; any separate restrictions still apply.`}</p><p>This reason will be shown to the user.</p></>}
      {error && <p role="alert" className="notice error">{error}</p>}
      <div className="decision-actions"><button className="button secondary" disabled={busy} onClick={() => setSelected(null)}>Cancel</button>
        <button className="button primary" disabled={busy} onClick={() => void save()}>{busy ? "Saving…" : "Confirm action"}</button></div>
    </div></div>}
  </section>;
}
