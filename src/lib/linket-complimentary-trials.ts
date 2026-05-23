import "server-only";

import type { ComplimentaryPauseSource } from "@/lib/billing/complimentary-subscription";
import {
  fetchDeferredComplimentaryStartAt,
} from "@/lib/billing/linket-bundle";
import { getPublicPricingSnapshot } from "@/lib/billing/pricing";
import {
  applyComplimentaryBillingProtection,
  type LinketEntitlementUser,
} from "@/lib/linket-entitlements";
import { isSupabaseAdminAvailable, supabaseAdmin } from "@/lib/supabase-admin";

type TrialSource = "linket_claim" | "linket_transfer" | "admin_grant";

type AssignmentOwnershipRow = {
  id: string;
  tag_id: string;
  user_id: string;
};

type TrialClaimRow = {
  tag_id: string;
  user_id: string;
  assignment_id: string | null;
  accepted_at: string;
  starts_at: string;
  ends_at: string;
  source: string | null;
};

function addUtcMonths(isoValue: string, months: number) {
  const date = new Date(isoValue);
  if (Number.isNaN(date.getTime())) return null;
  date.setUTCMonth(date.getUTCMonth() + months);
  return date.toISOString();
}

function isDuplicateTrialClaimError(error: unknown) {
  if (!error || typeof error !== "object") return false;
  return (
    "code" in error &&
    (error as { code?: unknown }).code === "23505"
  );
}

async function fetchExistingClaim(tagId: string) {
  const { data, error } = await supabaseAdmin
    .from("linket_complimentary_trial_claims")
    .select("tag_id,user_id,assignment_id,accepted_at,starts_at,ends_at,source")
    .eq("tag_id", tagId)
    .limit(1)
    .maybeSingle<TrialClaimRow | null>();

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

async function fetchOwnedAssignment(args: {
  tagId: string;
  userId: string;
  assignmentId?: string | null;
}) {
  let query = supabaseAdmin
    .from("tag_assignments")
    .select("id,tag_id,user_id")
    .eq("tag_id", args.tagId)
    .eq("user_id", args.userId)
    .limit(1);

  if (args.assignmentId) {
    query = query.eq("id", args.assignmentId);
  }

  const { data, error } = await query.maybeSingle<AssignmentOwnershipRow | null>();

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

export async function claimLinketComplimentaryTrial(args: {
  tagId: string;
  assignmentId?: string | null;
  user: LinketEntitlementUser;
  source: TrialSource;
  pauseSource: ComplimentaryPauseSource;
}) {
  if (!isSupabaseAdminAvailable) {
    throw new Error("Linkets service is not configured.");
  }

  const assignment = await fetchOwnedAssignment({
    tagId: args.tagId,
    userId: args.user.id,
    assignmentId: args.assignmentId,
  });

  if (!assignment) {
    throw new Error("Linket not found or not owned by the current user.");
  }

  const existingClaim = await fetchExistingClaim(args.tagId);
  if (existingClaim) {
    return {
      status:
        existingClaim.user_id === args.user.id
          ? "already_claimed_by_current_user"
          : "already_claimed",
      claim: existingClaim,
    } as const;
  }

  const includedMonths =
    getPublicPricingSnapshot().individual.webPlusLinketBundle.includesProMonths;
  const acceptedAt = new Date().toISOString();
  const deferredStartAt = await fetchDeferredComplimentaryStartAt(
    args.user.id,
    acceptedAt
  );
  const startsAt = deferredStartAt ?? acceptedAt;
  const endsAt = addUtcMonths(startsAt, includedMonths);

  if (!endsAt) {
    throw new Error("Unable to create complimentary trial window.");
  }

  const payload = {
    tag_id: args.tagId,
    user_id: args.user.id,
    assignment_id: assignment.id,
    accepted_at: acceptedAt,
    starts_at: startsAt,
    ends_at: endsAt,
    source: args.source,
  };

  const { data, error } = await supabaseAdmin
    .from("linket_complimentary_trial_claims")
    .insert(payload)
    .select("tag_id,user_id,assignment_id,accepted_at,starts_at,ends_at,source")
    .single<TrialClaimRow>();

  if (error) {
    if (isDuplicateTrialClaimError(error)) {
      const duplicateClaim = await fetchExistingClaim(args.tagId);
      if (duplicateClaim) {
        return {
          status:
            duplicateClaim.user_id === args.user.id
              ? "already_claimed_by_current_user"
              : "already_claimed",
          claim: duplicateClaim,
        } as const;
      }
    }
    throw new Error(error.message);
  }

  try {
    await applyComplimentaryBillingProtection({
      user: args.user,
      source: args.pauseSource,
    });
  } catch (error) {
    console.error(
      "Complimentary trial claimed but billing protection failed:",
      error
    );
  }

  return {
    status: "claimed",
    claim: data,
  } as const;
}
