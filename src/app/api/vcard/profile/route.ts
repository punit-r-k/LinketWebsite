import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { requireRouteAccess } from "@/lib/api-authorization";
import { getSignedAvatarUrl } from "@/lib/avatar-server";
import { getActiveProfileForUser } from "@/lib/profile-service";
import { revalidatePublicProfileHandle } from "@/lib/public-profile-revalidation";
import { validateJsonBody, validateSearchParams } from "@/lib/request-validation";
import { rejectUntrustedWrite } from "@/lib/request-security";
import { createServerSupabase } from "@/lib/supabase/server";
import { sanitizeVCardPhotoData } from "@/lib/vcard/photo";

type VCardFields = {
  fullName: string;
  title: string;
  email: string;
  phone: string;
  company: string;
  addressLine1: string;
  addressLine2: string;
  addressCity: string;
  addressRegion: string;
  addressPostal: string;
  addressCountry: string;
  note: string;
  photoData: string | null;
  photoName: string | null;
  photoRemoved: boolean;
  contactButtonVisible: boolean;
};

const EMPTY_FIELDS: VCardFields = {
  fullName: "",
  title: "",
  email: "",
  phone: "",
  company: "",
  addressLine1: "",
  addressLine2: "",
  addressCity: "",
  addressRegion: "",
  addressPostal: "",
  addressCountry: "",
  note: "",
  photoData: null,
  photoName: null,
  photoRemoved: false,
  contactButtonVisible: true,
};

type VCardProfileResponse = {
  defaultPhotoName: string | null;
  defaultPhotoUrl: string | null;
  fields: VCardFields;
};

const vcardQuerySchema = z.object({
  userId: z.string().uuid(),
});

const vcardBodySchema = z.object({
  fields: z.object({
    addressCity: z.string().max(240),
    addressCountry: z.string().max(240),
    addressLine1: z.string().max(240),
    addressLine2: z.string().max(240),
    addressPostal: z.string().max(64),
    addressRegion: z.string().max(240),
    company: z.string().max(240),
    email: z.string().max(320),
    fullName: z.string().max(240),
    note: z.string().max(4000),
    phone: z.string().max(64),
    photoData: z.string().nullable(),
    photoName: z.string().max(255).nullable(),
    photoRemoved: z.boolean().optional(),
    contactButtonVisible: z.boolean().optional(),
    title: z.string().max(240),
  }),
  userId: z.string().uuid(),
});

function serializeAddress(fields: VCardFields) {
  const payload = {
    line1: fields.addressLine1?.trim() || "",
    line2: fields.addressLine2?.trim() || "",
    city: fields.addressCity?.trim() || "",
    region: fields.addressRegion?.trim() || "",
    postalCode: fields.addressPostal?.trim() || "",
    country: fields.addressCountry?.trim() || "",
  };
  const hasValue = Object.values(payload).some((value) => value);
  return hasValue ? JSON.stringify(payload) : null;
}

function parseAddress(value: string | null) {
  if (!value) {
    return {
      addressLine1: "",
      addressLine2: "",
      addressCity: "",
      addressRegion: "",
      addressPostal: "",
      addressCountry: "",
    };
  }
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
      return {
        addressLine1: parsed.line1 ?? "",
        addressLine2: parsed.line2 ?? "",
        addressCity: parsed.city ?? "",
        addressRegion: parsed.region ?? "",
        addressPostal: parsed.postalCode ?? "",
        addressCountry: parsed.country ?? "",
      };
    } catch {
      // fall through to legacy handling
    }
  }
  return {
    addressLine1: trimmed,
    addressLine2: "",
    addressCity: "",
    addressRegion: "",
    addressPostal: "",
    addressCountry: "",
  };
}

async function loadPublicProfileDefaults(userId: string) {
  const supabase = await createServerSupabase();
  const [activeProfile, accountResult] = await Promise.all([
    getActiveProfileForUser(userId).catch(() => null),
    supabase
      .from("profiles")
      .select("display_name,avatar_url,updated_at,avatar_original_file_name")
      .eq("user_id", userId)
      .maybeSingle(),
  ]);
  if (accountResult.error && accountResult.error.code !== "PGRST116") {
    throw accountResult.error;
  }

  const account = accountResult.data;
  const defaultPhotoUrl = await getSignedAvatarUrl(
    account?.avatar_url ?? null,
    account?.updated_at ?? null
  ).catch(() => null);

  return {
    fullName:
      activeProfile?.name?.trim() ||
      account?.display_name?.trim() ||
      "",
    title: activeProfile?.headline?.trim() || "",
    defaultPhotoName:
      account?.avatar_original_file_name?.trim() || "profile-photo.jpg",
    defaultPhotoUrl,
  };
}

function applyPublicProfileDefaults(
  fields: VCardFields,
  defaults: Awaited<ReturnType<typeof loadPublicProfileDefaults>>
): VCardFields {
  return {
    ...fields,
    fullName: fields.fullName.trim() || defaults.fullName,
    title: fields.title.trim() || defaults.title,
  };
}

export async function GET(request: NextRequest) {
  try {
    const parsedQuery = validateSearchParams(
      request.nextUrl.searchParams,
      vcardQuerySchema
    );
    if (!parsedQuery.ok) {
      return parsedQuery.response;
    }
    const { userId } = parsedQuery.data;

    const access = await requireRouteAccess("GET /api/vcard/profile", {
      resourceUserId: userId,
    });
    if (access instanceof NextResponse) {
      return access;
    }

    const supabase = await createServerSupabase();
    const defaults = await loadPublicProfileDefaults(userId);

    const { data, error } = await supabase
      .from("vcard_profiles")
      .select("full_name,title,email,phone,company,address,note,photo_data,photo_name,photo_removed_at,contact_button_visible")
      .eq("user_id", userId)
      .maybeSingle();
    if (error && error.code !== "PGRST116") throw error;

    if (!data) {
      const fields = applyPublicProfileDefaults(EMPTY_FIELDS, defaults);
      const response: VCardProfileResponse = {
        fields,
        defaultPhotoName: defaults.defaultPhotoName,
        defaultPhotoUrl: defaults.defaultPhotoUrl,
      };
      return NextResponse.json(response, { status: 200 });
    }

    const photoData = sanitizeVCardPhotoData(data.photo_data ?? null);
    const payload = applyPublicProfileDefaults({
      fullName: data.full_name ?? "",
      title: data.title ?? "",
      email: data.email ?? "",
      phone: data.phone ?? "",
      company: data.company ?? "",
      ...parseAddress(data.address ?? null),
      note: data.note ?? "",
      photoData,
      photoName: photoData ? data.photo_name ?? null : null,
      photoRemoved: !photoData && Boolean(data.photo_removed_at),
      contactButtonVisible: data.contact_button_visible !== false,
    }, defaults);
    const response: VCardProfileResponse = {
      fields: payload,
      defaultPhotoName: defaults.defaultPhotoName,
      defaultPhotoUrl:
        !photoData && !data.photo_removed_at ? defaults.defaultPhotoUrl : null,
    };

    return NextResponse.json(response, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Load failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const untrusted = rejectUntrustedWrite(request);
    if (untrusted) return untrusted;

    const parsedBody = await validateJsonBody(request, vcardBodySchema);
    if (!parsedBody.ok) {
      return parsedBody.response;
    }
    const body = parsedBody.data as {
      fields: VCardFields;
      userId: string;
    };

    const access = await requireRouteAccess("POST /api/vcard/profile", {
      resourceUserId: body.userId,
    });
    if (access instanceof NextResponse) {
      return access;
    }

    const supabase = await createServerSupabase();

    const { fields } = body;
    const photoData = sanitizeVCardPhotoData(fields.photoData);
    const savedFields: VCardFields = {
      ...fields,
      photoData,
      photoName: photoData ? fields.photoName : null,
      photoRemoved: photoData ? false : Boolean(fields.photoRemoved),
      contactButtonVisible: fields.contactButtonVisible !== false,
    };

    const payload = {
      user_id: body.userId,
      full_name: savedFields.fullName?.trim() || null,
      title: savedFields.title?.trim() || null,
      email: savedFields.email?.trim() || null,
      phone: savedFields.phone?.trim() || null,
      company: savedFields.company?.trim() || null,
      address: serializeAddress(savedFields),
      note: savedFields.note?.trim() || null,
      photo_data: savedFields.photoData,
      photo_name: savedFields.photoName,
      photo_removed_at: savedFields.photoRemoved ? new Date().toISOString() : null,
      contact_button_visible: savedFields.contactButtonVisible,
      updated_at: new Date().toISOString(),
    };

    const { error } = await supabase
      .from("vcard_profiles")
      .upsert(payload, { onConflict: "user_id" });
    if (error) throw error;

    const { data: activeProfile, error: activeProfileError } = await supabase
      .from("user_profiles")
      .select("handle")
      .eq("user_id", body.userId)
      .eq("is_active", true)
      .limit(1)
      .maybeSingle();
    if (!activeProfileError) {
      revalidatePublicProfileHandle(
        (activeProfile as { handle?: string | null } | null)?.handle
      );
    }

    return NextResponse.json({ fields: savedFields }, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Save failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
