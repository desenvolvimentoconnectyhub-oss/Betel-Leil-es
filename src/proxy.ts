import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const adminMatcher = /^\/admin(?:\/.*)?$/;
const adminApiMatcher = /^\/api\/admin(?:\/.*)?$/;

function cleanToken(value: string | undefined) {
  return value?.trim() || "";
}

function hasMachineToken(request: NextRequest) {
  const expectedTokens = [
    process.env.CRON_SECRET,
    process.env.BETEL_SOURCE_PROVIDER_TOKEN,
    process.env.BETEL_COMMUNICATION_WORKER_TOKEN,
    process.env.BETEL_COMMUNICATION_SCHEDULER_TOKEN,
  ]
    .map(cleanToken)
    .filter(Boolean);

  if (!expectedTokens.length) return false;

  const authorization = request.headers.get("authorization") || "";
  const directToken =
    request.headers.get("x-admin-token") ||
    request.headers.get("x-source-token") ||
    request.headers.get("x-scheduler-token") ||
    "";

  return expectedTokens.some((token) => authorization === `Bearer ${token}` || directToken === token);
}

function redirectToLogin(request: NextRequest, reason?: string) {
  const url = new URL("/login", request.url);
  url.searchParams.set("next", `${request.nextUrl.pathname}${request.nextUrl.search}`);
  if (reason) url.searchParams.set("error", reason);
  return NextResponse.redirect(url);
}

function jsonUnauthorized(status: 401 | 403, message: string) {
  return NextResponse.json({ success: false, error: message }, { status });
}

export async function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const isAdminPage = adminMatcher.test(pathname);
  const isAdminApi = adminApiMatcher.test(pathname);

  if (!isAdminPage && !isAdminApi) {
    return NextResponse.next();
  }

  if (isAdminApi && hasMachineToken(request)) {
    return NextResponse.next();
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    return isAdminApi
      ? jsonUnauthorized(401, "Supabase publico nao configurado.")
      : redirectToLogin(request, "supabase_not_configured");
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options);
        });
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return isAdminApi
      ? jsonUnauthorized(401, "Sessao administrativa obrigatoria.")
      : redirectToLogin(request);
  }

  await supabase.rpc("claim_admin_user_by_email");

  const { data: adminUser, error } = await supabase
    .from("admin_users")
    .select("id,role,status")
    .eq("auth_user_id", user.id)
    .eq("status", "active")
    .maybeSingle();

  if (error || !adminUser) {
    return isAdminApi
      ? jsonUnauthorized(403, "Usuario sem permissao administrativa ativa.")
      : redirectToLogin(request, "admin_required");
  }

  return response;
}

export const config = {
  matcher: ["/admin/:path*", "/api/admin/:path*"],
};
