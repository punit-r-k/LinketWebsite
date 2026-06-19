import { isSupabaseAdminAvailable, supabaseAdmin } from "@/lib/supabase-admin";
import {
  getDefaultLeadRating,
  normalizeLeadFlag,
  normalizeLeadRating,
} from "@/lib/lead-workflow";

export type AnalyticsTimelinePoint = {
  date: string;
  scans: number;
  leads: number;
};

export type AnalyticsTopProfile = {
  profileId: string | null;
  handle: string | null;
  displayName: string;
  nickname: string | null;
  scans: number;
  leads: number;
};

export type AnalyticsTopLink = {
  id: string;
  profileId: string | null;
  handle: string | null;
  profileDisplayName: string;
  title: string;
  url: string;
  clicks: number;
};

export type AnalyticsLead = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  company: string | null;
  message: string | null;
  note: string | null;
  next_follow_up_at: string | null;
  lead_flag: "follow_up" | "done";
  lead_rating: number;
  source_url: string | null;
  handle: string | null;
  created_at: string;
};

export type AnalyticsTotals = {
  scansToday: number;
  leadsToday: number;
  scans7d: number;
  leads7d: number;
  readyLeads: number;
  conversionRate7d: number;
  activeTags: number;
  lastScanAt: string | null;
};

export type AnalyticsFunnelStepKey =
  | "landing_cta_click"
  | "signup_start"
  | "signup_complete"
  | "first_profile_publish"
  | "first_lead";

export type AnalyticsFunnelStep = {
  key: AnalyticsFunnelStepKey;
  label: string;
  eventCount: number;
  firstAt: string | null;
  completed: boolean;
  conversionFromPrevious: number | null;
};

export type AnalyticsFunnel = {
  steps: AnalyticsFunnelStep[];
  completedSteps: number;
  totalSteps: number;
  completionRate: number;
};

export type OnboardingChecklistItem = {
  id:
    | "set_handle"
    | "publish_profile"
    | "add_three_links"
    | "test_share"
    | "publish_lead_form";
  label: string;
  completed: boolean;
  detail: string;
};

export type OnboardingChecklist = {
  items: OnboardingChecklistItem[];
  completedCount: number;
  totalCount: number;
  progress: number;
};

export type UserAnalytics = {
  totals: AnalyticsTotals;
  timeline: AnalyticsTimelinePoint[];
  topProfiles: AnalyticsTopProfile[];
  topLinks: AnalyticsTopLink[];
  recentLeads: AnalyticsLead[];
  funnel: AnalyticsFunnel;
  onboarding: OnboardingChecklist;
  meta: {
    days: number;
    generatedAt: string;
    available: boolean;
    accessLevel: "free" | "paid";
    analyticsScope: "full" | "public_profile_visits";
    publicProfileHandle: string | null;
  };
};

export type AnalyticsOptions = {
  days?: number;
  recentLeadCount?: number;
  timezoneOffsetMinutes?: number;
};

const DEFAULT_OPTIONS: Required<AnalyticsOptions> = {
  days: 30,
  recentLeadCount: 10,
  timezoneOffsetMinutes: 0,
};

const LANDING_CTA_EVENT_IDS = [
  "hero_cta_click",
  "pricing_cta_click",
  "footer_cta_click",
] as const;

const SHARE_TEST_EVENT_IDS = [
  "vcard_download_success",
  "share_contact_success",
] as const;

const FUNNEL_EVENT_IDS = [
  ...LANDING_CTA_EVENT_IDS,
  "signup_start",
  "signup_complete",
  "profile_published",
  "lead_captured",
  ...SHARE_TEST_EVENT_IDS,
] as const;

export async function getUserAnalytics(
  userId: string,
  options: AnalyticsOptions = {}
): Promise<UserAnalytics> {
  const resolved = { ...DEFAULT_OPTIONS, ...options };
  const days = Math.max(1, Math.min(resolved.days, 90));
  const timezoneOffsetMinutes = normalizeTimezoneOffsetMinutes(
    resolved.timezoneOffsetMinutes
  );

  if (!isSupabaseAdminAvailable) {
    const funnel = buildFunnel([]);
    const onboarding = buildOnboardingChecklist({
      profiles: [],
      linksByProfile: new Map<string, number>(),
      hasPublishedLeadForm: false,
      shareTestCount: 0,
    });
    return {
      totals: {
        scansToday: 0,
        leadsToday: 0,
        scans7d: 0,
        leads7d: 0,
        readyLeads: 0,
        conversionRate7d: 0,
        activeTags: 0,
        lastScanAt: null,
      },
      timeline: buildEmptyTimeline(days, timezoneOffsetMinutes),
      topProfiles: [],
      topLinks: [],
      recentLeads: [],
      funnel,
      onboarding,
      meta: {
        days,
        generatedAt: new Date().toISOString(),
        available: false,
        accessLevel: "paid",
        analyticsScope: "full",
        publicProfileHandle: null,
      },
    };
  }

  const { startUtc, endUtc, startLocalDayMs, todayKey } = buildTimelineWindow({
    days,
    timezoneOffsetMinutes,
  });
  const timelineMap = initialiseTimelineMap(startLocalDayMs, days);

  const [
    assignments,
    profileRows,
    linksByProfile,
    linkRows,
    hasPublishedLeadForm,
    conversionRows,
  ] = await Promise.all([
    fetchAssignments(userId),
    fetchProfilesForUser(userId),
    fetchActiveLinkCountsByProfile(userId),
    fetchLinkPerformanceRows(userId),
    fetchPublishedLeadFormState(userId),
    fetchConversionEventsForUser(userId, [...FUNNEL_EVENT_IDS]),
  ]);

  const tagIds = assignments.map((assignment) => assignment.tag_id);
  const profileByHandle = new Map<string, AssignmentProfile>();
  const profileById = new Map<string, AssignmentProfile>();
  const tagMeta = new Map<string, AssignmentProfile>();

  for (const profile of profileRows) {
    const normalized: AssignmentProfile = {
      profileId: profile.id,
      handle: profile.handle?.trim()?.toLowerCase() || null,
      displayName: profile.name?.trim() || null,
      nickname: null,
    };
    profileById.set(profile.id, normalized);
    if (normalized.handle) {
      profileByHandle.set(normalized.handle, normalized);
    }
  }

  for (const assignment of assignments) {
    const normalized = normaliseAssignment(assignment);
    tagMeta.set(assignment.tag_id, normalized);
    if (normalized.profileId) {
      const fromProfiles = profileById.get(normalized.profileId);
      if (fromProfiles) {
        if (!fromProfiles.nickname && normalized.nickname) {
          profileById.set(normalized.profileId, {
            ...fromProfiles,
            nickname: normalized.nickname,
          });
        }
      } else {
        profileById.set(normalized.profileId, normalized);
      }
    }
    if (normalized.handle && !profileByHandle.has(normalized.handle)) {
      profileByHandle.set(normalized.handle, normalized);
    }
  }

  let scansToday = 0;
  let leadsToday = 0;
  let lastScanAt: string | null = null;
  const scansByProfile = new Map<string, ProfileAggregate>();
  const activeTagIds = new Set<string>();

  const scanRows = await fetchScanRowsForUser({
    userId,
    startIso: startUtc.toISOString(),
    endIso: endUtc.toISOString(),
    tagIds,
  });

  for (const row of scanRows) {
    if (!row.occurred_at) continue;
    const key = dayKey(row.occurred_at, timezoneOffsetMinutes);
    const entry = timelineMap.get(key);
    if (entry) entry.scans += 1;
    if (key === todayKey) scansToday += 1;
    if (!lastScanAt || new Date(row.occurred_at) > new Date(lastScanAt)) {
      lastScanAt = row.occurred_at;
    }
    if (row.tag_id) activeTagIds.add(row.tag_id);

    const metadataProfileId =
      readMetadataValue(row.metadata, "owner_profile_id") ||
      readMetadataValue(row.metadata, "profile_id");
    const profileFromMetadata = metadataProfileId
      ? profileById.get(metadataProfileId)
      : undefined;
    const profileFromTag = row.tag_id ? tagMeta.get(row.tag_id) : undefined;
    const profile = profileFromMetadata ?? profileFromTag;

    const aggregateKey =
      profileFromMetadata?.profileId ||
      profile?.profileId ||
      profile?.handle ||
      row.tag_id ||
      row.id ||
      "unknown";

    const current = scansByProfile.get(aggregateKey) ?? {
      profileId: profile?.profileId ?? metadataProfileId ?? null,
      handle: profile?.handle ?? null,
      displayName: profile?.displayName ?? "Unassigned Linket",
      nickname: profile?.nickname ?? null,
      scans: 0,
      leads: 0,
    };
    current.scans += 1;
    if (profile?.displayName) current.displayName = profile.displayName;
    if (profile?.nickname) current.nickname = profile.nickname;
    if (!current.profileId && metadataProfileId) {
      current.profileId = metadataProfileId;
    }
    scansByProfile.set(aggregateKey, current);
  }

  const { data: leadRows, error: leadsError } = await supabaseAdmin
    .from("leads")
    .select(
      "id, name, email, phone, company, message, note, next_follow_up_at, lead_flag, lead_rating, source_url, handle, created_at"
    )
    .eq("user_id", userId)
    .gte("created_at", startUtc.toISOString())
    .lte("created_at", endUtc.toISOString())
    .order("created_at", { ascending: false });

  if (leadsError) {
    throw new Error("Failed to load leads: " + leadsError.message);
  }

  const normalizedLeadRows = (leadRows ?? []).map((lead) => ({
    ...lead,
    lead_flag: normalizeLeadFlag(lead.lead_flag),
    lead_rating: normalizeLeadRating(
      lead.lead_rating,
      getDefaultLeadRating(lead.lead_flag)
    ),
  }));
  const recentLeads = normalizedLeadRows.slice(0, resolved.recentLeadCount);
  const readyLeads = normalizedLeadRows.filter(
    (lead) => lead.lead_flag === "follow_up"
  ).length;

  for (const lead of normalizedLeadRows) {
    if (!lead.created_at) continue;
    const key = dayKey(lead.created_at, timezoneOffsetMinutes);
    const entry = timelineMap.get(key);
    if (entry) entry.leads += 1;
    if (key === todayKey) leadsToday += 1;

    const normalizedHandle = lead.handle?.trim()?.toLowerCase() || null;
    const profile = normalizedHandle
      ? profileByHandle.get(normalizedHandle)
      : undefined;
    const aggregateKey =
      profile?.profileId ||
      normalizedHandle ||
      (lead.id ? `lead-${lead.id}` : "lead");

    const current = scansByProfile.get(aggregateKey) ?? {
      profileId: profile?.profileId ?? null,
      handle: profile?.handle ?? normalizedHandle ?? null,
      displayName: profile?.displayName ?? normalizedHandle ?? "Public Linket",
      nickname: profile?.nickname ?? null,
      scans: 0,
      leads: 0,
    };
    current.leads += 1;
    scansByProfile.set(aggregateKey, current);
  }

  const timeline = Array.from(timelineMap.values()).sort((a, b) =>
    a.date < b.date ? -1 : 1
  );
  const scans7d = sumRange(timeline, 7, (point) => point.scans);
  const leads7d = sumRange(timeline, 7, (point) => point.leads);
  const conversionRate7d = scans7d > 0 ? leads7d / scans7d : 0;

  const topProfiles = Array.from(scansByProfile.values())
    .sort((a, b) => (b.scans === a.scans ? b.leads - a.leads : b.scans - a.scans))
    .slice(0, 8)
    .map((item) => ({
      profileId: item.profileId,
      handle: item.handle,
      displayName: item.displayName,
      nickname: item.nickname ?? null,
      scans: item.scans,
      leads: item.leads,
    }));

  const topLinks = linkRows
    .map((row) => {
      const profile = row.profile_id ? profileById.get(row.profile_id) : undefined;
      return {
        id: row.id,
        profileId: row.profile_id ?? null,
        handle: profile?.handle ?? null,
        profileDisplayName:
          profile?.displayName ||
          profile?.nickname ||
          row.title ||
          "Unassigned profile",
        title: row.title || "Untitled link",
        url: row.url || "",
        clicks: Number(row.click_count ?? 0),
      };
    })
    .sort((a, b) => (b.clicks === a.clicks ? a.title.localeCompare(b.title) : b.clicks - a.clicks));

  const funnel = buildFunnel(conversionRows);
  const shareTestCount = countEventsByIds(conversionRows, [...SHARE_TEST_EVENT_IDS]);
  const onboarding = buildOnboardingChecklist({
    profiles: profileRows,
    linksByProfile,
    hasPublishedLeadForm,
    shareTestCount,
  });

  return {
    totals: {
      scansToday,
      leadsToday,
      scans7d,
      leads7d,
      readyLeads,
      conversionRate7d,
      activeTags: activeTagIds.size,
      lastScanAt,
    },
    timeline,
    topProfiles,
    topLinks,
    recentLeads: recentLeads.map((lead) => ({
      id: lead.id,
      name: lead.name,
      email: lead.email,
      phone: lead.phone ?? null,
      company: lead.company ?? null,
      message: lead.message ?? null,
      note: lead.note ?? null,
      next_follow_up_at: lead.next_follow_up_at ?? null,
      lead_flag: lead.lead_flag,
      lead_rating: lead.lead_rating,
      source_url: lead.source_url ?? null,
      handle: lead.handle ?? null,
      created_at: lead.created_at,
    })),
    funnel,
    onboarding,
    meta: {
      days,
      generatedAt: new Date().toISOString(),
      available: true,
      accessLevel: "paid",
      analyticsScope: "full",
      publicProfileHandle: null,
    },
  };
}

type AssignmentRow = {
  tag_id: string;
  nickname: string | null;
  profile: null | {
    id: string;
    name: string | null;
    handle: string | null;
  };
};

type UserProfileRow = {
  id: string;
  name: string | null;
  handle: string | null;
  is_active: boolean;
};

type AssignmentProfile = {
  profileId: string | null;
  handle: string | null;
  displayName: string | null;
  nickname: string | null;
};

type ProfileAggregate = {
  profileId: string | null;
  handle: string | null;
  displayName: string;
  nickname: string | null;
  scans: number;
  leads: number;
};

type ScanRow = {
  id: string;
  tag_id: string | null;
  occurred_at: string | null;
  metadata: Record<string, unknown> | null;
};

type ConversionEventRow = {
  event_id: string;
  created_at: string;
  timestamp: string | null;
};

type LinkPerformanceRow = {
  id: string;
  profile_id: string | null;
  title: string | null;
  url: string | null;
  click_count: number | null;
  is_active: boolean;
};

const MINUTE_MS = 60_000;
const DAY_MS = 86_400_000;

function buildEmptyTimeline(
  days: number,
  timezoneOffsetMinutes: number
): AnalyticsTimelinePoint[] {
  const { startLocalDayMs } = buildTimelineWindow({
    days,
    timezoneOffsetMinutes,
  });
  const map = initialiseTimelineMap(startLocalDayMs, days);
  return Array.from(map.values());
}

function initialiseTimelineMap(startLocalDayMs: number, days: number) {
  const map = new Map<string, AnalyticsTimelinePoint>();
  for (let i = 0; i < days; i += 1) {
    const key = formatIsoDay(new Date(startLocalDayMs + i * DAY_MS));
    map.set(key, { date: key, scans: 0, leads: 0 });
  }
  return map;
}

function dayKey(input: string | Date, timezoneOffsetMinutes: number) {
  const d = typeof input === "string" ? new Date(input) : input;
  const shifted = new Date(d.getTime() - timezoneOffsetMinutes * MINUTE_MS);
  return formatIsoDay(shifted);
}

function buildTimelineWindow({
  days,
  timezoneOffsetMinutes,
  now = new Date(),
}: {
  days: number;
  timezoneOffsetMinutes: number;
  now?: Date;
}) {
  const localNow = new Date(now.getTime() - timezoneOffsetMinutes * MINUTE_MS);
  const localTodayStartMs = Date.UTC(
    localNow.getUTCFullYear(),
    localNow.getUTCMonth(),
    localNow.getUTCDate()
  );
  const startLocalDayMs = localTodayStartMs - (days - 1) * DAY_MS;
  const endLocalDayMs = localTodayStartMs + DAY_MS - 1;

  return {
    startUtc: new Date(startLocalDayMs + timezoneOffsetMinutes * MINUTE_MS),
    endUtc: new Date(endLocalDayMs + timezoneOffsetMinutes * MINUTE_MS),
    startLocalDayMs,
    todayKey: formatIsoDay(localNow),
  };
}

function formatIsoDay(date: Date) {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function normalizeTimezoneOffsetMinutes(value: number) {
  if (!Number.isFinite(value)) return 0;
  const offset = Math.trunc(value);
  return Math.max(-840, Math.min(840, offset));
}

async function fetchAssignments(userId: string): Promise<AssignmentRow[]> {
  const { data, error } = await supabaseAdmin
    .from("tag_assignments")
    .select("tag_id, nickname, profile:user_profiles(id, name, handle)")
    .eq("user_id", userId);
  if (error) throw new Error("Failed to load tag assignments: " + error.message);
  return (data ?? []).map((row: Record<string, unknown>) => {
    let profile = row.profile;
    if (Array.isArray(profile)) {
      profile = profile[0] ?? null;
    }
    return { ...row, profile } as AssignmentRow;
  });
}

async function fetchProfilesForUser(userId: string): Promise<UserProfileRow[]> {
  const { data, error } = await supabaseAdmin
    .from("user_profiles")
    .select("id, name, handle, is_active")
    .eq("user_id", userId);
  if (error) throw new Error("Failed to load profiles: " + error.message);
  return (data ?? []) as UserProfileRow[];
}

async function fetchActiveLinkCountsByProfile(userId: string) {
  const { data, error } = await supabaseAdmin
    .from("profile_links")
    .select("profile_id, is_active")
    .eq("user_id", userId)
    .eq("is_active", true);
  if (error) throw new Error("Failed to load profile links: " + error.message);
  const counts = new Map<string, number>();
  for (const row of (data ?? []) as Array<{ profile_id: string }>) {
    counts.set(row.profile_id, (counts.get(row.profile_id) ?? 0) + 1);
  }
  return counts;
}

async function fetchPublishedLeadFormState(userId: string) {
  const { data, error } = await supabaseAdmin
    .from("lead_forms")
    .select("id")
    .eq("user_id", userId)
    .eq("status", "published")
    .limit(1);
  if (error) throw new Error("Failed to load lead forms: " + error.message);
  return Boolean(data?.length);
}

async function fetchLinkPerformanceRows(userId: string) {
  const { data, error } = await supabaseAdmin
    .from("profile_links")
    .select("id, profile_id, title, url, click_count, is_active")
    .eq("user_id", userId)
    .eq("is_active", true);
  if (error) throw new Error("Failed to load profile link performance: " + error.message);
  return (data ?? []) as LinkPerformanceRow[];
}

async function fetchConversionEventsForUser(userId: string, eventIds: string[]) {
  const { data, error } = await supabaseAdmin
    .from("conversion_events")
    .select("event_id, created_at, timestamp")
    .eq("user_id", userId)
    .in("event_id", eventIds)
    .order("created_at", { ascending: true });
  if (error) {
    if (error.message.toLowerCase().includes('relation "conversion_events" does not exist')) {
      return [] as ConversionEventRow[];
    }
    throw new Error("Failed to load conversion events: " + error.message);
  }
  return ((data ?? []) as ConversionEventRow[]).filter((row) => Boolean(row.event_id));
}

function countEventsByIds(rows: ConversionEventRow[], eventIds: string[]) {
  const ids = new Set(eventIds);
  return rows.reduce(
    (total, row) => (ids.has(row.event_id) ? total + 1 : total),
    0
  );
}

function buildFunnel(rows: ConversionEventRow[]): AnalyticsFunnel {
  const stepConfig: Array<{
    key: AnalyticsFunnelStepKey;
    label: string;
    eventIds: string[];
  }> = [
    {
      key: "landing_cta_click",
      label: "Landing CTA click",
      eventIds: [...LANDING_CTA_EVENT_IDS],
    },
    {
      key: "signup_start",
      label: "Signup start",
      eventIds: ["signup_start"],
    },
    {
      key: "signup_complete",
      label: "Signup complete",
      eventIds: ["signup_complete"],
    },
    {
      key: "first_profile_publish",
      label: "First profile publish",
      eventIds: ["profile_published"],
    },
    {
      key: "first_lead",
      label: "First lead",
      eventIds: ["lead_captured"],
    },
  ];

  const counts = new Map<AnalyticsFunnelStepKey, number>();
  const firstAt = new Map<AnalyticsFunnelStepKey, string>();

  for (const row of rows) {
    const occurredAt = row.timestamp || row.created_at;
    for (const step of stepConfig) {
      if (!step.eventIds.includes(row.event_id)) continue;
      counts.set(step.key, (counts.get(step.key) ?? 0) + 1);
      const earliest = firstAt.get(step.key);
      if (!earliest || new Date(occurredAt) < new Date(earliest)) {
        firstAt.set(step.key, occurredAt);
      }
    }
  }

  const steps: AnalyticsFunnelStep[] = stepConfig.map((step, index) => {
    const eventCount = counts.get(step.key) ?? 0;
    const previousCount =
      index > 0 ? counts.get(stepConfig[index - 1].key) ?? 0 : 0;
    return {
      key: step.key,
      label: step.label,
      eventCount,
      firstAt: firstAt.get(step.key) ?? null,
      completed: eventCount > 0,
      conversionFromPrevious:
        index === 0 || previousCount <= 0
          ? null
          : Math.min(eventCount / previousCount, 1),
    };
  });

  const completedSteps = steps.reduce(
    (total, step) => (step.completed ? total + 1 : total),
    0
  );

  return {
    steps,
    completedSteps,
    totalSteps: steps.length,
    completionRate: steps.length > 0 ? completedSteps / steps.length : 0,
  };
}

function buildOnboardingChecklist(input: {
  profiles: UserProfileRow[];
  linksByProfile: Map<string, number>;
  hasPublishedLeadForm: boolean;
  shareTestCount: number;
}): OnboardingChecklist {
  const { profiles, linksByProfile, hasPublishedLeadForm, shareTestCount } = input;
  const activeProfile = profiles.find((profile) => profile.is_active) ?? profiles[0];

  const hasCustomHandle = profiles.some((profile) => {
    const handle = profile.handle?.trim().toLowerCase() ?? "";
    if (!handle) return false;
    return !/^user-[0-9a-f]{8}$/i.test(handle);
  });
  const hasPublishedProfile = profiles.some((profile) => profile.is_active);
  const activeLinkCount = activeProfile
    ? linksByProfile.get(activeProfile.id) ?? 0
    : 0;
  const hasThreeLinks = activeLinkCount >= 3;
  const hasShareTest = shareTestCount > 0;

  const items: OnboardingChecklistItem[] = [
    {
      id: "publish_profile",
      label: "Publish profile",
      completed: hasPublishedProfile,
      detail: hasPublishedProfile
        ? "An active profile is live."
        : "Activate one public profile.",
    },
    {
      id: "publish_lead_form",
      label: "Publish lead form",
      completed: hasPublishedLeadForm,
      detail: hasPublishedLeadForm
        ? "Lead form is published."
        : "Publish your lead form to collect contacts.",
    },
    {
      id: "set_handle",
      label: "Set handle",
      completed: hasCustomHandle,
      detail: hasCustomHandle
        ? "Public handle is configured."
        : "Choose a custom public handle.",
    },
    {
      id: "add_three_links",
      label: "Add 3 links",
      completed: hasThreeLinks,
      detail: hasThreeLinks
        ? `${activeLinkCount} links are live.`
        : `${activeLinkCount}/3 links published.`,
    },
    {
      id: "test_share",
      label: "Test share",
      completed: hasShareTest,
      detail: hasShareTest
        ? "Share or vCard flow has been tested."
        : "Use Share Contact or Save Contact once.",
    },
  ];

  const completedCount = items.reduce(
    (total, item) => (item.completed ? total + 1 : total),
    0
  );

  return {
    items,
    completedCount,
    totalCount: items.length,
    progress: items.length > 0 ? completedCount / items.length : 0,
  };
}

async function fetchScanRowsForUser(options: {
  userId: string;
  startIso: string;
  endIso: string;
  tagIds: string[];
}): Promise<ScanRow[]> {
  const { userId, startIso, endIso, tagIds } = options;
  const rowsById = new Map<string, ScanRow>();
  let metadataQueriesFailed = false;

  for (const metadataKey of ["owner_user_id", "user_id"] as const) {
    try {
      const { data, error } = await supabaseAdmin
        .from("tag_events")
        .select("id, tag_id, occurred_at, metadata")
        .eq("event_type", "scan")
        .gte("occurred_at", startIso)
        .lte("occurred_at", endIso)
        .filter(`metadata->>${metadataKey}`, "eq", userId)
        .order("occurred_at", { ascending: true });

      if (error) throw error;
      for (const row of (data ?? []) as ScanRow[]) {
        if (!row.id) continue;
        rowsById.set(row.id, row);
      }
    } catch {
      metadataQueriesFailed = true;
    }
  }

  if (rowsById.size === 0 && metadataQueriesFailed && tagIds.length > 0) {
    const { data, error } = await supabaseAdmin
      .from("tag_events")
      .select("id, tag_id, occurred_at, metadata")
      .eq("event_type", "scan")
      .in("tag_id", tagIds)
      .gte("occurred_at", startIso)
      .lte("occurred_at", endIso)
      .order("occurred_at", { ascending: true });
    if (error) {
      throw new Error("Failed to load tag events: " + error.message);
    }
    for (const row of (data ?? []) as ScanRow[]) {
      if (!row.id) continue;
      rowsById.set(row.id, row);
    }
  }

  return Array.from(rowsById.values()).sort((a, b) => {
    const left = a.occurred_at || "";
    const right = b.occurred_at || "";
    return left < right ? -1 : left > right ? 1 : 0;
  });
}

function readMetadataValue(
  metadata: Record<string, unknown> | null,
  key: string
) {
  const value = metadata?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function normaliseAssignment(row: AssignmentRow): AssignmentProfile {
  const displayName = row.profile?.name?.trim() || row.nickname?.trim() || null;
  const handle = row.profile?.handle?.trim()?.toLowerCase() || null;
  return {
    profileId: row.profile?.id ?? null,
    handle,
    displayName,
    nickname: row.nickname ?? null,
  };
}

function sumRange(
  points: AnalyticsTimelinePoint[],
  days: number,
  selector: (point: AnalyticsTimelinePoint) => number
) {
  const subset = points.slice(-Math.min(days, points.length));
  return subset.reduce((total, point) => total + selector(point), 0);
}
