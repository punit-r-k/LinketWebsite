import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { requireRouteAccess } from "@/lib/api-authorization";
import { updateAssignmentForUser } from "@/lib/linket-tags";
import { validateJsonBody, uuidParamSchema } from "@/lib/request-validation";
import { rejectUntrustedWrite } from "@/lib/request-security";
import { isSupabaseAdminAvailable } from "@/lib/supabase-admin";

type PatchPayload = {
  profileId?: string | null;
  nickname?: string | null;
  action?: "release" | "retire";
};

const patchPayloadSchema = z.object({
  action: z.enum(["release", "retire"]).optional(),
  nickname: z.string().trim().max(120).nullable().optional(),
  profileId: z.string().uuid().nullable().optional(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const untrusted = rejectUntrustedWrite(req);
  if (untrusted) return untrusted;

  if (!isSupabaseAdminAvailable) {
    return NextResponse.json(
      { error: "Linkets service is not configured." },
      { status: 500 }
    );
  }

  const access = await requireRouteAccess("PATCH /api/linkets/[id]");
  if (access instanceof NextResponse) {
    return access;
  }

  const { id: assignmentId } = await params;
  const parsedAssignmentId = uuidParamSchema.safeParse(assignmentId?.trim());
  if (!parsedAssignmentId.success) {
    return NextResponse.json({ error: "Missing assignment id." }, { status: 400 });
  }

  const parsedBody = await validateJsonBody(req, patchPayloadSchema);
  if (!parsedBody.ok) {
    return parsedBody.response;
  }
  const payload = parsedBody.data as PatchPayload;

  const hasProfileId = Object.prototype.hasOwnProperty.call(payload, "profileId");
  const hasNickname = Object.prototype.hasOwnProperty.call(payload, "nickname");

  try {
    const updated = await updateAssignmentForUser({
      assignmentId: parsedAssignmentId.data,
      userId: access.user.id,
      action: payload.action,
      profileId: hasProfileId ? payload.profileId ?? null : undefined,
      nickname: hasNickname ? payload.nickname ?? null : undefined,
    });
    return NextResponse.json({ assignment: updated });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to update Linket";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
