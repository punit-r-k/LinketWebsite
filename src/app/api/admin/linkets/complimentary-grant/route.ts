import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { findAuthUserByEmail } from "@/lib/auth-admin-users";
import { requireRouteAccess } from "@/lib/api-authorization";
import { claimLinketComplimentaryTrial } from "@/lib/linket-complimentary-trials";
import { grantLinketEntitlementToUser } from "@/lib/linket-entitlements";
import { findLinketByLookup } from "@/lib/linket-tag-lookup";
import { cancelPendingTransfersForTag } from "@/lib/linket-transfers";
import { getActiveProfileForUser } from "@/lib/profile-service";
import { rejectUntrustedWrite } from "@/lib/request-security";
import { validateJsonBody } from "@/lib/request-validation";
import { isSupabaseAdminAvailable } from "@/lib/supabase-admin";

const repairGrantSchema = z.object({
  recipientEmail: z.string().trim().email("Enter a valid recipient email."),
  linketLookup: z.string().trim().min(1, "Enter a Linket ID or claim code."),
});

export async function POST(req: NextRequest) {
  if (!isSupabaseAdminAvailable) {
    return NextResponse.json(
      { error: "Linkets service is not configured." },
      { status: 500 }
    );
  }

  const untrusted = rejectUntrustedWrite(req);
  if (untrusted) return untrusted;

  const access = await requireRouteAccess(
    "POST /api/admin/linkets/complimentary-grant"
  );
  if (access instanceof NextResponse) {
    return access;
  }

  const parsedBody = await validateJsonBody(req, repairGrantSchema);
  if (!parsedBody.ok) {
    return parsedBody.response;
  }

  try {
    const recipient = await findAuthUserByEmail(parsedBody.data.recipientEmail);
    if (!recipient) {
      return NextResponse.json(
        { error: "Recipient account not found for that email." },
        { status: 404 }
      );
    }

    const tag = await findLinketByLookup(parsedBody.data.linketLookup);
    if (!tag) {
      return NextResponse.json(
        { error: "Linket not found for that identifier." },
        { status: 404 }
      );
    }

    await cancelPendingTransfersForTag(tag.id, access.user.id, {
      canceled_reason: "admin_reassignment",
    });

    const activeProfile = await getActiveProfileForUser(recipient.id);
    const result = await grantLinketEntitlementToUser({
      tagId: tag.id,
      user: recipient,
      source: "admin_grant",
      pauseSource: "admin_grant",
      profileId: activeProfile?.id ?? null,
      extraMetadata: {
        granted_by_user_id: access.user.id,
        granted_by_email: access.user.email ?? null,
        recipient_email: recipient.email ?? parsedBody.data.recipientEmail,
        repair_mode: true,
      },
    });
    const trialResult = await claimLinketComplimentaryTrial({
      tagId: tag.id,
      assignmentId: result.assignmentId,
      user: recipient,
      source: "admin_grant",
      pauseSource: "admin_grant",
    });

    return NextResponse.json({
      ok: true,
      recipient: {
        id: recipient.id,
        email: recipient.email ?? parsedBody.data.recipientEmail,
      },
      tag: {
        id: tag.id,
        chipUid: tag.chip_uid,
        claimCode: tag.claim_code,
      },
      assignmentId: result.assignmentId,
      trial: {
        status: trialResult.status,
        startsAt: trialResult.claim.starts_at,
        endsAt: trialResult.claim.ends_at,
      },
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Unable to repair complimentary access.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
