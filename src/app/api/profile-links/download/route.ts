import { NextRequest, NextResponse } from "next/server";

import { sanitizeAttachmentFilename } from "@/lib/security";
import { isSupabaseAdminAvailable, supabaseAdmin } from "@/lib/supabase-admin";
import type { ProfileLinkRecord } from "@/types/db";

export async function GET(request: NextRequest) {
  try {
    const linkId = request.nextUrl.searchParams.get("linkId")?.trim();
    if (!linkId) {
      return NextResponse.json({ error: "linkId is required" }, { status: 400 });
    }

    if (!isSupabaseAdminAvailable) {
      return NextResponse.json({ error: "Downloads are not configured." }, { status: 503 });
    }

    const { data, error } = await supabaseAdmin
      .from("profile_links")
      .select("*")
      .eq("id", linkId)
      .eq("is_active", true)
      .eq("link_type", "resume")
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) {
      return NextResponse.json({ error: "Resume not found." }, { status: 404 });
    }

    const link = data as ProfileLinkRecord;
    const response = await fetch(link.url, { cache: "no-store" });
    if (!response.ok) {
      return NextResponse.json({ error: "Resume unavailable." }, { status: 502 });
    }

    const bytes = await response.arrayBuffer();
    const filename = sanitizeAttachmentFilename(
      `${link.title || "resume"}.pdf`,
      "resume.pdf"
    );

    return new NextResponse(bytes, {
      headers: {
        "Cache-Control": "private, no-store",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Type": "application/pdf",
      },
    });
  } catch (error) {
    console.error("Resume download error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Unable to download resume.",
      },
      { status: 500 }
    );
  }
}
