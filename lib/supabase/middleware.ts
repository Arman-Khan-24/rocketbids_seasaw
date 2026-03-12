import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  const isAuthRoute =
    pathname.startsWith("/login") || pathname.startsWith("/register");
  const isAdminRoute = pathname.startsWith("/admin");
  const isBidderRoute = pathname.startsWith("/bidder");

  // Do not hard-redirect unauthenticated users in middleware.
  // Client role layouts handle redirects reliably after hydration.
  if (!user) {
    return supabaseResponse;
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  const role =
    profile?.role === "admin" || profile?.role === "bidder"
      ? profile.role
      : user.user_metadata?.role === "admin"
        ? "admin"
        : "bidder";

  if (isAuthRoute || pathname === "/") {
    const url = request.nextUrl.clone();
    url.pathname = role === "admin" ? "/admin/dashboard" : "/bidder/browse";
    return NextResponse.redirect(url);
  }

  // Admin visiting bidder routes → redirect to admin dashboard
  if (role === "admin" && isBidderRoute) {
    const url = request.nextUrl.clone();
    url.pathname = "/admin/dashboard";
    return NextResponse.redirect(url);
  }

  // Bidder visiting admin routes → redirect to bidder browse
  if (role === "bidder" && isAdminRoute) {
    const url = request.nextUrl.clone();
    url.pathname = "/bidder/browse";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
