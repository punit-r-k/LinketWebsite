import { NextRequest, NextResponse } from "next/server";

import { requireRouteAccess } from "@/lib/api-authorization";
import { limitRequest } from "@/lib/rate-limit";
import {
  rejectLargeRequestBody,
  rejectUntrustedWrite,
} from "@/lib/request-security";
import { sanitizeAttachmentFilename } from "@/lib/security";
import { getConfiguredSiteOrigin } from "@/lib/site-url";
import { isSupabaseAdminAvailable, supabaseAdmin } from "@/lib/supabase-admin";

const RESUME_BUCKET = "profile-resumes";
const MAX_RESUME_BYTES = 5 * 1024 * 1024;
const MAX_RESUME_BODY_BYTES = 6 * 1024 * 1024;

export async function POST(request: NextRequest) {
  try {
    const untrusted = rejectUntrustedWrite(request);
    if (untrusted) return untrusted;

    if (await limitRequest(request, "resume-upload", 20, 60_000)) {
      return NextResponse.json(
        { error: "Too many upload attempts. Please try again later." },
        { status: 429 }
      );
    }

    if (!isSupabaseAdminAvailable) {
      return NextResponse.json(
        { error: "Resume uploads are not configured." },
        { status: 503 }
      );
    }

    const tooLarge = rejectLargeRequestBody(
      request,
      MAX_RESUME_BODY_BYTES,
      "Resume upload payload"
    );
    if (tooLarge) return tooLarge;

    const data = await request.formData();
    const userId = String(data.get("userId") ?? "").trim();
    const profileId = String(data.get("profileId") ?? "").trim() || "draft";
    const fileEntry = data.get("file");

    const access = await requireRouteAccess("POST /api/profile-links/resume-upload", {
      resourceUserId: userId,
    });
    if (access instanceof NextResponse) {
      return access;
    }

    if (!userId || !(fileEntry instanceof File)) {
      return NextResponse.json(
        { error: "userId and file are required." },
        { status: 400 }
      );
    }

    if (fileEntry.size <= 0) {
      return NextResponse.json({ error: "File is empty." }, { status: 400 });
    }

    if (fileEntry.size > MAX_RESUME_BYTES) {
      return NextResponse.json(
        { error: "Resume PDF must be 5 MB or smaller." },
        { status: 400 }
      );
    }

    if (!(await isPdf(fileEntry))) {
      return NextResponse.json(
        { error: "Upload a PDF resume." },
        { status: 400 }
      );
    }

    const safeName = sanitizeAttachmentFilename(fileEntry.name, "resume.pdf");
    const timestamp = Date.now();
    const path = `${userId}/${profileId}/resume-${timestamp}-${safeName}`;

    const { error: uploadError } = await supabaseAdmin.storage
      .from(RESUME_BUCKET)
      .upload(path, fileEntry, {
        cacheControl: "3600",
        contentType: "application/pdf",
        upsert: false,
      });
    if (uploadError) {
      throw new Error(uploadError.message || "Upload failed.");
    }

    const downloadUrl = new URL(
      `/api/profile-links/download?path=${encodeURIComponent(path)}`,
      getConfiguredSiteOrigin()
    ).toString();

    return NextResponse.json({
      file: {
        name: safeName,
        sizeBytes: fileEntry.size,
        url: downloadUrl,
      },
    });
  } catch (error) {
    console.error("Resume upload error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Unable to upload resume.",
      },
      { status: 500 }
    );
  }
}

async function isPdf(file: File) {
  const type = (file.type || "").toLowerCase();
  const name = file.name.toLowerCase();
  if (type !== "application/pdf" && !name.endsWith(".pdf")) {
    return false;
  }
  const signature = await file.slice(0, 5).text().catch(() => "");
  return signature === "%PDF-";
}
