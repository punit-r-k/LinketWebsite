"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import "@/styles/theme/public-profile.css";
import { createClient } from "@/lib/supabase/client";
import type { ProfileWithLinks } from "@/lib/profile-service";
import PublicProfilePreview from "@/components/public/PublicProfilePreview";
import PublicProfilePreviewLoader from "@/components/public/PublicProfilePreviewLoader";
import { isDarkTheme, normalizeThemeName } from "@/lib/themes";

type PreviewState = {
  loading: boolean;
  error: string | null;
  profile: ProfileWithLinks | null;
  account: {
    handle: string;
    displayName: string | null;
    avatarPath: string | null;
    avatarUpdatedAt: string | null;
  } | null;
  contactEnabled: boolean;
};

function PublicProfilePreviewPageContent() {
  const params = useParams();
  const searchParams = useSearchParams();
  const handle = String(params?.handle ?? "").trim().toLowerCase();
  const requestedTheme = normalizeThemeName(searchParams.get("theme"), "autumn");
  const requestedThemeClassName = `theme-${requestedTheme} ${isDarkTheme(requestedTheme) ? "dark" : ""}`;
  const supabase = useMemo(() => createClient(), []);
  const [state, setState] = useState<PreviewState>({
    loading: true,
    error: null,
    profile: null,
    account: null,
    contactEnabled: false,
  });

  useEffect(() => {
    if (!handle) return;
    let active = true;
    (async () => {
      try {
        const { data, error } = await supabase.auth.getUser();
        if (error || !data.user) {
          throw new Error("Sign in to preview your profile.");
        }
        const userId = data.user.id;
        const profilesRes = await fetch(
          `/api/linket-profiles?userId=${encodeURIComponent(userId)}`,
          { cache: "no-store" }
        );
        if (!profilesRes.ok) {
          const info = await profilesRes.json().catch(() => ({}));
          throw new Error(info?.error || "Unable to load profiles.");
        }
        const profiles = (await profilesRes.json()) as ProfileWithLinks[];
        const profile =
          profiles.find(
            (item) => item.handle?.toLowerCase() === handle
          ) ?? profiles[0];
        if (!profile) throw new Error("Profile not found.");

        const [accountRes, contactRes] = await Promise.all([
          fetch(`/api/account/handle?userId=${encodeURIComponent(userId)}`, {
            cache: "no-store",
          }),
          fetch(`/api/vcard/profile?userId=${encodeURIComponent(userId)}`, {
            cache: "no-store",
          }),
        ]);
        const accountPayload = accountRes.ok
          ? ((await accountRes.json()) as {
              handle?: string | null;
              displayName?: string | null;
              avatarPath?: string | null;
              avatarUpdatedAt?: string | null;
            })
          : null;
        const contactPayload = contactRes.ok
          ? ((await contactRes.json().catch(() => null)) as {
              fields?: {
                email?: string | null;
                phone?: string | null;
                contactButtonVisible?: boolean;
              };
            } | null)
          : null;
        const contactFields = contactPayload?.fields;
        const contactEnabled = Boolean(
          contactFields?.contactButtonVisible !== false &&
            (contactFields?.email?.trim() || contactFields?.phone?.trim())
        );

        if (!active) return;
        setState({
          loading: false,
          error: null,
          profile,
          account: {
            handle: accountPayload?.handle || profile.handle,
            displayName: accountPayload?.displayName ?? null,
            avatarPath: accountPayload?.avatarPath ?? null,
            avatarUpdatedAt: accountPayload?.avatarUpdatedAt ?? null,
          },
          contactEnabled,
        });
      } catch (err) {
        if (!active) return;
        setState({
          loading: false,
          error: err instanceof Error ? err.message : "Unable to load preview.",
          profile: null,
          account: null,
          contactEnabled: false,
        });
      }
    })();
    return () => {
      active = false;
    };
  }, [handle, supabase]);

  if (!handle) {
    return (
      <div className={`min-h-screen bg-background text-foreground ${requestedThemeClassName}`}>
        <div className="mx-auto max-w-3xl px-6 py-12 text-sm text-muted-foreground">
          Preview unavailable.
        </div>
      </div>
    );
  }

  if (state.loading) {
    return (
      <div className={`min-h-screen bg-background text-foreground ${requestedThemeClassName}`}>
        <PublicProfilePreviewLoader fullscreen />
      </div>
    );
  }

  if (state.error || !state.profile || !state.account) {
    return (
      <div className={`min-h-screen bg-background text-foreground ${requestedThemeClassName}`}>
        <div className="mx-auto max-w-3xl px-6 py-12 text-sm text-muted-foreground">
          {state.error ?? "Profile unavailable."}
        </div>
      </div>
    );
  }

  const { profile, account, contactEnabled } = state;

  return (
    <PublicProfilePreview
      profile={profile}
      account={account}
      handle={handle}
      themeOverride={requestedTheme}
      contactEnabled={contactEnabled}
    />
  );
}

function PublicProfilePreviewPageFallback() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <PublicProfilePreviewLoader fullscreen />
    </div>
  );
}

export default function PublicProfilePreviewPage() {
  return (
    <Suspense fallback={<PublicProfilePreviewPageFallback />}>
      <PublicProfilePreviewPageContent />
    </Suspense>
  );
}
