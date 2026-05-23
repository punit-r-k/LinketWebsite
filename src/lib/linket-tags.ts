import { supabaseAdmin } from "@/lib/supabase-admin";
import { cancelPendingTransfersForTag } from "@/lib/linket-transfers";
import type {
  HardwareTagRecord,
  TagAssignmentRecord,
  TagEventRecord,
  UserProfileRecord,
} from "@/types/db";

export type TagAssignmentDetail = {
  assignment: TagAssignmentRecord;
  tag: HardwareTagRecord;
  profile: Pick<UserProfileRecord, "id" | "name" | "handle" | "is_active"> | null;
  complimentaryTrial?: LinketComplimentaryTrialState;
};

export type LinketComplimentaryTrialState = {
  claimable: boolean;
  claimed: boolean;
  claimedByCurrentUser: boolean;
  acceptedAt: string | null;
  startsAt: string | null;
  endsAt: string | null;
};

type LinketComplimentaryTrialClaimRow = {
  tag_id: string;
  user_id: string;
  accepted_at: string;
  starts_at: string;
  ends_at: string;
};

function mapAssignmentRow(
  row: Record<string, unknown>,
  complimentaryTrial?: LinketComplimentaryTrialState
): TagAssignmentDetail {
  const assignment = {
    id: row.id as string,
    tag_id: row.tag_id as string,
    user_id: row.user_id as string,
    profile_id: (row.profile_id as string | null) ?? null,
    nickname: (row.nickname as string | null) ?? null,
    last_redirected_at: (row.last_redirected_at as string | null) ?? null,
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
  } satisfies TagAssignmentRecord;

  const tagRecord = row.hardware_tags ?? row.tag ?? row.tags;
  if (!tagRecord || typeof tagRecord !== "object" || tagRecord === null) {
    throw new Error("Malformed assignment row: missing hardware tag relation");
  }
  const tagObj = tagRecord as Record<string, unknown>;
  const tag: HardwareTagRecord = {
    id: tagObj.id as string,
    chip_uid: tagObj.chip_uid as string,
    claim_code: (tagObj.claim_code as string | null) ?? null,
    status: tagObj.status as "unclaimed" | "claimed" | "retired",
    last_claimed_at: (tagObj.last_claimed_at as string | null) ?? null,
    created_at: tagObj.created_at as string,
    updated_at: tagObj.updated_at as string,
  };

  const profileRecord = row.profile ?? row.user_profiles ?? null;
    let profile: Pick<UserProfileRecord, "id" | "name" | "handle" | "is_active"> | null = null;
    if (profileRecord && typeof profileRecord === "object" && profileRecord !== null) {
      const p = profileRecord as Record<string, unknown>;
      profile = {
        id: p.id as string,
        name: p.name as string,
        handle: p.handle as string,
        is_active: Boolean(p.is_active),
      };
    }

  return { assignment, tag, profile, complimentaryTrial };
}

function isMissingRelationError(message: string) {
  const lowered = message.toLowerCase();
  return (
    lowered.includes("does not exist") ||
    lowered.includes("relation") ||
    lowered.includes("schema cache")
  );
}

async function fetchComplimentaryTrialClaimsByTagIds(tagIds: string[]) {
  if (tagIds.length === 0) return new Map<string, LinketComplimentaryTrialClaimRow>();

  const { data, error } = await supabaseAdmin
    .from("linket_complimentary_trial_claims")
    .select("tag_id,user_id,accepted_at,starts_at,ends_at")
    .in("tag_id", tagIds)
    .returns<LinketComplimentaryTrialClaimRow[]>();

  if (error) {
    if (isMissingRelationError(error.message)) {
      return new Map<string, LinketComplimentaryTrialClaimRow>();
    }
    throw new Error(error.message);
  }

  return new Map((data ?? []).map((row) => [row.tag_id, row]));
}

function buildComplimentaryTrialState(
  userId: string,
  tagId: string,
  claimRowsByTagId: Map<string, LinketComplimentaryTrialClaimRow>
): LinketComplimentaryTrialState {
  const claim = claimRowsByTagId.get(tagId);
  if (!claim) {
    return {
      claimable: true,
      claimed: false,
      claimedByCurrentUser: false,
      acceptedAt: null,
      startsAt: null,
      endsAt: null,
    };
  }

  const claimedByCurrentUser = claim.user_id === userId;
  return {
    claimable: false,
    claimed: true,
    claimedByCurrentUser,
    acceptedAt: claim.accepted_at,
    startsAt: claim.starts_at,
    endsAt: claim.ends_at,
  };
}

async function fetchAssignmentById(assignmentId: string): Promise<TagAssignmentDetail | null> {
  const { data, error } = await supabaseAdmin
    .from("tag_assignments")
    .select(
      `*,
      hardware_tags:hardware_tags(
        id, chip_uid, claim_code, status, last_claimed_at, created_at, updated_at
      ),
      profile:user_profiles(id, name, handle, is_active)
    `
    )
    .eq("id", assignmentId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  return mapAssignmentRow(data);
}

export async function getAssignmentsForUser(userId: string): Promise<TagAssignmentDetail[]> {
  const { data, error } = await supabaseAdmin
    .from("tag_assignments")
    .select(
      `*,
      hardware_tags:hardware_tags(
        id, chip_uid, claim_code, status, last_claimed_at, created_at, updated_at
      ),
      profile:user_profiles(id, name, handle, is_active)
    `
    )
    .eq("user_id", userId)
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as Array<Record<string, unknown>>;
  const tagIds = rows
    .map((row) => (typeof row.tag_id === "string" ? row.tag_id : null))
    .filter((value): value is string => Boolean(value));
  const trialClaimsByTagId = await fetchComplimentaryTrialClaimsByTagIds(tagIds);

  return rows.map((row) =>
    mapAssignmentRow(
      row,
      typeof row.tag_id === "string"
        ? buildComplimentaryTrialState(userId, row.tag_id, trialClaimsByTagId)
        : undefined
    )
  );
}

export async function assertOwnedProfileId(
  userId: string,
  profileId: string | null | undefined
) {
  if (!profileId) return null;

  const { data, error } = await supabaseAdmin
    .from("user_profiles")
    .select("id")
    .eq("id", profileId)
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data?.id) {
    throw new Error("Profile is not owned by the current user");
  }
  return data.id as string;
}

export async function updateAssignmentForUser(options: {
  assignmentId: string;
  userId: string;
  profileId?: string | null;
  nickname?: string | null;
  action?: "release" | "retire";
}): Promise<TagAssignmentDetail | null> {
  const current = await fetchAssignmentById(options.assignmentId);
  if (!current) throw new Error("Assignment not found");
  if (current.assignment.user_id !== options.userId) {
    throw new Error("Not authorized to modify this Linket");
  }

  if (options.action === "release") {
    await cancelPendingTransfersForTag(current.assignment.tag_id, options.userId, {
      canceled_reason: "linket_released",
      released_assignment_id: current.assignment.id,
    });

    const { error: deleteError } = await supabaseAdmin
      .from("tag_assignments")
      .delete()
      .eq("id", options.assignmentId);
    if (deleteError) throw new Error(deleteError.message);

    const { error: tagUpdateError } = await supabaseAdmin
      .from("hardware_tags")
      .update({ status: "unclaimed" })
      .eq("id", current.assignment.tag_id);
    if (tagUpdateError) throw new Error(tagUpdateError.message);

    await supabaseAdmin.from("tag_events").insert({
      tag_id: current.assignment.tag_id,
      event_type: "release",
      metadata: { user_id: options.userId },
    } satisfies Partial<TagEventRecord>);

    return null;
  }

  const payload: Record<string, unknown> = {};
  if (options.nickname !== undefined) {
    payload.nickname = options.nickname;
  }
  if (options.profileId !== undefined) {
    payload.profile_id = await assertOwnedProfileId(options.userId, options.profileId);
  }

  if (Object.keys(payload).length > 0) {
    const { error: updateError } = await supabaseAdmin
      .from("tag_assignments")
      .update(payload)
      .eq("id", options.assignmentId);
    if (updateError) throw new Error(updateError.message);
  }

  return fetchAssignmentById(options.assignmentId);
}
