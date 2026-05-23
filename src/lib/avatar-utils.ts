export function isHttpUrl(value: string) {
  return /^https?:\/\//i.test(value);
}

export function isMockupAssetValue(value: string | null | undefined) {
  if (!value) return false;
  const normalized = value.trim().toLowerCase().replace(/\\/g, "/");
  return (
    normalized.includes("/mockups/") ||
    normalized.includes("mockups/") ||
    normalized.endsWith("profile-avatar.jpg")
  );
}

export function extractAvatarPathFromUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    const base = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
    if (base && !parsed.origin.startsWith(base)) return null;
    const markers = [
      "/storage/v1/object/public/avatars/",
      "/storage/v1/object/sign/avatars/",
    ];
    for (const marker of markers) {
      const index = parsed.pathname.indexOf(marker);
      if (index !== -1) {
        return parsed.pathname.slice(index + marker.length);
      }
    }
    return null;
  } catch {
    return null;
  }
}

export function normalizeAvatarPath(
  path: string | null | undefined
): string | null {
  if (!path) return null;
  if (isMockupAssetValue(path)) return null;
  if (isHttpUrl(path)) return extractAvatarPathFromUrl(path);
  return path.replace(/^\//, "");
}

export function appendVersion(
  url: string | null,
  version?: string | number | null
): string | null {
  if (!url) return null;
  if (version === undefined || version === null) return url;
  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}v=${encodeURIComponent(String(version))}`;
}
