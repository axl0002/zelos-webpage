import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { checkMutation, rpcFailure } from "@/lib/review-api";
import { privateResponse } from "@/lib/ranked-upload-api";
import { parseReportAction } from "@/lib/admin-users";
export async function POST(request: NextRequest) {
  const invalid = checkMutation(request); if (invalid) return privateResponse(invalid);
  try {
    const auth = await requireAdmin(); if (auth.response) return privateResponse(auth.response);
    const input = parseReportAction(await request.json().catch(() => null));
    if (!input) return privateResponse(NextResponse.json({error: "Select a report action and provide a reason of 3–1000 characters."}, {status: 400}));
    const {error} = await auth.client.rpc("admin_moderate_safety_case", input);
    return privateResponse(error ? rpcFailure(error) : NextResponse.json({ok: true}));
  } catch { return privateResponse(rpcFailure({})); }
}
