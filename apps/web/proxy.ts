import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function proxy(request: NextRequest) {
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
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const pathname = request.nextUrl.pathname;

  // 未認証ユーザーをログインへリダイレクト
  if (!user && !pathname.startsWith("/auth")) {
    return NextResponse.redirect(new URL("/auth/login", request.url));
  }

  // 認証済みユーザーのロール判定とダッシュボードへのリダイレクト
  if (user && pathname === "/") {
    const { data: employee } = await supabase
      .from("employees")
      .select("role")
      .eq("id", user.id)
      .single();

    const role = employee?.role;
    if (role === "manager" || role === "office") {
      return NextResponse.redirect(new URL("/manager/dashboard", request.url));
    }
    if (role === "staff") {
      return NextResponse.redirect(new URL("/staff/dashboard", request.url));
    }
  }

  // manager ルートを manager / office のみ許可
  if (pathname.startsWith("/manager")) {
    const { data: employee } = await supabase
      .from("employees")
      .select("role")
      .eq("id", user!.id)
      .single();

    if (!["manager", "office"].includes(employee?.role ?? "")) {
      return NextResponse.redirect(new URL("/staff/dashboard", request.url));
    }
  }

  return supabaseResponse;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
