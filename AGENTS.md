# Public scoring transparency

When the public scoring contract returns `scores_only`, keep formulas and
algorithm parameters private and show the generic public scoring page. Do not
restore a public calculator for an alternative algorithm.

Keep `/scoring` accurate whenever changing the record-points formula, weights,
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

# Backward compatibility and legacy clients

- Keep released Zelos clients and already-open admin browser versions working,
  including users who never upgrade. For an incompatible feature, preserve the
  existing contract and normally add a separately named `_v2`/`_v3` Supabase RPC
  or explicitly versioned HTTP request path. Avoid ambiguous same-name overloads.
- Preserve legacy function signatures, accepted requests, response shapes,
  pagination/cursors and access rules. New watch tracking, telemetry or client
  capabilities cannot become prerequisites for legacy calls; missing history is
  unknown rather than proof that a post was watched.
- Test old requests and cursors as well as new and mixed-version usage, including
  authorization on both paths. Deploy additive backend support before the client
  or website that calls it, and preserve a safe fallback/rollback path.
- Do not retire legacy support without the user's explicit approval of a
  separate deprecation/migration plan. Coordinate canonical backend work with
  `../CalisthenicsRanker/AGENTS.md` and its saved Supabase account mapping.
