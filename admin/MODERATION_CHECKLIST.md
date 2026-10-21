# Moderation release checklist

Use disposable accounts and videos for manual checks. Automated checks use mocked
HTTP/UI and isolated backend fixtures; they do not modify real athletes.

## Automated dry runs

Run `npm test`, `npm run typecheck`, and `npm run build` from `admin/`.

- Ranked uploads: preview, exact saved hold boundaries, watched confirmation,
  approve/reject, rule/note validation, stale revision, failed preview and retry.
- Ranking flags: frame evidence/seek, reject ranking or dismiss flag, stale review
  confirmation, unavailable content and sanitized route errors.
- User reports: post/comment/profile evidence; timestamp seek; confirm/dismiss;
  hide, restore, delete and ban owner; reason and explicit confirmation; refreshed
  state/revision after decisions; no client-supplied owner target.
- Users: username/ID search, bounded public results, ban and remove manual ban,
  refreshed account state/revision, switching targets clears pending inputs.
- Mutation routes: authenticated admin, same-origin JSON, request/revision
  validation, duplicate-submission guard, stable retry identity, no-store replies,
  SQL/error detail redaction and restricted-account protection.
- Upload safety: flagged video/avatar preview, approve/reject, validation and retry.

## Manual staging / disposable-account verification

1. Submit an eligible ranked clip that enters admin review. In **Ranked uploads**,
   inspect the video and timing, confirm review, approve. Verify the app shows the
   accepted post/record and recalculated ranks. Repeat with a second clip and
   reject with a specific reason; check uploader feedback and no accepted record.
2. Flag a ranked clip's start/end frames. In **Ranking flags**, verify the original
   selected reason and frame positions. Test dismissal, then a separate confirmed
   flag; check the resulting ranked eligibility in the app.
3. Report a disposable post, comment and profile. In **User reports**, verify
   evidence and timestamps. Confirm one violation and dismiss another. Check
   visibility in a separate non-admin account.
4. For a disposable post report, enter a reason and **Hide video**. Verify it leaves
   public feeds/rankings. **Restore video** and verify eligible content returns;
   independent safety/ban restrictions must remain. **Delete video** on another
   disposable clip and verify it stays unavailable and cannot be restored.
5. In **Users**, search the exact disposable username (also try its UUID), ban it,
   and verify app access/content restrictions. Remove the manual ban and verify
   recovery. Separate strike/safety restrictions must remain in force.
6. Repeat **Ban user** from each supported report kind; verify the reported
   content's owner is affected, never the reporter. Confirm admin/self protection.
7. In two admin sessions, load the same case/user; change one, then attempt a stale
   action in the other. Expect a refresh error without a second mutation.
8. Verify moderation audit records, queued media cleanup and leaderboard updates
   using authorized backend checks. Imported legacy media is shared with the old
   app and is not physically removed by new-app deletion.

Backend migration must be deployed before the web release. Production dry runs
must not ban/delete existing athletes or posts; these manual steps remain user-run
until explicitly performed with disposable fixtures.
