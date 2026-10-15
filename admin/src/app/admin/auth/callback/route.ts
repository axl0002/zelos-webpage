import { NextRequest, NextResponse } from "next/server";
import { serverClient } from "@/lib/supabase/server";
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const origin = process.env.ADMIN_ORIGIN || request.nextUrl.origin;
  if (code) {
    const client = await serverClient();
    const { error } = await client.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL("/admin", origin));
  }
  return NextResponse.redirect(new URL("/admin/login?error=expired", origin));
}
