import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { privateResponse } from "@/lib/ranked-upload-api";
import { parseDailyAnalytics, parseAnalyticsQuery } from "@/lib/admin-analytics";
export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdmin();
    if (auth.response) return privateResponse(auth.response);
    const query = parseAnalyticsQuery(request.nextUrl.searchParams);
    if (!query) return privateResponse(NextResponse.json({error: "Choose 7, 30 or 90 days and a valid time zone."}, {status: 400}));
    const {data, error} = await auth.client.rpc("admin_daily_analytics_v1", {days: query.days, timezone_name: query.timezone});
    if (error) return privateResponse(NextResponse.json({error: error.code === "42501" ? "This account does not have admin access." : "Analytics could not be loaded. Please try again."}, {status: error.code === "42501" ? 403 : 503}));
    return privateResponse(NextResponse.json(parseDailyAnalytics(data, query)));
  } catch {return privateResponse(NextResponse.json({error: "Analytics could not be loaded. Please try again."}, {status: 503}));}
}
