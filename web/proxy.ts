import { getSessionCookie } from "better-auth/cookies";
import { NextResponse, type NextRequest } from "next/server";

// Optimistic gate: no session cookie → /login. Pages verify the session for real (lib/session.ts).
// /api, /mcp and /.well-known are excluded: Better Auth and OAuth bearer tokens handle those.
// So is /c/<token> (a coach link: the token is the key). /assistant tells an assistant how to connect.
const PUBLIC = new Set(["/login", "/privacy", "/terms", "/assistant"]);

export function proxy(request: NextRequest) {
  if (!getSessionCookie(request) && !PUBLIC.has(request.nextUrl.pathname)) {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|icon|apple-icon|api|mcp|c/|\\.well-known).*)"],
};
