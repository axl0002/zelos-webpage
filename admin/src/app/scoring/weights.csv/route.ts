import { getPublicScoreWeights } from "@/lib/score-weights.server";
import { exportWeightCsv } from "@/lib/score-weights-csv";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    const weights = await getPublicScoreWeights();
    return new Response(exportWeightCsv(weights.weights), {headers: {
      "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="zelos-scoring-weights.csv"',
      "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff",
    }});
  } catch {
    return Response.json({error: "Exercise weights are temporarily unavailable."}, {status: 503,
      headers: {"Cache-Control": "no-store", "X-Content-Type-Options": "nosniff"}});
  }
}
