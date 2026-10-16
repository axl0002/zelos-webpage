import { parseScoreRules } from "./score-rules";
import { supabaseConfig } from "./supabase/config";

// Only Server Components / server routes import this module. No session cookies,
// privileged keys, user-supplied URL, SQL, table name or parameters are accepted.
export async function getPublicScoreRules() {
  const { url, key } = supabaseConfig();
  const response = await fetch(`${url}/rest/v1/rpc/get_public_score_rules`, {
    method: "POST",
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: "{}",
    cache: "no-store",
    signal: AbortSignal.timeout(6000),
  });
  if (!response.ok) throw new Error("Scoring rules unavailable");
  return parseScoreRules(await response.json());
}
