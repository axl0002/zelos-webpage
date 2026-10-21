const queues = [
  ["/admin", "Exercise review"],
  ["/admin/ranked-uploads", "Ranked uploads"],
  ["/admin/ranking-flags", "Ranking flags"],
  ["/admin/reports", "User reports"],
  ["/admin/safety", "Upload safety"],
  ["/admin/users", "Users"],
] as const;
/** Visible on narrow screens as well as the desktop sidebar. */
export default function ReviewQueueNav({active}: {active: string}) {
  return <nav className="review-queue-links" aria-label="Review queues">
    {queues.map(([href, label]) => <a key={href} href={href} aria-current={active === href ? "page" : undefined}>{label}</a>)}
  </nav>;
}
