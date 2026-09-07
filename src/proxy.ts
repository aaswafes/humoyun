import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Next.js 16 renamed middleware.ts -> proxy.ts.
// Keeps the Supabase auth cookie fresh and gates the app shell.
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  // Local preview mode has no accounts, so there is nothing to gate.
  if (process.env.NEXT_PUBLIC_SOLO === "1") return response;

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet) => {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const { data: { user } } = await supabase.auth.getUser();
  const { pathname } = request.nextUrl;
  const isAuthRoute = pathname.startsWith("/login") || pathname.startsWith("/auth");

  if (!user && !isAuthRoute) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  if (user && isAuthRoute) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return response;
}

// `api/` and `sw.js` sit outside the gate on purpose. A route handler is
// reached by callers with no session cookie — Telegram's webhook, a cron —
// so it authenticates itself with its own secret; redirecting one to /login
// would answer a webhook with an HTML page. And the service worker must be
// fetchable before anyone signs in, or it can never install.
export const config = {
  matcher: ["/((?!api/|_next/static|_next/image|favicon.ico|manifest.webmanifest|sw.js|icon|.*\\.(?:svg|png|jpg|jpeg|gif|webp|woff2?)$).*)"],
};
