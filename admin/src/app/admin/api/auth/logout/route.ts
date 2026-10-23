import { NextRequest, NextResponse } from "next/server";
import { serverClient } from "@/lib/supabase/server";
import { checkMutation } from "@/lib/review-api";
import { privateResponse } from "@/lib/ranked-upload-api";
export async function POST(request: NextRequest) {
  const invalid = checkMutation(request);
  if (invalid) return privateResponse(invalid);
  try {
    const client = await serverClient();
    const {error} = await client.auth.signOut({ scope: "local" });
    if (!error) return privateResponse(NextResponse.json({ ok: true }));
  } catch { /* Never claim success when the session could not be cleared. */ }
  return privateResponse(NextResponse.json({error: "Could not sign out. Please try again."}, {status: 503}));
}
