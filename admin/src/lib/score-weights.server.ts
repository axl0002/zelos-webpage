import { parsePublicScoreWeights } from "./score-weights";
import { supabaseConfig } from "./supabase/config";

// Fixed anonymous read-only RPC. Its backend implementation guard also applies
// when the separate scoring-status request is unavailable.
export async function getPublicScoreWeights() {
  const { url, key } = supabaseConfig();
  const response = await fetch(`${url}/rest/v1/rpc/get_public_score_weights_v1`, {
    method: "POST",
    headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: "{}",
    cache: "no-store",
    signal: AbortSignal.timeout(6000),
  });
  if (!response.ok) throw new Error("Exercise weights unavailable");
  return parsePublicScoreWeights(await response.json());
}
