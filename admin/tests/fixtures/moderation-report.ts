import type { ModerationReport } from "../../src/lib/moderation-reports";
export const report: ModerationReport = {
  id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd", target_kind: "post", target_id: "reported-post",
  state: "open", revision: 3, created_at: "2026-10-20T00:00:00Z", report_count: 1, auto_hidden: true,
  decision_note: null, context: null,
  reports: [{id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee", reason: "Spam", details: "Repeated links in the video.",
    created_at: "2026-10-20T00:00:00Z", timestamp_ms: 12500,
    answers_snapshot: {category: {label: "Spam"}, options: [{label: "Unwanted links or messages"}], locations: [{label: "Video"}]}}],
};
export const reportPreview = {title: "Reported video", username: "athlete", caption: "Caption to review", urls: ["https://media.zelos.club/reported.mp4"]};
