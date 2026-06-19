import { NextRequest, NextResponse } from "next/server";

import { createServerSupabaseReadonly } from "@/lib/supabase/server";
import { sanitizeAttachmentFilename, sanitizeHttpUrl } from "@/lib/security";
import { isSupabaseAdminAvailable, supabaseAdmin } from "@/lib/supabase-admin";
import type { ProfileLinkRecord } from "@/types/db";

const RESUME_BUCKET = "profile-resumes";

type ResumeLinkRecord = ProfileLinkRecord & {
  profile?: { is_active?: boolean | null } | null;
};

function isSafeStoragePath(value: string) {
  const trimmed = value.trim();
  return (
    trimmed.length > 0 &&
    !trimmed.startsWith("/") &&
    !trimmed.includes("..") &&
    trimmed.split("/").filter(Boolean).length >= 2
  );
}

function ownerUserIdFromPath(value: string) {
  return value.split("/")[0]?.trim() || null;
}

function extractResumeStoragePath(value: string | null | undefined) {
  const raw = value?.trim();
  if (!raw) return null;

  if (isSafeStoragePath(raw) && raw.includes("/")) {
    return raw;
  }

  try {
    const parsed = new URL(raw);
    if (parsed.pathname === "/api/profile-links/download") {
      const path = parsed.searchParams.get("path")?.trim() ?? "";
      return isSafeStoragePath(path) ? path : null;
    }

    const markers = [
      `/storage/v1/object/public/${RESUME_BUCKET}/`,
      `/storage/v1/object/sign/${RESUME_BUCKET}/`,
    ];
    for (const marker of markers) {
      const index = parsed.pathname.indexOf(marker);
      if (index === -1) continue;
      const path = decodeURIComponent(parsed.pathname.slice(index + marker.length));
      return isSafeStoragePath(path) ? path : null;
    }
  } catch {
    return null;
  }

  return null;
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
      if (!isSafeStoragePath(directPath)) {
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
      .eq("link_type", "resume")
      .eq("profile.is_active", true)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) {
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
