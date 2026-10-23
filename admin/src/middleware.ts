import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { cookieOptions, supabaseConfig } from "./lib/supabase/config";
import { temporaryAuthError } from "./lib/supabase/auth-errors";
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
  const path = request.nextUrl.pathname.replace(/\/$/, "");
  // Login/callback must remain reachable, and APIs keep their JSON status codes.
  const workspace = path !== "/admin/login" && path !== "/admin/auth/callback" &&
    path !== "/admin/api" && !path.startsWith("/admin/api/");
  function finish(result: NextResponse) {
    if (result !== response)
      response.cookies.getAll().forEach(cookie => result.cookies.set(cookie));
    result.headers.set("Cache-Control", "private, no-store");
    return result;
  }
  function unavailable() {
    return finish(new NextResponse("Could not verify admin access. Please try again.", {
      status: 503, headers: {"Content-Type": "text/plain; charset=utf-8"},
    }));
  }
  try {
    const { data: { user }, error } = await client.auth.getUser();
    if (workspace) {
      if (temporaryAuthError(error)) return unavailable();
      if (error || !user)
        return finish(NextResponse.redirect(new URL("/admin/login", request.url)));
    }
  } catch {
    if (workspace) return unavailable();
  }
  return finish(response);
}
export const config = {
  matcher: ["/admin/:path*"],
};
