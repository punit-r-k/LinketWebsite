import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { requireRouteAccess } from "@/lib/api-authorization";
import { validateJsonBody, validateSearchParams } from "@/lib/request-validation";
import { rejectUntrustedWrite } from "@/lib/request-security";
import { createServerSupabase } from "@/lib/supabase/server";
import { isSupabaseAdminAvailable, supabaseAdmin } from "@/lib/supabase-admin";
import { revalidatePublicProfileHandle } from "@/lib/public-profile-revalidation";
import {
  createDefaultLeadFormConfig,
} from "@/lib/lead-form";
import {
  ensurePublishedLeadFormRow,
  getPlanScopedLeadFormConfig,
  type LeadFormRecord,
} from "@/lib/lead-form.server";
import type {
  LeadFormConfig,
  LeadFormField,
} from "@/types/lead-form";

const leadFormsQuerySchema = z.object({
  handle: z.string().trim().max(120).optional(),
  profileId: z.string().uuid().optional(),
  userId: z.string().uuid(),
});

const leadFormsPutSchema = z.object({
  config: z.object({}).passthrough(),
  handle: z.string().trim().min(1).max(120),
  profileId: z.string().uuid().nullable().optional(),
  userId: z.string().uuid(),
});

function buildLegacyConfig(
  handle: string,
  fields: Array<{
    id: string;
    label: string;
    type: string;
    required: boolean;
    options: string[] | null;
    validation: { minLength?: number | null; emailFormat?: boolean } | null;
    placeholder?: string | null;
  }>,
  settings: Record<string, unknown> | null
): LeadFormConfig {
  const config = createDefaultLeadFormConfig(`legacy-${handle}`);
  config.title = "Lead capture";
  config.description = "";
  config.status = "published";
  config.settings.confirmationMessage =
    (settings?.successMessage as string | undefined) ||
    config.settings.confirmationMessage;
  config.fields = fields.map((field) => {
    const base: Partial<LeadFormField> = {
      id: field.id,
      label: field.label,
      required: field.required,
      helpText: "",
      validation: { rule: "none" },
    };
    if (field.type === "textarea") {
      return { ...base, type: "long_text" } as LeadFormField;
    }
    if (field.type === "select") {
      return {
        ...base,
        type: "dropdown",
        options: (field.options || []).map((opt, idx) => ({
          id: `${field.id}-opt-${idx}`,
          label: opt,
        })),
        allowOther: false,
        otherLabel: "Other",
        presentation: { shuffleOptions: false },
      } as LeadFormField;
    }
    if (field.type === "checkbox") {
      return {
        ...base,
        type: "checkboxes",
        options: [
          {
            id: `${field.id}-opt-0`,
            label: field.placeholder || "Yes",
          },
        ],
        allowOther: false,
        otherLabel: "Other",
        presentation: { shuffleOptions: false },
      } as LeadFormField;
    }
    const validationRule =
      field.type === "email" || field.validation?.emailFormat
        ? "email"
        : "none";
    return {
      ...base,
      type: "short_text",
      validation:
        field.validation?.minLength
          ? { rule: "min_length", value: field.validation.minLength }
          : { rule: validationRule },
    } as LeadFormField;
  });
  return config;
}

async function fetchLegacyConfig(
  supabase: Awaited<ReturnType<typeof createServerSupabase>>,
  userId: string,
  handle: string
): Promise<LeadFormConfig | null> {
  const { data: fields, error: fieldsError } = await supabase
    .from("lead_form_fields")
    .select("id,label,type,required,options,validation,placeholder")
    .eq("user_id", userId)
    .eq("handle", handle)
    .eq("is_active", true)
    .order("order_index", { ascending: true });
  if (fieldsError) return null;
  const { data: settings } = await supabase
    .from("lead_form_settings")
    .select("settings")
    .eq("user_id", userId)
    .eq("handle", handle)
    .maybeSingle();
  if (!fields?.length) return null;
  return buildLegacyConfig(
    handle,
    fields as Array<{
      id: string;
      label: string;
      type: string;
      required: boolean;
      options: string[] | null;
      validation: { minLength?: number | null; emailFormat?: boolean } | null;
      placeholder?: string | null;
    }>,
    (settings?.settings as Record<string, unknown>) || null
  );
}

async function getResponseStats(
  supabase: Awaited<ReturnType<typeof createServerSupabase>>,
  formId: string
) {
  const { count, error } = await supabase
    .from("lead_form_responses")
    .select("id", { count: "exact", head: true })
    .eq("form_id", formId);
  if (error) return { count: 0, lastSubmittedAt: null };
  const { data: latest } = await supabase
    .from("lead_form_responses")
    .select("submitted_at")
    .eq("form_id", formId)
    .order("submitted_at", { ascending: false })
    .limit(1);
  return {
    count: count ?? 0,
    lastSubmittedAt: latest?.[0]?.submitted_at ?? null,
  };
}

export async function GET(request: NextRequest) {
  try {
    const parsedQuery = validateSearchParams(
      request.nextUrl.searchParams,
      leadFormsQuerySchema
    );
    if (!parsedQuery.ok) {
      return parsedQuery.response;
    }

    const { userId, handle, profileId } = parsedQuery.data;
    if (!handle && !profileId) {
      return NextResponse.json(
        { error: "userId and handle or profileId are required" },
        { status: 400 }
      );
    }

    const access = await requireRouteAccess("GET /api/lead-forms", {
      resourceUserId: userId,
    });
    if (access instanceof NextResponse) {
      return access;
    }
    const supabase = await createServerSupabase();

    let query = supabase.from("lead_forms").select("*").eq("user_id", userId);
    if (profileId) query = query.eq("profile_id", profileId);
    if (handle) query = query.eq("handle", handle);
    let { data, error: formError } = await query.maybeSingle();
    if (formError && formError.code !== "PGRST116") {
      throw new Error(formError.message);
    }

    if (!data && profileId && handle) {
      const fallback = await supabase
        .from("lead_forms")
        .select("*")
        .eq("user_id", userId)
        .eq("handle", handle)
        .maybeSingle();
      if (fallback.error && fallback.error.code !== "PGRST116") {
        throw new Error(fallback.error.message);
      }
      data = fallback.data as LeadFormRecord | null;
    }

    let config: LeadFormConfig | null = null;
    let formRow: LeadFormRecord | null = (data as LeadFormRecord) || null;

    if (!formRow && handle) {
      config = await fetchLegacyConfig(supabase, userId, handle);
      if (config) {
        formRow = {
          id: config.id,
          user_id: userId,
          profile_id: profileId || null,
          handle,
          status: config.status,
          title: config.title,
          description: config.description,
          config,
          created_at: config.meta.createdAt,
          updated_at: config.meta.updatedAt,
        };
      }
    }

    if (!formRow && handle) {
      formRow = await ensurePublishedLeadFormRow({
        client: supabase,
        userId,
        handle,
        profileId,
      });
    }

    const { config: resolvedConfig, planAccess } = await getPlanScopedLeadFormConfig(
      userId,
      formRow?.config ?? config,
      formRow?.id || `form-${userId}`
    );

    const stats = planAccess.canViewAdvancedAnalytics && formRow?.id
      ? await getResponseStats(supabase, formRow.id)
      : { count: 0, lastSubmittedAt: null };

    return NextResponse.json(
      {
        form: resolvedConfig,
        meta: {
          formId: formRow?.id || resolvedConfig.id,
          stats,
        },
      },
      { headers: { "Cache-Control": "no-store, max-age=0" } }
    );
  } catch (error) {
    console.error("Lead form fetch error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Unable to load lead form",
      },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const untrusted = rejectUntrustedWrite(request);
    if (untrusted) return untrusted;

    const parsedBody = await validateJsonBody(request, leadFormsPutSchema);
    if (!parsedBody.ok) {
      return parsedBody.response;
    }
    const {
      userId,
      handle,
      profileId,
      config,
    } = parsedBody.data as {
      config: LeadFormConfig;
      handle: string;
      profileId?: string | null;
      userId: string;
    };

    const access = await requireRouteAccess("PUT /api/lead-forms", {
      resourceUserId: userId,
    });
    if (access instanceof NextResponse) {
      return access;
    }
    const supabase = await createServerSupabase();

    const now = new Date().toISOString();
    const { config: normalizedConfig } = await getPlanScopedLeadFormConfig(
      userId,
      config,
      config.id || handle
    );
    const normalized = {
      ...normalizedConfig,
      status: "published" as const,
    };
    const nextVersion = (normalized.meta.version || 1) + 1;
    normalized.meta = {
      ...normalized.meta,
      updatedAt: now,
      version: nextVersion,
    };

    const data = await ensurePublishedLeadFormRow({
      client: supabase,
      userId,
      handle,
      profileId,
      rawConfig: normalized,
    });
    if (!data) {
      throw new Error("Unable to save lead form");
    }

    if (isSupabaseAdminAvailable) {
      await supabaseAdmin
        .from("lead_forms")
        .update({ config: normalized })
        .eq("id", data.id);
    }
    revalidatePublicProfileHandle(handle);

    return NextResponse.json(
      { form: normalized, formId: data.id },
      { headers: { "Cache-Control": "no-store, max-age=0" } }
    );
  } catch (error) {
    console.error("Lead form save error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Unable to save lead form",
      },
      { status: 500 }
    );
  }
}
