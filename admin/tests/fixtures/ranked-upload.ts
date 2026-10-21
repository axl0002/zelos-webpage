import type { RankedUploadReview } from "../../src/lib/ranked-uploads";
export const rankedUpload: RankedUploadReview = {
  id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
  owner_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  post_id: "ranked-private-post", title: "Full Planche attempt", username: "athlete",
  created_at: "2026-10-16T12:00:00Z", board_id: "planche-hold-full", board_name: "Full Planche",
  exercise_name: "Planche Hold", progression: "Full", metric: "seconds", claim: 12,
  guidelines: {board_id: "planche-hold-full", form_standard: "Keep arms straight.\nHips level with shoulders",
    camera_standard: "Film from the side with the full body visible.", form_checkpoints: [],
    counting_standard: null, common_mistakes: [], demo_caption: null,
    rules: [
      {id:"10000000-0000-4000-8000-000000000001",type:"form",text:"Keep arms straight.",position:0},
      {id:"10000000-0000-4000-8000-000000000002",type:"form",text:"Hips level with shoulders",position:1},
      {id:"10000000-0000-4000-8000-000000000003",type:"filming",text:"Film from the side with the full body visible.",position:0},
    ]},
  projected_rank: 2, participants: 11, cutoff: 2, top_percent: 10,
  always_require_review: false, reason: "top_percent", revision: 4, state: "rank_review",
  review_note: null, rejection_reason: null, rejection_rules: [],
};
export const privatePreview = {url: "https://zelos-supabase-staging.0123456789abcdef0123456789abcdef.r2.cloudflarestorage.com/private/clip?X-Amz-Signature=test", expires_in: 120};
