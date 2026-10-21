"use client";
import { useEffect, useRef, useState } from "react";
import type { AdminUser } from "@/lib/admin-users";
import ModerationActionForm from "./moderation-action-form";
export default function AdminUsersDashboard() {
  const [query, setQuery] = useState(""), [users, setUsers] = useState<AdminUser[]>([]);
  const [selected, setSelected] = useState<string | null>(null), [searched, setSearched] = useState(false);
  const [loading, setLoading] = useState(false), [busy, setBusy] = useState(false);
  const [error, setError] = useState(""), [notice, setNotice] = useState("");
  const request = useRef<AbortController | null>(null), lastQuery = useRef("");
  useEffect(() => () => request.current?.abort(), []);
  async function search(value = query, preserveSelected: string | null = null) {
    request.current?.abort(); const controller = new AbortController(); request.current = controller;
    setLoading(true); setError(""); setUsers([]); setSelected(null); lastQuery.current = value.trim();
    try {
      const response = await fetch(`/admin/api/users?q=${encodeURIComponent(value.trim())}`, {cache: "no-store", signal: controller.signal});
      const data = await response.json(); if (!response.ok) throw new Error(data.error || "Users could not load. Please try again.");
      if (!controller.signal.aborted) {setUsers(data); setSelected(data.some((item: AdminUser) => item.id === preserveSelected) ? preserveSelected : data[0]?.id ?? null); setSearched(true);}
    } catch (cause) {if (!controller.signal.aborted) setError((cause as Error).message);}
    finally {if (!controller.signal.aborted) setLoading(false);}
  }
  const user = users.find(item => item.id === selected);
  return <div className="dashboard-content"><header className="page-header"><div><p className="eyebrow">ACCOUNT MODERATION</p><h1>Users</h1>
      <p className="muted">Search by username or user ID. Up to 30 matching accounts are shown. Refine the search to find a specific athlete.</p></div></header>
      <form className="filter-controls" onSubmit={event => {event.preventDefault(); setNotice(""); void search();}}>
        <label>Username or user ID<input value={query} maxLength={100} disabled={busy} onChange={event => setQuery(event.target.value)} /></label>
        <button className="button primary" disabled={busy || loading || query.trim().length < 2}>Search users</button>
      </form>
      {error && <p role="alert" className="notice error">{error}</p>}{notice && <p role="status" className="notice success">{notice}</p>}
      <div className="review-layout"><section className="queue-panel" aria-label="User search results">
        {loading && <p className="empty">Searching users…</p>}
        {!loading && !searched && <p className="empty">Search for a username or user ID to find an account.</p>}
        {!loading && searched && !users.length && <p className="empty">No matching users.</p>}
        {users.map(item => <button key={item.id} disabled={busy} aria-label={`${item.username || "Unnamed account"} · ${item.is_banned ? "Banned" : "Active"} · ${item.id}`} aria-pressed={item.id === selected} className={`candidate ${item.id === selected ? "selected" : ""}`}
          onClick={() => {setSelected(item.id); setNotice("");}}><span className="candidate-copy"><strong>{item.username || "Unnamed account"}</strong>
            <span>{item.is_banned ? "Banned" : "Active"} · {item.country || "No country"}</span><small>{item.id}</small></span></button>)}
      </section><section className="review-panel" aria-label="User details">
        {user ? <><h2>{user.username || "Unnamed account"}</h2><p className="muted">{user.id}</p>
          <p>Account status: {user.is_banned ? "Banned" : "Active"}</p>
          {user.manual_ban && <p>{user.manual_ban_until ? <>Manual ban ends: <time dateTime={user.manual_ban_until}>{new Date(user.manual_ban_until).toLocaleString()}</time></> : "Manual ban: indefinite"}</p>}
          {!user.manual_ban && user.is_banned && user.ban_until && <p>Restriction ends: <time dateTime={user.ban_until}>{new Date(user.ban_until).toLocaleString()}</time></p>}
          {user.manual_ban && <p className="muted small">Removing or expiring this manual ban does not remove separate safety or strike restrictions.</p>}
          <ModerationActionForm key={`${user.id}:${user.revision}`} onBusy={setBusy} onSaved={() => {setNotice("Account moderation saved."); void search(lastQuery.current, user.id);}}
            actions={[
              ...(user.can_ban ? [{id: "ban", label: "Ban user", danger: true, effect: "Block this account from using Zelos and hide its posts from public feeds and rankings."}] : []),
              ...(user.can_unban ? [{id: "unban", label: "Remove manual ban", effect: "Remove the administrator's ban. Any separate safety or strike restrictions still apply."}] : []),
            ]} onSubmit={async (action, reason, requestId, durationDays) => {
              const response = await fetch("/admin/api/users/ban", {method: "POST", headers: {"Content-Type": "application/json"},
                body: JSON.stringify({user_id: user.id, banned: action === "ban", expected_revision: user.revision, reason, request_id: requestId, duration_days: durationDays})});
              const data = await response.json(); if (!response.ok) throw new Error(data.error || "The account could not be updated. Please try again.");
            }} />
          {!user.can_ban && !user.can_unban && <p className="muted">This account cannot be changed here.</p>}
        </> : <p className="empty">Search and select a user to review their account.</p>}
      </section></div>
    </div>;
}
