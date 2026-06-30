type ResumeLinkLike = {
  link_type?: string | null;
  title?: string | null;
  url?: string | null;
};

const RESUME_BUCKET = "profile-resumes";

export function isResumeProfileLink(link: ResumeLinkLike) {
  if (link.link_type === "resume") return true;

  const title = link.title?.trim().toLowerCase() ?? "";
  const url = link.url?.trim().toLowerCase() ?? "";
  const hasResumeTitle =
    title === "resume" ||
    title === "cv" ||
    title.includes("resume") ||
    title.includes("curriculum vitae");

  return (
    hasResumeTitle ||
    url.includes("/profile-resumes/") ||
    url.includes("/storage/v1/object/public/profile-resumes/") ||
    url.includes("/storage/v1/object/sign/profile-resumes/") ||
    (hasResumeTitle && url.includes(".pdf"))
  );
}

export function isSafeResumeStoragePath(value: string) {
  const trimmed = value.trim();
  return (
    trimmed.length > 0 &&
    !trimmed.startsWith("/") &&
    !trimmed.includes("://") &&
    !trimmed.includes("?") &&
    !trimmed.includes("#") &&
    !trimmed.includes("\\") &&
    !trimmed.includes("..") &&
    trimmed.split("/").filter(Boolean).length >= 2
  );
}

export function extractResumeStoragePath(value: string | null | undefined) {
  const raw = value?.trim();
  if (!raw) return null;

  if (isSafeResumeStoragePath(raw)) {
    return raw;
  }

  try {
    const parsed = new URL(raw);
    if (parsed.pathname === "/api/profile-links/download") {
      const path = parsed.searchParams.get("path")?.trim() ?? "";
      return isSafeResumeStoragePath(path) ? path : null;
    }

    const markers = [
      `/storage/v1/object/public/${RESUME_BUCKET}/`,
      `/storage/v1/object/sign/${RESUME_BUCKET}/`,
    ];
    for (const marker of markers) {
      const index = parsed.pathname.indexOf(marker);
      if (index === -1) continue;
      const path = decodeURIComponent(
        parsed.pathname.slice(index + marker.length)
      );
      return isSafeResumeStoragePath(path) ? path : null;
    }
  } catch {
    return null;
  }

  return null;
}
