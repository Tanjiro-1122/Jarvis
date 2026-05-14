import { NextRequest, NextResponse } from "next/server";
import { computeToken, getSessionSecret, safeEqual, SESSION_COOKIE } from "@/lib/auth";

async function verifyToken(cookieValue: string, secret: string): Promise<boolean> {
  const dotIndex = cookieValue.indexOf(".");
  if (dotIndex === -1) return false; // legacy fixed-token format — reject
  const nonce = cookieValue.slice(0, dotIndex);
  const provided = cookieValue.slice(dotIndex + 1);
  if (!nonce || !provided) return false;
  const expected = await computeToken(secret, nonce);
  return safeEqual(provided, expected);
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow login page and auth API routes through
  if (pathname.startsWith("/login") || pathname.startsWith("/api/auth")) {
    return NextResponse.next();
  }

  // If SESSION_SECRET is not configured the app runs in open/local mode —
  // authentication is not enforced, so all routes are passed through.
  // This lets the local single-session workspace flow work without requiring
  // APP_PASSWORD + SESSION_SECRET to be set.
  const secret = getSessionSecret();
  if (!secret) {
    return NextResponse.next();
  }

  const token = request.cookies.get(SESSION_COOKIE)?.value;

  if (!token || !(await verifyToken(token, secret))) {
    const loginUrl = new URL("/login", request.url);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
