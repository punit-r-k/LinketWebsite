import { NextRequest, NextResponse } from "next/server";
import { isSupabaseAdminAvailable, supabaseAdmin } from "@/lib/supabase-admin";
import {
  rejectLargeRequestBody,
  rejectUntrustedWrite,
} from "@/lib/request-security";

const MAX_LINK_CLICK_BODY_BYTES = 8 * 1024;

export async function POST(request: NextRequest) {
  try {
    const untrusted = rejectUntrustedWrite(request);
    if (untrusted) return untrusted;

    const tooLarge = rejectLargeRequestBody(
      request,
      MAX_LINK_CLICK_BODY_BYTES,
      "Link click payload"
    );
    if (tooLarge) return tooLarge;

    const body = (await request.json().catch(() => ({}))) as {
      linkId?: string;
    };
    if (!body.linkId) {
      return NextResponse.json(
        { error: "linkId is required" },
        { status: 400 }
      );
    }

    if (!isSupabaseAdminAvailable) {
      return NextResponse.json({ ok: true }, { status: 200 });
    }

    const { error } = await supabaseAdmin.rpc(
      "increment_profile_link_click",
      { p_link_id: body.linkId }
    );
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const { data: linkRow, error: linkLookupError } = await supabaseAdmin
      .from("profile_links")
      .select("id, user_id, profile_id")
      .eq("id", body.linkId)
      .maybeSingle();
    if (!linkLookupError && linkRow) {
      const { error: eventError } = await supabaseAdmin
        .from("profile_link_click_events")
        .insert({
          link_id: linkRow.id,
          user_id: linkRow.user_id,
          profile_id: linkRow.profile_id,
          occurred_at: new Date().toISOString(),
        });
      if (
        eventError &&
        !/does not exist|relation .* does not exist/i.test(eventError.message)
      ) {
        console.warn("profile link click event logging failed:", eventError.message);
      }
    }

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to track link click",
      },
      { status: 500 }
    );
  }
}
