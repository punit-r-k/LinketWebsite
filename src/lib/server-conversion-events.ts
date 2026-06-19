import "server-only";

import { isSupabaseAdminAvailable, supabaseAdmin } from "@/lib/supabase-admin";

type ConversionEventInput = {
  eventId: string;
  userId?: string | null;
  eventSource?: string;
  path?: string | null;
  href?: string | null;
  referrer?: string | null;
  timestamp?: string | null;
  meta?: Record<string, unknown> | null;
};

function sanitizeString(value: unknown, max = 1024) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
}

function normalizeMeta(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function normalizeTimestamp(value: unknown) {
  if (typeof value !== "string") return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function isIgnorableInsertError(message: string) {
  return message
    .toLowerCase()
    .includes('relation "conversion_events" does not exist');
}

export async function recordConversionEvent(
  input: ConversionEventInput
): Promise<void> {
  const eventId = sanitizeString(input.eventId, 120);
  if (!eventId) return;

  const payload = {
    event_id: eventId,
    event_source: sanitizeString(input.eventSource, 120) || "server",
    user_id: input.userId ?? null,
    path: sanitizeString(input.path, 512) || null,
    href: sanitizeString(input.href, 1024) || null,
    referrer: sanitizeString(input.referrer, 1024) || null,
    timestamp: normalizeTimestamp(input.timestamp),
    meta: normalizeMeta(input.meta),
  };

  try {
    if (!isSupabaseAdminAvailable) {
      return;
    }
    const { error } = await supabaseAdmin.from("conversion_events").insert(payload);
    if (error && !isIgnorableInsertError(error.message)) {
      console.warn("conversion_events insert failed:", error.message);
    }
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "unknown conversion event error";
    if (!isIgnorableInsertError(message)) {
      console.warn("conversion_events insert failed:", message);
    }
  }
}
