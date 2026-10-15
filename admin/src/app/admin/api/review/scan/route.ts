import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { checkMutation, rpcFailure } from "@/lib/review-api";
export async function POST(request: NextRequest) {
  const invalid = checkMutation(request);
  if (invalid) return invalid;
  const auth = await requireAdmin();
  if (auth.response) return auth.response;
  const body = await request.json().catch(() => null);
  if (
    !body ||
    (body.after !== null &&
      (typeof body.after !== "string" || body.after.length > 200))
  )
    return NextResponse.json(
      { error: "Invalid scan cursor." },
      { status: 400 },
    );
  const { data, error } = await auth.client.rpc("admin_scan_rank_candidates", {
    after_post: body.after,
    batch_size: 500,
  });
  return error ? rpcFailure(error) : NextResponse.json(data);
}
