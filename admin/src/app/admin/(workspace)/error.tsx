"use client";
export default function WorkspaceError({reset}: {error: Error & {digest?: string}; reset: () => void}) {
  return <section className="review-panel workspace-state">
    <h1>Could not load this page.</h1>
    <p role="alert" className="error">The service is temporarily unavailable. Please try again or choose another page.</p>
    <button className="button primary" onClick={reset}>Try again</button>
  </section>;
}
