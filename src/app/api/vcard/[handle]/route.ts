import { NextResponse } from "next/server";
import { buildVCard } from "@/lib/vcard/buildVCard";
import { getActiveProfileForPublicHandle } from "@/lib/profile-service";
import type { ContactProfile } from "@/lib/profile.store";
import { sanitizeAttachmentFilename } from "@/lib/security";
import { isSupabaseAdminAvailable, supabaseAdmin } from "@/lib/supabase-admin";
import { sanitizeVCardPhotoData } from "@/lib/vcard/photo";
import type { ProfileLinkRecord } from "@/types/db";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type VCardRecord = {
  full_name: string | null;
  title: string | null;
  email: string | null;
  additional_emails: string[] | null;
  phone: string | null;
  additional_phones: string[] | null;
  company: string | null;
  address: string | null;
  note: string | null;
  photo_data: string | null;
  photo_name: string | null;
  photo_removed_at: string | null;
  contact_button_visible: boolean | null;
  updated_at: string | null;
};

function splitName(fullName: string) {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 0) return { firstName: "", lastName: "" };
  if (parts.length === 1) return { firstName: parts[0], lastName: "" };
  return {
    firstName: parts.slice(0, -1).join(" "),
    lastName: parts.slice(-1).join(" "),
  };
}

function normalizeContactList(values: string[] | null | undefined, primary = "") {
  const seen = new Set<string>();
  const normalizedPrimary = primary.trim().toLowerCase();
  if (normalizedPrimary) seen.add(normalizedPrimary);
  return (values ?? [])
    .map((value) => value.trim())
    .filter((value) => {
      if (!value) return false;
      const key = value.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 5);
}

function buildContactProfile(
  handle: string,
  record: VCardRecord | null,
  fallbackName: string,
  fallbackTitle: string,
  links: ProfileLinkRecord[],
  uid: string,
  updatedAt: string
): ContactProfile {
  const name = record?.full_name?.trim() || fallbackName;
  const { firstName, lastName } = splitName(name);
  const parsedAddress = parseAddress(record?.address ?? null);
  const photoData = sanitizeVCardPhotoData(record?.photo_data);
  const title = record?.title?.trim() || fallbackTitle.trim();
  const primaryEmail = record?.email?.trim() ?? "";
  const primaryPhone = record?.phone?.trim() ?? "";
  const emails = [
    primaryEmail,
    ...normalizeContactList(record?.additional_emails, primaryEmail),
  ].filter(Boolean);
  const phones = [
    primaryPhone,
    ...normalizeContactList(record?.additional_phones, primaryPhone),
  ].filter(Boolean);
  return {
    handle,
    firstName,
    lastName,
    org: record?.company ?? undefined,
    title: title || undefined,
    emails: emails.length
      ? emails.map((value, index) => ({
          value,
          type: "work" as const,
          pref: index === 0,
        }))
      : undefined,
    phones: phones.length
      ? phones.map((value, index) => ({
          value,
          type: "cell" as const,
          pref: index === 0,
        }))
      : undefined,
    note: record?.note ?? undefined,
    address: parsedAddress ?? undefined,
    photo:
      photoData && !record?.photo_removed_at
        ? { dataUrl: photoData }
        : undefined,
    links: links
      .map((link) => ({
        title: link.title || undefined,
        url: link.url,
      }))
      .filter((link) => Boolean(link.url.trim())),
    uid,
    updatedAt,
  };
}

function getDisplayedProfileLinks(
  links: ProfileLinkRecord[] | null | undefined
) {
  return (links ?? [])
    .filter((link) => link.is_active && Boolean(link.url?.trim()))
    .slice()
    .sort(
      (a, b) =>
        (a.order_index ?? 0) - (b.order_index ?? 0) ||
        a.created_at.localeCompare(b.created_at)
    );
}

function getLatestTimestamp(values: Array<string | null | undefined>) {
  const latest = values.reduce((current, value) => {
    if (!value) return current;
    const timestamp = Date.parse(value);
    return Number.isFinite(timestamp) ? Math.max(current, timestamp) : current;
  }, 0);
  return latest ? new Date(latest).toISOString() : new Date().toISOString();
}

function parseAddress(value: string | null) {
  if (!value) return null;
  const trimmed = value.trim();
  if (trimmed.startsWith("{")) {
    try {
      const parsed = JSON.parse(trimmed) as Partial<{
        line1: string;
        line2: string;
        city: string;
        region: string;
        postalCode: string;
        country: string;
      }>;
      const streetParts = [parsed.line1, parsed.line2].filter(Boolean);
      const street = streetParts.join(" ").trim();
      if (!street && !parsed.city && !parsed.region && !parsed.postalCode && !parsed.country) {
        return null;
      }
      return {
        street: street || undefined,
        city: parsed.city || undefined,
        region: parsed.region || undefined,
        postcode: parsed.postalCode || undefined,
        country: parsed.country || undefined,
      };
    } catch {
      return { street: trimmed };
    }
  }
  return { street: trimmed };
}

async function fetchVCardRecord(userId: string) {
  if (!isSupabaseAdminAvailable) return null;
  const { data, error } = await supabaseAdmin
    .from("vcard_profiles")
    .select("full_name,title,email,additional_emails,phone,additional_phones,company,address,note,photo_data,photo_name,photo_removed_at,contact_button_visible,updated_at")
    .eq("user_id", userId)
    .maybeSingle();
  if (error && error.code !== "PGRST116") throw error;
  return (data as VCardRecord | null) ?? null;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ handle: string }> }
) {
  try {
    const { handle: rawHandle } = await params;
    const handle = rawHandle?.trim().toLowerCase();
    if (!handle) {
      return NextResponse.json({ error: "Handle required" }, { status: 400 });
    }

    const payload = await getActiveProfileForPublicHandle(handle);
    if (!payload) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 });
    }

    const { account, profile } = payload;
    const fallbackName =
      profile.name || account.display_name || profile.handle || handle;
    const fallbackTitle = profile.headline?.trim() || "";

    const vcardRecord = await fetchVCardRecord(account.user_id);
    if (vcardRecord?.contact_button_visible === false) {
      return NextResponse.json(
        { error: "Contact download unavailable" },
        { status: 404 }
      );
    }
    const displayedLinks = getDisplayedProfileLinks(profile.links);
    const updatedAt = getLatestTimestamp([
      vcardRecord?.updated_at,
      profile.updated_at,
      ...displayedLinks.map((link) => link.updated_at ?? link.created_at),
    ]);

    const contactProfile = buildContactProfile(
      handle,
      vcardRecord,
      fallbackName,
      fallbackTitle,
      displayedLinks,
      `urn:uuid:${profile.id}`,
      updatedAt
    );
    const vcard = buildVCard(contactProfile);

    return new NextResponse(vcard, {
      status: 200,
      headers: {
        "Content-Type": "text/vcard; charset=utf-8",
        "Content-Disposition": `attachment; filename="${sanitizeAttachmentFilename(
          `${handle}.vcf`,
          "contact.vcf"
        )}"`,
        "Cache-Control": "no-store, max-age=0",
        Pragma: "no-cache",
        Expires: "0",
        "Surrogate-Control": "no-store",
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to build vCard";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
