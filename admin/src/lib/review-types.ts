export type Board = {
  id: string;
  exercise_id: string;
  exercise_name: string;
  name: string;
  progression: string | null;
  metric: "reps" | "seconds";
  max_value: number;
  form: string;
  camera: string;
};
export type ReviewContext = { user_id: string; boards: Board[] };
export type Suggestion = {
  exercise_id: string;
  name: string;
  evidence: string[];
};
export type CurrentRecord = {
  exercise_id: string;
  board_id: string;
  name: string;
  value: number;
  metric: string;
  origin: string;
  post_id: string;
};
export type Candidate = {
  post_id: string;
  revision: number;
  status: "pending" | "approved" | "skipped";
  title: string;
  caption: string;
  username: string;
  country: string | null;
  author_id: string;
  created_at: string;
  duration_ms: number | null;
  primary_url: string;
  poster_url: string | null;
  renditions: Record<string, string>;
  suggestions: Suggestion[];
  warnings: string[];
  current_records: CurrentRecord[];
  board_id: string | null;
  value: number | null;
  note: string;
  reviewed_at: string | null;
  result: { active: boolean } | null;
};
export type QueuePage = {
  items: Candidate[];
  stats: Record<"pending" | "approved" | "skipped", number>;
};
export type Decision = {
  post_id: string;
  revision: number;
  decision: "approve" | "skip";
  board_id: string | null;
  value: number | null;
  note: string;
  watched: boolean;
  replace_current: boolean;
};
