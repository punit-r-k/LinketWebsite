import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { requireRouteAccess } from "@/lib/api-authorization";
import { claimLinketComplimentaryTrial } from "@/lib/linket-complimentary-trials";
import { validateJsonBody } from "@/lib/request-validation";
import { rejectUntrustedWrite } from "@/lib/request-security";
import { isSupabaseAdminAvailable } from "@/lib/supabase-admin";

const complimentaryTrialSchema = z.object({
  tagId: z.string().uuid(),
  assignmentId: z.string().uuid().nullable().optional(),
});

export async function POST(req: NextRequest) {
  const untrusted = rejectUntrustedWrite(req);
  if (untrusted) return untrusted;

  if (!isSupabaseAdminAvailable) {
    return NextResponse.json(
      { error: "Linkets service is not configured." },
      { status: 500 }
    );
  }

  const access = await requireRouteAccess("POST /api/linkets/complimentary-trial");
  if (access instanceof NextResponse) {
    return access;
  }

  const parsedBody = await validateJsonBody(req, complimentaryTrialSchema);
  if (!parsedBody.ok) {
    return parsedBody.response;
  }

  try {
    const result = await claimLinketComplimentaryTrial({
      tagId: parsedBody.data.tagId,
      assignmentId: parsedBody.data.assignmentId ?? null,
      user: access.user,
      source: "linket_claim",
      pauseSource: "linket_claim_api",
    });

    if (result.status === "already_claimed") {
      return NextResponse.json(
        {
          error: "This Linket's complimentary trial has already been claimed.",
        },
        { status: 409 }
      );
    }

    return NextResponse.json({
      ok: true,
      status: result.status,
      trial: {
        acceptedAt: result.claim.accepted_at,
        startsAt: result.claim.starts_at,
        endsAt: result.claim.ends_at,
      },
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Unable to claim complimentary trial.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
