import "server-only";

import {
  applyFreeLeadFormLimits,
  normalizeLeadFormConfig,
} from "@/lib/lead-form";
import { getDashboardPlanAccessForUser } from "@/lib/plan-access.server";
import { createServerSupabase } from "@/lib/supabase/server";
import { isSupabaseAdminAvailable, supabaseAdmin } from "@/lib/supabase-admin";
import type { LeadFormConfig } from "@/types/lead-form";

export type LeadFormRecord = {
  id: string;
  user_id: string;
  profile_id: string | null;
  handle: string | null;
  status: "draft" | "published";
  title: string | null;
  description: string | null;
  config: LeadFormConfig | null;
  created_at: string | null;
  updated_at: string | null;
};

const LEAD_FORM_SELECT =
  "id,user_id,profile_id,handle,status,title,description,config,created_at,updated_at";

type LeadFormWriteClient =
  | Awaited<ReturnType<typeof createServerSupabase>>
  | typeof supabaseAdmin;

type FindExistingLeadFormArgs = {
  client: LeadFormWriteClient;
  userId: string;
  handle: string;
  profileId?: string | null;
};

type UpsertPublishedLeadFormArgs = {
  client: LeadFormWriteClient;
  userId: string;
  handle: string;
  profileId?: string | null;
  config: LeadFormConfig;
  existingRow?: LeadFormRecord | null;
};

type EnsurePublishedLeadFormArgs = {
  userId: string;
  handle: string;
  profileId?: string | null;
  rawConfig?: LeadFormConfig | null;
  existingRow?: LeadFormRecord | null;
  client?: LeadFormWriteClient;
};

function normalizeHandle(value: string | null | undefined) {
  return value?.trim().toLowerCase() ?? "";
}

function isOwnerHandleConflict(error: { code?: string; message?: string }) {
  return (
    error.code === "23505" &&
    (error.message?.includes("lead_forms_owner_handle") ?? false)
  );
}

export async function getPlanScopedLeadFormConfig(
  userId: string,
  rawConfig: LeadFormConfig | null | undefined,
  fallbackId: string
) {
  const planAccess = await getDashboardPlanAccessForUser(userId);
  const config = planAccess.canCustomizeLeadForm
    ? normalizeLeadFormConfig(rawConfig, fallbackId)
    : applyFreeLeadFormLimits(rawConfig, fallbackId);

  return { config, planAccess };
}

export async function findExistingLeadFormRow({
  client,
  userId,
  handle,
  profileId,
}: FindExistingLeadFormArgs): Promise<LeadFormRecord | null> {
  const normalizedHandle = normalizeHandle(handle);
  const normalizedProfileId = profileId?.trim() || null;

  if (normalizedHandle) {
    const { data, error } = await client
      .from("lead_forms")
      .select(LEAD_FORM_SELECT)
      .eq("user_id", userId)
      .eq("handle", normalizedHandle)
      .limit(1)
      .maybeSingle();

    if (error && error.code !== "PGRST116") {
      throw new Error(error.message);
    }

    if (data) {
      return data as LeadFormRecord;
    }
  }

  if (normalizedProfileId) {
    const { data, error } = await client
      .from("lead_forms")
      .select(LEAD_FORM_SELECT)
      .eq("user_id", userId)
      .eq("profile_id", normalizedProfileId)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error && error.code !== "PGRST116") {
      throw new Error(error.message);
    }

    if (data) {
      return data as LeadFormRecord;
    }
  }

  return null;
}

export async function upsertPublishedLeadFormRow({
  client,
  userId,
  handle,
  profileId,
  config,
  existingRow,
}: UpsertPublishedLeadFormArgs): Promise<LeadFormRecord> {
  const normalizedHandle = normalizeHandle(handle);
  if (!normalizedHandle) {
    throw new Error("Lead form handle is required.");
  }

  const now = new Date().toISOString();
  const persistedConfig: LeadFormConfig = {
    ...config,
    status: "published",
    meta: {
      ...config.meta,
      updatedAt: now,
    },
  };

  const payload = {
    user_id: userId,
    profile_id: profileId?.trim() || existingRow?.profile_id || null,
    handle: normalizedHandle,
    status: "published" as const,
    title: persistedConfig.title,
    description: persistedConfig.description,
    config: persistedConfig,
    updated_at: now,
  };

  if (existingRow?.id) {
    const { data, error } = await client
      .from("lead_forms")
      .update(payload)
      .eq("id", existingRow.id)
      .select(LEAD_FORM_SELECT)
      .single();

    if (error) {
      if (isOwnerHandleConflict(error)) {
        const handleRow = await findExistingLeadFormRow({
          client,
          userId,
          handle: normalizedHandle,
        });
        if (handleRow?.id && handleRow.id !== existingRow.id) {
          return upsertPublishedLeadFormRow({
            client,
            userId,
            handle: normalizedHandle,
            profileId,
            config,
            existingRow: handleRow,
          });
        }
      }
      throw new Error(error.message);
    }

    return data as LeadFormRecord;
  }

  const { data, error } = await client
    .from("lead_forms")
    .upsert(payload, { onConflict: "user_id,handle" })
    .select(LEAD_FORM_SELECT)
    .single();

  if (error) {
    if (isOwnerHandleConflict(error)) {
      const handleRow = await findExistingLeadFormRow({
        client,
        userId,
        handle: normalizedHandle,
      });
      if (handleRow?.id) {
        return upsertPublishedLeadFormRow({
          client,
          userId,
          handle: normalizedHandle,
          profileId,
          config,
          existingRow: handleRow,
        });
      }
    }
    throw new Error(error.message);
  }

  return data as LeadFormRecord;
}

export async function ensurePublishedLeadFormRow({
  userId,
  handle,
  profileId,
  rawConfig,
  existingRow,
  client,
}: EnsurePublishedLeadFormArgs): Promise<LeadFormRecord | null> {
  const normalizedHandle = normalizeHandle(handle);
  if (!normalizedHandle) {
    return null;
  }

  const writeClient =
    client ?? (isSupabaseAdminAvailable ? supabaseAdmin : null);
  if (!writeClient) {
    return null;
  }

  const row =
    existingRow ??
    (await findExistingLeadFormRow({
      client: writeClient,
      userId,
      handle: normalizedHandle,
      profileId,
    }));

  const fallbackId = row?.id ?? `form-${userId}`;
  const { config } = await getPlanScopedLeadFormConfig(
    userId,
    rawConfig ?? row?.config,
    fallbackId
  );

  return upsertPublishedLeadFormRow({
    client: writeClient,
    userId,
    handle: normalizedHandle,
    profileId,
    config,
    existingRow: row,
  });
}
