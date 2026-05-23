import "server-only";

import { getPublicPricingSnapshot } from "@/lib/billing/pricing";
import { createServerSupabaseReadonly } from "@/lib/supabase/server";
import { isSupabaseAdminAvailable, supabaseAdmin } from "@/lib/supabase-admin";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

type ComplimentaryTrialClaimRow = {
  starts_at: string;
  ends_at: string;
  accepted_at: string;
  source: string | null;
};

type CoveredPaidPeriodRow = {
  period_end: string | null;
};

export type LinketBundleComplimentaryWindow = {
  eligible: boolean;
  startsAt: string | null;
  endsAt: string | null;
  active: boolean;
  startsInDays: number | null;
  daysRemaining: number | null;
  includedMonths: number;
  source: "linket_claim" | "none" | "unavailable";
};

function isMissingRelationError(message: string) {
  const lowered = message.toLowerCase();
  return (
    lowered.includes("does not exist") ||
    lowered.includes("relation") ||
    lowered.includes("schema cache")
  );
}

function addUtcMonths(isoValue: string, months: number) {
  const date = new Date(isoValue);
  if (Number.isNaN(date.getTime())) return null;
  date.setUTCMonth(date.getUTCMonth() + months);
  return date.toISOString();
}

function toMs(value: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.getTime();
}

async function fetchAcceptedTrialClaims(userId: string) {
  const now = new Date().toISOString();
  const execute = async (
    db: typeof supabaseAdmin | Awaited<ReturnType<typeof createServerSupabaseReadonly>>
  ) => {
    const { data, error } = await db
      .from("linket_complimentary_trial_claims")
      .select("starts_at,ends_at,accepted_at,source")
      .eq("user_id", userId)
      .gt("ends_at", now)
      .order("starts_at", { ascending: true })
      .returns<ComplimentaryTrialClaimRow[]>();

    if (error) {
      if (isMissingRelationError(error.message)) {
        return { rows: [], source: "unavailable" as const };
      }
      throw new Error(error.message);
    }

    return { rows: data ?? [], source: "linket_claim" as const };
  };

  if (isSupabaseAdminAvailable) {
    return execute(supabaseAdmin);
  }

  const supabase = await createServerSupabaseReadonly();
  return execute(supabase);
}

function pickRelevantTrialClaim(
  rows: ComplimentaryTrialClaimRow[],
  nowMs: number
) {
  return (
    rows.find((row) => {
      const startsAtMs = toMs(row.starts_at);
      const endsAtMs = toMs(row.ends_at);
      return (
        startsAtMs !== null &&
        endsAtMs !== null &&
        nowMs >= startsAtMs &&
        nowMs < endsAtMs
      );
    }) ??
    rows.find((row) => {
      const endsAtMs = toMs(row.ends_at);
      return endsAtMs !== null && nowMs < endsAtMs;
    }) ??
    null
  );
}

export async function fetchDeferredComplimentaryStartAt(
  userId: string,
  claimAt: string
) {
  const execute = async (
    db: typeof supabaseAdmin | Awaited<ReturnType<typeof createServerSupabaseReadonly>>
  ) => {
    const { data, error } = await db
      .from("subscription_billing_periods")
      .select("period_end")
      .eq("user_id", userId)
      .eq("provider", "stripe")
      .eq("status", "paid")
      .lte("period_start", claimAt)
      .gt("period_end", claimAt)
      .order("period_end", { ascending: true })
      .limit(1)
      .maybeSingle()
      .returns<CoveredPaidPeriodRow | null>();

    if (error) throw error;
    return data?.period_end ?? null;
  };

  if (isSupabaseAdminAvailable) {
    try {
      return await execute(supabaseAdmin);
    } catch (error) {
      if (
        error &&
        typeof error === "object" &&
        "message" in error &&
        typeof error.message === "string" &&
        isMissingRelationError(error.message)
      ) {
        return null;
      }
      throw error;
    }
  }

  const supabase = await createServerSupabaseReadonly();
  try {
    return await execute(supabase);
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "message" in error &&
      typeof error.message === "string" &&
      isMissingRelationError(error.message)
    ) {
      return null;
    }
    throw error;
  }
}

export async function getLinketBundleComplimentaryWindowForUser(
  userId: string
): Promise<LinketBundleComplimentaryWindow> {
  const includesProMonths =
    getPublicPricingSnapshot().individual.webPlusLinketBundle.includesProMonths;
  const defaultResponse: LinketBundleComplimentaryWindow = {
    eligible: false,
    startsAt: null,
    endsAt: null,
    active: false,
    startsInDays: null,
    daysRemaining: null,
    includedMonths: includesProMonths,
    source: "none",
  };

  const nowMs = Date.now();
  const trialClaims = await fetchAcceptedTrialClaims(userId);
  const claim = pickRelevantTrialClaim(trialClaims.rows, nowMs);
  if (!claim) {
    return {
      ...defaultResponse,
      source: trialClaims.source === "unavailable" ? "unavailable" : "none",
    };
  }

  const startsAt = claim.starts_at;
  const endsAt = claim.ends_at || addUtcMonths(startsAt, includesProMonths);
  if (!endsAt || toMs(startsAt) === null || toMs(endsAt) === null) {
    return {
      ...defaultResponse,
      source: "linket_claim",
    };
  }

  const startsAtMs = toMs(startsAt);
  const endsAtMs = toMs(endsAt);
  const active =
    startsAtMs !== null &&
    endsAtMs !== null &&
    nowMs >= startsAtMs &&
    nowMs < endsAtMs;
  const startsInDays =
    startsAtMs !== null && nowMs < startsAtMs
      ? Math.max(1, Math.ceil((startsAtMs - nowMs) / MS_PER_DAY))
      : null;
  const daysRemaining =
    active && endsAtMs !== null
      ? Math.max(1, Math.ceil((endsAtMs - nowMs) / MS_PER_DAY))
      : 0;

  return {
    eligible: true,
    startsAt,
    endsAt,
    active,
    startsInDays,
    daysRemaining,
    includedMonths: includesProMonths,
    source: "linket_claim",
  };
}
