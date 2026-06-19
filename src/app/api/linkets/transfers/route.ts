import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { requireRouteAccess } from "@/lib/api-authorization";
import { createLinketTransferRequest } from "@/lib/linket-transfers";
import { validateJsonBody } from "@/lib/request-validation";
import { rejectUntrustedWrite } from "@/lib/request-security";
import { getConfiguredSiteOrigin } from "@/lib/site-url";
import { isSupabaseAdminAvailable } from "@/lib/supabase-admin";

const createTransferSchema = z.object({
  assignmentId: z.string().uuid(),
  recipientEmail: z.string().trim().email("Enter a valid recipient email."),
});

function buildTransferLinks(token: string) {
  const origin = getConfiguredSiteOrigin().replace(/\/$/, "");
  const transferPath = `/dashboard/linkets?transfer=${encodeURIComponent(token)}`;
  return {
    directUrl: `${origin}${transferPath}`,
    inviteUrl: `${origin}/auth?view=signin&next=${encodeURIComponent(
      transferPath
    )}`,
  };
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

  const access = await requireRouteAccess("POST /api/linkets/transfers");
  if (access instanceof NextResponse) {
    return access;
  }

  const parsedBody = await validateJsonBody(req, createTransferSchema);
  if (!parsedBody.ok) {
    return parsedBody.response;
  }

  try {
    const { transfer, assignment } = await createLinketTransferRequest({
      assignmentId: parsedBody.data.assignmentId,
      senderUser: access.user,
      recipientEmail: parsedBody.data.recipientEmail,
    });
    const links = buildTransferLinks(transfer.transfer_token);

    return NextResponse.json({
      transfer: {
        id: transfer.id,
        token: transfer.transfer_token,
        recipientEmail: transfer.recipient_email,
        expiresAt: transfer.expires_at,
        nickname: assignment.nickname,
        chipUid: assignment.hardware_tags?.chip_uid ?? null,
        claimCode: assignment.hardware_tags?.claim_code ?? null,
        ...links,
      },
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Unable to create Linket transfer invite.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
