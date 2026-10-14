# Zelos website

`site/` is the existing static landing website. `admin/` is a separate Node/Next.js
application mounted at `/admin` for reviewing copied training clips for rankings.
The admin uses only Zelos Supabase (`obnirsfjxcvyyiocwaii`) and published media at
`media.zelos.club`. The old Firebase admin pages/endpoints have been removed from
this branch; their source remains in Git. The public landing site's existing
files and production hosting have not been changed.

## Run the admin locally

Use Node 22 or later.

```sh
cd admin
npm ci
cp .env.example .env.local
# Set the public Supabase anon key and the exact browser origin in .env.local.
npm run dev
```

Open **http://localhost:3004/admin**. Development assets use `.next-dev/`;
production builds use `.next/`, so a build does not overwrite the active dev
server's styles or script chunks. Keep `.env.local` out of Git. Only the public
Supabase URL/key and the application origin are needed.

The landing site remains independently served at `/`. Every request beginning
with `/admin` (including `/admin/_next`, `/admin/api`, and `/admin/auth`) must be
forwarded to the Node process **without stripping the `/admin` prefix**.
`next.config.js` owns that base path. Example reverse-proxy location:

```nginx
location /admin {
    proxy_pass http://127.0.0.1:3004;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
}
```

For hosted deployment, set `ADMIN_ORIGIN` to the exact HTTPS origin, add its
`/admin/auth/callback` URL to Supabase Auth's redirect allow-list, build with the
public Supabase environment, and run the Node app behind HTTPS. Public deployment
and hosting changes have not been performed. Do not cache authenticated responses
in a reverse proxy/CDN.

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
without a path or trailing slash. Configure routing separately if the landing
site and admin app use different hosting projects. A Git push alone does not set
environment variables or route the landing site's `/admin` path.

## Review workflow

1. **Scan training clips** reads bounded batches of eligible, already-imported
   Supabase posts. It matches exercise names/variants in title and description,
   plus retained structured exercise tags. Generic mentions can suggest several
   exercises. Suggestions are intentionally candidates, not classifications.
2. Select a clip and watch it. The video uses 720p first, then smaller/other
   renditions, then the original, with fallback on playback errors. Only the
   selected video loads metadata. Use the speed control to inspect reps/form.
3. Choose the exercise and active progression. **The result starts blank.** Count
   completed reps or whole hold seconds from the video. Add notes/timestamps.
4. Click **Approve ranking** and confirm approval in the dialog. If the athlete
   already has a current entry, it is preserved unless the reviewer explicitly
   chooses replacement.
5. Skip unsuitable clips with a reason. Skipped posts remain training clips.
   Approved/Skipped filters provide read-only decision history. Rescanning never
   resets completed decisions. Editing a completed decision is deliberately not
   exposed; correct fields before approval.

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

Validation completed: 34 isolated UI/API/configuration tests, 355 isolated SQL
assertions in the backend repository, TypeScript and optimized build, and zero
dependency audit findings. Tests cover password login, non-admin rejection,
temporary Auth failures, review-input preservation and real Supabase SSR clients
with mocked HTTP, including chunked cookie refresh propagation. Backend/API checks
confirm unauthenticated private-data requests return 401 and cross-origin
mutations return 403. No live UI tests are required or run.
