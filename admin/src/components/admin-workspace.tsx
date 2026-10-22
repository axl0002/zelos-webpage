"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useRef, useState } from "react";
import {AdminReviewCountsProvider, ReviewCountBadge} from "./admin-review-counts";
import type {AdminReviewCounts} from "@/lib/admin-review-counts";

export const adminDestinations = [
  {href: "/admin", label: "Exercise review"},
  {href: "/admin/ranked-uploads", label: "Ranked uploads"},
  {href: "/admin/ranking-flags", label: "Ranking flags"},
  {href: "/admin/reports", label: "User reports"},
  {href: "/admin/safety", label: "Upload safety"},
  {href: "/admin/users", label: "Users"},
  {href: "/admin/scoring-lab", label: "Scoring lab"},
] as const;

const countKinds: Record<string, keyof AdminReviewCounts> = {
  "/admin/ranked-uploads": "ranked_uploads", "/admin/ranking-flags": "ranking_flags", "/admin/reports": "user_reports",
};

/** One persistent navigation shell for every admin workspace route/state. */
export default function AdminWorkspace({children}: {children: React.ReactNode}) {
  return <AdminReviewCountsProvider><WorkspaceContent>{children}</WorkspaceContent></AdminReviewCountsProvider>;
}
function WorkspaceContent({children}: {children: React.ReactNode}) {
  const pathname = usePathname(), router = useRouter();
  const [signingOut, setSigningOut] = useState(false), [error, setError] = useState("");
  const pending = useRef(false);
  async function signOut() {
    if (pending.current) return;
    pending.current = true; setSigningOut(true); setError("");
    try {
      const response = await fetch("/admin/api/auth/logout", {method: "POST", headers: {"Content-Type": "application/json"}, body: "{}"});
      if (!response.ok) throw new Error("Sign out failed");
      router.replace("/admin/login"); router.refresh();
    } catch {setError("Could not sign out. Please try again.");}
    finally {pending.current = false; setSigningOut(false);}
  }
  return <div className="workspace">
    <a className="admin-skip-link" href="#admin-content">Skip to workspace</a>
    <aside className="sidebar" aria-label="Admin workspace">
      <Link className="brand" href="/admin" prefetch={false} aria-label="Zelos admin home">zelos<span> / admin</span></Link>
      <nav className="admin-navigation" aria-label="Admin navigation">
        {adminDestinations.map(({href, label}) => {
          const active = href === "/admin" ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
          const kind = countKinds[href], badgeId = `admin-count-${kind}`;
          return <Link aria-label={label} aria-describedby={kind ? badgeId : undefined} key={href} href={href} prefetch={false} className={`nav-item${active ? " active" : ""}`} aria-current={active ? "page" : undefined}>{label}{kind && <ReviewCountBadge kind={kind} id={badgeId} />}</Link>;
        })}
      </nav>
      <div className="sidebar-bottom">
        <nav className="admin-public-links" aria-label="Public website">
          <a href="/scoring" target="_blank" rel="noopener noreferrer">Scoring guide <span className="sr-only">(opens in a new tab)</span><span aria-hidden="true">↗</span></a>
          <a href="/" target="_blank" rel="noopener noreferrer">Zelos website <span className="sr-only">(opens in a new tab)</span><span aria-hidden="true">↗</span></a>
        </nav>
        <button type="button" className="button secondary full" disabled={signingOut} onClick={() => void signOut()}>{signingOut ? "Signing out…" : "Sign out"}</button>
        {error && <p role="alert" className="error small">{error}</p>}
      </div>
    </aside>
    <main id="admin-content" className="main" tabIndex={-1}>{children}</main>
  </div>;
}
