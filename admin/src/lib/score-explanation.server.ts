import {parseScoreExplanation} from "./score-explanation";
import {supabaseConfig} from "./supabase/config";
export async function getPublicScoreExplanation() {
  const {url, key} = supabaseConfig();
  const response = await fetch(`${url}/rest/v1/rpc/get_public_score_explanation_v1`, {
    method: "POST", headers: {apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json"},
    body: "{}", cache: "no-store", signal: AbortSignal.timeout(6000),
  });
  if (!response.ok) throw Error("Scoring explanation unavailable");
  return parseScoreExplanation(await response.json());
}
