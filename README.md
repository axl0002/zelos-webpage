# Zelos website

`admin/` is one Node/Next.js deployment serving the existing static landing website
at `/` and the ranking-review dashboard at `/admin`. The original landing HTML,
styles, images and fonts are included in `admin/public/`. The existing `site/`
folder is retained as the original static source. A test keeps both copies identical.
Support, Privacy, and Terms use the landing page's shared `/styles.css`, Inter
typography, navigation, and footer. Shared color variables keep their dark palette
consistent. When editing public pages or styles, update both `site/` and
`admin/public/`; support links use `https://zelos.club/support`.
Privacy, Terms, Support, Stats, About and Equipment keep their existing `.html`
URLs; extensionless versions also work. Shop links still point to the separate
Shopify store at `https://shop.zelos.club/`; its domain and DNS are unchanged.
The admin uses only Zelos Supabase (`obnirsfjxcvyyiocwaii`) and published media at
`media.zelos.club`. The old Firebase admin pages/endpoints have been removed from
this branch; their source remains in Git.

## Production hosting

Vercel serves `https://zelos.club/` and `https://zelos.club/admin` from the `main`
branch, using project `zelos-webpage`, root directory `admin`, and the Next.js
preset. Cloudflare remains the DNS provider. The former Cloudflare Worker and
its domain binding are no longer present; there is no Pages deployment.

`www.zelos.club` redirects to the apex. `support.zelos.club` is also a production
project domain and redirects to `https://zelos.club/support`. All three domains
have HTTPS. The apex A records and the two subdomain CNAME records are DNS-only
and use Vercel's recommended values. Shopify, media, CDN, email, and other
unrelated DNS records were preserved.

Production uses `ADMIN_ORIGIN=https://zelos.club`. The public Supabase URL and
anon key are configured in Vercel for production, preview, and development;
preview requests use their own origin. Supabase Auth allows the production
`/admin/auth/callback` URL while retaining the mobile and localhost callbacks.
Use the custom domain for production admin reviews.

## Run the admin locally

Use Node 22 or later.

```sh
cd admin
npm ci
cp .env.example .env.local
# Set the public Supabase anon key and the exact browser origin in .env.local.
npm run dev
```

Open **http://localhost:3004/** for the landing page or
**http://localhost:3004/admin** for the dashboard. Development assets use `.next-dev/`;
production builds use `.next/`, so a build does not overwrite the active dev
server's styles or script chunks. Keep `.env.local` out of Git. Only the public
Supabase URL/key and the application origin are needed.

The Next.js router owns `/admin`, `/admin/api`, and `/admin/auth`; there is no
global `basePath`. Static landing pages and assets are served from the root,
including `/assets`, `/fonts`, and `/styles.css`. Session middleware and private
cache headers apply only to `/admin` routes. The public site retains its existing
HTML metadata and runs without Supabase session checks.

For hosted deployment, set `ADMIN_ORIGIN` to the exact HTTPS origin, add its
`/admin/auth/callback` URL to Supabase Auth's redirect allow-list, and deploy the
whole `admin/` app behind HTTPS. Do not cache authenticated responses in a reverse
proxy/CDN.

## Authentication and authorization

Supabase verifies the session server-side; PostgreSQL checks the existing
`zelos_internal.app_members` admin role for **every** admin RPC. Client metadata,
email strings, and cookie presence do not grant access. The browser and Node
server use the authenticated user's token and public key; neither has a service
role credential. POST endpoints require a matching Origin and JSON content type.

The login form uses Supabase `signInWithPassword`. Admin accounts must be assigned
the admin role through a trusted backend operation; there is no public admin
registration. Account passwords must not be stored in source, documentation, or
environment files. Logout affects only the current web session.

The browser checks the admin RPC before navigation for useful feedback; every
page/API and database RPC still enforces authorization independently. An ordinary
Zelos account cannot review clips. Custom SMTP is not needed for password login;
future password-reset emails would require a working email-delivery setup.

Temporary failures contacting Supabase Auth are retried once during the server
identity check. If the service is still unavailable (or rate limited), the API
returns 503 with retry guidance and preserves the review form, instead of claiming
the admin is signed out. Workspace loading also offers retry instead of redirecting
an outage to login. Invalid/revoked sessions still return 401 and non-admin accounts
still return 403. The approval mutation itself is never automatically retried.

The public `anon`/publishable key identifies the application and does not grant
administrative access. `public-env.cjs` rejects service-role, secret, management,
user and wrong-project JWTs in the public key setting before Next.js bundles them.
Never configure a privileged key in a `NEXT_PUBLIC_*` variable. Country names and
app startup flags are deliberately public read-only data; private data and review
actions require authorization.

For Vercel, configure the project root as `admin`, use the Next.js framework
preset, and set the three variables in `admin/.env.example` for each deployment
environment. `ADMIN_ORIGIN` must match that environment's exact HTTPS origin,
without a path or trailing slash (`https://zelos.club` after the domain cutover).
Assign `zelos.club` to this project at cutover: the build includes both public pages and
the dashboard, so a second admin project or reverse proxy is unnecessary. Keep
the existing `shop.zelos.club` DNS records pointing to Shopify. A Git push alone
does not set environment variables or domain assignments.

## Review workflow

1. **Scan training clips** reads bounded batches of eligible, already-imported
   Supabase posts. It matches exercise names/variants in title and description,
   plus retained structured exercise tags. Generic mentions can suggest several
   exercises. Candidates whose title or description contains `assist`, `assisted`,
   `assit`, `band`, `bands`, or `banded` are automatically rejected for ranking.
   The same rule rejects bad/poor/sloppy/incorrect form or technique, weighted
   exercise wording (including common misspellings, added weight and weight vests),
   and kg/kilo/kilogram mentions such as `20kg` or `2.5 KGs`. Matching ignores case
   and separators (`bad-form`, `bad_form`, `badform`), while keeping `unassisted`,
   `unweighted`, and `bodyweight` distinct. Automatic rejections save matched
   reasons in review history and leave the post as Training. Completed
   decisions are preserved. The scan reports elapsed time and rejection totals.
2. Select a clip and watch it. The video uses 720p first, then smaller/other
   renditions, then the original, with fallback on playback errors. Only the
   selected video loads and autoplays muted. Use the player controls for sound
   and the speed control to inspect reps/form.
3. Choose the exercise and active progression. **The result starts blank.** Count
   completed reps or whole hold seconds from the video. Notes/timestamps are optional.
4. Click **Approve ranking** to save the review immediately. If the athlete
   already has a current entry, it is preserved unless the reviewer explicitly
   chooses replacement.
5. Click **Reject ranking** to save a rejection immediately; notes are optional.
   Rejected clips remain training posts.
   Approved/Rejected filters provide read-only decision history. Rescanning never
   resets completed decisions. Editing a completed decision is deliberately not
   exposed; correct fields before approval.
6. Each successful decision immediately opens the next buffered clip. The queue
   refills in the background and keeps the current video and inputs mounted.
   Failed saves preserve the current clip and inputs for retry.

No automated scan changes a post type or leaderboard result. The scan excludes
banned/held/deleted users, removed/hidden/deleted/unpublished posts, already-ranked
clips, and media outside the published CDN. Eligibility is checked again at
approval. Supabase restrictions reflect the copied destination; the separate
pre-cutover source synchronization is still required while the old app is live.

Approval is one PostgreSQL transaction: lock/recheck the candidate revision and
source fingerprint, validate the human count and active board, create a historical
`human_review` submission, attach the selected exercise, change the post type,
optionally update the one-entry-per-athlete/exercise pointer, and record the
reviewer/decision/snapshots in a private audit table. It does not fabricate the
original athlete's acceptance of new guidelines. Retries are idempotent; competing
or stale approvals fail with a conflict and retain the reviewer's form input.

## Backend and validation

The canonical migration and isolated PostgreSQL tests live in the mobile/backend
repository, not a second migration history:

- `CalisthenicsRanker/calisthenics_ranker/supabase/migrations/20261013164304_app_rank_candidate_review.sql`
- `CalisthenicsRanker/calisthenics_ranker/supabase/tests/app_rank_candidate_review.sql`
- `experiments/supabase_migration/deploy_rank_candidate_review.mjs`

```sh
cd admin
npm test
npm run typecheck
npm run build
npm audit
```

Validation completed: 71 isolated UI/API/configuration tests, TypeScript and an
optimized build. Isolated production HTTP checks also verified 35 public
routes/assets against their original bytes, anonymous admin redirects, and
unauthenticated API rejection. Tests cover password login, non-admin rejection,
temporary Auth failures, review-input preservation and real Supabase SSR clients
with mocked HTTP, including chunked cookie refresh propagation. Landing-route
tests check existing HTML links, Shopify destinations, assets and session
middleware boundaries without executing public page scripts. Backend/API checks
confirm unauthenticated private-data requests return 401 and cross-origin
mutations return 403. No live UI tests are required or run.

## Public scoring guide

`https://zelos.club/scoring` is a public Server Component explaining exercise-record
points, each enabled progression weight, ties,
small-board smoothing, discipline totals and worked examples. Its calculator runs
only in the visitor's browser. It uses the same shared document styles as privacy,
support and terms. The old `/scores` URLs permanently redirect to `/scoring`. The page and `/scoring/rules.json` read the same
validated `get_public_score_rules()` response using the existing public Supabase
key. They do not use admin sessions, privileged keys, athlete records or write APIs.
The RPC takes no parameters and has an explicit field allowlist. Hidden draft
exercises are excluded. Data/connection failures show an unavailable state rather
than presenting a hardcoded old formula as current.

Weights are finite, non-negative relative values with no ceiling of 100. The
comparison tables show configured exercises as columns and a shared ascending
weight scale including empty rows. Upcoming skills are included in the tables
and hypothetical calculator without status labels; availability is shown only in
the app, where upcoming exercises cannot be submitted or earn points. Disabled
progressions are omitted from the tables and calculator, while the public JSON
retains their metadata.

Weights and configuration come from Supabase on each page request. The public JSON
may be cached for up to 60 seconds. Configuration/catalogue changes advance the
publication revision/date automatically. Formula/aggregation changes must update
the documented algorithm, explanation, calculator, parity tests and the backend's
implementation hashes together; an unmatched implementation fails closed. Do not
refresh hashes without checking the public explanation. The backend migration is
`app_public_score_rules` in the canonical CalisthenicsRanker Supabase repository.
Follow `AGENTS.md` and run `scores*.test.ts*`, `site-routing.test.ts`, TypeScript,
the production build and the isolated PostgreSQL `app_public_score_rules.sql`
permission/formula tests for changes to this contract.
