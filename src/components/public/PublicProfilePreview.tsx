"use client";

import { useEffect, useState } from "react";
import { getSignedAvatarUrl } from "@/lib/avatar-client";
import { getSignedProfileHeaderUrl } from "@/lib/profile-header-client";
import { getSignedProfileLogoUrl } from "@/lib/profile-logo-client";
import { isDarkTheme, normalizeThemeName } from "@/lib/themes";
import type { ThemeName } from "@/lib/themes";
import type { ProfileWithLinks } from "@/lib/profile-service";
import type { LeadFormConfig } from "@/types/lead-form";
import PublicProfileLinksList from "@/components/public/PublicProfileLinksList";
import PublicLeadForm from "@/components/public/PublicLeadForm";
import VCardDownload from "@/components/VCardDownload";
import ShareContactButton from "@/components/ShareContactButton";

type AccountPreview = {
  handle: string;
  displayName: string | null;
  avatarPath: string | null;
  avatarUpdatedAt: string | null;
};

type Props = {
  profile: ProfileWithLinks;
  account: AccountPreview;
  handle: string;
  layout?: "split" | "stacked";
  forceMobile?: boolean;
  themeOverride?: ThemeName;
  contactEnabled?: boolean;
};

function sortLinks(links: ProfileWithLinks["links"]) {
  return (links ?? [])
    .filter((link) => link.is_active)
    .slice()
    .sort(
      (a, b) =>
        (a.order_index ?? 0) - (b.order_index ?? 0) ||
        a.created_at.localeCompare(b.created_at)
    );
}

export default function PublicProfilePreview({
  profile,
  account,
  handle,
  layout = "split",
  forceMobile = false,
  themeOverride,
  contactEnabled = true,
}: Props) {
  const [avatar, setAvatar] = useState<string | null>(null);
  const [headerImage, setHeaderImage] = useState<string | null>(null);
  const [logoAsset, setLogoAsset] = useState<{
    path: string;
    url: string | null;
  } | null>(null);
  const publicHandle = profile.handle || account.handle || handle;
  const displayName = profile.name || account.displayName || publicHandle;
  const resolvedTheme = normalizeThemeName(themeOverride ?? profile.theme, "autumn");
  const isDark = isDarkTheme(resolvedTheme);
  const themeClass = `theme-${resolvedTheme} ${isDark ? "dark" : ""}`;
  const headline = profile.headline?.trim() ?? "";
  const logoPath = profile.logo_url ?? null;
  const logoUrl = logoAsset?.path === logoPath ? logoAsset.url : null;
  const logoShape = profile.logo_shape === "rect" ? "rect" : "circle";
  const logoBadgeClass = profile.logo_bg_white ? "bg-white" : "bg-background";
  const links = sortLinks(profile.links);
  const hasLinks = links.length > 0;
  const hasHeadline = Boolean(headline);
  const [leadFormTitle, setLeadFormTitle] = useState("Contact");
  const [hasLeadForm, setHasLeadForm] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      const signed = await getSignedAvatarUrl(
        account.avatarPath,
        account.avatarUpdatedAt
      );
      if (!active) return;
      setAvatar(signed);
    })();
    return () => {
      active = false;
    };
  }, [account.avatarPath, account.avatarUpdatedAt]);

  useEffect(() => {
    let active = true;
    (async () => {
      const signed = await getSignedProfileHeaderUrl(
        profile.header_image_url,
        profile.header_image_updated_at
      );
      if (!active) return;
      setHeaderImage(signed);
    })();
    return () => {
      active = false;
    };
  }, [profile.header_image_url, profile.header_image_updated_at]);

  useEffect(() => {
    if (!logoPath) return;
    let active = true;
    (async () => {
      const signed = await getSignedProfileLogoUrl(
        logoPath,
        profile.logo_updated_at
      );
      if (!active) return;
      setLogoAsset({ path: logoPath, url: signed });
    })();
    return () => {
      active = false;
    };
  }, [logoPath, profile.logo_updated_at]);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const search = new URLSearchParams();
        if (publicHandle) search.set("handle", publicHandle);
        if (profile.id) search.set("profileId", profile.id);
        const response = await fetch(
          `/api/lead-forms/public?${search.toString()}`,
          { cache: "no-store" }
        );
        if (!response.ok) return;
        const payload = (await response.json()) as {
          form: LeadFormConfig | null;
        };
        if (!active) return;
        const fields = payload.form?.fields ?? [];
        setHasLeadForm(fields.length > 0);
        if (payload.form?.title) {
          setLeadFormTitle(payload.form.title);
        }
      } catch {
        if (active) {
          setHasLeadForm(false);
          setLeadFormTitle("Contact");
        }
      }
    })();
    return () => {
      active = false;
    };
  }, [profile.id, publicHandle]);

  return (
    <div className={`public-profile-shell min-h-full text-foreground ${themeClass}`}>
      <div className="relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0 -z-10">
          <div
            className="absolute -left-32 top-[-140px] h-[360px] w-[360px] rounded-full blur-[120px] opacity-20"
            style={{ backgroundColor: "var(--ring)" }}
          />
          <div
            className="absolute right-[-200px] top-[160px] h-[420px] w-[420px] rounded-full blur-[140px] opacity-15"
            style={{ backgroundColor: "var(--primary)" }}
          />
          <div
            className="absolute inset-0 opacity-[0.16]"
            style={{
              backgroundImage:
                "linear-gradient(90deg, var(--border) 1px, transparent 1px), linear-gradient(180deg, var(--border) 1px, transparent 1px)",
              backgroundSize: "72px 72px",
            }}
          />
        </div>

        {layout === "stacked" ? (
          <section className="relative mx-auto w-full max-w-3xl px-4 pb-20 pt-12 sm:px-8 lg:px-10">
            <section className="space-y-8">
              <div className="space-y-6">
              <div className={forceMobile ? "" : "sm:hidden"}>
                <div className="overflow-hidden rounded-3xl border border-border/60 bg-card/70">
                  <div
                    className="relative h-32"
                    style={{
                      backgroundImage:
                        "linear-gradient(90deg, var(--primary), var(--accent), var(--ring))",
                    }}
                  >
                    {headerImage ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={headerImage}
                        alt=""
                        className="h-full w-full object-cover"
                      />
                    ) : null}
                    <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-background/40" />
                  </div>
                  <div
                    className={
                      avatar
                        ? "-mt-16 flex flex-col items-center px-4 pb-4 text-center"
                        : "mt-4 flex flex-col items-center px-4 pb-6 text-center"
                    }
                  >
                    {avatar ? (
                      <div className="flex flex-col items-center">
                        <div className="relative flex flex-col items-center">
                        <div className="relative h-28 w-28 rounded-3xl shadow-sm z-10 bg-muted/40 overflow-visible">
                          <div className="h-full w-full overflow-hidden rounded-3xl ring-4 ring-[var(--avatar-border)]">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={avatar}
                              alt={`${displayName} avatar`}
                              className="h-full w-full object-cover"
                            />
                          </div>
                          {logoUrl && logoShape === "circle" ? (
                            <span className={`absolute -bottom-2 -right-2 h-12 w-12 overflow-hidden rounded-full border-2 border-[var(--avatar-border)] shadow-md ${logoBadgeClass}`}>
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={logoUrl} alt="" className="h-full w-full object-cover" />
                            </span>
                          ) : null}
                        </div>
                          {logoUrl && logoShape === "rect" ? (
                          <span className={`relative z-20 -mt-3 mb-2 h-8 w-20 overflow-hidden rounded-md border border-[var(--avatar-border)] shadow-sm ${logoBadgeClass}`}>
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={logoUrl} alt="" className="h-full w-full object-cover" />
                            </span>
                          ) : null}
                        </div>
                      </div>
                    ) : null}
                    <div className={avatar ? "mt-3 space-y-1" : "mt-2 space-y-1"}>
                      <h1 className="break-words font-display text-2xl tracking-tight">
                        {displayName}
                      </h1>
                      {hasHeadline ? (
                        <p
                          className="break-words text-sm text-muted-foreground"
                          style={{ whiteSpace: "normal", overflow: "visible", textOverflow: "clip" }}
                        >
                          {headline}
                        </p>
                      ) : null}
                      <div className="break-words text-xs text-muted-foreground">
                        @{publicHandle}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              {forceMobile ? null : (
              <div className="public-profile-desktop-header hidden flex-wrap items-center gap-4 sm:flex">
                {avatar ? (
                  <div className="flex flex-col items-center">
                    <div className="relative flex flex-col items-center">
                      <div className="relative h-20 w-20 rounded-3xl bg-muted/40 overflow-visible">
                        <div className="h-full w-full overflow-hidden rounded-3xl ring-4 ring-[var(--avatar-border)]">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={avatar}
                            alt={`${displayName} avatar`}
                            className="h-full w-full object-cover"
                          />
                        </div>
                        {logoUrl && logoShape === "circle" ? (
                        <span className={`absolute -bottom-1.5 -right-1.5 h-8 w-8 overflow-hidden rounded-full border-2 border-[var(--avatar-border)] shadow-md ${logoBadgeClass}`}>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={logoUrl} alt="" className="h-full w-full object-cover" />
                          </span>
                        ) : null}
                      </div>
                      {logoUrl && logoShape === "rect" ? (
                      <span className={`relative z-20 -mt-2 mb-1.5 h-6 w-16 overflow-hidden rounded-md border border-[var(--avatar-border)] shadow-sm ${logoBadgeClass}`}>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={logoUrl} alt="" className="h-full w-full object-cover" />
                        </span>
                      ) : null}
                    </div>
                  </div>
                ) : null}
                  <div className="min-w-0 space-y-1">
                    <h1 className="break-words font-display text-3xl tracking-tight sm:text-4xl">
                      {displayName}
                    </h1>
                    {hasHeadline ? (
                      <p
                        className="break-words text-sm text-muted-foreground"
                        style={{ whiteSpace: "normal", overflow: "visible", textOverflow: "clip" }}
                      >
                        {headline}
                      </p>
                    ) : null}
                    <div className="break-words text-xs text-muted-foreground">
                      @{publicHandle}
                    </div>
                  </div>
                </div>
              )}

                <div
                  className={
                    forceMobile
                      ? "public-profile-actions flex flex-wrap items-center justify-center gap-3"
                      : "public-profile-actions flex flex-wrap items-center justify-center gap-3 sm:justify-start"
                  }
                >
                  {contactEnabled ? (
                    <VCardDownload
                      handle={publicHandle}
                      label="Save Contact Information"
                      className="public-profile-cta-primary w-full rounded-full sm:w-auto"
                    />
                  ) : null}
                  <ShareContactButton
                    handle={publicHandle}
                    profileId={profile.id}
                    label="Share contact"
                    variant="outline"
                    className="w-full rounded-full sm:w-auto"
                  />
                </div>
              </div>

              {hasLinks ? (
                <div className="space-y-3">
                  <h2 className="public-profile-links-label text-sm font-semibold uppercase tracking-[0.3em] text-muted-foreground">
                    Links
                  </h2>
                  <PublicProfileLinksList
                    links={links}
                    themeName={resolvedTheme}
                  />
                </div>
              ) : null}

              {hasLeadForm ? (
                <div
                  id="public-lead-form"
                  className="rounded-[28px] border border-border/60 bg-card/80 p-6 shadow-[0_24px_60px_-40px_rgba(15,23,42,0.7)]"
                >
                  <div className="space-y-2">
                    <h2 className="text-lg font-semibold text-foreground">
                      {leadFormTitle}
                    </h2>
                    <p className="text-sm text-muted-foreground">
                      Share your info with {displayName}.
                    </p>
                  </div>
                  <div className="mt-5">
                    <PublicLeadForm
                      ownerId={profile.user_id}
                      handle={publicHandle}
                      profileId={profile.id}
                      variant="profile"
                      showHeader={false}
                    />
                  </div>
                </div>
              ) : null}
            </section>
          </section>
        ) : (
          <section className="relative mx-auto w-full max-w-5xl px-4 pb-20 pt-8 sm:px-8 lg:px-10">
            <section className="grid gap-10 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
              <div className="space-y-6">
              <div className={forceMobile ? "" : "sm:hidden"}>
                <div className="overflow-hidden rounded-3xl border border-border/60 bg-card/70">
                  <div
                    className="relative h-32"
                    style={{
                      backgroundImage:
                        "linear-gradient(90deg, var(--primary), var(--accent), var(--ring))",
                    }}
                  >
                    {headerImage ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={headerImage}
                        alt=""
                        className="h-full w-full object-cover"
                      />
                    ) : null}
                    <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-background/40" />
                  </div>
                  <div
                    className={
                      avatar
                        ? "-mt-16 flex flex-col items-center px-4 pb-4 text-center"
                        : "mt-4 flex flex-col items-center px-4 pb-6 text-center"
                    }
                  >
                    {avatar ? (
                      <div className="flex flex-col items-center">
                        <div className="relative flex flex-col items-center">
                        <div className="relative h-28 w-28 rounded-3xl shadow-sm z-10 bg-muted/40 overflow-visible">
                          <div className="h-full w-full overflow-hidden rounded-3xl ring-4 ring-[var(--avatar-border)]">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={avatar}
                              alt={`${displayName} avatar`}
                              className="h-full w-full object-cover"
                            />
                          </div>
                          {logoUrl && logoShape === "circle" ? (
                            <span className={`absolute -bottom-2 -right-2 h-12 w-12 overflow-hidden rounded-full border-2 border-[var(--avatar-border)] shadow-md ${logoBadgeClass}`}>
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={logoUrl} alt="" className="h-full w-full object-cover" />
                            </span>
                          ) : null}
                        </div>
                          {logoUrl && logoShape === "rect" ? (
                          <span className={`relative z-20 -mt-3 mb-2 h-8 w-20 overflow-hidden rounded-md border border-[var(--avatar-border)] shadow-sm ${logoBadgeClass}`}>
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={logoUrl} alt="" className="h-full w-full object-cover" />
                            </span>
                          ) : null}
                        </div>
                      </div>
                    ) : null}
                    <div className={avatar ? "mt-3 space-y-1" : "mt-2 space-y-1"}>
                      <h1 className="break-words font-display text-2xl tracking-tight">
                        {displayName}
                      </h1>
                      {hasHeadline ? (
                        <p
                          className="break-words text-sm text-muted-foreground"
                          style={{ whiteSpace: "normal", overflow: "visible", textOverflow: "clip" }}
                        >
                          {headline}
                        </p>
                      ) : null}
                      <div className="break-words text-xs text-muted-foreground">
                        @{publicHandle}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              {forceMobile ? null : (
              <div className="public-profile-desktop-header hidden flex-wrap items-center gap-4 sm:flex">
                {avatar ? (
                  <div className="flex flex-col items-center">
                    <div className="relative flex flex-col items-center">
                      <div className="relative h-20 w-20 rounded-3xl bg-muted/40 overflow-visible">
                        <div className="h-full w-full overflow-hidden rounded-3xl ring-4 ring-[var(--avatar-border)]">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={avatar}
                            alt={`${displayName} avatar`}
                            className="h-full w-full object-cover"
                          />
                        </div>
                        {logoUrl && logoShape === "circle" ? (
                        <span className={`absolute -bottom-1.5 -right-1.5 h-8 w-8 overflow-hidden rounded-full border-2 border-[var(--avatar-border)] shadow-md ${logoBadgeClass}`}>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={logoUrl} alt="" className="h-full w-full object-cover" />
                          </span>
                        ) : null}
                      </div>
                      {logoUrl && logoShape === "rect" ? (
                      <span className={`relative z-20 -mt-2 mb-1.5 h-6 w-16 overflow-hidden rounded-md border border-[var(--avatar-border)] shadow-sm ${logoBadgeClass}`}>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={logoUrl} alt="" className="h-full w-full object-cover" />
                        </span>
                      ) : null}
                    </div>
                  </div>
                ) : null}
                  <div className="min-w-0 space-y-1">
                    <h1 className="break-words font-display text-3xl tracking-tight sm:text-4xl">
                      {displayName}
                    </h1>
                    {hasHeadline ? (
                      <p
                        className="break-words text-sm text-muted-foreground"
                        style={{ whiteSpace: "normal", overflow: "visible", textOverflow: "clip" }}
                      >
                        {headline}
                      </p>
                    ) : null}
                    <div className="break-words text-xs text-muted-foreground">
                      @{publicHandle}
                    </div>
                  </div>
                </div>
              )}

                <div className="public-profile-actions flex flex-wrap items-center gap-3">
                  {contactEnabled ? (
                    <VCardDownload
                      handle={publicHandle}
                      label="Save Contact Information"
                      className="public-profile-cta-primary w-full rounded-full sm:w-auto"
                    />
                  ) : null}
                  <ShareContactButton
                    handle={publicHandle}
                    profileId={profile.id}
                    label="Share contact"
                    variant="outline"
                    className="w-full rounded-full sm:w-auto"
                  />
                </div>

                {hasLinks ? (
                  <div className="space-y-3">
                  <h2 className="public-profile-links-label text-sm font-semibold uppercase tracking-[0.3em] text-muted-foreground">
                    Links
                  </h2>
                  <PublicProfileLinksList
                    links={links}
                    themeName={resolvedTheme}
                  />
                </div>
                ) : null}
              </div>

              {hasLeadForm ? (
                <div
                  id="public-lead-form"
                  className="rounded-[28px] border border-border/60 bg-card/80 p-6 shadow-[0_24px_60px_-40px_rgba(15,23,42,0.7)]"
                >
                  <div className="space-y-2">
                    <h2 className="text-lg font-semibold text-foreground">
                      {leadFormTitle}
                    </h2>
                    <p className="text-sm text-muted-foreground">
                      Share your info with {displayName}.
                    </p>
                  </div>
                  <div className="mt-5">
                    <PublicLeadForm
                      ownerId={profile.user_id}
                      handle={publicHandle}
                      profileId={profile.id}
                      variant="profile"
                      showHeader={false}
                    />
                  </div>
                </div>
              ) : null}
            </section>
          </section>
        )}
      </div>
    </div>
  );
}
