import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { privateResponse } from "@/lib/ranked-upload-api";
import { rpcFailure } from "@/lib/review-api";
import { parseAdminUsers } from "@/lib/admin-users";
export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdmin();
    if (auth.response) return privateResponse(auth.response);
    const query = request.nextUrl.searchParams.get("q")?.trim() ?? "";
    if (query.length < 2 || query.length > 100) return privateResponse(NextResponse.json({error: "Enter at least two characters of a username, or a user ID."}, {status: 400}));
    const {data, error} = await auth.client.rpc("admin_search_users", {search_text: query, page_size: 30});
    return privateResponse(error ? rpcFailure(error) : NextResponse.json(parseAdminUsers(data)));
  } catch { return privateResponse(rpcFailure({})); }
}
