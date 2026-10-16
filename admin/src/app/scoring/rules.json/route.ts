import { NextResponse } from "next/server";
import { getPublicScoreRules } from "@/lib/score-rules.server";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    return NextResponse.json(await getPublicScoreRules(), {
      headers: {
        "Cache-Control": "public, max-age=60",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return NextResponse.json(
      { error: "Scoring rules are temporarily unavailable." },
      {
        status: 503,
        headers: { "Cache-Control": "no-store" },
      },
    );
  }
}
