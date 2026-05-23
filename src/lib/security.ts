import { addDefaultWwwToParsedUrl } from "@/lib/public-link-url";

const DEV_FALLBACK_SECRET = "devsalt";
const INTERNAL_SECRET = process.env.INTERNAL_SECRET?.trim() ?? "";

type HeaderReader = {
  get(name: string): string | null;
};

export function sanitizeHttpUrl(
  raw: string,
  options?: {
    allowCredentials?: boolean;
  }
) {
  const parsed = new URL(raw);
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("Bad scheme");
  }
  if (
    options?.allowCredentials !== true &&
    (parsed.username || parsed.password)
  ) {
    throw new Error("Credentials are not allowed in URLs");
  }
  return parsed.toString();
}

export function sanitizePublicLinkUrl(raw: string) {
  const normalized = sanitizeHttpUrl(raw, { allowCredentials: false });
  if (normalized === "http://" || normalized === "https://") {
    throw new Error("Incomplete URL");
  }
  return addDefaultWwwToParsedUrl(new URL(normalized)).toString();
}

export function sanitizeAttachmentFilename(raw: string, fallback: string) {
  const trimmed = raw.trim();
  const safe = trimmed
    .normalize("NFKD")
    .replace(/[^\x20-\x7E]/g, "")
    .replace(/[\r\n"]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^[_ .-]+|[_ .-]+$/g, "");

  return safe || fallback;
}

export function hasAmbiguousRequestBodyHeaders(headers: HeaderReader) {
  const contentLength = headers.get("content-length")?.trim() ?? "";
  const transferEncoding = headers.get("transfer-encoding")?.trim() ?? "";
  return Boolean(contentLength && transferEncoding);
}

export async function getDailySalt() {
  // Rotates daily to reduce long-lived correlation while keeping short-term rate limiting stable.
  const dayKey = new Date().toISOString().slice(0, 10);
  const baseSecret =
    INTERNAL_SECRET ||
    (process.env.NODE_ENV !== "production" ? DEV_FALLBACK_SECRET : "");
  return baseSecret ? `${baseSecret}:${dayKey}` : dayKey;
}

export async function hashIdentifier(value?: string) {
  const salt = await getDailySalt();
  const data = new TextEncoder().encode(`${value ?? "0.0.0.0"}|${salt}`);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}
