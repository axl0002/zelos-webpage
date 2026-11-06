import { NextResponse } from "next/server";
import { getPublicScoreWeights } from "@/lib/score-weights.server";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    return NextResponse.json(await getPublicScoreWeights(), {
      headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
    });
  } catch {
    return NextResponse.json({ error: "Exercise weights are temporarily unavailable." }, {
      status: 503, headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
    });
  }
}
