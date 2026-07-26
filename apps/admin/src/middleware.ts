import { NextResponse, type NextRequest } from "next/server";

/**
 * Convenience redirect only. This middleware improves UX by redirecting
 * unauthenticated requests to `/login` early, but it is NOT the authorization
 * boundary — every protected layout/page/route handler calls
 * `requireAdminSession` itself (see `src/lib/session.ts`), so a bypassed or
 * misconfigured middleware can never grant access on its own.
 */
export function middleware(request: NextRequest) {
  // Supabase (@supabase/ssr) stores the auth session in cookies named
  // `sb-<project-ref>-auth-token` (possibly chunked). Presence is only a UX
  // hint here; `requireAdminSession` is the real authorization boundary.
  const hasSessionCookie = request.cookies
    .getAll()
    .some((cookie) => cookie.name.startsWith("sb-") && cookie.name.includes("auth-token"));
  const { pathname } = request.nextUrl;

  // Password recovery must be reachable without a session: `/reset-password`
  // starts the flow, `/auth/confirm` exchanges the emailed token for one, and
  // `/update-password` renders its own expired-link state when the recovery
  // session is missing rather than bouncing to a login the user cannot pass.
  const isPublicPath =
    pathname === "/" ||
    pathname === "/login" ||
    pathname === "/reset-password" ||
    pathname === "/update-password" ||
    pathname.startsWith("/auth/") ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api/health");

  if (!hasSessionCookie && !isPublicPath) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("from", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|brand).*)"],
};
