# Admin UI review — 21 October 2026

## Route inventory

| Route | Purpose | Navigation/authentication |
| --- | --- | --- |
| `/admin` | Exercise review and training-clip scan | Shared workspace; server admin check |
| `/admin/ranked-uploads` | Approve/reject ranked submissions | Shared workspace; server admin check |
| `/admin/ranking-flags` | Review ranked-post flags/frame evidence | Shared workspace; server admin check |
| `/admin/reports` | Post/comment/profile reports and moderation actions | Shared workspace; server admin check |
| `/admin/safety` | Flagged uploads/avatar safety review | Shared workspace; server admin check |
| `/admin/users` | Search accounts, ban/unban | Shared workspace; server admin check |
| `/admin/<unknown>` | Old/broken admin bookmarks | Shared not-found page after server admin check |
| `/admin/login` | Existing-account password login | Outside authenticated workspace layout |
| `/admin/auth/callback` | Authentication callback | Route handler; unchanged |
| `/admin/api/*` | 18 existing administration endpoints | Existing session/role, mutation and private-response checks unchanged |
| `/scoring`, `/scoring/rules.json` | Public scoring explanation/rules | Public; no admin data or mutation API |
| `/profile/[id]` | Public profile share/deep-link fallback | Public; unchanged |
| `/`, `/about`, `/support`, `/stats`, `/equipment`, `/privacy`, `/terms` | Public static website | Existing rewrites unchanged |

## Findings and changes

- Six separate dashboard sidebars had different links, order, branding, active
  states and sign-out availability. Users showed only two links. They now use
  one persistent App Router workspace layout and one six-item navigation list.
- Mobile CSS hid desktop navigation and relied on duplicate per-page links.
  Navigation now remains visible as a responsive grid; small-height viewports
  can scroll the sidebar. There is only one navigation landmark/menu in the DOM.
- Authorization-service errors used standalone login-card layouts, losing all
  navigation. They remain inside the workspace. Loading, unexpected errors and
  broken bookmarks also retain the same navigation and sign-out control.
- Sidebar branding consistently returns to exercise review. Public scoring and
  website links open in a separate tab so the review workspace stays available.
- Page titles and active states identify every workspace. Next links preserve
  the shell during navigation/back operations without changing route URLs.
- Short pages no longer vertically center because of automatic main margins.
  Headers/actions wrap at narrow widths. Long confirmation dialogs scroll within
  the viewport. Empty Users/Ranking flags panels now explain what to do next.
- Admin ban reasons are explicitly marked as shown to the banned user, matching
  the new owner-only account restriction screen. Other moderation reasons remain
  private; this change does not add timed bans or change moderation semantics.

## Verification and limits

Mocked UI tests render all six server pages inside the actual shared layout,
including empty states, authorization outages, loading/error/not-found children,
active route changes, retained sidebar DOM, sign-out failures and duplicate-click
guards. Authentication and authorization redirects remain tested for every page.
CSS contract checks cover mobile navigation visibility, wrapping and bounded
sidebar/dialog scrolling. Existing moderation API/decision suites are retained.

No live UI tests or real-user moderation mutations were performed. Production
HTTP checks can verify anonymous redirects/private APIs and public-page
availability; final visual interaction with a signed-in browser remains a manual
user check. Use `MODERATION_CHECKLIST.md` for disposable-account workflow checks.
