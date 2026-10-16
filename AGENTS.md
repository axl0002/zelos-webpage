# Public scoring transparency

Keep `/scores` accurate whenever changing the record-points formula, weights,
aggregation, tie rules, or eligibility. Its source is the read-only
`get_public_score_rules()` RPC in the canonical mobile/backend Supabase migrations.

- Configuration/weight edits appear automatically. For a new formula, update the
  contract, page copy, calculator, worked examples and tests in the same release.
- Keep the backend's implementation-hash guard. Do not silently fall back to an
  old formula or hardcoded weights when the live contract is unavailable.
- Do not expose athlete records, database write APIs or privileged credentials.
  The public page is outside admin session middleware and accepts no SQL input.
- Validate with mocked UI/HTTP and isolated PostgreSQL tests. Do not run live UI
  tests or simulators. Read-only production HTTP/API checks are permitted.
- Public static assets still have matching copies in `site/` and `admin/public/`.
