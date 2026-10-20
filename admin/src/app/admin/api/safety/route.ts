import { privateResponse } from "@/lib/ranked-upload-api";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { rpcFailure } from "@/lib/review-api";

export const dynamic = "force-dynamic";

export async function GET() {
  return privateResponse(await handler());
}

async function handler() {
  try {
  const auth = await requireAdmin();
  if (auth.response) return auth.response;
  const { data, error } = await auth.client.rpc("get_upload_reviews");
  return error
    ? rpcFailure(error)
    : NextResponse.json(data, { headers: { "Cache-Control": "private, no-store" } });
  } catch { return NextResponse.json({error: "The review service is temporarily unavailable. Your inputs are still here; try again."}, {status: 503}); }
}
