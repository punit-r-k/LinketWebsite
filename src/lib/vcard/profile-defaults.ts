import { sanitizeVCardPhotoData } from "@/lib/vcard/photo";

const LEGACY_DEFAULT_PROFILE_NAME = "linket public profile";

function normalizeNameCandidate(value: string | null | undefined) {
  const name = value?.trim() ?? "";
  if (!name || name.toLowerCase() === LEGACY_DEFAULT_PROFILE_NAME) return "";
  return name;
}

export function resolveVCardName(
  contactName: string | null | undefined,
  publicProfileName: string | null | undefined,
  handle: string,
  accountName?: string | null
) {
  return (
    normalizeNameCandidate(contactName) ||
    normalizeNameCandidate(publicProfileName) ||
    normalizeNameCandidate(accountName) ||
    normalizeNameCandidate(handle)
  );
}

export function resolveVCardPhotoData(
  contactPhotoData: string | null | undefined,
  contactPhotoRemovedAt: string | null | undefined,
  publicProfilePhotoData: string | null | undefined
) {
  const contactPhoto = sanitizeVCardPhotoData(contactPhotoData);
  if (contactPhoto && !contactPhotoRemovedAt) return contactPhoto;
  if (contactPhotoRemovedAt) return null;
  return sanitizeVCardPhotoData(publicProfilePhotoData);
}
