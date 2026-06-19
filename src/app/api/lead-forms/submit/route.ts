import { NextRequest, NextResponse } from "next/server";
import { isSupabaseAdminAvailable, supabaseAdmin } from "@/lib/supabase-admin";
import { sanitizeSubmissionAnswers, validateSubmission } from "@/lib/lead-form";
import { getPlanScopedLeadFormConfig } from "@/lib/lead-form.server";
import { limitRequest } from "@/lib/rate-limit";
import {
  rejectLargeRequestBody,
  rejectUntrustedWrite,
} from "@/lib/request-security";
import { recordConversionEvent } from "@/lib/server-conversion-events";
import type {
  LeadFormConfig,
  LeadFormField,
  LeadFormSubmission,
} from "@/types/lead-form";

const DEFAULT_FOLLOW_UP_DELAY_MS = 86_400_000;
const MAX_SUBMISSION_BODY_BYTES = 512 * 1024;

type LeadFormRow = {
  id: string;
  user_id: string;
  handle: string | null;
  status: "draft" | "published";
  config: LeadFormConfig;
};

function isResponseTokenColumnError(message: string) {
  const lowered = message.toLowerCase();
  return lowered.includes("response_token");
}

function shouldRetryLeadInsertWithoutResponseId(message: string) {
  const lowered = message.toLowerCase();
  return lowered.includes("lead_response_id") || lowered.includes("schema cache");
}

async function insertLeadFormResponse(
  client: typeof supabaseAdmin,
  payload: {
    form_id: string;
    response_id: string;
    response_token?: string;
    submitted_at: string;
    answers: LeadFormSubmission["answers"];
    responder_email: string | null;
  }
) {
  const { error } = await client.from("lead_form_responses").insert(payload);
  if (error) {
    if (isResponseTokenColumnError(error.message)) {
      throw new Error(
        "Lead form response editing is not configured. Run the latest Supabase migrations."
      );
    }
    throw new Error(error.message);
  }
}

async function insertLeadRecord(
  client: typeof supabaseAdmin,
  payload: {
    user_id: string;
    handle: string;
    name: string;
    email: string;
    phone: string | null;
    company: string | null;
    message: string | null;
    source_url: string | null;
    lead_flag: string;
    lead_rating: number;
    next_follow_up_at: string | null;
    custom_fields: Record<string, unknown>;
    lead_response_id: string;
  }
) {
  const { error } = await client.from("leads").insert(payload);
  if (!error) return;
  if (shouldRetryLeadInsertWithoutResponseId(error.message)) {
    const fallback = { ...payload };
    delete (fallback as { lead_response_id?: string }).lead_response_id;
    const { error: retryError } = await client.from("leads").insert(fallback);
    if (!retryError) return;
    throw new Error(retryError.message);
  }
  throw new Error(error.message);
}

function mapLeadFields(
  answers: LeadFormSubmission["answers"],
  config: LeadFormConfig
) {
  const fieldsById = new Map(config.fields.map((field) => [field.id, field]));
  const values: Record<string, unknown> = {};
  for (const [fieldId, entry] of Object.entries(answers)) {
    const field = fieldsById.get(fieldId);
    if (!field) continue;
    const label = field.label?.trim() || fieldId;
    const safeLabel = label.replace(/::/g, " ").trim() || fieldId;
    values[`${safeLabel}::${fieldId}`] = toLeadCustomFieldValue(
      field,
      entry.value
    );
  }
  return values;
}

function toLeadCustomFieldValue(field: LeadFormField, value: unknown) {
  if (field.type !== "file_upload") return value;
  return summarizeUploadedFiles(value);
}

function summarizeUploadedFiles(value: unknown) {
  if (!Array.isArray(value)) return "";
  const entries = value
    .map((entry) => {
      if (typeof entry === "string") return entry.trim();
      if (!entry || typeof entry !== "object") return "";
      const source = entry as Record<string, unknown>;
      const name =
        typeof source.name === "string" ? source.name.trim() : "";
      const url =
        typeof source.url === "string" ? source.url.trim() : "";
      if (name && url) return `${name} (${url})`;
      return name || url;
    })
    .filter(Boolean);
  return entries.join(", ");
}

function inferLeadFields(
  answers: LeadFormSubmission["answers"],
  config: LeadFormConfig
) {
  const labelMap = new Map(
    config.fields.map((field) => [field.id, field.label.toLowerCase()])
  );
  const findByLabel = (needle: string) => {
    for (const [id, label] of labelMap.entries()) {
      if (label.includes(needle)) return answers[id]?.value ?? null;
    }
    return null;
  };
  return {
    name: (findByLabel("name") as string | null) ?? null,
    email: (findByLabel("email") as string | null) ?? null,
    phone: (findByLabel("phone") as string | null) ?? null,
    company: (findByLabel("company") as string | null) ?? null,
    message: (findByLabel("message") as string | null) ?? null,
  };
}

function normaliseSourceUrl(value: unknown, fallback: string | null) {
  for (const candidate of [value, fallback]) {
    if (typeof candidate !== "string") continue;
    const trimmed = candidate.trim();
    if (!trimmed) continue;
    try {
      const parsed = new URL(trimmed);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        continue;
      }
      return parsed.toString().slice(0, 2048);
    } catch {
      // Ignore invalid URLs.
    }
  }
  return null;
}

function createResponseToken() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `tok_${Date.now()}_${Math.random().toString(36).slice(2, 12)}`;
}

export async function POST(request: NextRequest) {
  try {
    const untrusted = rejectUntrustedWrite(request);
    if (untrusted) return untrusted;

    if (await limitRequest(request, "lead-form-submit", 20, 60_000)) {
      return NextResponse.json(
        { error: "Too many requests. Please try again later." },
        { status: 429 }
      );
    }

    if (!isSupabaseAdminAvailable) {
      return NextResponse.json(
        { error: "Lead form submissions are not configured." },
        { status: 503 }
      );
    }

    const tooLarge = rejectLargeRequestBody(
      request,
      MAX_SUBMISSION_BODY_BYTES,
      "Lead form submission payload"
    );
    if (tooLarge) return tooLarge;

    const body = await request.json();
    const {
      formId,
      responseId,
      answers,
      responderEmail,
      pageUrl,
    } = body as {
      formId?: string;
      responseId?: string;
      answers?: LeadFormSubmission["answers"];
      responderEmail?: string | null;
      pageUrl?: string | null;
    };

    if (!formId || !answers) {
      return NextResponse.json(
        { error: "formId and answers are required" },
        { status: 400 }
      );
    }

    const { data: formRow, error: formError } = await supabaseAdmin
      .from("lead_forms")
      .select("id,user_id,handle,status,config")
      .eq("id", formId)
      .maybeSingle();
    if (formError) throw new Error(formError.message);
    if (!formRow) {
      return NextResponse.json(
        { error: "Form not available" },
        { status: 404 }
      );
    }

    const formPayload = formRow as LeadFormRow;
    if (formPayload.status !== "published") {
      return NextResponse.json(
        { error: "Form not available" },
        { status: 403 }
      );
    }
    const { config } = await getPlanScopedLeadFormConfig(
      formPayload.user_id,
      formPayload.config,
      formPayload.id
    );
    const { answers: sanitizedAnswers } = sanitizeSubmissionAnswers(
      config,
      answers
    );
    const validationErrors = validateSubmission(config, sanitizedAnswers);
    if (validationErrors.length) {
      return NextResponse.json(
        { error: "Validation failed", fields: validationErrors },
        { status: 400 }
      );
    }

    const resolvedResponseId =
      responseId || crypto.randomUUID?.() || `resp_${Date.now()}`;
    const now = new Date().toISOString();
    const responseToken = createResponseToken();

    const payload = {
      form_id: formId,
      response_id: resolvedResponseId,
      response_token: responseToken,
      submitted_at: now,
      answers: sanitizedAnswers,
      responder_email: responderEmail ?? null,
    };

    const writeClient = supabaseAdmin;
    await insertLeadFormResponse(writeClient, payload);

    const leadValues = inferLeadFields(sanitizedAnswers, config);
    const emailValue = leadValues.email || responderEmail || null;
    const sourceUrl = normaliseSourceUrl(
      pageUrl,
      request.headers.get("referer")
    );
    if (leadValues.name && emailValue) {
      try {
        await insertLeadRecord(writeClient, {
          user_id: formPayload.user_id,
          handle: formPayload.handle || "public",
          name: leadValues.name,
          email: emailValue,
          phone: leadValues.phone,
          company: leadValues.company,
          message: leadValues.message,
          source_url: sourceUrl,
          lead_flag: "follow_up",
          lead_rating: 3,
          next_follow_up_at: new Date(
            Date.now() + DEFAULT_FOLLOW_UP_DELAY_MS
          ).toISOString(),
          custom_fields: mapLeadFields(sanitizedAnswers, config),
          lead_response_id: resolvedResponseId,
        });
        await recordConversionEvent({
          eventId: "lead_captured",
          userId: formPayload.user_id,
          eventSource: "server",
          meta: {
            formId,
            handle: formPayload.handle,
          },
        });
      } catch (leadError) {
        const message =
          leadError instanceof Error ? leadError.message : String(leadError);
        console.warn("Lead insert failed:", message);
      }
    }

    return NextResponse.json({
      responseId: resolvedResponseId,
      responseToken,
      submittedAt: now,
    });
  } catch (error) {
    console.error("Lead form submit error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Unable to submit response",
      },
      { status: 500 }
    );
  }
}
