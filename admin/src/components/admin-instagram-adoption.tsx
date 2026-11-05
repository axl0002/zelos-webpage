"use client";
import {useEffect, useState} from "react";
import {parseInstagramAdoption, type InstagramAdoption} from "@/lib/admin-instagram-adoption";
const number = new Intl.NumberFormat("en-US");
export default function AdminInstagramAdoption({refresh}: {refresh: number}) {
  const [data, setData] = useState<InstagramAdoption | null>(null), [error, setError] = useState(false), [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setData(null); setError(false);
    void (async () => {
      try {
        const response = await fetch("/admin/api/analytics/instagram", {cache: "no-store", signal: controller.signal});
        if (!response.ok) throw new Error("unavailable");
        const result = parseInstagramAdoption(await response.json());
        if (!controller.signal.aborted) setData(result);
      } catch {if (!controller.signal.aborted) setError(true);}
    })();
    return () => controller.abort();
  }, [refresh, retry]);
  const rate = data && data.signed_in_accounts > 0 ? new Intl.NumberFormat("en-US", {style: "percent", maximumFractionDigits: 1}).format(data.with_instagram / data.signed_in_accounts) : "—";
  return <section className="analytics-instagram" aria-labelledby="instagram-adoption-heading">
    <header><h2 id="instagram-adoption-heading">Instagram username adoption</h2><p className="muted small">Signed in since 22 Oct 2026 UTC · independent of the date range above</p></header>
    {error ? <div><p role="alert">Instagram adoption could not be loaded.</p><button type="button" className="button secondary" onClick={() => setRetry(n => n + 1)}>Retry Instagram adoption</button></div> : !data ? <p role="status">Loading Instagram adoption…</p> : <>
      <div className="analytics-metrics">
        <section className="analytics-metric"><p>Added Instagram username</p><strong>{rate}</strong><span className="analytics-metric-detail">{number.format(data.with_instagram)} of {number.format(data.signed_in_accounts)} signed-in accounts</span></section>
        <section className="analytics-metric"><p>No Instagram</p><strong>{number.format(data.without_instagram)}</strong><span className="analytics-metric-detail">Explicitly selected “I don’t have Instagram”</span></section>
        <section className="analytics-metric"><p>No response</p><strong>{number.format(data.unanswered)}</strong><span className="analytics-metric-detail">No saved username or opt-out</span></section>
      </div>
      {data.signed_in_accounts === 0 && <p>No eligible accounts have a recorded sign-in since v2.</p>}
      <p className="muted small">Current saved choices for admitted accounts with a complete profile and a recorded sign-in since v2. Excludes deleted, banned and migration-held accounts. This measures saved usernames, not verified Instagram accounts or when they were added.</p>
      <p className="muted small">Updated <time dateTime={data.generated_at}>{new Intl.DateTimeFormat("en-US", {dateStyle: "medium", timeStyle: "short", timeZone: "UTC"}).format(new Date(data.generated_at))} UTC</time></p>
    </>}
  </section>;
}
