import {NextRequest, NextResponse} from "next/server";
import {requireAdmin} from "@/lib/require-admin";
import {privateResponse} from "@/lib/ranked-upload-api";
import {parseInstagramAdoption} from "@/lib/admin-instagram-adoption";
export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdmin();
    if (auth.response) return privateResponse(auth.response);
    if (request.nextUrl.search) return privateResponse(NextResponse.json({error: "This metric always covers sign-ins since Zelos v2."}, {status: 400}));
    const {data, error} = await auth.client.rpc("admin_instagram_adoption_v1");
    if (error) return privateResponse(NextResponse.json({error: "Instagram adoption could not be loaded."}, {status: error.code === "42501" ? 403 : 503}));
    return privateResponse(NextResponse.json(parseInstagramAdoption(data)));
  } catch {return privateResponse(NextResponse.json({error: "Instagram adoption could not be loaded."}, {status: 503}));}
}
