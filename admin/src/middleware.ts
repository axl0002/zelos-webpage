import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { cookieOptions, supabaseConfig } from "./lib/supabase/config";
export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });
  const { url, key } = supabaseConfig();
  const client = createServerClient(url, key, {
    cookieOptions,
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (values) => {
        values.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        values.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
      },
    },
  });
  await client.auth.getUser();
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}
export const config = {
  matcher: ["/admin/:path*"],
};
