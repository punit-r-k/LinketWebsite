const HTTP_SCHEME_PATTERN = /^https?:\/\//i;

function isIpv4Hostname(hostname: string) {
  const parts = hostname.split(".");
  return (
    parts.length === 4 &&
    parts.every((part) => {
      if (!/^\d+$/.test(part)) return false;
      const value = Number(part);
      return value >= 0 && value <= 255;
    })
  );
}

function isIpv6Hostname(hostname: string) {
  return hostname.includes(":") || /^\[[\da-f:.]+\]$/i.test(hostname);
}

export function shouldAddDefaultWwwHostname(hostname: string) {
  const normalized = hostname.trim().toLowerCase().replace(/\.$/, "");
  if (!normalized || normalized.startsWith("www.")) return false;
  if (!normalized.includes(".")) return false;
  if (
    normalized === "localhost" ||
    normalized.endsWith(".localhost") ||
    normalized.endsWith(".local")
  ) {
    return false;
  }
  if (isIpv4Hostname(normalized) || isIpv6Hostname(normalized)) return false;

  const labels = normalized.split(".").filter(Boolean);
  return labels.length === 2;
}

function splitAuthorityHost(authority: string) {
  if (!authority || authority.includes("@") || authority.startsWith("[")) {
    return null;
  }

  const [host, ...portParts] = authority.split(":");
  if (!host) return null;
  return {
    host,
    port: portParts.length ? `:${portParts.join(":")}` : "",
  };
}

export function addDefaultWwwToUrlString(value: string) {
  return value.replace(
    /^(https?:\/\/)([^/?#]*)(.*)$/i,
    (match, scheme: string, authority: string, suffix: string) => {
      const split = splitAuthorityHost(authority);
      if (!split || !shouldAddDefaultWwwHostname(split.host)) return match;
      return `${scheme}www.${split.host}${split.port}${suffix}`;
    }
  );
}

export function addDefaultWwwToParsedUrl(parsed: URL) {
  if (shouldAddDefaultWwwHostname(parsed.hostname)) {
    parsed.hostname = `www.${parsed.hostname}`;
  }
  return parsed;
}

export function normalizePublicLinkUrlInput(
  value: string,
  options?: { addDefaultWww?: boolean; emptyValue?: string }
) {
  const trimmed = value.trim();
  if (!trimmed) return options?.emptyValue ?? "https://";
  const withScheme = HTTP_SCHEME_PATTERN.test(trimmed)
    ? trimmed.replace(/^http:\/\//i, "https://")
    : `https://${trimmed.replace(/^\/+/, "")}`;
  return options?.addDefaultWww
    ? addDefaultWwwToUrlString(withScheme)
    : withScheme;
}
