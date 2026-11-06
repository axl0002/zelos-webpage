import {NextRequest,NextResponse} from "next/server";
import {requireAdmin} from "@/lib/require-admin";
import {privateResponse} from "@/lib/ranked-upload-api";
import {parseAnalyticsQuery} from "@/lib/admin-analytics";
import {getDailyActiveUsers} from "@/lib/admin-dau.server";
export const dynamic="force-dynamic";
export async function GET(request:NextRequest) {
  try{
    const auth=await requireAdmin();
    if(auth.response)return privateResponse(auth.response);
    const query=parseAnalyticsQuery(request.nextUrl.searchParams);
    if(!query)return privateResponse(NextResponse.json({error:"Choose 7, 30 or 90 days and a valid time zone."},{status:400}));
    return privateResponse(NextResponse.json(await getDailyActiveUsers(query)));
  }catch{return privateResponse(NextResponse.json({error:"Daily active users could not be loaded. Please try again."},{status:503}));}
}
