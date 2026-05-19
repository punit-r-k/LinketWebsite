import "server-only";

import { isSupabaseAdminAvailable, supabaseAdmin } from "@/lib/supabase-admin";

export type ProductClickMetric = {
  key: string;
  eventId: string;
  label: string;
  count: number;
  uniqueUsers: number;
  topPath: string | null;
  lastAt: string | null;
};

export type ProductOnboardingStage = {
  key: ProductOnboardingStageKey;
  label: string;
  reachedUsers: number;
  completedUsers: number;
  completionRate: number;
  conversionFromPrevious: number | null;
  dropOffAfterUsers: number | null;
  dropOffAfterRate: number | null;
  lastAt: string | null;
};

export type ProductOnboardingStop = {
  key: ProductOnboardingStageKey;
  label: string;
  stoppedUsers: number;
  explicitExitEvents: number;
  lastExitAt: string | null;
};

export type ProductAnalytics = {
  totals: {
    events: number;
    knownUsers: number;
    anonymousEvents: number;
    clickEvents: number;
    onboardingStarts: number;
    onboardingCompletions: number;
    onboardingCompletionRate: number;
  };
  topClicks: ProductClickMetric[];
  onboardingStages: ProductOnboardingStage[];
  onboardingStops: ProductOnboardingStop[];
  meta: {
    days: number;
    generatedAt: string;
    available: boolean;
    truncated: boolean;
    queriedEventCount: number;
    sampledEventCount: number;
    error: string | null;
  };
};

type ProductAnalyticsOptions = {
  days?: number;
};

type ConversionEventRecord = {
  id: string;
  event_id: string;
  user_id: string | null;
  path: string | null;
  href: string | null;
  timestamp: string | null;
  meta: Record<string, unknown> | null;
  created_at: string;
};

type ClickAggregate = {
  key: string;
  eventId: string;
  label: string;
  count: number;
  users: Set<string>;
  pathCounts: Map<string, number>;
  lastAt: string | null;
};

type UserOnboardingState = {
  reachedIndex: number;
  completedIndexes: Set<number>;
  exitStageIndex: number | null;
  explicitExitEvents: number;
  lastExitAt: string | null;
};

type ProductOnboardingStageKey =
  | "started"
  | "profile"
  | "contact"
  | "links"
  | "publish"
  | "live";

const DEFAULT_DAYS = 30;
const MAX_DAYS = 180;
const MAX_EVENTS = 15000;
const DAY_MS = 86_400_000;

const ONBOARDING_STAGES: Array<{
  key: ProductOnboardingStageKey;
  label: string;
}> = [
  { key: "started", label: "Started onboarding" },
  { key: "profile", label: "Profile basics" },
  { key: "contact", label: "Contact card" },
  { key: "links", label: "First link" },
  { key: "publish", label: "Publish step" },
  { key: "live", label: "Live page" },
];

const STEP_ID_TO_STAGE_INDEX: Record<string, number> = {
  profile: 1,
  contact: 2,
  links: 3,
  publish: 4,
};

const CLICK_EVENT_LABELS: Record<string, string> = {
  hero_cta_click: "Landing hero CTA",
  pricing_cta_click: "Pricing CTA",
  footer_cta_click: "Footer CTA",
  consult_submit_click: "Consult form submit",
  dashboard_nav_clicked: "Dashboard navigation",
  copy_public_link_clicked: "Copy public link",
  open_public_profile_clicked: "Open public profile",
  qr_modal_opened: "Open QR modal",
  share_contact_click: "Share contact",
  vcard_download_click: "Download vCard",
  linket_claim_started: "Start Linket claim",
  onboarding_publish_clicked: "Publish onboarding page",
};

export async function getProductAnalytics(
  options: ProductAnalyticsOptions = {}
): Promise<ProductAnalytics> {
  const days = normalizeDays(options.days);

  if (!isSupabaseAdminAvailable) {
    return buildEmptyProductAnalytics(days, {
      available: false,
      error: "Supabase service role credentials are not configured.",
    });
  }

  const since = new Date(Date.now() - days * DAY_MS).toISOString();
  const { data, error, count } = await supabaseAdmin
    .from("conversion_events")
    .select(
      "id,event_id,user_id,path,href,timestamp,meta,created_at",
      { count: "exact" }
    )
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(MAX_EVENTS);

  if (error) {
    if (isMissingConversionEventsError(error.message)) {
      return buildEmptyProductAnalytics(days, {
        available: false,
        error: "The conversion_events table is missing. Apply the analytics migrations.",
      });
    }
    throw new Error(error.message || "Unable to load product analytics.");
  }

  const rows = ((data ?? []) as ConversionEventRecord[]).filter((row) =>
    Boolean(row.event_id)
  );
  const queriedEventCount = count ?? rows.length;
  const knownUsers = new Set<string>();
  let anonymousEvents = 0;

  for (const row of rows) {
    if (row.user_id) {
      knownUsers.add(row.user_id);
    } else {
      anonymousEvents += 1;
    }
  }

  const topClicks = buildTopClicks(rows);
  const { stages, stops } = buildOnboardingAnalytics(rows);
  const starts = stages[0]?.reachedUsers ?? 0;
  const completions = stages[stages.length - 1]?.completedUsers ?? 0;

  return {
    totals: {
      events: queriedEventCount,
      knownUsers: knownUsers.size,
      anonymousEvents,
      clickEvents: topClicks.reduce((total, click) => total + click.count, 0),
      onboardingStarts: starts,
      onboardingCompletions: completions,
      onboardingCompletionRate: starts > 0 ? completions / starts : 0,
    },
    topClicks,
    onboardingStages: stages,
    onboardingStops: stops,
    meta: {
      days,
      generatedAt: new Date().toISOString(),
      available: true,
      truncated: queriedEventCount > rows.length,
      queriedEventCount,
      sampledEventCount: rows.length,
      error: null,
    },
  };
}

function buildTopClicks(rows: ConversionEventRecord[]): ProductClickMetric[] {
  const aggregates = new Map<string, ClickAggregate>();

  for (const row of rows) {
    if (!isClickEvent(row.event_id)) continue;

    const label = getClickLabel(row);
    const key = `${row.event_id}:${label}`;
    const aggregate =
      aggregates.get(key) ??
      ({
        key,
        eventId: row.event_id,
        label,
        count: 0,
        users: new Set<string>(),
        pathCounts: new Map<string, number>(),
        lastAt: null,
      } satisfies ClickAggregate);

    aggregate.count += 1;
    if (row.user_id) aggregate.users.add(row.user_id);

    const path = normalizePath(row);
    if (path) {
      aggregate.pathCounts.set(path, (aggregate.pathCounts.get(path) ?? 0) + 1);
    }

    const occurredAt = getOccurredAt(row);
    if (!aggregate.lastAt || new Date(occurredAt) > new Date(aggregate.lastAt)) {
      aggregate.lastAt = occurredAt;
    }

    aggregates.set(key, aggregate);
  }

  return Array.from(aggregates.values())
    .sort((a, b) =>
      b.count === a.count ? a.label.localeCompare(b.label) : b.count - a.count
    )
    .slice(0, 12)
    .map((aggregate) => ({
      key: aggregate.key,
      eventId: aggregate.eventId,
      label: aggregate.label,
      count: aggregate.count,
      uniqueUsers: aggregate.users.size,
      topPath: getTopPath(aggregate.pathCounts),
      lastAt: aggregate.lastAt,
    }));
}

function buildOnboardingAnalytics(rows: ConversionEventRecord[]) {
  const users = new Map<string, UserOnboardingState>();
  const stageLastAt = new Map<number, string>();
  const orderedRows = [...rows].sort(
    (a, b) => new Date(getOccurredAt(a)).getTime() - new Date(getOccurredAt(b)).getTime()
  );

  for (const row of orderedRows) {
    if (!row.user_id) continue;

    const reachedIndex = getReachedStageIndex(row);
    const completedIndexes = getCompletedStageIndexes(row);
    const exitStageIndex = getExitStageIndex(row);
    if (
      reachedIndex === null &&
      completedIndexes.length === 0 &&
      exitStageIndex === null
    ) {
      continue;
    }

    const current =
      users.get(row.user_id) ??
      ({
        reachedIndex: -1,
        completedIndexes: new Set<number>(),
        exitStageIndex: null,
        explicitExitEvents: 0,
        lastExitAt: null,
      } satisfies UserOnboardingState);

    const occurredAt = getOccurredAt(row);
    if (reachedIndex !== null) {
      current.reachedIndex = Math.max(current.reachedIndex, reachedIndex);
      updateStageLastAt(stageLastAt, reachedIndex, occurredAt);
    }

    for (const completedIndex of completedIndexes) {
      current.completedIndexes.add(completedIndex);
      current.reachedIndex = Math.max(current.reachedIndex, completedIndex);
      updateStageLastAt(stageLastAt, completedIndex, occurredAt);
    }

    if (exitStageIndex !== null) {
      current.exitStageIndex = exitStageIndex;
      current.explicitExitEvents += 1;
      current.lastExitAt = occurredAt;
      updateStageLastAt(stageLastAt, exitStageIndex, occurredAt);
    }

    users.set(row.user_id, current);
  }

  const states = Array.from(users.values()).filter(
    (state) => state.reachedIndex >= 0
  );
  const reachedCounts = ONBOARDING_STAGES.map((_, index) =>
    states.reduce(
      (total, state) => total + (state.reachedIndex >= index ? 1 : 0),
      0
    )
  );

  const completedCounts = ONBOARDING_STAGES.map((_, index) =>
    states.reduce(
      (total, state) =>
        total + (state.completedIndexes.has(index) ? 1 : 0),
      0
    )
  );

  const stages: ProductOnboardingStage[] = ONBOARDING_STAGES.map(
    (stage, index) => {
      const reachedUsers = reachedCounts[index] ?? 0;
      const completedUsers = completedCounts[index] ?? 0;
      const previousReached = index > 0 ? reachedCounts[index - 1] ?? 0 : 0;
      const nextReached = reachedCounts[index + 1] ?? null;
      const dropOffAfterUsers =
        nextReached === null ? null : Math.max(0, reachedUsers - nextReached);

      return {
        key: stage.key,
        label: stage.label,
        reachedUsers,
        completedUsers,
        completionRate:
          reachedUsers > 0 ? Math.min(completedUsers / reachedUsers, 1) : 0,
        conversionFromPrevious:
          index === 0 || previousReached <= 0
            ? null
            : Math.min(reachedUsers / previousReached, 1),
        dropOffAfterUsers,
        dropOffAfterRate:
          dropOffAfterUsers === null || reachedUsers <= 0
            ? null
            : dropOffAfterUsers / reachedUsers,
        lastAt: stageLastAt.get(index) ?? null,
      };
    }
  );

  const stopAggregates = new Map<
    ProductOnboardingStageKey,
    ProductOnboardingStop
  >();
  const liveIndex = ONBOARDING_STAGES.length - 1;

  for (const state of states) {
    if (state.reachedIndex >= liveIndex) continue;
    const stopIndex = clampStageIndex(state.exitStageIndex ?? state.reachedIndex);
    const stage = ONBOARDING_STAGES[stopIndex];
    const current =
      stopAggregates.get(stage.key) ??
      ({
        key: stage.key,
        label: stage.label,
        stoppedUsers: 0,
        explicitExitEvents: 0,
        lastExitAt: null,
      } satisfies ProductOnboardingStop);

    current.stoppedUsers += 1;
    current.explicitExitEvents += state.explicitExitEvents;
    if (
      state.lastExitAt &&
      (!current.lastExitAt || new Date(state.lastExitAt) > new Date(current.lastExitAt))
    ) {
      current.lastExitAt = state.lastExitAt;
    }
    stopAggregates.set(stage.key, current);
  }

  const stops = Array.from(stopAggregates.values()).sort((a, b) =>
    b.stoppedUsers === a.stoppedUsers
      ? a.label.localeCompare(b.label)
      : b.stoppedUsers - a.stoppedUsers
  );

  return { stages, stops };
}

function getReachedStageIndex(row: ConversionEventRecord) {
  const eventId = row.event_id;
  if (eventId === "onboarding_started") return 0;
  if (eventId === "onboarding_step_viewed") {
    return readStepIndexFromMeta(row.meta);
  }
  if (eventId === "onboarding_step_completed") {
    return readStepIndexFromMeta(row.meta);
  }
  if (eventId === "onboarding_publish_clicked") return 4;
  if (eventId === "onboarding_publish_succeeded") return 5;
  if (eventId === "profile_published") return 5;
  return null;
}

function getCompletedStageIndexes(row: ConversionEventRecord) {
  const eventId = row.event_id;
  if (eventId === "onboarding_started") return [0];
  if (eventId === "onboarding_step_completed") {
    const index = readStepIndexFromMeta(row.meta);
    return index === null ? [] : [index];
  }
  if (eventId === "onboarding_publish_succeeded") return [4, 5];
  if (eventId === "profile_published") return [5];
  return [];
}

function getExitStageIndex(row: ConversionEventRecord) {
  if (row.event_id !== "onboarding_exited") return null;
  const explicitStep = readMetaString(row.meta, "current_step");
  if (explicitStep && explicitStep in STEP_ID_TO_STAGE_INDEX) {
    return STEP_ID_TO_STAGE_INDEX[explicitStep];
  }
  const reached = readMetaNumber(row.meta, "current_step_index");
  if (reached === null) return 0;
  return clampStageIndex(reached + 1);
}

function readStepIndexFromMeta(meta: Record<string, unknown> | null) {
  const stepId = readMetaString(meta, "step_id");
  if (!stepId) return null;
  return STEP_ID_TO_STAGE_INDEX[stepId] ?? null;
}

function updateStageLastAt(
  stageLastAt: Map<number, string>,
  stageIndex: number,
  occurredAt: string
) {
  for (let index = 0; index <= stageIndex; index += 1) {
    const current = stageLastAt.get(index);
    if (!current || new Date(occurredAt) > new Date(current)) {
      stageLastAt.set(index, occurredAt);
    }
  }
}

function isClickEvent(eventId: string) {
  const normalized = eventId.toLowerCase();
  return (
    normalized === "ui_click" ||
    normalized.endsWith("_click") ||
    normalized.endsWith("_clicked") ||
    normalized.includes("cta_click") ||
    normalized.includes("nav_clicked") ||
    normalized === "qr_modal_opened" ||
    normalized === "linket_claim_started"
  );
}

function getClickLabel(row: ConversionEventRecord) {
  if (row.event_id === "dashboard_nav_clicked") {
    const label = readMetaString(row.meta, "label");
    return label ? `Dashboard nav: ${label}` : CLICK_EVENT_LABELS[row.event_id];
  }

  if (row.event_id === "ui_click") {
    const analyticsId = readMetaString(row.meta, "analytics_id");
    if (analyticsId) return humanizeEventId(analyticsId);
    const hrefPath = readMetaString(row.meta, "href_path");
    if (hrefPath) return `Click ${hrefPath}`;
  }

  const knownLabel = CLICK_EVENT_LABELS[row.event_id];
  if (knownLabel) return knownLabel;

  const sourceCta = readMetaString(row.meta, "source_cta");
  if (sourceCta) return `${humanizeEventId(row.event_id)}: ${humanizeEventId(sourceCta)}`;

  return humanizeEventId(row.event_id);
}

function getTopPath(pathCounts: Map<string, number>) {
  let topPath: string | null = null;
  let topCount = 0;
  for (const [path, count] of pathCounts) {
    if (count > topCount) {
      topPath = path;
      topCount = count;
    }
  }
  return topPath;
}

function normalizePath(row: ConversionEventRecord) {
  if (row.path?.trim()) return row.path.trim().slice(0, 160);

  const hrefPath = readMetaString(row.meta, "href");
  if (hrefPath) return hrefPath.slice(0, 160);

  if (!row.href?.trim()) return null;
  try {
    const parsed = new URL(row.href);
    return `${parsed.pathname}${parsed.search}`.slice(0, 160);
  } catch {
    return row.href.trim().slice(0, 160);
  }
}

function getOccurredAt(row: ConversionEventRecord) {
  return row.timestamp || row.created_at;
}

function readMetaString(
  meta: Record<string, unknown> | null,
  key: string
) {
  const value = meta?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readMetaNumber(
  meta: Record<string, unknown> | null,
  key: string
) {
  const value = meta?.[key];
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return value;
}

function humanizeEventId(eventId: string) {
  return eventId
    .split(/[_-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function normalizeDays(value: number | undefined) {
  if (!Number.isFinite(value)) return DEFAULT_DAYS;
  return Math.max(1, Math.min(MAX_DAYS, Math.trunc(value ?? DEFAULT_DAYS)));
}

function clampStageIndex(value: number) {
  return Math.max(0, Math.min(ONBOARDING_STAGES.length - 1, Math.trunc(value)));
}

function isMissingConversionEventsError(message: string) {
  const normalized = message.toLowerCase();
  return (
    normalized.includes('relation "conversion_events" does not exist') ||
    normalized.includes("could not find the table")
  );
}

function buildEmptyProductAnalytics(
  days: number,
  options: { available: boolean; error: string | null }
): ProductAnalytics {
  return {
    totals: {
      events: 0,
      knownUsers: 0,
      anonymousEvents: 0,
      clickEvents: 0,
      onboardingStarts: 0,
      onboardingCompletions: 0,
      onboardingCompletionRate: 0,
    },
    topClicks: [],
    onboardingStages: ONBOARDING_STAGES.map((stage) => ({
      key: stage.key,
      label: stage.label,
      reachedUsers: 0,
      completedUsers: 0,
      completionRate: 0,
      conversionFromPrevious: null,
      dropOffAfterUsers: null,
      dropOffAfterRate: null,
      lastAt: null,
    })),
    onboardingStops: [],
    meta: {
      days,
      generatedAt: new Date().toISOString(),
      available: options.available,
      truncated: false,
      queriedEventCount: 0,
      sampledEventCount: 0,
      error: options.error,
    },
  };
}
