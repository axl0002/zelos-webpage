import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { rpcFailure } from "@/lib/review-api";
export const dynamic = "force-dynamic";
export async function GET() {
  const auth = await requireAdmin();
  if (auth.response) return auth.response;
  const { data, error } = await auth.client.rpc("admin_ranking_flags");
  return error ? rpcFailure(error) : NextResponse.json(data, { headers: { "Cache-Control": "private, no-store" } });
}
