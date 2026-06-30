import { NextRequest, NextResponse } from "next/server";

import { createServerSupabaseReadonly } from "@/lib/supabase/server";
import {
  extractResumeStoragePath,
  isResumeProfileLink,
  isSafeResumeStoragePath,
} from "@/lib/profile-link-resume";
import { sanitizeAttachmentFilename, sanitizeHttpUrl } from "@/lib/security";
import { isSupabaseAdminAvailable, supabaseAdmin } from "@/lib/supabase-admin";
import type { ProfileLinkRecord } from "@/types/db";

const RESUME_BUCKET = "profile-resumes";

type ResumeLinkRecord = ProfileLinkRecord & {
  profile?: { is_active?: boolean | null } | null;
};

function ownerUserIdFromPath(value: string) {
  return value.split("/")[0]?.trim() || null;
}

async function requireStorageOwner(request: NextRequest, path: string) {
  const ownerUserId = ownerUserIdFromPath(path);
  if (!ownerUserId) {
    return NextResponse.json({ error: "Invalid resume path." }, { status: 400 });
  }

  const supabase = await createServerSupabaseReadonly();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (user.id !== ownerUserId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  return null;
}

async function redirectToSignedResume(path: string, filename: string) {
  const { data, error } = await supabaseAdmin.storage
    .from(RESUME_BUCKET)
    .createSignedUrl(path, 60, { download: filename });
  if (error || !data?.signedUrl) {
    console.error(
      "Resume signed URL error:",
      error?.message ?? "Signed URL was not returned."
    );
    return NextResponse.json({ error: "Resume unavailable." }, { status: 404 });
  }

  return NextResponse.redirect(data.signedUrl);
}

export async function GET(request: NextRequest) {
  try {
    const linkId = request.nextUrl.searchParams.get("linkId")?.trim();
    if (!isSupabaseAdminAvailable) {
      return NextResponse.json({ error: "Downloads are not configured." }, { status: 503 });
    }

    const directPath = request.nextUrl.searchParams.get("path")?.trim() ?? "";
    if (directPath) {
      if (!isSafeResumeStoragePath(directPath)) {
        return NextResponse.json({ error: "Invalid resume path." }, { status: 400 });
      }
      const accessError = await requireStorageOwner(request, directPath);
      if (accessError) return accessError;
      const filename = sanitizeAttachmentFilename(
        directPath.split("/").pop() ?? "resume.pdf",
        "resume.pdf"
      );
      return redirectToSignedResume(directPath, filename);
    }

    if (!linkId) {
      return NextResponse.json({ error: "linkId is required" }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from("profile_links")
      .select("*, profile:user_profiles!inner(is_active)")
      .eq("id", linkId)
      .eq("is_active", true)
      .eq("profile.is_active", true)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data || !isResumeProfileLink(data)) {
      return NextResponse.json({ error: "Resume not found." }, { status: 404 });
    }

    const link = data as ResumeLinkRecord;
    const filename = sanitizeAttachmentFilename(
      `${link.title || "resume"}.pdf`,
      "resume.pdf"
    );
    const path = extractResumeStoragePath(link.url);
    if (path) {
      return redirectToSignedResume(path, filename);
    }

    return NextResponse.redirect(sanitizeHttpUrl(link.url));
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
