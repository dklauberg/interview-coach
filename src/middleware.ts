import { NextRequest, NextResponse } from "next/server";

// Access gate (HTTP Basic Auth). Protects the whole app — pages AND API routes —
// so nobody who finds the URL can spend your API credits.
//
// Two ways to configure access (set either or both in .env.local):
//   APP_PASSWORD=somepass
//     A single shared password. Any username works; only the password is checked.
//   APP_USERS=artur:781452,ana:hunter2
//     Named users, each with their own password ("user:pass" pairs, comma-separated).
//
// If neither is set (e.g. local dev), the app is open. When both are set, a request
// is allowed if it matches the shared password OR any named user.
export function middleware(req: NextRequest) {
  const sharedPassword = process.env.APP_PASSWORD?.trim();
  const usersRaw = process.env.APP_USERS?.trim();

  if (!sharedPassword && !usersRaw) return NextResponse.next(); // not configured → open

  const auth = req.headers.get("authorization");
  if (auth?.startsWith("Basic ")) {
    try {
      const decoded = atob(auth.slice(6));
      const idx = decoded.indexOf(":");
      const user = (idx >= 0 ? decoded.slice(0, idx) : "").trim();
      const pass = idx >= 0 ? decoded.slice(idx + 1) : decoded;

      // shared password — any username
      if (sharedPassword && pass === sharedPassword) return NextResponse.next();

      // named users — username + password must both match
      if (usersRaw) {
        for (const pair of usersRaw.split(",")) {
          const sep = pair.indexOf(":");
          if (sep < 0) continue;
          const u = pair.slice(0, sep).trim();
          const p = pair.slice(sep + 1).trim();
          if (u === user && p === pass) return NextResponse.next();
        }
      }
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
