import { isMockupAssetValue } from "@/lib/avatar-utils";

const DATA_IMAGE_PATTERN =
  /^data:image\/(?:png|jpe?g|webp|gif);base64,[a-z0-9+/=\s]+$/i;

export const MAX_EMBEDDED_VCARD_PHOTO_BYTES = 500 * 1024;

export function isMockupPhotoValue(value: string) {
  return isMockupAssetValue(value);
}

export function sanitizeVCardPhotoData(value: string | null | undefined) {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed || isMockupPhotoValue(trimmed)) return null;
  return DATA_IMAGE_PATTERN.test(trimmed) ? trimmed : null;
}
