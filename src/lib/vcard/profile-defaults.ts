import { sanitizeVCardPhotoData } from "@/lib/vcard/photo";

export function resolveVCardName(
  contactName: string | null | undefined,
  publicProfileName: string | null | undefined,
  handle: string
) {
  return (
    contactName?.trim() ||
    publicProfileName?.trim() ||
    handle.trim()
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
