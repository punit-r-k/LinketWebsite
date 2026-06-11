"use client";

import { useCallback, type CSSProperties } from "react";
import Image from "next/image";
import { ArrowUpRight, Download } from "lucide-react";
import LinkFavicon from "@/components/LinkFavicon";
import { emitAnalyticsEvent } from "@/lib/analytics";
import { sanitizePublicLinkUrl } from "@/lib/security";
import { coerceThemeName, isDarkTheme } from "@/lib/themes";
import type { ThemeName } from "@/lib/themes";
import type { ProfileLinkRecord } from "@/types/db";

function isResumeLink(link: ProfileLinkRecord) {
  if (link.link_type === "resume") return true;

  const title = link.title.trim().toLowerCase();
  const url = link.url.trim().toLowerCase();
  const isResumeTitle =
    title === "resume" ||
    title === "cv" ||
    title.includes("resume") ||
    title.includes("curriculum vitae");

  return (
    url.includes("/profile-resumes/") ||
    url.includes("/storage/v1/object/public/profile-resumes/") ||
    (isResumeTitle && url.includes(".pdf"))
  );
}

export default function PublicProfileLinksList({
  links,
  themeName,
  trackClicks = false,
}: {
  links: ProfileLinkRecord[];
  themeName?: ThemeName | string | null;
  trackClicks?: boolean;
}) {
  const resolvedTheme = coerceThemeName(themeName);
  const useDarkThemeIcons = resolvedTheme ? isDarkTheme(resolvedTheme) : false;
  const safeLinks = links
    .map((link) => {
      try {
        return {
          ...link,
          url: sanitizePublicLinkUrl(link.url),
        };
      } catch {
        return null;
      }
    })
    .filter((link): link is ProfileLinkRecord => Boolean(link));

  const trackClick = useCallback(
    (linkId: string) => {
      if (!trackClicks) return;
      emitAnalyticsEvent({
        id: "profile_link_click",
        meta: { linkId, source: "public_profile_link" },
      });
      const payload = JSON.stringify({ linkId });
      if (typeof navigator !== "undefined" && "sendBeacon" in navigator) {
        const blob = new Blob([payload], { type: "application/json" });
        const sent = navigator.sendBeacon("/api/profile-links/click", blob);
        if (sent) return;
      }
      void fetch("/api/profile-links/click", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: payload,
        keepalive: true,
      }).catch(() => {});
    },
    [trackClicks]
  );

  return (
    <div className="grid gap-3">
      {safeLinks.map((link, index) => {
        const resumeLink = isResumeLink(link);
        const useResumeDownload = link.link_type === "resume";

        return (
          <a
            key={link.id}
            href={
              useResumeDownload
                ? `/api/profile-links/download?linkId=${encodeURIComponent(link.id)}`
                : link.url
            }
            target={useResumeDownload ? undefined : "_blank"}
            rel={useResumeDownload ? undefined : "noreferrer"}
            download={useResumeDownload ? "" : undefined}
            onClick={() => trackClick(link.id)}
            style={{ "--public-profile-delay": `${430 + index * 70}ms` } as CSSProperties}
            className="public-profile-link public-profile-link-entrance group flex min-w-0 items-center justify-between gap-4 overflow-hidden rounded-2xl border border-border/60 bg-card/80 px-4 py-3 transition hover:border-[color:var(--ring)] hover:shadow-[0_18px_45px_-35px_var(--ring)] focus-visible:outline-none focus-visible:[box-shadow:0_0_0_2px_var(--color-button-focus-offset),0_0_0_5px_var(--color-button-focus-ring),0_18px_45px_-35px_var(--ring)]"
          >
            <div className="flex min-w-0 flex-1 items-center gap-3">
              {resumeLink ? (
                <span className="public-profile-resume-icon-shell inline-flex h-10 w-10 shrink-0 items-center justify-center">
                  <Image
                    src="/icons/resume.png"
                    alt=""
                    width={24}
                    height={24}
                    className="public-profile-resume-icon h-6 w-6 object-contain"
                    aria-hidden
                  />
                </span>
              ) : (
                <LinkFavicon
                  title={link.title}
                  url={link.url}
                  useDarkThemeIcons={useDarkThemeIcons}
                  className="public-profile-link-icon"
                  fallbackClassName="public-profile-link-icon-fallback"
                  loading={index < 4 ? "eager" : "lazy"}
                />
              )}
              <div className="min-w-0">
                <div className="truncate text-base font-semibold text-foreground">
                  {link.title}
                </div>
                <div className="truncate text-xs text-muted-foreground">
                  {resumeLink ? "Download PDF" : link.url}
                </div>
              </div>
            </div>
            <span className="public-profile-link-action inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border transition">
              {resumeLink ? (
                <Download className="h-4 w-4" aria-hidden />
              ) : (
                <ArrowUpRight className="h-4 w-4" aria-hidden />
              )}
            </span>
          </a>
        );
      })}
    </div>
  );
}
