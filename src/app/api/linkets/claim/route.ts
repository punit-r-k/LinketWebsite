import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { z } from "zod";

import { requireRouteAccess } from "@/lib/api-authorization";
import { normalizeClaimCodeInput } from "@/lib/linket-claim-code";
import { grantLinketEntitlementToUser } from "@/lib/linket-entitlements";
import { assertOwnedProfileId } from "@/lib/linket-tags";
import { validateJsonBody } from "@/lib/request-validation";
import { rejectUntrustedWrite } from "@/lib/request-security";
import { getActiveProfileForUser } from "@/lib/profile-service";
import { isSupabaseAdminAvailable, supabaseAdmin } from "@/lib/supabase-admin";

type ClaimPayload = {
  chipUid?: string;
  claimCode?: string;
  profileId?: string | null;
  nickname?: string | null;
};

const claimPayloadSchema = z
  .object({
    chipUid: z.string().trim().max(128).optional(),
    claimCode: z.string().trim().max(128).optional(),
    nickname: z.string().trim().max(120).nullable().optional(),
    profileId: z.string().uuid().nullable().optional(),
  })
  .refine((value) => Boolean(value.chipUid || value.claimCode), {
    message: "Claim code is required.",
    path: ["claimCode"],
  });

const CLAIMABLE_STATUSES = new Set(["unclaimed", "claimable"]);

function buildClaimLookupCandidates(value: string) {
  const upper = normalizeClaimCodeInput(value);
  const lower = upper.toLowerCase();
  return {
    upper,
    lower,
  };
}

async function findClaimTag(candidates: { lower: string; upper: string }) {
  const lookupValues = Array.from(
    new Set([candidates.upper, candidates.lower].filter(Boolean))
  );
  const { data, error } = await supabaseAdmin
    .from("hardware_tags")
    .select("id,status")
    .in("claim_code", lookupValues)
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

async function findTokenTag(candidates: { lower: string; upper: string }) {
  const lookupValues = Array.from(
    new Set([candidates.upper, candidates.lower].filter(Boolean))
  );
  const chipUidLookup = await supabaseAdmin
    .from("hardware_tags")
    .select("id,status")
    .in("chip_uid", lookupValues)
    .limit(1)
    .maybeSingle();
  if (chipUidLookup.error) {
    throw new Error(chipUidLookup.error.message);
  }
  if (chipUidLookup.data) {
    return chipUidLookup.data;
  }

  const publicTokenLookup = await supabaseAdmin
    .from("hardware_tags")
    .select("id,status")
    .in("public_token", lookupValues)
    .limit(1)
    .maybeSingle();
  if (publicTokenLookup.error) {
    throw new Error(publicTokenLookup.error.message);
  }
  return publicTokenLookup.data;
}

export async function POST(req: NextRequest) {
  const untrusted = rejectUntrustedWrite(req);
  if (untrusted) return untrusted;

  if (!isSupabaseAdminAvailable) {
    return NextResponse.json(
      { error: "Linkets service is not configured." },
      { status: 500 }
    );
  }

  const access = await requireRouteAccess("POST /api/linkets/claim");
  if (access instanceof NextResponse) {
    return access;
  }

  const parsedBody = await validateJsonBody(req, claimPayloadSchema);
  if (!parsedBody.ok) {
    return parsedBody.response;
  }

  const payload = parsedBody.data as ClaimPayload;
  const rawCode = payload.chipUid ?? payload.claimCode ?? "";
  const candidates = buildClaimLookupCandidates(rawCode || "");

  let profileId = payload.profileId ?? null;
  if (!profileId) {
    try {
      const activeProfile = await getActiveProfileForUser(access.user.id);
      profileId = activeProfile?.id ?? null;
    } catch {
      profileId = null;
    }
  }
  try {
    profileId = await assertOwnedProfileId(access.user.id, profileId);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Forbidden" },
      { status: 403 }
    );
  }

  let tagId: string | null = null;

  try {
    const claimTag = await findClaimTag(candidates);
    if (claimTag) {
      if (!CLAIMABLE_STATUSES.has(claimTag.status)) {
        return NextResponse.json(
          { error: "Tag is already claimed or unavailable." },
          { status: 409 }
        );
      }
      tagId = claimTag.id;
    } else {
      const tokenTag = await findTokenTag(candidates);
      if (!tokenTag) {
        return NextResponse.json(
          { error: "Claim code not found." },
          { status: 404 }
        );
      }
      if (!CLAIMABLE_STATUSES.has(tokenTag.status)) {
        return NextResponse.json(
          { error: "Tag is already claimed or unavailable." },
          { status: 409 }
        );
      }
      tagId = tokenTag.id;
    }
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to claim Linket." },
      { status: 500 }
    );
  }

  if (!tagId) {
    return NextResponse.json({ error: "Claim code not found." }, { status: 404 });
  }

  try {
    const result = await grantLinketEntitlementToUser({
      tagId,
      user: access.user,
      source: "linket_claim",
      pauseSource: "linket_claim_api",
      profileId,
      nickname: payload.nickname ?? null,
    });

    return NextResponse.json({ ok: true, assignmentId: result.assignmentId });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to claim Linket.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
