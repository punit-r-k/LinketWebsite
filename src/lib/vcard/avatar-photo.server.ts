import "server-only";

import { normalizeAvatarPath } from "@/lib/avatar-utils";
import { isSupabaseAdminAvailable, supabaseAdmin } from "@/lib/supabase-admin";
import { MAX_EMBEDDED_VCARD_PHOTO_BYTES } from "@/lib/vcard/photo";

const SUPPORTED_PHOTO_TYPES = new Set([
  "image/gif",
  "image/jpeg",
  "image/png",
  "image/webp",
]);

function inferPhotoMime(blobType: string | undefined, path: string) {
  const normalizedType = blobType?.split(";")[0]?.trim().toLowerCase();
  if (normalizedType && SUPPORTED_PHOTO_TYPES.has(normalizedType)) {
    return normalizedType;
  }
  if (/\.png$/i.test(path)) return "image/png";
  if (/\.gif$/i.test(path)) return "image/gif";
  if (/\.webp$/i.test(path)) return "image/webp";
  if (/\.jpe?g$/i.test(path)) return "image/jpeg";
  return null;
}

function getAvatarDownloadCandidates(path: string) {
  const thumbnailPath = path.replace(
    /(^|\/)avatar(\.(?:png|jpe?g|webp|gif))$/i,
    "$1avatar_128$2"
  );
  return thumbnailPath === path ? [path] : [thumbnailPath, path];
}

export async function loadAvatarPhotoDataUrl(
  avatarPath: string | null | undefined
) {
  if (!isSupabaseAdminAvailable) return null;
  const normalizedPath = normalizeAvatarPath(avatarPath);
  if (!normalizedPath) return null;

  for (const candidatePath of getAvatarDownloadCandidates(normalizedPath)) {
    const { data, error } = await supabaseAdmin.storage
      .from("avatars")
      .download(candidatePath);
    if (error || !data || data.size > MAX_EMBEDDED_VCARD_PHOTO_BYTES) {
      continue;
    }

    const mime = inferPhotoMime(data.type, candidatePath);
    if (!mime) continue;
    const base64 = Buffer.from(await data.arrayBuffer()).toString("base64");
    if (base64) return `data:${mime};base64,${base64}`;
  }

  return null;
}
