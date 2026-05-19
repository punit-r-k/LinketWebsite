import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { CSRF_COOKIE_NAME } from "@/lib/csrf";
import { matchPrivilegedRouteId } from "@/lib/api-authorization-policy";
import { isCrossOriginRequest, resolveCorsHeaders } from "@/lib/cors";
import {
  buildRateLimitHeaders,
  consumeRateLimit,
  getClientIp,
  getRateLimitConfig,
  resolveApiRateLimitProfile,
} from "@/lib/rate-limit";
import { hasAmbiguousRequestBodyHeaders } from "@/lib/security";
import {
  readBearerTokenFromHeaders,
  verifySupabaseAccessToken,
} from "@/lib/supabase/auth-token";
import {
  LOCALE_COOKIE_NAME,
  LOCALE_SOURCE_COOKIE_NAME,
  normalizeLocale,
  resolveDetectedLocale,
  type SupportedLocale,
} from "@/lib/i18n";
import { getOptionalConfiguredSiteOrigin } from "@/lib/site-url";

type CanonicalHostConfig = {
  host: string;
  hostname: string;
};

function parseHostCsvEnv(value: string | undefined) {
  return (value ?? "")
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
}

function parseCanonicalHost(value: string | null | undefined) {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  try {
    const parsed = new URL(
      trimmed.includes("://") ? trimmed : `https://${trimmed}`
    );
    return {
      host: parsed.host.toLowerCase(),
      hostname: parsed.hostname.toLowerCase(),
    } satisfies CanonicalHostConfig;
  } catch {
    return null;
  }
}

function getCanonicalHostConfig(): CanonicalHostConfig | null {
  const explicit = parseCanonicalHost(process.env.CANONICAL_HOST);
  if (explicit) {
    return explicit;
  }

  return parseCanonicalHost(getOptionalConfiguredSiteOrigin());
}

function shouldRedirectToCanonicalHost(
  requestUrl: URL,
  canonicalHost: CanonicalHostConfig
) {
  const requestHost = requestUrl.host.toLowerCase();
  const requestHostname = requestUrl.hostname.toLowerCase();

  if (requestHost === canonicalHost.host) {
    return false;
  }

  if (
    requestHostname === "localhost" ||
    requestHostname === "127.0.0.1" ||
    requestHostname.endsWith(".vercel.app")
  ) {
    return false;
  }

  const explicitAliases = parseHostCsvEnv(process.env.CANONICAL_HOST_ALIASES);
  if (
    explicitAliases.includes(requestHost) ||
    explicitAliases.includes(requestHostname)
  ) {
    return true;
  }

  const bareCanonicalHost = canonicalHost.hostname.replace(/^www\./, "");
  const derivedAliases = new Set([bareCanonicalHost, `www.${bareCanonicalHost}`]);
  derivedAliases.delete(canonicalHost.hostname);

  return derivedAliases.has(requestHostname);
}

function applyCookies(source: NextResponse, target: NextResponse) {
  for (const cookie of source.cookies.getAll()) {
    target.cookies.set(cookie);
  }
}

function applyHeaders(
  response: NextResponse,
  headers: Record<string, string> | null | undefined
) {
  if (!headers) {
    return;
  }

  for (const [key, value] of Object.entries(headers)) {
    response.headers.set(key, value);
  }
}

function readRequestedCorsHeaders(request: NextRequest) {
  const requestedHeaders =
    request.headers.get("access-control-request-headers") ?? "";
  return requestedHeaders
    .split(",")
    .map((header) => header.trim())
    .filter(Boolean);
}

function resolveApiCorsHeaders(request: NextRequest) {
  const requestedMethod =
    request.headers.get("access-control-request-method")?.trim().toUpperCase() ??
    request.method.toUpperCase();

  return resolveCorsHeaders(request.headers.get("origin"), {
    allowHeaders: readRequestedCorsHeaders(request),
    allowMethods: ["OPTIONS", requestedMethod],
  });
}

function getRequestCountry(request: NextRequest) {
  return (
    request.headers.get("x-vercel-ip-country") ??
    request.headers.get("cf-ipcountry") ??
    request.headers.get("x-country-code")
  );
}

function resolveLocaleForRequest(request: NextRequest) {
  const cookieSource = request.cookies.get(LOCALE_SOURCE_COOKIE_NAME)?.value;
  const cookieLocale = request.cookies.get(LOCALE_COOKIE_NAME)?.value;
  const preferredCookieLocale =
    !cookieSource || cookieSource === "manual" ? cookieLocale : undefined;

  return resolveDetectedLocale({
    queryLocale: request.nextUrl.searchParams.get("lang"),
    cookieLocale: preferredCookieLocale,
    country: getRequestCountry(request),
    acceptLanguage: request.headers.get("accept-language"),
  });
}

function buildLocalizedRequestHeaders(
  request: NextRequest,
  locale: SupportedLocale
) {
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-linket-locale", locale);
  return requestHeaders;
}

function applyLocaleCookies(
  request: NextRequest,
  response: NextResponse,
  locale: SupportedLocale
) {
  const requestedLocale = normalizeLocale(request.nextUrl.searchParams.get("lang"));
  const cookieLocale = normalizeLocale(
    request.cookies.get(LOCALE_COOKIE_NAME)?.value
  );
  const cookieSource = request.cookies.get(LOCALE_SOURCE_COOKIE_NAME)?.value;
  const source =
    requestedLocale || cookieSource === "manual" ? "manual" : "detected";

  if (!requestedLocale && cookieLocale === locale && cookieSource === source) {
    return;
  }

  const secure = request.nextUrl.protocol === "https:";
  const maxAge = 60 * 60 * 24 * 365;

  response.cookies.set({
    name: LOCALE_COOKIE_NAME,
    value: locale,
    sameSite: "lax",
    secure,
    path: "/",
    maxAge,
  });
  response.cookies.set({
    name: LOCALE_SOURCE_COOKIE_NAME,
    value: source,
    sameSite: "lax",
    secure,
    path: "/",
    maxAge,
  });
}

async function resolveApiUserId(request: NextRequest) {
  const bearerToken = readBearerTokenFromHeaders(request.headers);
  if (bearerToken) {
    const verified = await verifySupabaseAccessToken(bearerToken);
    return {
      invalidToken: !verified.user,
      userId: verified.user?.id ?? null,
    };
  }

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get: (name) => request.cookies.get(name)?.value,
        set() {},
        remove() {},
      },
    }
  );
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return {
    invalidToken: false,
    userId: user?.id ?? null,
  };
}

async function handleApiRequest(request: NextRequest) {
  const routeId = matchPrivilegedRouteId(
    request.method,
    request.nextUrl.pathname
  );
  const origin = request.headers.get("origin");
  const crossOrigin = isCrossOriginRequest(origin, request.nextUrl.origin);
  const corsHeaders = resolveApiCorsHeaders(request);

  if (request.method === "OPTIONS" && origin) {
    if (crossOrigin && !corsHeaders) {
      console.warn("Blocked API preflight from disallowed origin", {
        origin,
        pathname: request.nextUrl.pathname,
      });
      return new NextResponse(null, {
        headers: { Vary: "Origin" },
        status: 403,
      });
    }

    return new NextResponse(null, {
      headers: corsHeaders ?? { Vary: "Origin" },
      status: 204,
    });
  }

  if (crossOrigin && origin && !corsHeaders) {
    console.warn("Blocked API request from disallowed origin", {
      origin,
      pathname: request.nextUrl.pathname,
    });
    return NextResponse.json(
      { error: "Origin not allowed." },
      {
        headers: { Vary: "Origin" },
        status: 403,
      }
    );
  }

  const rateLimitConfig = getRateLimitConfig();
  if (!rateLimitConfig.enabled) {
    const response = NextResponse.next({ request: { headers: request.headers } });
    applyHeaders(response, corsHeaders);
    return response;
  }

  const rateLimitProfile = resolveApiRateLimitProfile({
    isPrivilegedRoute: Boolean(routeId),
    pathname: request.nextUrl.pathname,
  });
  const ipRateLimitState = await consumeRateLimit({
    identifier: getClientIp(request.headers),
    limit: rateLimitProfile.ip.limit,
    prefix: request.nextUrl.pathname,
    scope: "ip",
    windowMs: rateLimitProfile.ip.windowMs,
  });

  if (!ipRateLimitState.allowed) {
    const response = NextResponse.json(
      { error: "Too many requests. Please try again later." },
      { status: 429 }
    );
    applyHeaders(response, corsHeaders);
    applyHeaders(response, buildRateLimitHeaders([ipRateLimitState]));
    console.warn("API rate limit exceeded", {
      pathname: request.nextUrl.pathname,
      scope: "ip",
    });
    return response;
  }

  const rateLimitStates = [ipRateLimitState];
  if (routeId && rateLimitProfile.user) {
    const actor = await resolveApiUserId(request);
    if (actor.invalidToken) {
      const response = NextResponse.json(
        { error: "Invalid bearer token." },
        { status: 401 }
      );
      applyHeaders(response, corsHeaders);
      applyHeaders(response, buildRateLimitHeaders(rateLimitStates));
      return response;
    }

    if (actor.userId) {
      const userRateLimitState = await consumeRateLimit({
        identifier: actor.userId,
        limit: rateLimitProfile.user.limit,
        prefix: request.nextUrl.pathname,
        scope: "user",
        windowMs: rateLimitProfile.user.windowMs,
      });
      rateLimitStates.push(userRateLimitState);

      if (!userRateLimitState.allowed) {
        const response = NextResponse.json(
          { error: "Too many requests. Please try again later." },
          { status: 429 }
        );
        applyHeaders(response, corsHeaders);
        applyHeaders(response, buildRateLimitHeaders(rateLimitStates));
        console.warn("API rate limit exceeded", {
          pathname: request.nextUrl.pathname,
          scope: "user",
          userId: actor.userId,
        });
        return response;
      }
    }
  }

  const response = NextResponse.next({ request: { headers: request.headers } });
  applyHeaders(response, corsHeaders);
  applyHeaders(response, buildRateLimitHeaders(rateLimitStates));
  return response;
}

export async function proxy(req: NextRequest) {
  const url = req.nextUrl;
  const locale = resolveLocaleForRequest(req);
  const localizedRequestHeaders = buildLocalizedRequestHeaders(req, locale);

  if (hasAmbiguousRequestBodyHeaders(req.headers)) {
    return NextResponse.json(
      { error: "Ambiguous request body framing is not allowed." },
      { status: 400 }
    );
  }

  const canonicalHost = getCanonicalHostConfig();
  if (canonicalHost && shouldRedirectToCanonicalHost(url, canonicalHost)) {
    url.host = canonicalHost.host;
    const redirect = NextResponse.redirect(url, 308);
    applyLocaleCookies(req, redirect, locale);
    return redirect;
  }

  const path = url.pathname;
  if (path.startsWith("/api/")) {
    return handleApiRequest(req);
  }

  const needsSupabase =
    path.startsWith("/dashboard") ||
    path.startsWith("/auth") ||
    path.startsWith("/profile") ||
    path.startsWith("/admin");

  if (!needsSupabase) {
    const response = NextResponse.next({
      request: { headers: localizedRequestHeaders },
    });
    applyLocaleCookies(req, response, locale);
    return response;
  }

  const res = NextResponse.next({
    request: { headers: localizedRequestHeaders },
  });
  applyLocaleCookies(req, res, locale);
  if (!req.cookies.get(CSRF_COOKIE_NAME)?.value) {
    res.cookies.set({
      name: CSRF_COOKIE_NAME,
      value: crypto.randomUUID(),
      sameSite: "lax",
      secure: url.protocol === "https:",
      path: "/",
    });
  }

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get: (name) => req.cookies.get(name)?.value,
        set: (name, value, options) => {
          res.cookies.set({ name, value, ...(options ?? {}) });
        },
        remove: (name, options) => {
          res.cookies.set({ name, value: "", ...(options ?? {}), maxAge: 0 });
        },
      },
    }
  );

  const {
    data: { session },
  } = await supabase.auth.getSession();
  const fullPath = `${url.pathname}${url.search}`;
  const requiresAuth =
    path.startsWith("/dashboard") ||
    path.startsWith("/profile") ||
    path.startsWith("/admin");

  if (requiresAuth && !session) {
    const redirectUrl = new URL("/auth", req.url);
    redirectUrl.searchParams.set("view", "signin");
    redirectUrl.searchParams.set("next", fullPath || path);
    const redirect = NextResponse.redirect(redirectUrl);
    applyCookies(res, redirect);
    return redirect;
  }

  if (path.startsWith("/dashboard/admin") && session?.user?.id) {
    const { data: adminRows, error: adminError } = await supabase
      .from("admin_users")
      .select("user_id")
      .eq("user_id", session.user.id)
      .limit(1);

    if (adminError || !adminRows || adminRows.length === 0) {
      const redirectUrl = new URL("/dashboard", req.url);
      const redirect = NextResponse.redirect(redirectUrl);
      applyCookies(res, redirect);
      return redirect;
    }
  }

  return res;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml).*)"],
};
