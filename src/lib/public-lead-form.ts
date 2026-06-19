import "server-only";

import { ensurePublishedLeadFormRow } from "@/lib/lead-form.server";
import { normalizeLeadFormConfig } from "@/lib/lead-form";
import { createServerSupabaseReadonly } from "@/lib/supabase/server";
import { isSupabaseAdminAvailable, supabaseAdmin } from "@/lib/supabase-admin";
import type { LeadFormConfig } from "@/types/lead-form";

type ReadonlySupabase = Awaited<ReturnType<typeof createServerSupabaseReadonly>>;
type PublicLeadFormClient = ReadonlySupabase | typeof supabaseAdmin;

type LeadFormRow = {
  id: string;
  user_id: string;
  profile_id: string | null;
  handle: string | null;
  status: "draft" | "published";
  config: LeadFormConfig | null;
  updated_at: string | null;
};

type PublicProfileOwnerRow = {
  id: string;
  user_id: string;
  handle: string | null;
};

export type PublicLeadFormLookup = {
  handle?: string | null;
  profileId?: string | null;
  supabase?: ReadonlySupabase;
};

export type PublicLeadFormResult = {
  row: LeadFormRow | null;
  form: LeadFormConfig | null;
  formId: string | null;
};

async function fetchPublishedLeadFormByProfileId(
  supabase: PublicLeadFormClient,
  profileId: string
) {
  const { data, error } = await supabase
    .from("lead_forms")
    .select("id, user_id, profile_id, handle, status, config, updated_at")
    .eq("profile_id", profileId)
    .eq("status", "published")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error && error.code !== "PGRST116") {
    throw new Error(error.message);
  }

  return (data as LeadFormRow | null) ?? null;
}

async function fetchPublishedLeadFormByHandle(
  supabase: PublicLeadFormClient,
  handle: string
) {
  const { data, error } = await supabase
    .from("lead_forms")
    .select("id, user_id, profile_id, handle, status, config, updated_at")
    .eq("handle", handle)
    .eq("status", "published")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error && error.code !== "PGRST116") {
    throw new Error(error.message);
  }

  return (data as LeadFormRow | null) ?? null;
}

async function fetchPublicProfileOwnerByProfileId(
  supabase: PublicLeadFormClient,
  profileId: string
) {
  const { data, error } = await supabase
    .from("user_profiles")
    .select("id, user_id, handle")
    .eq("id", profileId)
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();

  if (error && error.code !== "PGRST116") {
    throw new Error(error.message);
  }

  return (data as PublicProfileOwnerRow | null) ?? null;
}

async function fetchPublicProfileOwnerByHandle(
  supabase: PublicLeadFormClient,
  handle: string
) {
  const { data, error } = await supabase
    .from("user_profiles")
    .select("id, user_id, handle")
    .eq("handle", handle)
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();

  if (error && error.code !== "PGRST116") {
    throw new Error(error.message);
  }

  return (data as PublicProfileOwnerRow | null) ?? null;
}

export async function getPublishedLeadForm({
  handle,
  profileId,
  supabase,
}: PublicLeadFormLookup): Promise<PublicLeadFormResult> {
  const client = isSupabaseAdminAvailable
    ? supabaseAdmin
    : supabase ?? (await createServerSupabaseReadonly());
  const normalizedHandle = handle?.trim().toLowerCase() || null;
  const normalizedProfileId = profileId?.trim() || null;

  let row = normalizedProfileId
    ? await fetchPublishedLeadFormByProfileId(client, normalizedProfileId)
    : null;

  if ((!row || !row.config) && normalizedHandle) {
    row = await fetchPublishedLeadFormByHandle(client, normalizedHandle);
  }

  if (!row?.config) {
    const owner =
      (normalizedProfileId
        ? await fetchPublicProfileOwnerByProfileId(client, normalizedProfileId)
        : null) ??
      (normalizedHandle
        ? await fetchPublicProfileOwnerByHandle(client, normalizedHandle)
        : null);

    if (owner?.user_id && (owner.handle?.trim() || normalizedHandle)) {
      row = await ensurePublishedLeadFormRow({
        userId: owner.user_id,
        profileId: owner.id,
        handle: owner.handle?.trim().toLowerCase() || normalizedHandle || "",
      });
    }
  }

  if (!row?.config) {
    return {
      row,
      form: null,
      formId: row?.id ?? null,
    };
  }

  return {
    row,
    form: normalizeLeadFormConfig(row.config, row.id),
    formId: row.id,
  };
}
