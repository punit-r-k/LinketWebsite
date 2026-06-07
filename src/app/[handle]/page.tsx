import type { Metadata } from "next";
import { notFound } from "next/navigation";
import "@/styles/theme/public-profile.css";
import { getSignedAvatarUrl } from "@/lib/avatar-server";
import { getSignedProfileHeaderUrl } from "@/lib/profile-header-server";
import { getSignedProfileLogoUrl } from "@/lib/profile-logo-server";
import { getPublishedLeadForm } from "@/lib/public-lead-form";
import { getActiveProfileForPublicHandle } from "@/lib/profile-service";
import { getConfiguredSiteOrigin } from "@/lib/site-url";
import { createServerSupabaseReadonly } from "@/lib/supabase/server";
import { isDarkTheme, normalizeThemeName } from "@/lib/themes";
import type { ProfileLinkRecord } from "@/types/db";
import PublicProfileLinksList from "@/components/public/PublicProfileLinksList";
import PublicProfileLiteMode from "@/components/public/PublicProfileLiteMode";
import PublicLeadForm from "@/components/public/PublicLeadForm";
import PublicProfileImage from "@/components/public/PublicProfileImage";
import PublicProfileViewTracker from "@/components/public/PublicProfileViewTracker";
import VCardDownload from "@/components/VCardDownload";
import ShareContactButton from "@/components/ShareContactButton";
import { applyFreeLeadFormLimits } from "@/lib/lead-form";
import { sanitizeThemeForPlan } from "@/lib/plan-access";
import { getDashboardPlanAccessForUser } from "@/lib/plan-access.server";
import { isSupabaseAdminAvailable, supabaseAdmin } from "@/lib/supabase-admin";

export const revalidate = 60;

type Props = {
  params: Promise<{ handle: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { handle: rawHandle } = await params;
  const handle = rawHandle?.trim().toLowerCase();

  if (!handle) {
    return {
      title: `Profile Not Found | Linket Connect`,
      robots: { index: false, follow: false },
    };
  }

  const payload = await getActiveProfileForPublicHandle(handle);
  if (!payload) {
    return {
      title: `Profile Not Found | Linket Connect`,
      robots: { index: false, follow: false },
    };
  }

  const { account, profile } = payload;
  const publicHandle = profile.handle || account.username || handle;
  const displayName = profile.name || account.display_name || publicHandle;
  const description =
    profile.headline?.trim() ||
    `View ${displayName}'s Linket profile, links, and contact details.`;
  const siteOrigin = getConfiguredSiteOrigin();
  const profilePath = `/${encodeURIComponent(publicHandle)}`;
  const absoluteProfileUrl = `${siteOrigin}${profilePath}`;

  return {
    title: `${displayName} (@${publicHandle}) | Linket Connect`,
    description,
    alternates: {
      canonical: absoluteProfileUrl,
    },
    openGraph: {
      title: `${displayName} on Linket Connect`,
      description,
      url: absoluteProfileUrl,
      type: "profile",
      images: [
        {
          url: "/og.png",
          width: 1366,
          height: 768,
          alt: "Linket Connect profile preview",
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: `${displayName} on Linket Connect`,
      description,
      images: ["/og.png"],
    },
  };
}

function sortLinks(links: ProfileLinkRecord[] | null | undefined) {
  return (links ?? [])
    .filter((link) => link.is_active)
    .slice()
    .sort(
      (a, b) =>
        (a.order_index ?? 0) - (b.order_index ?? 0) ||
        a.created_at.localeCompare(b.created_at)
    );
}

export default async function PublicProfilePage({ params }: Props) {
  const { handle: rawHandle } = await params;
  const handle = rawHandle?.trim().toLowerCase();
  if (!handle) notFound();

  const payload = await getActiveProfileForPublicHandle(handle);
  if (!payload) notFound();

  const { account, profile } = payload;
  const planAccess = await getDashboardPlanAccessForUser(profile.user_id);
  const avatar = await getSignedAvatarUrl(
    account.avatar_url,
    account.avatar_updated_at
  );
  const headerImage = await getSignedProfileHeaderUrl(
    profile.header_image_url,
    profile.header_image_updated_at
  );
  const logoUrl = await getSignedProfileLogoUrl(
    profile.logo_url,
    profile.logo_updated_at
  );
  const logoShape = profile.logo_shape === "rect" ? "rect" : "circle";
  const logoBadgeClass = profile.logo_bg_white ? "bg-white" : "bg-background";
  const publicHandle = profile.handle || handle;
  const supabase = await createServerSupabaseReadonly();
  const { row: leadFormRow, form: normalizedLeadForm } =
    await getPublishedLeadForm({
      handle: publicHandle,
      profileId: profile.id,
      supabase,
    });
  const resolvedLeadForm =
    normalizedLeadForm && !planAccess.canCustomizeLeadForm
      ? applyFreeLeadFormLimits(
          normalizedLeadForm,
          leadFormRow?.id ?? `form-${profile.user_id}`
        )
      : normalizedLeadForm;
  const { data: vcardData } = isSupabaseAdminAvailable
    ? await supabaseAdmin
        .from("vcard_profiles")
        .select("email, phone")
        .eq("user_id", account.user_id)
        .maybeSingle()
    : await supabase
        .from("vcard_profiles")
        .select("email, phone")
        .eq("user_id", account.user_id)
        .maybeSingle();
  const hasContactDetails = Boolean(
    (vcardData as { email?: string | null; phone?: string | null } | null)?.email?.trim() ||
      (vcardData as { email?: string | null; phone?: string | null } | null)?.phone?.trim()
  );

  const leadFormTitle = resolvedLeadForm?.title ?? "Contact";
  const hasLeadForm = Boolean(resolvedLeadForm?.fields?.length);
  const displayName = profile.name || account.display_name || publicHandle;
  const resolvedTheme = sanitizeThemeForPlan(
    normalizeThemeName(profile.theme, "autumn"),
    planAccess
  );
  const isDark = isDarkTheme(resolvedTheme);
  const themeClass = `theme-${resolvedTheme} ${isDark ? "dark" : ""}`;
  const headline = profile.headline?.trim() ?? "";
  const links = sortLinks(profile.links);
  const hasLinks = links.length > 0;
  const hasHeadline = Boolean(headline);

  return (
    <div className={`public-profile-shell min-h-screen text-foreground ${themeClass}`}>
      <PublicProfileViewTracker handle={publicHandle} />
      <PublicProfileLiteMode />
      <div className="relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0 -z-10 public-profile-backdrop-entrance public-profile-heavy">
          <div
            className="public-profile-backdrop-orb-left absolute -left-32 top-[-140px] h-[360px] w-[360px] rounded-full blur-[120px] opacity-20"
            style={{ backgroundColor: "var(--ring)" }}
          />
          <div
            className="public-profile-backdrop-orb-right absolute right-[-200px] top-[160px] h-[420px] w-[420px] rounded-full blur-[140px] opacity-15"
            style={{ backgroundColor: "var(--primary)" }}
          />
          <div
            className="public-profile-backdrop-grid absolute inset-0"
            style={{
              backgroundImage:
                "linear-gradient(90deg, var(--border) 1px, transparent 1px), linear-gradient(180deg, var(--border) 1px, transparent 1px)",
              backgroundSize: "72px 72px",
            }}
          />
        </div>

        <section className="relative mx-auto w-full max-w-5xl px-4 pb-20 pt-4 sm:px-8 sm:pt-24 lg:px-10">
          <section className="grid gap-10 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
            <div className="space-y-6">
              <div className="sm:hidden">
                <div className="public-profile-card public-profile-load public-profile-load-2 overflow-hidden rounded-3xl border border-border/60 bg-card/70">
                  <div
                    className="relative h-32"
                    style={{
                      backgroundImage:
                        "linear-gradient(90deg, var(--primary), var(--accent), var(--ring))",
                    }}
                  >
                    {headerImage ? (
                      <PublicProfileImage
                        src={headerImage}
                        alt=""
                        fallbackKind="header"
                        fill
                        unoptimized
                        loading="eager"
                        sizes="(max-width: 768px) 100vw, 768px"
                        className="public-profile-header-image h-full w-full object-cover"
                      />
                    ) : null}
                    <div className="public-profile-heavy absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-background/40" />
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
                        <div className={`relative h-28 w-28 rounded-3xl shadow-sm z-10 bg-muted/40 overflow-visible ${logoUrl && logoShape === "rect" ? "mb-5" : ""}`}>
                          <div className="relative h-full w-full overflow-hidden rounded-3xl ring-4 ring-[var(--avatar-border)]">
                            <PublicProfileImage
                              src={avatar}
                              alt={`${displayName} avatar`}
                              fallbackKind="avatar"
                              fallbackLabel={displayName}
                              width={112}
                              height={112}
                              unoptimized
                              loading="eager"
                              className="h-full w-full object-cover"
                            />
                          </div>
                          {logoUrl && logoShape === "circle" ? (
                            <span className={`absolute -bottom-2 -right-2 h-12 w-12 overflow-hidden rounded-full border-2 border-[var(--avatar-border)] shadow-md ${logoBadgeClass}`}>
                              <PublicProfileImage
                                src={logoUrl}
                                alt=""
                                fallbackKind="logo"
                                fallbackLabel={displayName}
                                width={48}
                                height={48}
                                unoptimized
                                className="h-full w-full object-cover"
                              />
                            </span>
                          ) : null}
                          {logoUrl && logoShape === "rect" ? (
                          <span className={`absolute -bottom-5 left-1/2 z-20 h-8 w-20 -translate-x-1/2 overflow-hidden rounded-md border border-[var(--avatar-border)] shadow-sm ${logoBadgeClass}`}>
                            <PublicProfileImage
                              src={logoUrl}
                              alt=""
                              fallbackKind="logo"
                              fallbackLabel={displayName}
                              width={80}
                              height={32}
                              unoptimized
                              className="h-full w-full object-cover"
                            />
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
              <div className="public-profile-desktop-header public-profile-load public-profile-load-2 hidden flex-wrap items-center gap-4 sm:flex">
                {avatar ? (
                  <div className="flex flex-col items-center">
                    <div className={`relative h-20 w-20 rounded-3xl bg-muted/40 overflow-visible ${logoUrl && logoShape === "rect" ? "mb-4" : ""}`}>
                      <div className="relative h-full w-full overflow-hidden rounded-3xl ring-4 ring-[var(--avatar-border)]">
                        <PublicProfileImage
                          src={avatar}
                          alt={`${displayName} avatar`}
                          fallbackKind="avatar"
                          fallbackLabel={displayName}
                          width={80}
                          height={80}
                          unoptimized
                          loading="eager"
                          className="h-full w-full object-cover"
                        />
                      </div>
                      {logoUrl && logoShape === "circle" ? (
                        <span className={`absolute -bottom-1.5 -right-1.5 h-8 w-8 overflow-hidden rounded-full border-2 border-[var(--avatar-border)] shadow-md ${logoBadgeClass}`}>
                          <PublicProfileImage
                            src={logoUrl}
                            alt=""
                            fallbackKind="logo"
                            fallbackLabel={displayName}
                            width={32}
                            height={32}
                            unoptimized
                            className="h-full w-full object-cover"
                          />
                        </span>
                      ) : null}
                      {logoUrl && logoShape === "rect" ? (
                      <span className={`absolute -bottom-4 left-1/2 z-20 h-6 w-16 -translate-x-1/2 overflow-hidden rounded-md border border-[var(--avatar-border)] shadow-sm ${logoBadgeClass}`}>
                        <PublicProfileImage
                          src={logoUrl}
                          alt=""
                          fallbackKind="logo"
                          fallbackLabel={displayName}
                          width={64}
                          height={24}
                          unoptimized
                          className="h-full w-full object-cover"
                        />
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

              <div className="public-profile-actions flex flex-wrap items-center gap-3 public-profile-load public-profile-load-3">
                {hasContactDetails ? (
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
                <div className="space-y-3 public-profile-load public-profile-load-4">
                  <h2 className="public-profile-links-label text-sm font-semibold uppercase tracking-[0.3em] text-muted-foreground">
                    Links
                  </h2>
                  <PublicProfileLinksList
                    links={links}
                    themeName={resolvedTheme}
                    trackClicks
                  />
                </div>
              ) : null}
            </div>

            {hasLeadForm ? (
              <div
                id="public-lead-form"
                className="public-profile-card public-profile-load public-profile-load-5 rounded-[28px] border border-border/60 bg-card/80 p-6 shadow-[0_24px_60px_-40px_rgba(15,23,42,0.7)]"
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
                    initialForm={resolvedLeadForm}
                    initialFormId={leadFormRow?.id ?? null}
                    variant="profile"
                    showHeader={false}
                  />
                </div>
              </div>
            ) : null}
          </section>
        </section>
      </div>
    </div>
  );
}
