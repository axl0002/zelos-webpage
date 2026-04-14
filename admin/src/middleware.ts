import { NextResponse, type NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Only protect admin routes (everything except /login)
  if (pathname === "/login") {
    return NextResponse.next();
  }

  // Check for session cookie
  const session = request.cookies.get("__session");

  if (!session?.value) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  // Cookie exists — actual token verification happens server-side in API routes/layout
  // Middleware on Edge can't use firebase-admin, so we do a basic cookie presence check here
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|login|api/auth).*)"],
};
