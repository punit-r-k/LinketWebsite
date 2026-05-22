import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { requireRouteAccess } from "@/lib/api-authorization";
import type {
  DashboardAnnouncementRecord,
  DashboardNotificationItem,
} from "@/lib/dashboard-notifications";
import { validateJsonBody } from "@/lib/request-validation";
import { createServerSupabaseReadonly } from "@/lib/supabase/server";
import { isSupabaseAdminAvailable, supabaseAdmin } from "@/lib/supabase-admin";

const DEFAULT_LIMIT = 6;
const MAX_LIMIT = 20;
const NOTIFICATION_TABLE = "dashboard_notifications";
const NOTIFICATION_STATE_TABLE = "dashboard_notification_user_states";
const NOTIFICATIONS_VIEW_RETENTION_MS = 2 * 24 * 60 * 60 * 1000;

const notificationActionSchema = z.object({
  action: z.enum(["view", "dismiss"]),
  notificationIds: z.array(z.string().uuid()).min(1).max(50),
});

type DashboardNotificationStateRecord = {
  notification_id: string;
  viewed_at: string | null;
  dismissed_at: string | null;
};

function parseLimit(rawValue: string | null) {
  const parsed = Number(rawValue ?? DEFAULT_LIMIT);
  if (!Number.isFinite(parsed)) return DEFAULT_LIMIT;
  return Math.max(1, Math.min(MAX_LIMIT, Math.trunc(parsed)));
}

function isMissingRelationError(error: { code?: string; message?: string } | null) {
  if (!error) return false;
  if (error.code === "42P01" || error.code === "PGRST205") return true;
  const message = (error.message ?? "").toLowerCase();
  return (
    message.includes("could not find the table") ||
    message.includes("does not exist")
  );
}

function buildStateMap(data: DashboardNotificationStateRecord[] | null) {
  return new Map((data ?? []).map((item) => [item.notification_id, item]));
}

function isNotificationVisibleForState(
  state: DashboardNotificationStateRecord | undefined,
  now: number
) {
  if (!state) return true;
  if (state.dismissed_at) return false;
  if (!state.viewed_at) return true;

  const viewedAt = Date.parse(state.viewed_at);
  if (!Number.isFinite(viewedAt)) return true;
  return now - viewedAt <= NOTIFICATIONS_VIEW_RETENTION_MS;
}

export async function GET(request: Request) {
  const access = await requireRouteAccess("GET /api/dashboard/notifications");
  if (access instanceof NextResponse) {
    return access;
  }
  const supabase = await createServerSupabaseReadonly();

  const limit = parseLimit(new URL(request.url).searchParams.get("limit"));
  const adminLookupClient = isSupabaseAdminAvailable ? supabaseAdmin : supabase;
  const { data: adminRows, error: adminError } = await adminLookupClient
    .from("admin_users")
    .select("user_id")
    .eq("user_id", access.user.id)
    .limit(1);
  const isAdmin =
    !adminError && Array.isArray(adminRows) && adminRows.length > 0;

  const audience = isAdmin ? ["all", "admins"] : ["all", "users"];
  const dbClient = isSupabaseAdminAvailable ? supabaseAdmin : supabase;
  const queryLimit = Math.min(MAX_LIMIT * 4, Math.max(limit * 4, limit));
  const { data, error } = await dbClient
    .from(NOTIFICATION_TABLE)
    .select(
      "id,title,message,severity,audience,is_active,send_as_notification,created_at,updated_at,created_by,updated_by"
    )
    .eq("is_active", true)
    .eq("send_as_notification", true)
    .in("audience", audience)
    .order("created_at", { ascending: false })
    .limit(queryLimit);

  if (error) {
    if (isMissingRelationError(error)) {
      return NextResponse.json({ notifications: [] });
    }
    return NextResponse.json(
      { error: error.message || "Unable to load notifications." },
      { status: 500 }
    );
  }

  if (!data) {
    return NextResponse.json({ notifications: [] });
  }

  const rows = data as DashboardAnnouncementRecord[];
  const notificationIds = rows.map((item) => item.id);
  let stateMap = new Map<string, DashboardNotificationStateRecord>();

  if (notificationIds.length > 0) {
    const { data: stateData, error: stateError } = await dbClient
      .from(NOTIFICATION_STATE_TABLE)
      .select("notification_id,viewed_at,dismissed_at")
      .eq("user_id", access.user.id)
      .in("notification_id", notificationIds);

    if (stateError && !isMissingRelationError(stateError)) {
      return NextResponse.json(
        { error: stateError.message || "Unable to load notification state." },
        { status: 500 }
      );
    }

    if (!stateError) {
      stateMap = buildStateMap(stateData as DashboardNotificationStateRecord[]);
    }
  }

  const now = Date.now();
  const notifications: DashboardNotificationItem[] = rows
    .filter((item) => isNotificationVisibleForState(stateMap.get(item.id), now))
    .slice(0, limit)
    .map((item) => {
      const state = stateMap.get(item.id);
      return {
        id: item.id,
        title: item.title,
        message: item.message,
        severity: item.severity,
        createdAt: item.created_at,
        updatedAt: item.updated_at,
        viewedAt: state?.viewed_at ?? null,
      };
    });

  return NextResponse.json({
    notifications,
  });
}

export async function POST(request: NextRequest) {
  const access = await requireRouteAccess("POST /api/dashboard/notifications");
  if (access instanceof NextResponse) {
    return access;
  }

  const parsedBody = await validateJsonBody(request, notificationActionSchema);
  if (!parsedBody.ok) {
    return parsedBody.response;
  }

  const notificationIds = Array.from(new Set(parsedBody.data.notificationIds));
  const supabase = await createServerSupabaseReadonly();
  const dbClient = isSupabaseAdminAvailable ? supabaseAdmin : supabase;

  const { data: existingData, error: existingError } = await dbClient
    .from(NOTIFICATION_STATE_TABLE)
    .select("notification_id,viewed_at,dismissed_at")
    .eq("user_id", access.user.id)
    .in("notification_id", notificationIds);

  if (existingError) {
    if (isMissingRelationError(existingError)) {
      return NextResponse.json(
        { error: "Notification state table is missing. Apply the latest migrations." },
        { status: 500 }
      );
    }
    return NextResponse.json(
      { error: existingError.message || "Unable to load notification state." },
      { status: 500 }
    );
  }

  const existingById = buildStateMap(
    existingData as DashboardNotificationStateRecord[]
  );
  const now = new Date().toISOString();
  const rows =
    parsedBody.data.action === "view"
      ? notificationIds
          .filter((notificationId) => !existingById.get(notificationId)?.viewed_at)
          .map((notificationId) => ({
            user_id: access.user.id,
            notification_id: notificationId,
            viewed_at: now,
            updated_at: now,
          }))
      : notificationIds.map((notificationId) => ({
          user_id: access.user.id,
          notification_id: notificationId,
          viewed_at: existingById.get(notificationId)?.viewed_at ?? now,
          dismissed_at: now,
          updated_at: now,
        }));

  if (rows.length === 0) {
    return NextResponse.json({ ok: true });
  }

  const { error } = await dbClient
    .from(NOTIFICATION_STATE_TABLE)
    .upsert(rows, { onConflict: "user_id,notification_id" });

  if (error) {
    return NextResponse.json(
      { error: error.message || "Unable to save notification state." },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
}
