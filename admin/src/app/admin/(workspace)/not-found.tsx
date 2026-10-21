import Link from "next/link";
export default function WorkspaceNotFound() {
  return <section className="review-panel workspace-state">
    <h1>Page not found.</h1><p className="muted">Choose a workspace from the navigation or return to exercise review.</p>
    <Link className="button primary" href="/admin">Back to exercise review</Link>
  </section>;
}
