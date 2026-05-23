import "server-only";

import { getOrCreateStripeCustomerForUser } from "@/lib/billing/dashboard";
import {
  ensureNoChargeDuringComplimentary,
  pickManageableSubscriptionId,
  type ComplimentaryPauseSource,
} from "@/lib/billing/complimentary-subscription";
import { getLinketBundleComplimentaryWindowForUser } from "@/lib/billing/linket-bundle";
import { getStripeSecretKey, getStripeServerClient } from "@/lib/stripe";
import { isSupabaseAdminAvailable, supabaseAdmin } from "@/lib/supabase-admin";

const CLAIM_EVENT_OPERATION_KEY_INDEX =
  "idx_tag_events_claim_operation_key_unique";

export type LinketEntitlementSource =
  | "linket_claim"
  | "linket_transfer"
  | "admin_grant";

export type LinketEntitlementUser = {
  id: string;
  email?: string | null;
  user_metadata?: Record<string, unknown> | null;
};

type TagAssignmentLookupRow = {
  id: string;
  profile_id: string | null;
  nickname: string | null;
};

type PostgrestLikeError = {
  code?: string | null;
  details?: string | null;
  hint?: string | null;
  message?: string | null;
};

function readUserMetadataText(
  metadata: Record<string, unknown> | null | undefined,
  key: string
) {
  const value = metadata?.[key];
  return typeof value === "string" ? value : null;
}

function isDuplicateClaimOperationError(error: unknown) {
  if (!error || typeof error !== "object") {
    return false;
  }

  const candidate = error as PostgrestLikeError;
  if (candidate.code !== "23505") {
    return false;
  }

  const message = [candidate.message, candidate.details, candidate.hint]
    .filter((value): value is string => typeof value === "string")
    .join(" ");

  return message.includes(CLAIM_EVENT_OPERATION_KEY_INDEX);
}

export async function applyComplimentaryBillingProtection(args: {
  user: LinketEntitlementUser;
  source: ComplimentaryPauseSource;
}) {
  if (!getStripeSecretKey()) {
    return false;
  }

  const complimentaryWindow = await getLinketBundleComplimentaryWindowForUser(
    args.user.id
  );
  if (!complimentaryWindow.eligible) {
    return false;
  }

  const customerId = await getOrCreateStripeCustomerForUser({
    userId: args.user.id,
    email: args.user.email ?? null,
    fullName:
      readUserMetadataText(args.user.user_metadata, "full_name") ??
      readUserMetadataText(args.user.user_metadata, "name"),
    firstName: readUserMetadataText(args.user.user_metadata, "first_name"),
    lastName: readUserMetadataText(args.user.user_metadata, "last_name"),
  });

  if (!customerId) {
    return false;
  }

  const stripe = getStripeServerClient();
  const subscriptions = await stripe.subscriptions.list({
    customer: customerId,
    status: "all",
    limit: 20,
  });
  const subscriptionId = pickManageableSubscriptionId(subscriptions.data);

  if (!subscriptionId) {
    return false;
  }

  return ensureNoChargeDuringComplimentary({
    stripe,
    subscriptionId,
    complimentaryStartsAt: complimentaryWindow.startsAt,
    complimentaryEndsAt: complimentaryWindow.endsAt,
    source: args.source,
  });
}

export async function grantLinketEntitlementToUser(args: {
  tagId: string;
  user: LinketEntitlementUser;
  source: LinketEntitlementSource;
  pauseSource: ComplimentaryPauseSource;
  idempotencyKey?: string | null;
  profileId?: string | null;
  nickname?: string | null;
  extraMetadata?: Record<string, unknown>;
}) {
  if (!isSupabaseAdminAvailable) {
    throw new Error("Linkets service is not configured.");
  }

  const claimedAt = new Date().toISOString();

  const { data: currentAssignment, error: assignmentLookupError } =
    await supabaseAdmin
      .from("tag_assignments")
      .select("id,profile_id,nickname")
      .eq("tag_id", args.tagId)
      .limit(1)
      .maybeSingle<TagAssignmentLookupRow | null>();

  if (assignmentLookupError) {
    throw new Error(assignmentLookupError.message);
  }

  let assignmentId: string | null = currentAssignment?.id ?? null;

  if (currentAssignment?.id) {
    const { error: assignmentUpdateError } = await supabaseAdmin
      .from("tag_assignments")
      .update({
        user_id: args.user.id,
        profile_id:
          args.profileId !== undefined
            ? args.profileId
            : currentAssignment.profile_id ?? null,
        nickname:
          args.nickname !== undefined
            ? args.nickname
            : currentAssignment.nickname ?? null,
      })
      .eq("id", currentAssignment.id);

    if (assignmentUpdateError) {
      throw new Error(assignmentUpdateError.message);
    }
  } else {
    const { data: createdAssignment, error: assignmentInsertError } =
      await supabaseAdmin
        .from("tag_assignments")
        .insert({
          tag_id: args.tagId,
          user_id: args.user.id,
          profile_id: args.profileId ?? null,
          nickname: args.nickname ?? null,
        })
        .select("id")
        .single<{ id: string }>();

    if (assignmentInsertError) {
      throw new Error(assignmentInsertError.message);
    }

    assignmentId = createdAssignment?.id ?? null;
  }

  const { error: tagUpdateError } = await supabaseAdmin
    .from("hardware_tags")
    .update({
      status: "claimed",
      last_claimed_at: claimedAt,
    })
    .eq("id", args.tagId);

  if (tagUpdateError) {
    throw new Error(tagUpdateError.message);
  }

  const claimEventMetadata: Record<string, unknown> = {
    user_id: args.user.id,
    claimer_user_id: args.user.id,
    entitlement_user_id: args.user.id,
    entitlement_source: args.source,
    giftable: true,
    ...(args.extraMetadata ?? {}),
  };
  if (args.idempotencyKey) {
    claimEventMetadata.entitlement_operation_key = args.idempotencyKey;
  }

  const { error: tagEventError } = await supabaseAdmin.from("tag_events").insert({
    tag_id: args.tagId,
    event_type: "claim",
    metadata: claimEventMetadata,
  });

  if (
    tagEventError &&
    !(args.idempotencyKey && isDuplicateClaimOperationError(tagEventError))
  ) {
    throw new Error(tagEventError.message);
  }

  return {
    assignmentId,
    claimedAt,
  };
}
