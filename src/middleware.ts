import { NextRequest, NextResponse } from "next/server";

// Simple shared-password gate (HTTP Basic Auth). Protects the whole app —
// pages AND API routes — so nobody who finds the URL can spend your API credits.
//
// Set APP_PASSWORD in .env.local to enable it. If it's unset (e.g. local dev),
// the app is open. The browser will prompt for a username (any value) and the
// password once, then remember it for the session.
export function middleware(req: NextRequest) {
  const password = process.env.APP_PASSWORD;
  if (!password) return NextResponse.next(); // not configured → open

  const auth = req.headers.get("authorization");
  if (auth?.startsWith("Basic ")) {
    try {
      const decoded = atob(auth.slice(6));
      const idx = decoded.indexOf(":");
      const pass = idx >= 0 ? decoded.slice(idx + 1) : decoded;
      if (pass === password) return NextResponse.next();
    } catch {
      // fall through to challenge
    }
  }

  return new NextResponse("Authentication required", {
    status: 401,
    headers: {
      "WWW-Authenticate": 'Basic realm="Interview Coach", charset="UTF-8"',
    },
  });
}

export const config = {
  // protect everything except Next.js static assets
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
