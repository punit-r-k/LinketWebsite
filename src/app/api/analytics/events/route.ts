import { NextRequest, NextResponse } from "next/server";
import { resolveCorsHeaders } from "@/lib/cors";
import { createServerSupabase } from "@/lib/supabase/server";
import { isSupabaseAdminAvailable, supabaseAdmin } from "@/lib/supabase-admin";
import { limitRequest } from "@/lib/rate-limit";
import {
  getRequestBodySizeIssue,
  rejectUntrustedWrite,
} from "@/lib/request-security";

type AnalyticsEventBody = {
  id?: string;
  meta?: Record<string, unknown> | null;
  path?: string | null;
  href?: string | null;
  referrer?: string | null;
  timestamp?: string | null;
};

const ANONYMOUS_HANDLE_ATTRIBUTED_EVENTS = new Set([
  "public_profile_view",
  "vcard_download_click",
  "vcard_download_success",
  "share_contact_click",
  "share_contact_success",
]);
const MAX_ANALYTICS_BODY_BYTES = 16 * 1024;

function sanitizeString(value: unknown, max = 1024) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
}

function normalizeMeta(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  try {
    const encoded = JSON.stringify(value);
    if (encoded.length > 4096) return {};
    const parsed = JSON.parse(encoded) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }
    return parsed as Record<string, unknown>;
  } catch {
    return {};
  }
}

function normalizeTimestamp(value: unknown) {
  if (typeof value !== "string") return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function isIgnorableInsertError(message: string) {
  const lowered = message.toLowerCase();
  return lowered.includes("relation \"conversion_events\" does not exist");
}

async function resolveUserId() {
  try {
    const supabase = await createServerSupabase();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    return user?.id ?? null;
  } catch {
    return null;
  }
}

function readHandleFromMeta(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const handle = (value as Record<string, unknown>).handle;
  if (typeof handle !== "string") return null;
  const normalized = handle.trim().toLowerCase();
  return normalized || null;
}

async function resolveAttributedUserId(
  currentUserId: string | null,
  eventId: string,
  meta: unknown
) {
  if (currentUserId) return currentUserId;
  if (!ANONYMOUS_HANDLE_ATTRIBUTED_EVENTS.has(eventId)) return null;
  if (!isSupabaseAdminAvailable) return null;
  const handle = readHandleFromMeta(meta);
  if (!handle) return null;
  const { data, error } = await supabaseAdmin
    .from("user_profiles")
    .select("user_id")
    .eq("handle", handle)
    .eq("is_active", true)
    .maybeSingle();
  if (error) return null;
  return (data?.user_id as string | null) ?? null;
}

function jsonWithCors(request: NextRequest, body: unknown, init?: ResponseInit) {
  const response = NextResponse.json(body, init);
  const headers = resolveCorsHeaders(request.headers.get("origin"), {
    allowMethods: ["OPTIONS", "POST"],
  });
  if (headers) {
    Object.entries(headers).forEach(([key, value]) => {
      response.headers.set(key, value);
    });
  }
  return response;
}

export async function OPTIONS(request: NextRequest) {
  const headers = resolveCorsHeaders(request.headers.get("origin"), {
    allowMethods: ["OPTIONS", "POST"],
  });
  if (!headers) {
    return new NextResponse(null, { status: 204 });
  }
  return new NextResponse(null, { status: 204, headers });
}

export async function POST(request: NextRequest) {
  try {
    const untrusted = rejectUntrustedWrite(request);
    if (untrusted) return untrusted;

    if (await limitRequest(request, "analytics-events", 120, 60_000)) {
      return jsonWithCors(
        request,
        { error: "Too many requests. Please try again later." },
        { status: 429 }
      );
    }

    const sizeIssue = getRequestBodySizeIssue(
      request,
      MAX_ANALYTICS_BODY_BYTES,
      "Analytics event payload"
    );
    if (sizeIssue) {
      return jsonWithCors(
        request,
        { error: sizeIssue.error },
        { status: sizeIssue.status }
      );
    }

    const body = (await request.json().catch(() => ({}))) as AnalyticsEventBody;
    const eventId = sanitizeString(body.id, 120);
    if (!eventId) {
      return jsonWithCors(request, { error: "id is required" }, { status: 400 });
    }

    const resolvedUserId = await resolveAttributedUserId(
      await resolveUserId(),
      eventId,
      body.meta
    );

    const payload = {
      event_id: eventId,
      event_source: "web",
      user_id: resolvedUserId,
      path: sanitizeString(body.path, 512) || null,
      href: sanitizeString(body.href, 1024) || null,
      referrer: sanitizeString(body.referrer, 1024) || null,
      timestamp: normalizeTimestamp(body.timestamp),
      meta: normalizeMeta(body.meta),
    };

    if (!isSupabaseAdminAvailable) {
      return jsonWithCors(request, { ok: true, stored: false });
    }

    const { error } = await supabaseAdmin
      .from("conversion_events")
      .insert(payload);
    if (error) {
      if (!isIgnorableInsertError(error.message)) {
        throw new Error(error.message);
      }
    }

    return jsonWithCors(request, { ok: true, stored: true });
  } catch (error) {
    return jsonWithCors(
      request,
      {
        ok: false,
        error: error instanceof Error ? error.message : "Unable to record analytics event",
      },
      { status: 500 }
    );
  }
}
