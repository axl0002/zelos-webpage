import {NextRequest, NextResponse} from "next/server";
import {requireAdmin} from "@/lib/require-admin";
import {checkMutation} from "@/lib/review-api";
import {privateResponse} from "@/lib/ranked-upload-api";
import {parseAdminWeightContext, parseWeightEdits, parseWeightReceipt, weightFingerprint, weightRequestId} from "@/lib/admin-score-weights";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
const json = (data: unknown, status = 200) => privateResponse(NextResponse.json(data, {status}));
const bad = () => json({error: "Check the complete weight table, confirmation and change reason."}, 400);
function failure(error: unknown) {
  const code = error && typeof error === "object" ? (error as {code?: string}).code : undefined;
  if (code === "42501") return json({error: "This account cannot manage scoring weights."}, 403);
  if (["40001", "23505", "55000"].includes(code ?? "")) return json({error: "Scoring settings changed. Refresh current weights and review the CSV again before applying."}, 409);
  if (code === "22023" || code === "22003") return bad();
  return json({error: "Could not confirm the weight change. Retry the same apply request to check its result before starting another change."}, 503);
}
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdmin(); if (auth.response) return privateResponse(auth.response);
    if ([...request.nextUrl.searchParams].length) return bad();
    const {data, error} = await auth.client.rpc("admin_score_weights_context_v1");
    return error ? failure(error) : json(parseAdminWeightContext(data));
  } catch { return json({error: "Current scoring weights could not be loaded. Try refreshing."}, 503); }
}
export async function POST(request: NextRequest) {
  const invalid = checkMutation(request); if (invalid) return privateResponse(invalid);
  try {
    const auth = await requireAdmin(); if (auth.response) return privateResponse(auth.response);
    const limit = 512 * 1024;
    if ([...request.nextUrl.searchParams].length || Number(request.headers.get("content-length") ?? 0) > limit) return bad();
    const reader = request.body?.getReader(); if (!reader) return bad();
    let raw = "", bytes = 0; const decoder = new TextDecoder("utf-8", {fatal: true});
    try {
      while (true) { const {done, value} = await reader.read(); if (done) break;
        bytes += value.byteLength; if (bytes > limit) { await reader.cancel(); return bad(); }
        raw += decoder.decode(value, {stream: true});
      }
      raw += decoder.decode();
    } catch { return bad(); } finally { reader.releaseLock(); }
    let body: Record<string, unknown>, weights;
    try {
      body = JSON.parse(raw);
      if (!body || typeof body !== "object" || Array.isArray(body) ||
          Object.keys(body).length !== 5 || !["request_id", "expected_fingerprint", "weights", "change_reason", "confirmation"].every(key => key in body) ||
          !weightRequestId(body.request_id) || !weightFingerprint(body.expected_fingerprint) || body.confirmation !== "APPLY" ||
          typeof body.change_reason !== "string" || body.change_reason.trim().length < 10 || body.change_reason.trim().length > 2000) return bad();
      weights = parseWeightEdits(body.weights);
    } catch { return bad(); }
    // Do not reject a retry by fetching a newer context here: the versioned
    // backend must resolve its existing request ID before checking freshness.
    const {data, error} = await auth.client.rpc("admin_apply_score_weights_v1", {
      request_id: body.request_id, expected_fingerprint: body.expected_fingerprint,
      weights, change_reason: (body.change_reason as string).trim(),
    });
    if (error) return failure(error);
    const receipt = parseWeightReceipt(data); if (receipt.request_id.toLowerCase() !== (body.request_id as string).toLowerCase()) return failure({});
    return json(receipt);
  } catch { return failure({}); }
}
