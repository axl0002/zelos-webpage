import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { cookieOptions, supabaseConfig } from "./lib/supabase/config";
import { temporaryAuthError } from "./lib/supabase/auth-errors";
import { dynamicContentSecurityPolicy } from "../security-policy.cjs";
export async function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname.replace(/\/$/, "");
  const admin = path === "/admin" || path.startsWith("/admin/");
  const nonce = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(16))));
  const policy = dynamicContentSecurityPolicy(nonce, admin, process.env.NODE_ENV === "development");
  const requestHeaders = new Headers(request.headers);
  // Overwrite supplied values. Next uses this request CSP to nonce its scripts.
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", policy);
  let response = NextResponse.next({request: {headers: requestHeaders}});
  function finish(result: NextResponse) {
    if (result !== response)
      response.cookies.getAll().forEach(cookie => result.cookies.set(cookie));
    result.headers.set("Cache-Control", "private, no-store");
    result.headers.set("Content-Security-Policy", policy);
    return result;
  }
  // Public dynamic pages receive script protection without any session lookup.
  if (!admin) return finish(response);
  const { url, key } = supabaseConfig();
  const client = createServerClient(url, key, {
    cookieOptions,
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (values) => {
        values.forEach(({ name, value }) => request.cookies.set(name, value));
        requestHeaders.set("cookie", request.headers.get("cookie") ?? "");
        response = NextResponse.next({request: {headers: requestHeaders}});
        values.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
      },
    },
  });
  // Login/callback must remain reachable, and APIs keep their JSON status codes.
  const workspace = path !== "/admin/login" && path !== "/admin/auth/callback" &&
    path !== "/admin/api" && !path.startsWith("/admin/api/");
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
  matcher: ["/admin/:path*", "/scoring", "/profile/:path*", "/battle/:path*"],
};
