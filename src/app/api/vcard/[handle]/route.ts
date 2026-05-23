import { NextResponse } from "next/server";
import { buildVCard } from "@/lib/vcard/buildVCard";
import { getActiveProfileForPublicHandle } from "@/lib/profile-service";
import type { ContactProfile } from "@/lib/profile.store";
import { sanitizeAttachmentFilename } from "@/lib/security";
import { createClient } from "@supabase/supabase-js";
import { isSupabaseAdminAvailable, supabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type VCardRecord = {
  full_name: string | null;
  title: string | null;
  email: string | null;
  phone: string | null;
  company: string | null;
  address: string | null;
  note: string | null;
  photo_data: string | null;
  photo_name: string | null;
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

function buildContactProfile(
  handle: string,
  record: VCardRecord | null,
  fallbackName: string,
  links: Array<{
    title?: string | null;
    url?: string | null;
    is_active?: boolean | null;
  }>
): ContactProfile {
  const name = record?.full_name?.trim() || fallbackName;
  const { firstName, lastName } = splitName(name);
  const parsedAddress = parseAddress(record?.address ?? null);
  return {
    handle,
    firstName,
    lastName,
    org: record?.company ?? undefined,
    title: record?.title ?? undefined,
    emails: record?.email
      ? [{ value: record.email, type: "work", pref: true }]
      : undefined,
    phones: record?.phone
      ? [{ value: record.phone, type: "cell", pref: true }]
      : undefined,
    note: record?.note ?? undefined,
    address: parsedAddress ?? undefined,
    photo: record?.photo_data ? { dataUrl: record.photo_data } : undefined,
    links: links
      .filter((link) => link.is_active ?? true)
      .map((link) => ({
        title: link.title ?? undefined,
        url: link.url ?? "",
      }))
      .filter((link) => Boolean(link.url.trim())),
    uid: `urn:uuid:${handle}`,
    updatedAt: new Date().toISOString(),
  };
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

function createPublicClient() {
  const url =
    process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "";
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    "";
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function fetchVCardRecord(userId: string) {
  const supabase = isSupabaseAdminAvailable ? supabaseAdmin : createPublicClient();
  const { data, error } = await supabase
    .from("vcard_profiles")
    .select("full_name,title,email,phone,company,address,note,photo_data,photo_name")
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

    const vcardRecord = await fetchVCardRecord(account.user_id);

    const contactProfile = buildContactProfile(
      handle,
      vcardRecord,
      fallbackName,
      profile.links ?? []
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
