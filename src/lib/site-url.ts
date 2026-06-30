const DEFAULT_SITE_ORIGIN = "http://localhost:3000";
export const CANONICAL_SITE_ORIGIN = "https://www.linketconnect.com";

function normalizeOrigin(value: string | null | undefined) {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  try {
    return new URL(trimmed).origin;
  } catch {
    return null;
  }
}

function normalizeHost(value: string | null | undefined) {
  const origin = normalizeOrigin(value);
  if (!origin) return null;
  try {
    return new URL(origin).host.toLowerCase();
  } catch {
    return null;
  }
}

export function getOptionalConfiguredSiteOrigin() {
  return normalizeOrigin(process.env.NEXT_PUBLIC_SITE_URL);
}

export function getConfiguredSiteOrigin() {
  const configured = getOptionalConfiguredSiteOrigin();
  if (configured) return configured;

  if (process.env.NODE_ENV === "production") {
    throw new Error("Missing NEXT_PUBLIC_SITE_URL in production.");
  }

  return DEFAULT_SITE_ORIGIN;
}

export function getSiteOrigin() {
  if (typeof window !== "undefined" && window.location?.origin) {
    return window.location.origin;
  }
  const configured = getOptionalConfiguredSiteOrigin();
  if (configured) return configured;
  return DEFAULT_SITE_ORIGIN;
}

export function getConfiguredSiteHost() {
  return normalizeHost(getOptionalConfiguredSiteOrigin()) ?? "localhost:3000";
}

export function getSiteHost(origin = getSiteOrigin()) {
  return normalizeHost(origin) ?? "localhost:3000";
}

function toAbsoluteSiteUrl(path = "/", origin = getConfiguredSiteOrigin()) {
  const safePath = path.startsWith("/") ? path : `/${path}`;
  return `${origin.replace(/\/$/, "")}${safePath}`;
}

export function toPublicProfileUrl(handle: string, origin = getSiteOrigin()) {
  const normalizedHandle = handle.trim().replace(/^\/+|\/+$/g, "");
  if (!normalizedHandle) {
    return origin.replace(/\/$/, "");
  }
  return toAbsoluteSiteUrl(`/${normalizedHandle}`, origin);
}

export function toCanonicalPublicProfileUrl(handle: string) {
  return toPublicProfileUrl(handle, CANONICAL_SITE_ORIGIN);
}

export function getDefaultProfileLinkUrl(origin = getConfiguredSiteOrigin()) {
  return toAbsoluteSiteUrl("/", origin);
}
