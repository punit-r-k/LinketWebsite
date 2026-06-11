import type { NextConfig } from "next";

function parseCsvEnv(value: string | undefined) {
  return (value ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function getDeploymentEnvironment() {
  const explicit =
    process.env.APP_ENV?.trim().toLowerCase() ??
    process.env.VERCEL_ENV?.trim().toLowerCase() ??
    "";

  if (explicit === "production") {
    return "production";
  }
  if (explicit === "preview" || explicit === "staging") {
    return "staging";
  }
  if (process.env.NODE_ENV === "production") {
    return "production";
  }
  return "development";
}

function getAllowedOriginsRaw() {
  const deploymentEnvironment = getDeploymentEnvironment();
  if (deploymentEnvironment === "production") {
    return (
      process.env.CORS_ALLOWED_ORIGINS_PRODUCTION?.trim() ??
      process.env.CORS_ALLOWED_ORIGINS?.trim() ??
      ""
    );
  }
  if (deploymentEnvironment === "staging") {
    return (
      process.env.CORS_ALLOWED_ORIGINS_STAGING?.trim() ??
      process.env.CORS_ALLOWED_ORIGINS?.trim() ??
      ""
    );
  }
  return (
    process.env.CORS_ALLOWED_ORIGINS_DEVELOPMENT?.trim() ??
    process.env.CORS_ALLOWED_ORIGINS?.trim() ??
    ""
  );
}

function assertSafeProductionSecurityConfig() {
  if (getDeploymentEnvironment() !== "production") {
    return;
  }

  const allowedOriginsRaw = getAllowedOriginsRaw();
  const allowCredentials =
    process.env.CORS_ALLOW_CREDENTIALS?.trim().toLowerCase() === "true";
  const rateLimitEnabled =
    process.env.RATE_LIMIT_ENABLED?.trim().toLowerCase() !== "false";

  if (allowedOriginsRaw === "*") {
    throw new Error("Wildcard CORS origins are forbidden in production.");
  }

  const allowedOrigins = parseCsvEnv(allowedOriginsRaw);
  if (allowCredentials && allowedOrigins.includes("*")) {
    throw new Error(
      "Credentialed CORS requests require explicit origins in production."
    );
  }

  if (!process.env.INTERNAL_SECRET?.trim()) {
    throw new Error("Missing INTERNAL_SECRET in production.");
  }

  if (
    rateLimitEnabled &&
    (!process.env.UPSTASH_REDIS_REST_URL?.trim() ||
      !process.env.UPSTASH_REDIS_REST_TOKEN?.trim())
  ) {
    throw new Error(
      "Missing Upstash Redis configuration for production API rate limiting."
    );
  }
}

assertSafeProductionSecurityConfig();

function originFromEnv(url?: string) {
  try {
    if (!url) return null;
    const u = new URL(url);
    return u.origin;
  } catch {
    return null;
  }
}

function websocketOriginFromEnv(url?: string) {
  try {
    if (!url) return null;
    const u = new URL(url);
    if (u.protocol === "https:") u.protocol = "wss:";
    if (u.protocol === "http:") u.protocol = "ws:";
    return u.origin;
  } catch {
    return null;
  }
}

const supabaseOrigin =
  originFromEnv(process.env.NEXT_PUBLIC_SUPABASE_URL) ||
  "https://*.supabase.co";
const supabaseRealtimeOrigin =
  websocketOriginFromEnv(process.env.NEXT_PUBLIC_SUPABASE_URL) ||
  "wss://*.supabase.co";

const remoteImageHosts = [
  "images.unsplash.com",
  "www.launchuicomponents.com",
  "farmui.vercel.app",
];

const allowUnsafeEval = process.env.NODE_ENV !== "production";
const stripeScriptOrigin = "https://js.stripe.com";
const qrCodeImageOrigin = "https://api.qrserver.com";
const stripeConnectOrigins = [
  "https://api.stripe.com",
  "https://r.stripe.com",
  "https://q.stripe.com",
  "https://m.stripe.network",
];
const stripeFrameOrigins = ["https://js.stripe.com", "https://hooks.stripe.com"];

const csp = [
  `default-src 'self'`,
  `script-src 'self' 'unsafe-inline'${allowUnsafeEval ? " 'unsafe-eval'" : ""} ${stripeScriptOrigin}`,
  `style-src 'self' 'unsafe-inline'`,
  `img-src 'self' data: blob: ${supabaseOrigin} ${remoteImageHosts
    .map((host) => `https://${host}`)
    .join(" ")} https://q.stripe.com ${qrCodeImageOrigin}`,
  `connect-src 'self' ${supabaseOrigin} ${supabaseRealtimeOrigin} ${stripeConnectOrigins.join(" ")}`,
  `font-src 'self' data:`,
  `frame-src 'self' ${stripeFrameOrigins.join(" ")}`,
  `frame-ancestors 'self'`,
  `base-uri 'self'`,
  `form-action 'self'`,
].join("; ");

const nextConfig: NextConfig = {
  experimental: {
    optimizePackageImports: [
      "lucide-react",
      "@radix-ui/react-accordion",
      "@radix-ui/react-dialog",
      "@radix-ui/react-label",
      "@radix-ui/react-select",
      "@radix-ui/react-slot",
      "@radix-ui/react-switch",
      "@radix-ui/react-tabs",
    ],
  },
  images: {
    remotePatterns: remoteImageHosts.map((hostname) => ({
      protocol: "https",
      hostname,
    })),
  },
  async headers() {
    const locked = process.env.PREVIEW_LOCK === "1";
    const baseHeaders = [
      { key: "X-Frame-Options", value: "SAMEORIGIN" },
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
      { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
      { key: "Origin-Agent-Cluster", value: "?1" },
      {
        key: "Permissions-Policy",
        value: "camera=(), microphone=(), geolocation=()",
      },
      { key: "Content-Security-Policy", value: csp },
    ];
    if (locked) {
      baseHeaders.push({ key: "X-Robots-Tag", value: "noindex, nofollow" });
    }
    if (process.env.NODE_ENV === "production") {
      baseHeaders.push({
        key: "Strict-Transport-Security",
        value: "max-age=31536000; includeSubDomains; preload",
      });
    }
    return [
      {
        source: "/(.*)",
        headers: baseHeaders,
      },
    ];
  },
};

export default nextConfig;
