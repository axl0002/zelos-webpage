"use client";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { parseAdminReviewCounts, reviewCountsChanged, type AdminReviewCounts } from "@/lib/admin-review-counts";

type CountsState = {counts: AdminReviewCounts | null; loading: boolean};
const CountsContext = createContext<CountsState>({counts: null, loading: false});
export function AdminReviewCountsProvider({children}: {children: React.ReactNode}) {
  const pathname = usePathname();
  const [state, setState] = useState<CountsState>({counts: null, loading: true});
  const mounted = useRef(false), version = useRef(0), request = useRef<AbortController | null>(null);
  const refresh = useCallback(async () => {
    if (!mounted.current || document.visibilityState === "hidden") return;
    const current = ++version.current;
    request.current?.abort();
    const controller = new AbortController(); request.current = controller;
    setState(old => ({...old, loading: true}));
    const timeout = window.setTimeout(() => {
      controller.abort();
      if (mounted.current && current === version.current) setState({counts: null, loading: false});
    }, 15000);
    try {
      const response = await fetch("/admin/api/review-counts", {cache: "no-store", signal: controller.signal});
      if (!response.ok) throw new Error("Review counts unavailable");
      const counts = parseAdminReviewCounts(await response.json());
      if (mounted.current && current === version.current && !controller.signal.aborted) setState({counts, loading: false});
    } catch {
      // A failed or expired read means unknown, never an empty queue.
      if (mounted.current && current === version.current) setState({counts: null, loading: false});
    } finally {window.clearTimeout(timeout);}
  }, []);
  useEffect(() => {
    mounted.current = true;
    const trigger = () => {void refresh();};
    const visibility = () => {
      if (document.visibilityState !== "hidden") trigger();
      else {++version.current; request.current?.abort();}
    };
    const interval = window.setInterval(trigger, 30000);
    window.addEventListener("focus", trigger);
    window.addEventListener(reviewCountsChanged, trigger);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      mounted.current = false; ++version.current; request.current?.abort(); window.clearInterval(interval);
      window.removeEventListener("focus", trigger);
      window.removeEventListener(reviewCountsChanged, trigger);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [refresh]);
  useEffect(() => {void refresh();}, [pathname, refresh]);
  return <CountsContext.Provider value={state}>{children}</CountsContext.Provider>;
}
export function ReviewCountBadge({kind, id}: {kind: keyof AdminReviewCounts; id: string}) {
  const {counts, loading} = useContext(CountsContext);
  const count = counts?.[kind];
  const description = count === undefined ? loading ? "Loading unprocessed count" : "Unprocessed count unavailable"
    : `${count} unprocessed ${kind === "user_reports" ? `reports: ${counts!.current_reports} current, ${counts!.legacy_reports} legacy` : kind.replaceAll("_", " ")}`;
  return <span id={id} className={`review-count-badge ${count === undefined ? "unknown" : count === 0 ? "quiet" : "pending"}`}
    title={description} aria-busy={loading || undefined}>
    <span aria-hidden="true">{count ?? (loading ? "…" : "?")}</span><span className="sr-only">{description}</span>
  </span>;
}
