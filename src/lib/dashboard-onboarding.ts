import "server-only";

import { sanitizeThemeForPlan } from "@/lib/plan-access";
import { getDashboardPlanAccessForUser } from "@/lib/plan-access.server";
import { createServerSupabaseReadonly } from "@/lib/supabase/server";
import { getActiveProfileForUser } from "@/lib/profile-service";
import { isSupabaseAdminAvailable, supabaseAdmin } from "@/lib/supabase-admin";
import type { DashboardOnboardingState } from "@/lib/dashboard-onboarding-types";
import { getConfiguredSiteHost } from "@/lib/site-url";
import { DEFAULT_DASHBOARD_THEME, normalizeThemeName } from "@/lib/themes";

const AUTO_HANDLE_PATTERN = /^user-[0-9a-f]{8}$/i;
const DEFAULT_LINK_HOST = getConfiguredSiteHost();
const SHARE_TEST_EVENTS = [
  "share_contact_success",
  "vcard_download_success",
  "copy_public_link_clicked",
  "open_public_profile_clicked",
] as const;
const DASHBOARD_TOUR_SEEN_EVENTS = [
  "onboarding_walkthrough_started",
  "onboarding_walkthrough_completed",
  "onboarding_walkthrough_dismissed",
  "onboarding_publish_succeeded",
] as const;

function normaliseLinkUrl(url: string | null | undefined) {
  const raw = (url ?? "").trim();
  if (!raw) return "";
  try {
    const parsed = new URL(raw);
    const host = parsed.hostname.toLowerCase().replace(/^www\./, "");
    const path = parsed.pathname.replace(/\/+$/, "");
    return `${host}${path || "/"}`;
  } catch {
    return raw
      .toLowerCase()
      .replace(/^https?:\/\//, "")
      .replace(/^www\./, "")
      .replace(/\/+$/, "");
  }
}

function isMeaningfulLink(url: string | null | undefined) {
  const normalized = normaliseLinkUrl(url);
  if (!normalized) return false;
  return normalized !== DEFAULT_LINK_HOST && normalized !== `${DEFAULT_LINK_HOST}/`;
}

async function countEventsForUser(
  userId: string,
  eventIds: readonly string[]
): Promise<number> {
  const supabase = isSupabaseAdminAvailable
    ? supabaseAdmin
    : await createServerSupabaseReadonly();
  const { count, error } = await supabase
    .from("conversion_events")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .in("event_id", [...eventIds]);
  if (error) {
    if (
      error.message.toLowerCase().includes('relation "conversion_events" does not exist')
    ) {
      return 0;
    }
    throw new Error(error.message);
  }
  return count ?? 0;
}

async function countClaimedLinketsForUser(userId: string): Promise<number> {
  const supabase = await createServerSupabaseReadonly();
  const { count, error } = await supabase
    .from("tag_assignments")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);
  if (error) {
    const message = error.message.toLowerCase();
    if (
      message.includes('relation "tag_assignments" does not exist') ||
      message.includes("permission denied")
    ) {
      return 0;
    }
    throw new Error(error.message);
  }
  return count ?? 0;
}

async function loadAccountState(userId: string) {
  const supabase = await createServerSupabaseReadonly();
  try {
    return await supabase
      .from("profiles")
      .select("display_name, avatar_url, updated_at")
      .eq("user_id", userId)
      .maybeSingle();
  } catch {
    return { data: null, error: null };
  }
}

async function loadContactState(userId: string) {
  const supabase = await createServerSupabaseReadonly();
  try {
    return await supabase
      .from("vcard_profiles")
      .select("full_name, email, phone, company, title, contact_button_visible")
      .eq("user_id", userId)
      .maybeSingle();
  } catch {
    return { data: null, error: null };
  }
}

export async function getDashboardOnboardingState(
  userId: string
): Promise<DashboardOnboardingState> {
  const [
    activeProfile,
    accountResult,
    contactResult,
    publishEventCount,
    shareTestCount,
    dashboardTourEventCount,
    claimedLinketCount,
    planAccess,
  ] =
    await Promise.all([
      getActiveProfileForUser(userId).catch(() => null),
      loadAccountState(userId),
      loadContactState(userId),
      countEventsForUser(userId, ["profile_published"]).catch(() => 0),
      countEventsForUser(userId, SHARE_TEST_EVENTS).catch(() => 0),
      countEventsForUser(userId, DASHBOARD_TOUR_SEEN_EVENTS).catch(() => 0),
      countClaimedLinketsForUser(userId).catch(() => 0),
      getDashboardPlanAccessForUser(userId),
    ]);

  const account = {
    displayName: accountResult.data?.display_name ?? null,
    avatarPath: accountResult.data?.avatar_url ?? null,
    avatarUpdatedAt: accountResult.data?.updated_at ?? null,
  };

  const contact = {
    fullName: contactResult.data?.full_name ?? "",
    email: contactResult.data?.email ?? "",
    phone: contactResult.data?.phone ?? "",
    company: contactResult.data?.company ?? "",
    title: contactResult.data?.title ?? "",
    contactButtonVisible: contactResult.data?.contact_button_visible !== false,
  };

  const fallbackHandle = `user-${userId.slice(0, 8)}`;
  const activeProfileState = {
    id: activeProfile?.id ?? null,
    name: activeProfile?.name ?? account.displayName ?? "",
    handle: activeProfile?.handle ?? fallbackHandle,
    headline: activeProfile?.headline ?? "",
    theme: sanitizeThemeForPlan(
      normalizeThemeName(activeProfile?.theme, DEFAULT_DASHBOARD_THEME),
      planAccess
    ),
    links: activeProfile?.links ?? [],
    isActive: activeProfile?.is_active ?? false,
  };

  const activeLinks = activeProfileState.links.filter((link) => link.is_active);
  const hasMeaningfulLink = activeLinks.some((link) => isMeaningfulLink(link.url));
  const hasContact = Boolean(contact.email.trim() || contact.phone.trim());
  const hasCustomHandle =
    Boolean(activeProfileState.handle.trim()) &&
    !AUTO_HANDLE_PATTERN.test(activeProfileState.handle.trim());
  const hasProfileBasics =
    Boolean(activeProfileState.name.trim()) && hasCustomHandle;
  const hasPublished =
    publishEventCount > 0 ||
    (activeProfileState.isActive && hasProfileBasics && hasContact && hasMeaningfulLink);
  const hasTestedShare = shareTestCount > 0;
  const isLaunchReady = hasProfileBasics && hasContact && hasMeaningfulLink && hasPublished;
  const dashboardTourSeen =
    dashboardTourEventCount > 0 || hasPublished || isLaunchReady;

  return {
    userId,
    requiresOnboarding: !isLaunchReady,
    isLaunchReady,
    hasPublished,
    hasTestedShare,
    dashboardTourSeen,
    publishEventCount,
    shareTestCount,
    claimedLinketCount,
    account,
    contact,
    activeProfile: activeProfileState,
    steps: {
      profile: hasProfileBasics,
      contact: hasContact,
      links: hasMeaningfulLink,
      publish: hasPublished,
      share: hasTestedShare,
    },
  };
}
