import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { requireRouteAccess } from "@/lib/api-authorization";
import {
  getUserAnalytics,
  type UserAnalytics,
} from "@/lib/analytics-service";
import { getDashboardPlanAccessForUser } from "@/lib/plan-access.server";
import {
  getDefaultLeadRating,
  normalizeLeadFlag,
  normalizeLeadRating,
} from "@/lib/lead-workflow";
import { validateSearchParams } from "@/lib/request-validation";
import { createServerSupabase } from "@/lib/supabase/server";
import { isSupabaseAdminAvailable, supabaseAdmin } from "@/lib/supabase-admin";

const MINUTE_MS = 60_000;
const DAY_MS = 86_400_000;

type LeadRow = {
  company: string | null;
  created_at: string;
  email: string | null;
  id: string;
  message: string | null;
  name: string | null;
  phone: string | null;
  note: string | null;
  next_follow_up_at: string | null;
  lead_flag: "follow_up" | "done" | null;
  lead_rating: number | null;
};

type ActiveProfileHandleRow = {
  handle: string | null;
};

type PublicProfileVisitRow = {
  created_at: string;
  timestamp: string | null;
};

function buildEmptyTimeline(days: number, timezoneOffsetMinutes: number) {
  const localNow = new Date(Date.now() - timezoneOffsetMinutes * MINUTE_MS);
  const localTodayStartMs = Date.UTC(
    localNow.getUTCFullYear(),
    localNow.getUTCMonth(),
    localNow.getUTCDate()
  );
  const startLocalDayMs = localTodayStartMs - (days - 1) * DAY_MS;
  const points = [];
  for (let i = 0; i < days; i += 1) {
    const day = new Date(startLocalDayMs + i * DAY_MS);
    points.push({ date: formatIsoDay(day), scans: 0, leads: 0 });
  }
  return points;
}

function formatIsoDay(date: Date) {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function normalizeTimezoneOffsetMinutes(value: string | null) {
  const parsed = Number.parseInt(value ?? "0", 10);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(-840, Math.min(840, parsed));
}

function buildTimelineWindow(days: number, timezoneOffsetMinutes: number) {
  const localNow = new Date(Date.now() - timezoneOffsetMinutes * MINUTE_MS);
  const localTodayStartMs = Date.UTC(
    localNow.getUTCFullYear(),
    localNow.getUTCMonth(),
    localNow.getUTCDate()
  );
  const startLocalDayMs = localTodayStartMs - (days - 1) * DAY_MS;
  const endLocalDayMs = localTodayStartMs + DAY_MS - 1;

  return {
    todayKey: formatIsoDay(localNow),
    startUtc: new Date(startLocalDayMs + timezoneOffsetMinutes * MINUTE_MS),
    endUtc: new Date(endLocalDayMs + timezoneOffsetMinutes * MINUTE_MS),
  };
}

function dayKey(input: string, timezoneOffsetMinutes: number) {
  const date = new Date(input);
  if (Number.isNaN(date.getTime())) return null;
  return formatIsoDay(new Date(date.getTime() - timezoneOffsetMinutes * MINUTE_MS));
}

function buildEmptyFunnel() {
  return {
    steps: [
      {
        key: "landing_cta_click",
        label: "Landing CTA click",
        eventCount: 0,
        firstAt: null,
        completed: false,
        conversionFromPrevious: null,
      },
      {
        key: "signup_start",
        label: "Signup start",
        eventCount: 0,
        firstAt: null,
        completed: false,
        conversionFromPrevious: null,
      },
      {
        key: "signup_complete",
        label: "Signup complete",
        eventCount: 0,
        firstAt: null,
        completed: false,
        conversionFromPrevious: null,
      },
      {
        key: "first_profile_publish",
        label: "First profile publish",
        eventCount: 0,
        firstAt: null,
        completed: false,
        conversionFromPrevious: null,
      },
      {
        key: "first_lead",
        label: "First lead",
        eventCount: 0,
        firstAt: null,
        completed: false,
        conversionFromPrevious: null,
      },
    ],
    completedSteps: 0,
    totalSteps: 5,
    completionRate: 0,
  } satisfies UserAnalytics["funnel"];
}

function buildEmptyOnboarding() {
  return {
    items: [
      {
        id: "publish_profile",
        label: "Publish profile",
        completed: false,
        detail: "Activate one public profile.",
      },
      {
        id: "publish_lead_form",
        label: "Publish lead form",
        completed: false,
        detail: "Publish your lead form to collect contacts.",
      },
      {
        id: "set_handle",
        label: "Set handle",
        completed: false,
        detail: "Choose a custom public handle.",
      },
      {
        id: "add_three_links",
        label: "Add 3 links",
        completed: false,
        detail: "0/3 links published.",
      },
      {
        id: "test_share",
        label: "Test share",
        completed: false,
        detail: "Use Share Contact or Save Contact once.",
      },
    ],
    completedCount: 0,
    totalCount: 5,
    progress: 0,
  } satisfies UserAnalytics["onboarding"];
}

function buildAnalyticsPayload(options: {
  days: number;
  timezoneOffsetMinutes: number;
  available: boolean;
  accessLevel: UserAnalytics["meta"]["accessLevel"];
  analyticsScope: UserAnalytics["meta"]["analyticsScope"];
  publicProfileHandle?: string | null;
  recentLeads?: UserAnalytics["recentLeads"];
  readyLeads?: number;
}): UserAnalytics {
  return {
    meta: {
      available: options.available,
      generatedAt: new Date().toISOString(),
      days: options.days,
      accessLevel: options.accessLevel,
      analyticsScope: options.analyticsScope,
      publicProfileHandle: options.publicProfileHandle ?? null,
    },
    totals: {
      scansToday: 0,
      leadsToday: 0,
      scans7d: 0,
      leads7d: 0,
      readyLeads: options.readyLeads ?? 0,
      conversionRate7d: 0,
      activeTags: 0,
      lastScanAt: null,
    },
    timeline: buildEmptyTimeline(options.days, options.timezoneOffsetMinutes),
    topProfiles: [],
    topLinks: [],
    recentLeads: options.recentLeads ?? [],
    funnel: buildEmptyFunnel(),
    onboarding: buildEmptyOnboarding(),
  };
}

function isMissingRelationError(message: string) {
  const lowered = message.toLowerCase();
  return (
    lowered.includes("does not exist") ||
    lowered.includes("relation") ||
    lowered.includes("schema cache")
  );
}

async function fetchRecentLeads(userId: string) {
  const supabase = await createServerSupabase();
  const { data: leads, error } = await supabase
    .from("leads")
    .select("id,name,email,phone,company,message,note,next_follow_up_at,lead_flag,lead_rating,created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(10);

  if (error) {
    throw new Error(error.message);
  }

  return ((leads ?? []) as LeadRow[]).map((lead) => ({
    id: lead.id,
    name: lead.name ?? "",
    email: lead.email ?? "",
    phone: lead.phone ?? null,
    company: lead.company ?? null,
    message: lead.message ?? null,
    note: lead.note ?? null,
    next_follow_up_at: lead.next_follow_up_at ?? null,
    lead_flag: normalizeLeadFlag(lead.lead_flag),
    lead_rating: normalizeLeadRating(
      lead.lead_rating,
      getDefaultLeadRating(lead.lead_flag)
    ),
    source_url: null,
    handle: null,
    created_at: lead.created_at,
  }));
}

async function fetchReadyLeadCount(userId: string) {
  const supabase = await createServerSupabase();
  const { count, error } = await supabase
    .from("leads")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("lead_flag", "follow_up");

  if (error) {
    throw new Error(error.message);
  }

  return count ?? 0;
}

async function fetchActiveProfileHandle(userId: string) {
  const db = isSupabaseAdminAvailable
    ? supabaseAdmin
    : await createServerSupabase();

  const activeResult = await db
    .from("user_profiles")
    .select("handle")
    .eq("user_id", userId)
    .eq("is_active", true)
    .limit(1)
    .maybeSingle<ActiveProfileHandleRow | null>();

  if (activeResult.error && activeResult.error.code !== "PGRST116") {
    throw new Error(activeResult.error.message);
  }

  if (activeResult.data?.handle?.trim()) {
    return activeResult.data.handle.trim().toLowerCase();
  }

  const fallbackResult = await db
    .from("user_profiles")
    .select("handle")
    .eq("user_id", userId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle<ActiveProfileHandleRow | null>();

  if (fallbackResult.error && fallbackResult.error.code !== "PGRST116") {
    throw new Error(fallbackResult.error.message);
  }

  return fallbackResult.data?.handle?.trim().toLowerCase() ?? null;
}

function getOccurredAt(row: PublicProfileVisitRow) {
  return row.timestamp ?? row.created_at;
}

async function buildFreeAnalytics(
  userId: string,
  days: number,
  timezoneOffsetMinutes: number
) {
  const publicProfileHandle = await fetchActiveProfileHandle(userId);
  const analytics = buildAnalyticsPayload({
    days,
    timezoneOffsetMinutes,
    available: true,
    accessLevel: "free",
    analyticsScope: "public_profile_visits",
    publicProfileHandle,
  });

  if (!publicProfileHandle) {
    return analytics;
  }

  const db = isSupabaseAdminAvailable
    ? supabaseAdmin
    : await createServerSupabase();
  const { startUtc, endUtc, todayKey } = buildTimelineWindow(
    days,
    timezoneOffsetMinutes
  );

  const { data, error } = await db
    .from("conversion_events")
    .select("created_at,timestamp")
    .eq("user_id", userId)
    .eq("event_id", "public_profile_view")
    .filter("meta->>handle", "eq", publicProfileHandle)
    .gte("created_at", startUtc.toISOString())
    .lte("created_at", endUtc.toISOString())
    .order("created_at", { ascending: true })
    .returns<PublicProfileVisitRow[]>();

  if (error) {
    if (isMissingRelationError(error.message)) {
      return {
        ...analytics,
        meta: {
          ...analytics.meta,
          available: false,
        },
      };
    }
    throw new Error(error.message);
  }

  let scansToday = 0;
  let lastScanAt: string | null = null;

  for (const row of data ?? []) {
    const occurredAt = getOccurredAt(row);
    const key = dayKey(occurredAt, timezoneOffsetMinutes);
    if (!key) continue;
    const point = analytics.timeline.find((entry) => entry.date === key);
    if (!point) continue;
    point.scans += 1;
    if (key === todayKey) {
      scansToday += 1;
    }
    if (!lastScanAt || new Date(occurredAt) > new Date(lastScanAt)) {
      lastScanAt = occurredAt;
    }
  }

  const scans7d = analytics.timeline
    .slice(-Math.min(7, analytics.timeline.length))
    .reduce((total, point) => total + point.scans, 0);

  return {
    ...analytics,
    totals: {
      ...analytics.totals,
      scansToday,
      scans7d,
      lastScanAt,
    },
  };
}

const analyticsQuerySchema = z.object({
  days: z.coerce.number().int().min(1).max(90).optional().default(30),
  tzOffsetMinutes: z.coerce.number().int().min(-840).max(840).optional().default(0),
  userId: z.string().uuid(),
});

export async function GET(request: NextRequest) {
  const parsedQuery = validateSearchParams(
    request.nextUrl.searchParams,
    analyticsQuerySchema
  );
  if (!parsedQuery.ok) {
    return parsedQuery.response;
  }

  const { days, tzOffsetMinutes, userId } = parsedQuery.data;
  const timezoneOffsetMinutes = normalizeTimezoneOffsetMinutes(
    String(tzOffsetMinutes)
  );
  let accessLevel: UserAnalytics["meta"]["accessLevel"] = "paid";
  let analyticsScope: UserAnalytics["meta"]["analyticsScope"] = "full";

  try {
    const access = await requireRouteAccess("GET /api/analytics/supabase", {
      resourceUserId: userId,
    });
    if (access instanceof NextResponse) {
      return access;
    }

    const planAccess = await getDashboardPlanAccessForUser(userId);
    accessLevel = planAccess.canViewAdvancedAnalytics ? "paid" : "free";
    analyticsScope = planAccess.canViewAdvancedAnalytics
      ? "full"
      : "public_profile_visits";

    if (!planAccess.canViewAdvancedAnalytics) {
      const analytics = await buildFreeAnalytics(
        userId,
        days,
        timezoneOffsetMinutes
      );
      return NextResponse.json(analytics, {
        headers: {
          "Cache-Control": "no-store, max-age=0",
        },
      });
    }

    if (isSupabaseAdminAvailable) {
      const analytics = await getUserAnalytics(userId, {
        days,
        timezoneOffsetMinutes,
      });
      return NextResponse.json(analytics, {
        headers: {
          "Cache-Control": "no-store, max-age=0",
        },
      });
    }

    const [recentLeads, readyLeads] = await Promise.all([
      fetchRecentLeads(userId),
      fetchReadyLeadCount(userId),
    ]);
    const analytics = buildAnalyticsPayload({
      days,
      timezoneOffsetMinutes,
      available: false,
      accessLevel: "paid",
      analyticsScope: "full",
      recentLeads,
      readyLeads,
    });

    return NextResponse.json(analytics, {
      headers: {
        "Cache-Control": "no-store, max-age=0",
      },
    });
  } catch (error) {
    console.error("Analytics API error:", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to fetch analytics",
        meta: {
          available: false,
          generatedAt: new Date().toISOString(),
          days,
          accessLevel,
          analyticsScope,
          publicProfileHandle: null,
        },
      },
      { status: 500 }
    );
  }
}
