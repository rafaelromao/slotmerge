import { NextResponse, type NextRequest } from "next/server";

const PROTECTED_PREFIXES = [
  "/me",
  "/searches",
  "/admin",
];

const PUBLIC_PREFIXES = [
  "/sign-in",
  "/auth",
  "/api/local",
  "/api/v1",
  "/webhooks",
  "/_next",
  "/favicon",
];

function isProtected(pathname: string): boolean {
  return PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

function isPublic(pathname: string): boolean {
  return PUBLIC_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

export function middleware(request: NextRequest): NextResponse {
  const { pathname } = request.nextUrl;

  if (isPublic(pathname)) {
    return NextResponse.next();
  }

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-url", request.url);
  requestHeaders.set("x-pathname", pathname);

  if (isProtected(pathname)) {
    const sessionCookie = request.cookies.get("slotmerge_session");
    if (!sessionCookie) {
      const returnTo = `${pathname}${request.nextUrl.search}`;
      const target = new URL(
        `/sign-in?returnTo=${encodeURIComponent(returnTo)}`,
        request.url,
      );
      return NextResponse.redirect(target, 303);
    }
  }

  return NextResponse.next({
    request: { headers: requestHeaders },
  });
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|_next/data|favicon.ico|api/local/health).*)",
  ],
};
