"server-only";

import {
  appendVersion,
  extractAvatarPathFromUrl,
  isHttpUrl,
  isMockupAssetValue,
  normalizeAvatarPath,
} from "@/lib/avatar-utils";
import { isSupabaseAdminAvailable, supabaseAdmin } from "@/lib/supabase-admin";

export async function getSignedAvatarUrl(
  path: string | null | undefined,
  version?: string | number | null,
  expiresInSeconds = 3600
): Promise<string | null> {
  if (!path) return null;
  if (isMockupAssetValue(path)) return null;
  if (isHttpUrl(path)) {
    const extracted = extractAvatarPathFromUrl(path);
    if (!extracted) return null;
    const { data, error } = await supabaseAdmin
      .storage
      .from("avatars")
      .createSignedUrl(extracted, expiresInSeconds);
    if (error || !data?.signedUrl) return null;
    return appendVersion(data.signedUrl, version);
  }
  if (!isSupabaseAdminAvailable) return null;
  const normalized = normalizeAvatarPath(path);
  if (!normalized) return null;
  const { data, error } = await supabaseAdmin
    .storage
    .from("avatars")
    .createSignedUrl(normalized, expiresInSeconds);
  if (error || !data?.signedUrl) return null;
  return appendVersion(data.signedUrl, version);
}
