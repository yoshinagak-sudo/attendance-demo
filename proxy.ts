import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const PUBLIC_PATHS = [
  "/favicon.ico",
  "/robots.txt",
];

export function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  if (PUBLIC_PATHS.includes(pathname)) return NextResponse.next();

  const user = process.env.BASIC_AUTH_USER;
  const pass = process.env.BASIC_AUTH_PASS;
  if (!user || !pass) return NextResponse.next();

  const auth = request.headers.get("authorization");
  if (auth) {
    const [scheme, encoded] = auth.split(" ");
    if (scheme === "Basic" && encoded) {
      try {
        const decoded = atob(encoded);
        const sep = decoded.indexOf(":");
        if (sep > 0) {
          const u = decoded.slice(0, sep);
          const p = decoded.slice(sep + 1);
          if (u === user && p === pass) return NextResponse.next();
        }
      } catch {
        // fall through to 401
      }
    }
  }

  return new NextResponse("Authentication required", {
    status: 401,
    headers: {
      "WWW-Authenticate": 'Basic realm="attendance-demo"',
    },
  });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|robots.txt).*)"],
};
