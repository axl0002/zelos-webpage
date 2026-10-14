import { NextRequest, NextResponse } from "next/server";
import { serverClient } from "@/lib/supabase/server";
import { checkMutation } from "@/lib/review-api";
export async function POST(request: NextRequest) {
  const invalid = checkMutation(request);
  if (invalid) return invalid;
  const client = await serverClient();
  await client.auth.signOut({ scope: "local" });
  return NextResponse.json({ ok: true });
}
