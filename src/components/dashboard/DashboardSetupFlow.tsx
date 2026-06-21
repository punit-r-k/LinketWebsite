"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import Link from "next/link";
import {
  Check,
  CheckCircle2,
  Gift,
  Link2,
  Loader2,
  Palette,
  Phone,
  Plus,
  Rocket,
  Trash2,
  UserRound,
  type LucideIcon,
} from "lucide-react";

import AvatarUploader from "@/components/dashboard/AvatarUploader";
import {
  useDashboardPlanAccess,
  useDashboardUser,
} from "@/components/dashboard/DashboardSessionContext";
import { DASHBOARD_THEME_OPTIONS } from "@/components/dashboard/theme-options";
import PhonePreviewCard, {
  type PhonePreviewLinkItem,
} from "@/components/dashboard/public-profile/PhonePreviewCard";
import { toast } from "@/components/system/toaster";
import { useThemeOptional } from "@/components/theme/theme-provider";
import { trackEvent } from "@/lib/analytics";
import { getSignedAvatarUrl } from "@/lib/avatar-client";
import {
  clearPendingDashboardTheme,
  writePendingDashboardTheme,
} from "@/lib/dashboard-theme-pending";
import { getSignedProfileHeaderUrl } from "@/lib/profile-header-client";
import { getSignedProfileLogoUrl } from "@/lib/profile-logo-client";
import type { DashboardOnboardingState } from "@/lib/dashboard-onboarding-types";
import {
  ONBOARDING_LIVE_STATUS_EVENT,
  ONBOARDING_MILESTONE_LABELS,
  ONBOARDING_MILESTONE_NAV_EVENT,
  type OnboardingMilestoneTarget,
} from "@/lib/dashboard-onboarding-milestones";
import type { ProfileWithLinks } from "@/lib/profile-service";
import {
  getConfiguredSiteHost,
  getSiteOrigin,
  toPublicProfileUrl,
} from "@/lib/site-url";
import { normalizePublicLinkUrlInput } from "@/lib/public-link-url";
import {
  isThemeAvailableForPlan,
  sanitizeThemeForPlan,
} from "@/lib/plan-access";
import { scrollPageToTop } from "@/lib/scroll";
import {
  DEFAULT_DASHBOARD_THEME,
  isDarkTheme,
  normalizeThemeName,
  type ThemeName,
} from "@/lib/themes";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SwitchRow } from "@/components/ui/switch-row";
import { Textarea } from "@/components/ui/textarea";
import { useI18n } from "@/components/i18n/LocaleProvider";
import {
  formatClaimCodeDisplay,
  normalizeClaimCodeInput,
} from "@/lib/linket-claim-code";
import type { TagAssignmentDetail } from "@/lib/linket-tags";

type SetupStepId = "profile" | "contact" | "links" | "publish";
type SaveStatus = "idle" | "saving" | "saved" | "error" | "publishing";
type FieldSaveState = "saved" | "saving" | "unsaved" | "error";

type OnboardingLinketClaimResult = {
  title: string;
  description: string;
};

type ProfileLinkDraft = {
  id?: string;
  title: string;
  url: string;
  isActive: boolean;
  isOverride: boolean;
};

type ProfileDraft = {
  id: string;
  name: string;
  handle: string;
  headline: string;
  headerImageUrl: string | null;
  headerImageUpdatedAt: string | null;
  headerImageOriginalFileName: string | null;
  logoUrl: string | null;
  logoUpdatedAt: string | null;
  logoOriginalFileName: string | null;
  logoShape: "circle" | "rect";
  logoBackgroundWhite: boolean;
  links: ProfileLinkDraft[];
  theme: ThemeName;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

type ContactDraft = {
  fullName: string;
  title: string;
  email: string;
  additionalEmails: string[];
  phone: string;
  additionalPhones: string[];
  company: string;
  addressLine1: string;
  addressLine2: string;
  addressCity: string;
  addressRegion: string;
  addressPostal: string;
  addressCountry: string;
  note: string;
  photoData: string | null;
  photoName: string | null;
  contactButtonVisible: boolean;
};

type AccountDraft = {
  handle: string;
  avatarPath: string | null;
  avatarUpdatedAt: string | null;
  avatarOriginalFileName: string | null;
  displayName: string | null;
};

type SetupDraftCache<T> = {
  draft: T;
  savedDraft?: T;
  savedSignature: string;
  updatedAt: string;
};

const AUTO_HANDLE_PATTERN = /^user-[0-9a-f]{8}$/i;
const DEFAULT_LINK_HOST = getConfiguredSiteHost();
const MAX_LINK_ROWS = 5;
const ONBOARDING_COMPLETION_SESSION_KEY_PREFIX =
  "linket:onboarding-complete";
const ONBOARDING_PROFILE_DRAFT_STORAGE_PREFIX =
  "linket:onboarding:profile-draft";
const ONBOARDING_CONTACT_DRAFT_STORAGE_PREFIX =
  "linket:onboarding:contact-draft";
const ONBOARDING_STEP_STORAGE_PREFIX =
  "linket:onboarding:current-step";
const SAVE_RETRY_DELAYS_MS = [1500, 4000, 8000, 15000] as const;
const onboardingTrialDateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
});

function getSaveRetryDelay(attempt: number) {
  return SAVE_RETRY_DELAYS_MS[
    Math.min(Math.max(attempt, 0), SAVE_RETRY_DELAYS_MS.length - 1)
  ];
}

function formatPhoneNumber(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 10);
  if (digits.length <= 3) {
    return digits ? `(${digits}` : "";
  }
  if (digits.length <= 6) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  }
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)} - ${digits.slice(6)}`;
}

function normalizeContactList(values: string[] | null | undefined, primary = "") {
  const seen = new Set<string>();
  const normalizedPrimary = primary.trim().toLowerCase();
  if (normalizedPrimary) seen.add(normalizedPrimary);
  return (values ?? [])
    .map((value) => value.trim())
    .filter((value) => {
      if (!value) return false;
      const key = value.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 5);
}

function formatTrialDate(value: string | null | undefined) {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return onboardingTrialDateFormatter.format(parsed);
}

function getOnboardingCompletionSessionKey(userId: string) {
  return `${ONBOARDING_COMPLETION_SESSION_KEY_PREFIX}:${userId}`;
}

function getOnboardingDraftStorageKey(
  userId: string,
  type: "profile" | "contact"
) {
  return `${
    type === "profile"
      ? ONBOARDING_PROFILE_DRAFT_STORAGE_PREFIX
      : ONBOARDING_CONTACT_DRAFT_STORAGE_PREFIX
  }:${userId}`;
}

function getOnboardingStepStorageKey(userId: string) {
  return `${ONBOARDING_STEP_STORAGE_PREFIX}:${userId}`;
}

function readOnboardingDraftCache<T>(
  userId: string,
  type: "profile" | "contact"
): SetupDraftCache<T> | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(
      getOnboardingDraftStorageKey(userId, type)
    );
    if (!raw) return null;
    return JSON.parse(raw) as SetupDraftCache<T>;
  } catch {
    return null;
  }
}

function writeOnboardingDraftCache<T>(
  userId: string,
  type: "profile" | "contact",
  cache: SetupDraftCache<T>
) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      getOnboardingDraftStorageKey(userId, type),
      JSON.stringify(cache)
    );
  } catch {
    // Ignore storage failures and continue with in-memory draft persistence.
  }
}

function clearOnboardingDraftCache(
  userId: string,
  type: "profile" | "contact"
) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(getOnboardingDraftStorageKey(userId, type));
  } catch {
    // Ignore storage failures.
  }
}

const SETUP_STEPS: Array<{
  id: SetupStepId;
  label: string;
  description: string;
  icon: LucideIcon;
}> = [
  {
    id: "profile",
    label: "Profile",
    description: "Photo, name, public URL, and intro",
    icon: UserRound,
  },
  {
    id: "contact",
    label: "Contact card",
    description: "How people save you",
    icon: Phone,
  },
  {
    id: "links",
    label: "First link",
    description: "Add the main link people should open first",
    icon: Link2,
  },
  {
    id: "publish",
    label: "Review + publish",
    description: "Go live and test once",
    icon: Rocket,
  },
];

function readOnboardingStepIndex(userId: string) {
  if (typeof window === "undefined") return null;
  try {
    const stepId = window.sessionStorage.getItem(
      getOnboardingStepStorageKey(userId)
    );
    if (!stepId) return null;
    const index = SETUP_STEPS.findIndex((step) => step.id === stepId);
    return index >= 0 ? index : null;
  } catch {
    return null;
  }
}

function writeOnboardingStepIndex(userId: string, stepIndex: number) {
  if (typeof window === "undefined") return;
  const stepId = SETUP_STEPS[stepIndex]?.id;
  if (!stepId) return;
  try {
    window.sessionStorage.setItem(getOnboardingStepStorageKey(userId), stepId);
  } catch {
    // Ignore storage failures; inferred setup progress still works.
  }
}

function clearOnboardingStepIndex(userId: string) {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(getOnboardingStepStorageKey(userId));
  } catch {
    // Ignore storage failures.
  }
}

function canPersistOnboardingTheme(theme: ThemeName) {
  return theme === "light" || theme === "dark";
}

function applyDashboardScopeTheme(theme: ThemeName) {
  if (typeof document === "undefined") return;
  const scope = document.getElementById("dashboard-theme-scope");
  if (!scope) return;

  Array.from(scope.classList)
    .filter((className) => className.startsWith("theme-"))
    .forEach((className) => scope.classList.remove(className));
  scope.classList.add(`theme-${theme}`);
  scope.classList.toggle("dark", isDarkTheme(theme));
}

function buildEmptyLink(partial?: Partial<ProfileLinkDraft>): ProfileLinkDraft {
  return {
    title: "",
    url: "",
    isActive: true,
    isOverride: false,
    ...partial,
  };
}

function isAutoHandle(handle: string) {
  return AUTO_HANDLE_PATTERN.test(handle.trim());
}

function sanitizeHandleInput(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

function buildSuggestedHandle(name: string, userId: string) {
  const slug = sanitizeHandleInput(name);
  return slug || `user-${userId.slice(0, 8)}`;
}

function normalizeLinkUrlInput(value: string) {
  return normalizePublicLinkUrlInput(value, {
    addDefaultWww: true,
    emptyValue: "",
  });
}

function normaliseLinkUrl(url: string | null | undefined) {
  const raw = normalizeLinkUrlInput(url ?? "");
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

function isStarterLink(url: string | null | undefined) {
  const normalized = normaliseLinkUrl(url);
  return normalized === DEFAULT_LINK_HOST || normalized === `${DEFAULT_LINK_HOST}/`;
}

function isMeaningfulLink(url: string | null | undefined) {
  const normalized = normaliseLinkUrl(url);
  return Boolean(normalized) && !isStarterLink(url);
}

function deriveLinkTitle(title: string, url: string) {
  const trimmedTitle = title.trim();
  if (trimmedTitle) return trimmedTitle;
  const normalized = normalizeLinkUrlInput(url);
  if (!normalized) return "Website";
  try {
    const host = new URL(normalized).hostname.replace(/^www\./, "");
    const firstLabel = host.split(".")[0] || "Website";
    return firstLabel
      .replace(/[-_]+/g, " ")
      .replace(/\b\w/g, (char) => char.toUpperCase());
  } catch {
    return "Website";
  }
}

function getDeviceType() {
  if (typeof window === "undefined") return "desktop";
  return window.innerWidth < 768 ? "mobile" : "desktop";
}

function buildPublicUrl(handle: string) {
  const normalizedHandle = sanitizeHandleInput(handle);
  if (!normalizedHandle) return "";
  return toPublicProfileUrl(normalizedHandle, getSiteOrigin());
}

function buildPreviewProfile(
  draft: ProfileDraft,
  userId: string
): ProfileWithLinks {
  const now = new Date().toISOString();
  const links = draft.links.reduce<ProfileWithLinks["links"]>((items, link, index) => {
    const normalizedUrl = normalizeLinkUrlInput(link.url);
    if (!normalizedUrl) {
      return items;
    }

    items.push({
      id: link.id || `preview-link-${index}`,
      profile_id: draft.id || "preview-profile",
      user_id: userId,
      title: deriveLinkTitle(link.title, normalizedUrl),
      url: normalizedUrl,
      order_index: index,
      is_active: link.isActive,
      is_override: link.isOverride,
      click_count: 0,
      created_at: now,
      updated_at: now,
    });

    return items;
  }, []);

  return {
    id: draft.id || "preview-profile",
    user_id: userId,
    name: draft.name.trim() || "Your Name",
    handle: sanitizeHandleInput(draft.handle) || `user-${userId.slice(0, 8)}`,
    headline: draft.headline.trim() || null,
    header_image_url: draft.headerImageUrl,
    header_image_updated_at: draft.headerImageUpdatedAt,
    header_image_original_file_name: draft.headerImageOriginalFileName,
    logo_url: draft.logoUrl,
    logo_updated_at: draft.logoUpdatedAt,
    logo_original_file_name: draft.logoOriginalFileName,
    logo_shape: draft.logoShape,
    logo_bg_white: draft.logoBackgroundWhite,
    theme: normalizeThemeName(draft.theme, DEFAULT_DASHBOARD_THEME),
    is_active: true,
    created_at: draft.createdAt || now,
    updated_at: draft.updatedAt || now,
    links,
  };
}

function mapProfileRecord(record: ProfileWithLinks): ProfileDraft {
  return {
    id: record.id,
    name: record.name ?? "",
    handle: record.handle ?? "",
    headline: record.headline ?? "",
    headerImageUrl: record.header_image_url ?? null,
    headerImageUpdatedAt: record.header_image_updated_at ?? null,
    headerImageOriginalFileName: record.header_image_original_file_name ?? null,
    logoUrl: record.logo_url ?? null,
    logoUpdatedAt: record.logo_updated_at ?? null,
    logoOriginalFileName: record.logo_original_file_name ?? null,
    logoShape: record.logo_shape === "rect" ? "rect" : "circle",
    logoBackgroundWhite: Boolean(record.logo_bg_white),
    links:
      record.links?.map((link) => ({
        id: link.id,
        title: link.title ?? "",
        url: link.url ?? "",
        isActive: link.is_active ?? true,
        isOverride: link.is_override ?? false,
      })) ?? [],
    theme: normalizeThemeName(record.theme, DEFAULT_DASHBOARD_THEME),
    active: record.is_active,
    createdAt: record.created_at,
    updatedAt: record.updated_at,
  };
}

function mapContactFields(
  fields: Partial<ContactDraft> | null | undefined,
  fallbackName: string
): ContactDraft {
  return {
    fullName: fields?.fullName?.trim() || fallbackName,
    title: fields?.title ?? "",
    email: fields?.email ?? "",
    additionalEmails: normalizeContactList(
      fields?.additionalEmails,
      fields?.email ?? ""
    ),
    phone: fields?.phone ?? "",
    additionalPhones: normalizeContactList(
      fields?.additionalPhones,
      fields?.phone ?? ""
    ),
    company: fields?.company ?? "",
    addressLine1: fields?.addressLine1 ?? "",
    addressLine2: fields?.addressLine2 ?? "",
    addressCity: fields?.addressCity ?? "",
    addressRegion: fields?.addressRegion ?? "",
    addressPostal: fields?.addressPostal ?? "",
    addressCountry: fields?.addressCountry ?? "",
    note: fields?.note ?? "",
    photoData: fields?.photoData ?? null,
    photoName: fields?.photoName ?? null,
    contactButtonVisible: fields?.contactButtonVisible !== false,
  };
}

function normalizeContactDraftCache(
  cache: SetupDraftCache<ContactDraft> | null,
  fallbackName: string
) {
  if (!cache) return null;
  return {
    ...cache,
    draft: mapContactFields(cache.draft, fallbackName),
    savedDraft: cache.savedDraft
      ? mapContactFields(cache.savedDraft, fallbackName)
      : undefined,
  };
}

function prepareSetupLinks(draft: ProfileDraft, publishEventCount: number) {
  const currentLinks = draft.links.length ? draft.links : [buildEmptyLink()];
  if (
    publishEventCount === 0 &&
    currentLinks.length === 1 &&
    isStarterLink(currentLinks[0].url)
  ) {
    return {
      ...draft,
      links: [buildEmptyLink({ id: currentLinks[0].id })],
    };
  }
  return {
    ...draft,
    links: currentLinks,
  };
}

function mapOnboardingStateProfile(
  state: DashboardOnboardingState
): ProfileDraft {
  const now = new Date().toISOString();
  return prepareSetupLinks(
    {
      id: state.activeProfile.id ?? "preview-profile",
      name: state.activeProfile.name ?? "",
      handle: state.activeProfile.handle ?? "",
      headline: state.activeProfile.headline ?? "",
      headerImageUrl: null,
      headerImageUpdatedAt: null,
      headerImageOriginalFileName: null,
      logoUrl: null,
      logoUpdatedAt: null,
      logoOriginalFileName: null,
      logoShape: "circle",
      logoBackgroundWhite: false,
      links:
        state.activeProfile.links?.map((link) => ({
          id: link.id,
          title: link.title ?? "",
          url: link.url ?? "",
          isActive: link.is_active ?? true,
          isOverride: link.is_override ?? false,
        })) ?? [],
      theme: normalizeThemeName(
        state.activeProfile.theme,
        DEFAULT_DASHBOARD_THEME
      ),
      active: state.activeProfile.isActive,
      createdAt: now,
      updatedAt: now,
    },
    state.publishEventCount
  );
}

function mapOnboardingStateContact(
  state: DashboardOnboardingState,
  fallbackName: string,
  fallbackEmail: string | null
): ContactDraft {
  const mappedContact = mapContactFields(state.contact, fallbackName);
  if (
    !hasContactMethod(mappedContact) &&
    fallbackEmail
  ) {
    return {
      ...mappedContact,
      email: fallbackEmail,
    };
  }
  return mappedContact;
}

function buildProfileSavePayload(draft: ProfileDraft, active: boolean) {
  return {
    id: draft.id,
    name: draft.name.trim(),
    handle: sanitizeHandleInput(draft.handle),
    headline: draft.headline.trim(),
    headerImageUrl: draft.headerImageUrl,
    headerImageUpdatedAt: draft.headerImageUpdatedAt,
    headerImageOriginalFileName: draft.headerImageOriginalFileName,
    logoUrl: draft.logoUrl,
    logoUpdatedAt: draft.logoUpdatedAt,
    logoOriginalFileName: draft.logoOriginalFileName,
    logoShape: draft.logoShape,
    logoBackgroundWhite: draft.logoBackgroundWhite,
    theme: normalizeThemeName(draft.theme, DEFAULT_DASHBOARD_THEME),
    links: draft.links
      .map((link) => {
        const normalizedUrl = normalizeLinkUrlInput(link.url);
        if (!normalizedUrl) return null;
        return {
          id: link.id,
          title: deriveLinkTitle(link.title, normalizedUrl),
          url: normalizedUrl,
          isActive: link.isActive,
          isOverride: link.isOverride,
        };
      })
      .filter((link): link is NonNullable<typeof link> => Boolean(link)),
    active,
  };
}

function buildProfileDraftSignature(draft: ProfileDraft | null) {
  if (!draft) return "";
  return JSON.stringify(buildProfileSavePayload(draft, false));
}

function buildContactPayload(contact: ContactDraft, fallbackName: string) {
  return {
    fields: {
      ...contact,
      fullName: contact.fullName.trim() || fallbackName.trim(),
      title: contact.title.trim(),
      email: contact.email.trim(),
      additionalEmails: normalizeContactList(
        contact.additionalEmails,
        contact.email
      ),
      phone: contact.phone.trim(),
      additionalPhones: normalizeContactList(
        contact.additionalPhones,
        contact.phone
      ),
      company: contact.company.trim(),
      addressLine1: contact.addressLine1.trim(),
      addressLine2: contact.addressLine2.trim(),
      addressCity: contact.addressCity.trim(),
      addressRegion: contact.addressRegion.trim(),
      addressPostal: contact.addressPostal.trim(),
      addressCountry: contact.addressCountry.trim(),
      note: contact.note.trim(),
      photoData: contact.photoData,
      photoName: contact.photoName,
      contactButtonVisible: contact.contactButtonVisible !== false,
    },
  };
}

function buildContactDraftSignature(
  contact: ContactDraft | null,
  fallbackName: string
) {
  if (!contact) return "";
  return JSON.stringify(buildContactPayload(contact, fallbackName));
}

function getDraftLinkFieldKey(link: ProfileLinkDraft, index: number) {
  return link.id ?? `draft-link-${index}`;
}

function getInitialStepIndex(input: {
  profileComplete: boolean;
  contactComplete: boolean;
  linksComplete: boolean;
}) {
  if (!input.profileComplete) return getSetupStepIndex("profile");
  if (!input.contactComplete) return getSetupStepIndex("contact");
  if (!input.linksComplete) return getSetupStepIndex("links");
  return getSetupStepIndex("publish");
}

function getSetupStepIndex(stepId: SetupStepId) {
  const index = SETUP_STEPS.findIndex((step) => step.id === stepId);
  return index >= 0 ? index : 0;
}

function hasContactMethod(
  contact: Partial<ContactDraft> | null | undefined
) {
  return Boolean(
    contact?.email?.trim() ||
      contact?.phone?.trim() ||
      contact?.additionalEmails?.some((value) => value.trim()) ||
      contact?.additionalPhones?.some((value) => value.trim())
  );
}

function isAccountSeededContact(
  fields: Partial<ContactDraft> | null | undefined,
  fallbackEmail: string | null
) {
  return !hasContactMethod(fields) && Boolean(fallbackEmail?.trim());
}

function normalizeComparableText(value: string | null | undefined) {
  return (value ?? "").trim();
}

function areComparableValuesDifferent(
  current: string | null | undefined,
  saved: string | null | undefined
) {
  return normalizeComparableText(current) !== normalizeComparableText(saved);
}

function areComparableListsDifferent(
  current: string[] | null | undefined,
  saved: string[] | null | undefined
) {
  const currentValues = normalizeContactList(current);
  const savedValues = normalizeContactList(saved);
  if (currentValues.length !== savedValues.length) return true;
  return currentValues.some((value, index) => value !== savedValues[index]);
}

function areComparableUrlsDifferent(
  current: string | null | undefined,
  saved: string | null | undefined
) {
  return normalizeLinkUrlInput(current ?? "") !== normalizeLinkUrlInput(saved ?? "");
}

function getFieldSaveState(input: {
  dirty: boolean;
  saveStatus: SaveStatus;
  hasError?: boolean;
}): FieldSaveState {
  if (!input.dirty) return "saved";
  if (input.hasError || input.saveStatus === "error") return "error";
  if (input.saveStatus === "saving" || input.saveStatus === "publishing") {
    return "saving";
  }
  return "unsaved";
}

function FieldSavePill({
  state,
  showSaved = false,
}: {
  state: FieldSaveState;
  showSaved?: boolean;
}) {
  if (state === "saved" && !showSaved) return null;

  const toneClassName =
    state === "error"
      ? "border-red-500/35 bg-red-500/10 text-red-700 dark:text-red-200"
      : state === "saving"
        ? "border-foreground/15 bg-foreground/10 text-foreground"
        : state === "unsaved"
          ? "border-amber-500/35 bg-amber-500/10 text-amber-700 dark:text-amber-200"
          : "border-emerald-500/35 bg-emerald-500/12 text-emerald-700 dark:text-emerald-200";

  const label =
    state === "error"
      ? "Not saved"
      : state === "saving"
        ? "Saving"
        : state === "unsaved"
          ? "Unsaved"
          : "Saved";

  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em]",
        toneClassName
      )}
    >
      {state === "saving" ? (
        <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
      ) : (
        <span
          className={cn(
            "h-1.5 w-1.5 rounded-full",
            state === "error"
              ? "bg-red-600 dark:bg-red-300"
              : state === "unsaved"
                ? "bg-amber-600 dark:bg-amber-300"
                : "bg-emerald-600 dark:bg-emerald-300"
          )}
          aria-hidden="true"
        />
      )}
      {label}
    </span>
  );
}

export default function DashboardSetupFlow({
  initialOnboardingState,
  previewMode = false,
}: {
  initialOnboardingState: DashboardOnboardingState;
  previewMode?: boolean;
}) {
  const { ui } = useI18n();
  const user = useDashboardUser();
  const planAccess = useDashboardPlanAccess();
  const { theme: dashboardTheme, setTheme } = useThemeOptional();
  const userId = user?.id ?? null;
  const userEmail = user?.email ?? null;
  const previewProfileDraft = useMemo(
    () => mapOnboardingStateProfile(initialOnboardingState),
    [initialOnboardingState]
  );
  const previewContactDraft = useMemo(
    () =>
      mapOnboardingStateContact(
        initialOnboardingState,
        previewProfileDraft.name,
        userEmail
      ),
    [initialOnboardingState, previewProfileDraft.name, userEmail]
  );
  const [loading, setLoading] = useState(!previewMode);
  const [profileDraft, setProfileDraft] = useState<ProfileDraft | null>(
    previewMode ? previewProfileDraft : null
  );
  const [contactDraft, setContactDraft] = useState<ContactDraft | null>(
    previewMode ? previewContactDraft : null
  );
  const [account, setAccount] = useState<AccountDraft>({
    handle: initialOnboardingState.activeProfile.handle,
    avatarPath: initialOnboardingState.account.avatarPath,
    avatarUpdatedAt: initialOnboardingState.account.avatarUpdatedAt,
    avatarOriginalFileName: null,
    displayName: initialOnboardingState.account.displayName,
  });
  const [avatarPreviewUrl, setAvatarPreviewUrl] = useState<string | null>(null);
  const [headerPreviewUrl, setHeaderPreviewUrl] = useState<string | null>(null);
  const [logoPreviewUrl, setLogoPreviewUrl] = useState<string | null>(null);
  const [currentStepIndex, setCurrentStepIndex] = useState(
    getInitialStepIndex({
      profileComplete: initialOnboardingState.steps.profile,
      contactComplete: initialOnboardingState.steps.contact,
      linksComplete: initialOnboardingState.steps.links,
    })
  );
  const [contactRequiresReview, setContactRequiresReview] = useState(false);
  const [profileSaveStatus, setProfileSaveStatus] = useState<SaveStatus>("idle");
  const [contactSaveStatus, setContactSaveStatus] = useState<SaveStatus>("idle");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [handleError, setHandleError] = useState<string | null>(null);
  const [stepError, setStepError] = useState<string | null>(null);
  const [showLaunchHub, setShowLaunchHub] = useState(
    !initialOnboardingState.requiresOnboarding && initialOnboardingState.isLaunchReady
  );
  const [publishedThisSession, setPublishedThisSession] = useState(
    !initialOnboardingState.requiresOnboarding && initialOnboardingState.isLaunchReady
  );
  const [shareTestComplete, setShareTestComplete] = useState(
    initialOnboardingState.hasTestedShare
  );
  const [handleTouched, setHandleTouched] = useState(true);
  const [qrOpen, setQrOpen] = useState(false);
  const [showContactExtras, setShowContactExtras] = useState(false);
  const [showPhoneField, setShowPhoneField] = useState(false);
  const [avatarSaveState, setAvatarSaveState] = useState<FieldSaveState>("saved");
  const [themePreview, setThemePreview] = useState<ThemeName | null>(null);
  const [linketClaimCode, setLinketClaimCode] = useState("");
  const [linketClaiming, setLinketClaiming] = useState(false);
  const [linketClaimError, setLinketClaimError] = useState<string | null>(null);
  const [linketClaimResult, setLinketClaimResult] =
    useState<OnboardingLinketClaimResult | null>(null);
  const [completedSetupSteps, setCompletedSetupSteps] = useState<
    Record<SetupStepId, boolean>
  >({
    profile: false,
    contact: false,
    links: false,
    publish: false,
  });
  const [expandedLinkTitleEditors, setExpandedLinkTitleEditors] = useState<
    Record<string, boolean>
  >({});

  const setupStartedAtRef = useRef(Date.now());
  const profileDraftRef = useRef<ProfileDraft | null>(null);
  const contactDraftRef = useRef<ContactDraft | null>(null);
  const savedProfileDraftRef = useRef<ProfileDraft | null>(null);
  const savedContactDraftRef = useRef<ContactDraft | null>(null);
  const savedProfileSignatureRef = useRef("");
  const savedContactSignatureRef = useRef("");
  const profileSavePromiseRef = useRef<Promise<ProfileDraft | null> | null>(null);
  const contactSavePromiseRef = useRef<Promise<ContactDraft | null> | null>(null);
  const queuedProfileSaveRef = useRef(false);
  const queuedContactSaveRef = useRef(false);
  const profileRetryAttemptRef = useRef(0);
  const contactRetryAttemptRef = useRef(0);
  const lastProfileThemeRef = useRef<ThemeName | null>(null);
  const themePreviewRef = useRef<ThemeName | null>(null);
  const themeSaveTimerRef = useRef<number | null>(null);
  const startedTrackingRef = useRef(false);
  const lastStepViewRef = useRef<SetupStepId | null>(null);
  const currentStepIndexRef = useRef(currentStepIndex);
  const completedSetupStepsRef = useRef(completedSetupSteps);
  const showLaunchHubRef = useRef(showLaunchHub || publishedThisSession);
  const exitTrackingRef = useRef(false);

  const profileDraftSignature = useMemo(
    () => buildProfileDraftSignature(profileDraft),
    [profileDraft]
  );
  const contactDraftSignature = useMemo(
    () => buildContactDraftSignature(contactDraft, profileDraft?.name ?? ""),
    [contactDraft, profileDraft?.name]
  );
  const selectedOnboardingThemeForScope = sanitizeThemeForPlan(
    profileDraft?.theme ?? initialOnboardingState.activeProfile.theme,
    planAccess
  );
  const activeOnboardingThemeForScope =
    themePreview !== null && !canPersistOnboardingTheme(themePreview)
      ? themePreview
      : selectedOnboardingThemeForScope;

  useLayoutEffect(() => {
    applyDashboardScopeTheme(activeOnboardingThemeForScope);
    return () => {
      applyDashboardScopeTheme(dashboardTheme);
    };
  }, [activeOnboardingThemeForScope, dashboardTheme]);

  useEffect(() => {
    profileDraftRef.current = profileDraft;
  }, [profileDraft]);

  useEffect(() => {
    contactDraftRef.current = contactDraft;
  }, [contactDraft]);

  useEffect(() => {
    themePreviewRef.current = themePreview;
  }, [themePreview]);

  useEffect(() => {
    currentStepIndexRef.current = currentStepIndex;
  }, [currentStepIndex]);

  useEffect(() => {
    completedSetupStepsRef.current = completedSetupSteps;
  }, [completedSetupSteps]);

  useEffect(() => {
    showLaunchHubRef.current = showLaunchHub || publishedThisSession;
  }, [publishedThisSession, showLaunchHub]);

  useEffect(() => {
    if (!contactDraft) return;
    if (contactDraft.title.trim() || contactDraft.company.trim()) {
      setShowContactExtras(true);
    }
  }, [contactDraft]);

  useEffect(() => {
    if (!contactDraft) return;
    if (
      contactDraft.phone.trim() ||
      contactDraft.additionalPhones.some((phone) => phone.trim())
    ) {
      setShowPhoneField(true);
    }
  }, [contactDraft]);

  useEffect(() => {
    let active = true;
    (async () => {
      if (!account.avatarPath) {
        if (active) setAvatarPreviewUrl(null);
        return;
      }
      const signed = await getSignedAvatarUrl(
        account.avatarPath,
        account.avatarUpdatedAt
      );
      if (active) setAvatarPreviewUrl(signed);
    })();
    return () => {
      active = false;
    };
  }, [account.avatarPath, account.avatarUpdatedAt]);

  useEffect(() => {
    let active = true;
    (async () => {
      if (!profileDraft?.headerImageUrl) {
        if (active) setHeaderPreviewUrl(null);
        return;
      }
      const signed = await getSignedProfileHeaderUrl(
        profileDraft.headerImageUrl,
        profileDraft.headerImageUpdatedAt
      );
      if (active) setHeaderPreviewUrl(signed);
    })();
    return () => {
      active = false;
    };
  }, [profileDraft?.headerImageUpdatedAt, profileDraft?.headerImageUrl]);

  useEffect(() => {
    let active = true;
    (async () => {
      if (!profileDraft?.logoUrl) {
        if (active) setLogoPreviewUrl(null);
        return;
      }
      const signed = await getSignedProfileLogoUrl(
        profileDraft.logoUrl,
        profileDraft.logoUpdatedAt
      );
      if (active) setLogoPreviewUrl(signed);
    })();
    return () => {
      active = false;
    };
  }, [profileDraft?.logoUpdatedAt, profileDraft?.logoUrl]);

  useEffect(() => {
    if (!previewMode) return;
    setProfileDraft(previewProfileDraft);
    setContactDraft(previewContactDraft);
    setContactRequiresReview(false);
    setHandleTouched(!isAutoHandle(previewProfileDraft.handle));
    savedProfileDraftRef.current = previewProfileDraft;
    savedContactDraftRef.current = previewContactDraft;
    savedProfileSignatureRef.current =
      buildProfileDraftSignature(previewProfileDraft);
    savedContactSignatureRef.current = buildContactDraftSignature(
      previewContactDraft,
      previewProfileDraft.name
    );
    setTheme(previewProfileDraft.theme);
    setLoading(false);
  }, [previewContactDraft, previewMode, previewProfileDraft, setTheme]);

  useEffect(() => {
    if (!profileDraft) return;
    const nextTheme = sanitizeThemeForPlan(profileDraft.theme, planAccess);
    if (nextTheme === profileDraft.theme) return;

    setProfileDraft((current) =>
      current
        ? {
            ...current,
            theme: nextTheme,
            updatedAt: new Date().toISOString(),
          }
        : current
    );
    writePendingDashboardTheme(nextTheme);
    setTheme(nextTheme);
  }, [planAccess, profileDraft, setTheme]);

  useEffect(() => {
    if (previewMode) return;
    if (!userId) return;
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      try {
        const [profilesRes, accountRes, contactRes] = await Promise.all([
          fetch(`/api/linket-profiles?userId=${encodeURIComponent(userId)}`, {
            cache: "no-store",
          }),
          fetch(`/api/account/handle?userId=${encodeURIComponent(userId)}`, {
            cache: "no-store",
          }),
          fetch(`/api/vcard/profile?userId=${encodeURIComponent(userId)}`, {
            cache: "no-store",
          }),
        ]);

        if (!profilesRes.ok) {
          const info = await profilesRes.json().catch(() => ({}));
          throw new Error(info?.error || "Unable to load your public profile.");
        }

        const profiles = (await profilesRes.json()) as ProfileWithLinks[];
        const activeProfile =
          profiles.find((profile) => profile.is_active) ?? profiles[0];
        if (!activeProfile) {
          throw new Error("We couldn't create your starter profile.");
        }

        const accountPayload = accountRes.ok
          ? ((await accountRes.json().catch(() => ({}))) as {
              handle?: string | null;
              avatarPath?: string | null;
              avatarUpdatedAt?: string | null;
              avatarOriginalFileName?: string | null;
              displayName?: string | null;
            })
          : {};
        const contactPayload = contactRes.ok
          ? ((await contactRes.json().catch(() => ({}))) as {
              fields?: Partial<ContactDraft>;
            })
          : {};

        const mappedProfile = prepareSetupLinks(
          mapProfileRecord(activeProfile),
          initialOnboardingState.publishEventCount
        );
        const mappedContact = mapContactFields(
          contactPayload.fields,
          mappedProfile.name
        );
        const contactSeededFromAccount = isAccountSeededContact(
          contactPayload.fields,
          userEmail
        );
        const seededContact =
          contactSeededFromAccount
            ? { ...mappedContact, email: userEmail ?? "" }
            : mappedContact;
        const localProfileDraft = readOnboardingDraftCache<ProfileDraft>(
          userId,
          "profile"
        );
        const rawLocalContactDraft = readOnboardingDraftCache<ContactDraft>(
          userId,
          "contact"
        );
        const localProfileDirty = Boolean(
          localProfileDraft &&
            buildProfileDraftSignature(localProfileDraft.draft) !==
              localProfileDraft.savedSignature
        );
        const nextProfile =
          localProfileDirty && localProfileDraft
            ? localProfileDraft.draft
            : mappedProfile;
        const localContactDraft = normalizeContactDraftCache(
          rawLocalContactDraft,
          nextProfile.name
        );
        const localContactDirty = Boolean(
          localContactDraft &&
            buildContactDraftSignature(
              localContactDraft.draft,
              nextProfile.name
            ) !== localContactDraft.savedSignature
        );
        const nextContact =
          localContactDirty && localContactDraft
            ? localContactDraft.draft
            : seededContact;
        const nextContactRequiresReview =
          !localContactDirty && contactSeededFromAccount;

        if (cancelled) return;

        setProfileDraft(nextProfile);
        setContactDraft(nextContact);
        setContactRequiresReview(nextContactRequiresReview);
        setAccount({
          handle:
            accountPayload.handle?.trim() ||
            nextProfile.handle ||
            initialOnboardingState.activeProfile.handle,
          avatarPath:
            accountPayload.avatarPath ??
            initialOnboardingState.account.avatarPath ??
            null,
          avatarUpdatedAt:
            accountPayload.avatarUpdatedAt ??
            initialOnboardingState.account.avatarUpdatedAt ??
            null,
          avatarOriginalFileName: accountPayload.avatarOriginalFileName ?? null,
          displayName:
            accountPayload.displayName ??
            initialOnboardingState.account.displayName ??
            null,
        });
        setHandleTouched(!isAutoHandle(nextProfile.handle));
        savedProfileDraftRef.current = localProfileDirty
          ? localProfileDraft?.savedDraft ?? mappedProfile
          : nextProfile;
        savedContactDraftRef.current = localContactDirty
          ? localContactDraft?.savedDraft ?? seededContact
          : nextContact;
        savedProfileSignatureRef.current = localProfileDirty
          ? localProfileDraft?.savedSignature ?? buildProfileDraftSignature(mappedProfile)
          : buildProfileDraftSignature(nextProfile);
        savedContactSignatureRef.current = buildContactDraftSignature(
          localContactDirty ? seededContact : nextContact,
          nextProfile.name
        );
        setTheme(nextProfile.theme);
        const inferredStepIndex = getInitialStepIndex({
          profileComplete:
            Boolean(nextProfile.name.trim()) &&
            !isAutoHandle(nextProfile.handle),
          contactComplete:
            hasContactMethod(nextContact) && !nextContactRequiresReview,
          linksComplete: nextProfile.links.some((link) =>
            isMeaningfulLink(link.url)
          ),
        });
        setCurrentStepIndex(
          readOnboardingStepIndex(userId) ?? inferredStepIndex
        );
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Unable to load your setup flow.";
        const localProfileDraft = readOnboardingDraftCache<ProfileDraft>(
          userId,
          "profile"
        );
        const rawLocalContactDraft = readOnboardingDraftCache<ContactDraft>(
          userId,
          "contact"
        );
        const localProfileDirty = Boolean(
          localProfileDraft &&
            buildProfileDraftSignature(localProfileDraft.draft) !==
              localProfileDraft.savedSignature
        );
        const fallbackProfile = localProfileDraft?.draft ?? null;
        const localContactDraft = normalizeContactDraftCache(
          rawLocalContactDraft,
          fallbackProfile?.name ?? ""
        );
        const localContactDirty = Boolean(
          localContactDraft &&
            buildContactDraftSignature(
              localContactDraft.draft,
              fallbackProfile?.name ?? ""
            ) !== localContactDraft.savedSignature
        );
        const fallbackContact =
          localContactDraft?.draft ??
          (fallbackProfile
            ? mapOnboardingStateContact(
                initialOnboardingState,
                fallbackProfile.name,
                userEmail
              )
            : null);
        const fallbackContactRequiresReview =
          !localContactDirty &&
          !localContactDraft &&
          isAccountSeededContact(initialOnboardingState.contact, userEmail);

        if (fallbackProfile && fallbackContact) {
          setProfileDraft(fallbackProfile);
          setContactDraft(fallbackContact);
          setContactRequiresReview(fallbackContactRequiresReview);
          setHandleTouched(!isAutoHandle(fallbackProfile.handle));
          savedProfileDraftRef.current = localProfileDirty
            ? localProfileDraft?.savedDraft ?? null
            : fallbackProfile;
          savedContactDraftRef.current = localContactDirty
            ? localContactDraft?.savedDraft ?? null
            : fallbackContact;
          savedProfileSignatureRef.current =
            localProfileDraft?.savedSignature ??
            buildProfileDraftSignature(fallbackProfile);
          savedContactSignatureRef.current =
            localContactDraft?.savedSignature ??
            buildContactDraftSignature(fallbackContact, fallbackProfile.name);
          setTheme(fallbackProfile.theme);
          const inferredStepIndex = getInitialStepIndex({
            profileComplete:
              Boolean(fallbackProfile.name.trim()) &&
              !isAutoHandle(fallbackProfile.handle),
            contactComplete:
              hasContactMethod(fallbackContact) &&
              !fallbackContactRequiresReview,
            linksComplete: fallbackProfile.links.some((link) =>
              isMeaningfulLink(link.url)
            ),
          });
          setCurrentStepIndex(
            readOnboardingStepIndex(userId) ?? inferredStepIndex
          );
          setSaveError(message);
        } else {
          setSaveError(message);
          toast({
            title: "Setup unavailable",
            description: message,
            variant: "destructive",
          });
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [
    initialOnboardingState,
    initialOnboardingState.account.avatarPath,
    initialOnboardingState.account.avatarUpdatedAt,
    initialOnboardingState.account.displayName,
    initialOnboardingState.activeProfile.handle,
    initialOnboardingState.publishEventCount,
    setTheme,
    userEmail,
    userId,
    previewMode,
  ]);

  const liveProfileReady =
    Boolean(profileDraft?.name.trim()) &&
    Boolean(profileDraft?.handle.trim()) &&
    !isAutoHandle(profileDraft?.handle ?? "");
  const contactReady = hasContactMethod(contactDraft);
  const contactStepComplete = contactReady && !contactRequiresReview;
  const linksReady = Boolean(
    profileDraft?.links.some((link) => isMeaningfulLink(link.url))
  );
  const publishReady = initialOnboardingState.hasPublished || publishedThisSession;

  useEffect(() => {
    if (typeof window === "undefined") return;

    window.dispatchEvent(
      new CustomEvent(ONBOARDING_LIVE_STATUS_EVENT, {
        detail: {
          visible: showLaunchHub || publishedThisSession,
          profileReady: liveProfileReady,
          contactReady: contactStepComplete,
          linksReady,
          publishReady,
        },
      })
    );

    return () => {
      window.dispatchEvent(
        new CustomEvent(ONBOARDING_LIVE_STATUS_EVENT, {
          detail: { visible: false },
        })
      );
    };
  }, [
    contactStepComplete,
    linksReady,
    liveProfileReady,
    publishReady,
    publishedThisSession,
    showLaunchHub,
  ]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const handleMilestoneNavigation = (event: Event) => {
      const target = (
        event as CustomEvent<{ target?: OnboardingMilestoneTarget }>
      ).detail?.target;

      if (!target) return;
      setShowLaunchHub(false);
      setCurrentStepIndex(getSetupStepIndex(target));
      setStepError(null);
      scrollPageToTop({ behavior: "smooth" });
    };

    window.addEventListener(
      ONBOARDING_MILESTONE_NAV_EVENT,
      handleMilestoneNavigation
    );
    return () => {
      window.removeEventListener(
        ONBOARDING_MILESTONE_NAV_EVENT,
        handleMilestoneNavigation
      );
    };
  }, []);

  const previewProfile = useMemo(() => {
    if (!profileDraft || !userId) return null;
    return buildPreviewProfile(profileDraft, userId);
  }, [profileDraft, userId]);

  const publicUrl = useMemo(
    () => buildPublicUrl(profileDraft?.handle ?? account.handle),
    [account.handle, profileDraft?.handle]
  );

  const savedProfileDraft = savedProfileDraftRef.current;
  const savedContactDraft = savedContactDraftRef.current;
  const profileHasUnsavedChanges =
    profileDraftSignature !== savedProfileSignatureRef.current;
  const contactHasUnsavedChanges =
    contactDraftSignature !== savedContactSignatureRef.current;
  const handleIsDirty = areComparableValuesDifferent(
    profileDraft?.handle,
    savedProfileDraft?.handle
  );
  const handleStatus = useMemo(() => {
    const slug = profileDraft?.handle.trim() ?? "";
    if (!slug) {
      return {
        label: "Pick your link",
        className: "text-muted-foreground",
      };
    }
    if (handleError) {
      return {
        label: "Unavailable",
        className: "text-red-600",
      };
    }
    if (isAutoHandle(slug)) {
      return {
        label: "Pick a short link",
        className: "text-amber-700",
      };
    }
    if (!handleTouched && handleIsDirty) {
      return null;
    }
    if (profileSaveStatus === "saving" && handleIsDirty) {
      return {
        label: "Checking availability",
        className: "text-muted-foreground",
      };
    }
    if (handleIsDirty) {
      return null;
    }
    return {
      label: "Available",
      className: "text-emerald-700",
    };
  }, [
    handleError,
    handleIsDirty,
    handleTouched,
    profileDraft?.handle,
    profileSaveStatus,
  ]);

  useEffect(() => {
    if (previewMode || !userId || !profileDraft) return;
    if (!profileHasUnsavedChanges) {
      clearOnboardingDraftCache(userId, "profile");
      return;
    }
    writeOnboardingDraftCache(userId, "profile", {
      draft: profileDraft,
      savedDraft: savedProfileDraftRef.current ?? undefined,
      savedSignature: savedProfileSignatureRef.current,
      updatedAt: new Date().toISOString(),
    });
  }, [previewMode, profileDraft, profileHasUnsavedChanges, userId]);

  useEffect(() => {
    if (previewMode || !userId || !contactDraft || !profileDraft) return;
    if (!contactHasUnsavedChanges) {
      clearOnboardingDraftCache(userId, "contact");
      return;
    }
    writeOnboardingDraftCache(userId, "contact", {
      draft: contactDraft,
      savedDraft: savedContactDraftRef.current ?? undefined,
      savedSignature: savedContactSignatureRef.current,
      updatedAt: new Date().toISOString(),
    });
  }, [
    contactDraft,
    contactHasUnsavedChanges,
    previewMode,
    profileDraft,
    userId,
  ]);

  const trackingMeta = (extra?: Record<string, unknown>) => ({
    source: "dashboard_get_started",
    device_type: getDeviceType(),
    elapsed_ms: Date.now() - setupStartedAtRef.current,
    handle: sanitizeHandleInput(profileDraftRef.current?.handle ?? ""),
    link_count:
      profileDraftRef.current?.links.filter((link) => isMeaningfulLink(link.url))
        .length ?? 0,
    ...extra,
  });

  useEffect(() => {
    if (loading || startedTrackingRef.current) return;
    startedTrackingRef.current = true;
    void trackEvent(
      "onboarding_started",
      trackingMeta({
        initial_step: SETUP_STEPS[currentStepIndex]?.id ?? "profile",
        step_count: SETUP_STEPS.length,
        claimed_linkets: initialOnboardingState.claimedLinketCount,
      })
    );
  }, [currentStepIndex, initialOnboardingState.claimedLinketCount, loading]);

  useEffect(() => {
    if (loading) return;
    const stepId = SETUP_STEPS[currentStepIndex]?.id;
    if (!stepId || lastStepViewRef.current === stepId) return;
    lastStepViewRef.current = stepId;
    void trackEvent(
      "onboarding_step_viewed",
      trackingMeta({
        step_id: stepId,
        step_index: currentStepIndex + 1,
        step_count: SETUP_STEPS.length,
      })
    );
  }, [currentStepIndex, loading]);

  useEffect(() => {
    if (previewMode || loading || !userId || showLaunchHub) return;
    writeOnboardingStepIndex(userId, currentStepIndex);
  }, [currentStepIndex, loading, previewMode, showLaunchHub, userId]);

  useEffect(() => {
    if (previewMode || loading || !userId) return;

    const trackExit = () => {
      if (exitTrackingRef.current || showLaunchHubRef.current) return;
      exitTrackingRef.current = true;

      const stepIndex = currentStepIndexRef.current;
      const stepId = SETUP_STEPS[stepIndex]?.id ?? "profile";
      const completedStepIds = Object.entries(completedSetupStepsRef.current)
        .filter(([, completed]) => completed)
        .map(([id]) => id);

      void trackEvent(
        "onboarding_exited",
        trackingMeta({
          current_step: stepId,
          current_step_index: stepIndex,
          step_count: SETUP_STEPS.length,
          completed_step_ids: completedStepIds,
        })
      );
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        trackExit();
      }
    };

    window.addEventListener("pagehide", trackExit);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      window.removeEventListener("pagehide", trackExit);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [loading, previewMode, userId]);

  const saveProfileDraft = useCallback(
    async function saveProfileDraftImpl(options?: {
      publish?: boolean;
      quiet?: boolean;
    }) {
      const draft = profileDraftRef.current;
      if (!draft || !userId) return null;

      const publish = Boolean(options?.publish);
      const quiet = Boolean(options?.quiet);
      const nextSignature = buildProfileDraftSignature(draft);

      if (!publish && nextSignature === savedProfileSignatureRef.current) {
        profileRetryAttemptRef.current = 0;
        setProfileSaveStatus("saved");
        return draft;
      }

      if (profileSavePromiseRef.current) {
        await profileSavePromiseRef.current;
        if (!publish) {
          const refreshedDraft = profileDraftRef.current;
          if (
            refreshedDraft &&
            buildProfileDraftSignature(refreshedDraft) ===
              savedProfileSignatureRef.current
          ) {
            return refreshedDraft;
          }
        }
      }

      const request = (async () => {
        const requestedTheme = draft.theme;
        setProfileSaveStatus(publish ? "publishing" : "saving");
        setSaveError(null);
        setHandleError(null);
        try {
          const response = await fetch("/api/linket-profiles", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              userId,
              profile: buildProfileSavePayload(draft, publish),
            }),
          });

          if (!response.ok) {
            const info = await response.json().catch(() => ({}));
            const suggestions = Array.isArray(info?.suggestions)
              ? info.suggestions
              : [];
            const hint = suggestions.length
              ? ` Try ${suggestions.join(", ")}.`
              : "";
            const message = `${info?.error || "Unable to save your page."}${hint}`;
            if (response.status === 409) {
              setHandleError(message);
            }
            throw new Error(message);
          }

          const savedRecord = mapProfileRecord(
            (await response.json()) as ProfileWithLinks
          );
          savedProfileDraftRef.current = savedRecord;
          savedProfileSignatureRef.current =
            buildProfileDraftSignature(savedRecord);
          profileRetryAttemptRef.current = 0;
          setProfileSaveStatus("saved");
          clearOnboardingDraftCache(userId, "profile");
          if (savedRecord.theme === requestedTheme) {
            clearPendingDashboardTheme();
          }
          if (
            publish ||
            (!themePreviewRef.current &&
              profileDraftRef.current?.theme === requestedTheme)
          ) {
            setTheme(savedRecord.theme);
          }
          setAccount((current) => ({
            ...current,
            handle: savedRecord.handle,
          }));

          if (typeof window !== "undefined") {
            window.dispatchEvent(
              new CustomEvent("linket:handle-updated", {
                detail: { handle: savedRecord.handle },
              })
            );
          }

          if (
            buildProfileDraftSignature(profileDraftRef.current) ===
              nextSignature ||
            publish
          ) {
            setProfileDraft(savedRecord);
          }

          return savedRecord;
        } catch (error) {
          const message =
            error instanceof Error ? error.message : "Unable to save your page.";
          setProfileSaveStatus("error");
          setSaveError(message);
          if (profileDraftRef.current?.theme === requestedTheme) {
            clearPendingDashboardTheme();
          }
          if (!quiet) {
            toast({
              title: publish ? "Publish failed" : "Save failed",
              description: message,
              variant: "destructive",
            });
          }
          return null;
        }
      })();

      profileSavePromiseRef.current = request;
      try {
        return await request;
      } finally {
        profileSavePromiseRef.current = null;
        if (!publish && queuedProfileSaveRef.current) {
          queuedProfileSaveRef.current = false;
          void saveProfileDraftImpl({ quiet: true });
        }
      }
    },
    [setTheme, userId]
  );

  const saveContactDraft = useCallback(
    async function saveContactDraftImpl(options?: {
      quiet?: boolean;
      force?: boolean;
    }) {
      const draft = contactDraftRef.current;
      const fallbackName = profileDraftRef.current?.name ?? "";
      if (!draft || !userId) return null;

      const nextSignature = buildContactDraftSignature(draft, fallbackName);
      if (!options?.force && nextSignature === savedContactSignatureRef.current) {
        contactRetryAttemptRef.current = 0;
        setContactSaveStatus("saved");
        return draft;
      }

      if (contactSavePromiseRef.current) {
        await contactSavePromiseRef.current;
        const refreshed = contactDraftRef.current;
        if (
          refreshed &&
          buildContactDraftSignature(
            refreshed,
            profileDraftRef.current?.name ?? ""
          ) === savedContactSignatureRef.current
        ) {
          return refreshed;
        }
      }

      const request = (async () => {
        setContactSaveStatus("saving");
        setSaveError(null);
        try {
          const response = await fetch("/api/vcard/profile", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              userId,
              ...buildContactPayload(draft, fallbackName),
            }),
          });

          if (!response.ok) {
            const info = await response.json().catch(() => ({}));
            throw new Error(info?.error || "Unable to save your contact card.");
          }

          const payload = (await response.json()) as {
            fields?: Partial<ContactDraft>;
          };
          const savedDraft = mapContactFields(payload.fields, fallbackName);
          savedContactDraftRef.current = savedDraft;
          savedContactSignatureRef.current = buildContactDraftSignature(
            savedDraft,
            fallbackName
          );
          contactRetryAttemptRef.current = 0;
          setContactRequiresReview(false);
          setContactSaveStatus("saved");
          clearOnboardingDraftCache(userId, "contact");

          if (
            buildContactDraftSignature(
              contactDraftRef.current,
              profileDraftRef.current?.name ?? ""
            ) === nextSignature
          ) {
            setContactDraft(savedDraft);
          }

          return savedDraft;
        } catch (error) {
          const message =
            error instanceof Error
              ? error.message
              : "Unable to save your contact card.";
          setContactSaveStatus("error");
          setSaveError(message);
          if (!options?.quiet) {
            toast({
              title: "Contact card not saved",
              description: message,
              variant: "destructive",
            });
          }
          return null;
        }
      })();

      contactSavePromiseRef.current = request;
      try {
        return await request;
      } finally {
        contactSavePromiseRef.current = null;
        if (queuedContactSaveRef.current) {
          queuedContactSaveRef.current = false;
          void saveContactDraftImpl({ quiet: true });
        }
      }
    },
    [userId]
  );

  const requestProfileSaveSoon = useCallback(() => {
    if (typeof window === "undefined") return;
    window.setTimeout(() => {
      if (previewMode || loading || showLaunchHub || !userId) return;
      const currentDraft = profileDraftRef.current;
      if (!currentDraft) return;
      if (
        buildProfileDraftSignature(currentDraft) ===
        savedProfileSignatureRef.current
      ) {
        return;
      }
      if (profileSavePromiseRef.current) {
        queuedProfileSaveRef.current = true;
        return;
      }
      void saveProfileDraft({ quiet: true });
    }, 0);
  }, [loading, previewMode, saveProfileDraft, showLaunchHub, userId]);

  useEffect(() => {
    const currentTheme = profileDraft?.theme ?? null;
    if (!currentTheme) {
      lastProfileThemeRef.current = null;
      return;
    }
    if (lastProfileThemeRef.current === null) {
      lastProfileThemeRef.current = currentTheme;
      return;
    }
    if (currentTheme === lastProfileThemeRef.current) return;

    lastProfileThemeRef.current = currentTheme;
    if (themeSaveTimerRef.current) {
      window.clearTimeout(themeSaveTimerRef.current);
    }
    if (previewMode || loading || showLaunchHub || !userId) return;

    themeSaveTimerRef.current = window.setTimeout(() => {
      themeSaveTimerRef.current = null;
      requestProfileSaveSoon();
    }, 500);
  }, [
    loading,
    previewMode,
    profileDraft?.theme,
    requestProfileSaveSoon,
    showLaunchHub,
    userId,
  ]);

  useEffect(() => {
    return () => {
      if (themeSaveTimerRef.current) {
        window.clearTimeout(themeSaveTimerRef.current);
      }
    };
  }, []);

  const requestContactSaveSoon = useCallback(() => {
    if (typeof window === "undefined") return;
    window.setTimeout(() => {
      if (previewMode || loading || showLaunchHub || !userId) return;
      const currentDraft = contactDraftRef.current;
      if (!currentDraft) return;
      if (
        buildContactDraftSignature(
          currentDraft,
          profileDraftRef.current?.name ?? ""
        ) === savedContactSignatureRef.current
      ) {
        return;
      }
      if (contactSavePromiseRef.current) {
        queuedContactSaveRef.current = true;
        return;
      }
      void saveContactDraft({ quiet: true });
    }, 0);
  }, [loading, previewMode, saveContactDraft, showLaunchHub, userId]);

  useEffect(() => {
    profileRetryAttemptRef.current = 0;
  }, [profileDraftSignature]);

  useEffect(() => {
    contactRetryAttemptRef.current = 0;
  }, [contactDraftSignature]);

  useEffect(() => {
    if (!profileHasUnsavedChanges && profileSaveStatus === "error") {
      setProfileSaveStatus("saved");
    }
  }, [profileHasUnsavedChanges, profileSaveStatus]);

  useEffect(() => {
    if (!contactHasUnsavedChanges && contactSaveStatus === "error") {
      setContactSaveStatus("saved");
    }
  }, [contactHasUnsavedChanges, contactSaveStatus]);

  useEffect(() => {
    if (
      previewMode ||
      loading ||
      showLaunchHub ||
      !userId ||
      profileSaveStatus !== "error" ||
      !profileHasUnsavedChanges ||
      profileSavePromiseRef.current
    ) {
      return;
    }

    const timer = window.setTimeout(() => {
      const currentDraft = profileDraftRef.current;
      if (!currentDraft || profileSavePromiseRef.current) return;
      if (
        buildProfileDraftSignature(currentDraft) ===
        savedProfileSignatureRef.current
      ) {
        return;
      }
      profileRetryAttemptRef.current += 1;
      void saveProfileDraft({ quiet: true });
    }, getSaveRetryDelay(profileRetryAttemptRef.current));

    return () => window.clearTimeout(timer);
  }, [
    loading,
    previewMode,
    profileHasUnsavedChanges,
    profileSaveStatus,
    saveProfileDraft,
    showLaunchHub,
    userId,
  ]);

  useEffect(() => {
    if (
      previewMode ||
      loading ||
      showLaunchHub ||
      !userId ||
      contactSaveStatus !== "error" ||
      !contactHasUnsavedChanges ||
      contactSavePromiseRef.current
    ) {
      return;
    }

    const timer = window.setTimeout(() => {
      const currentDraft = contactDraftRef.current;
      if (!currentDraft || contactSavePromiseRef.current) return;
      if (
        buildContactDraftSignature(
          currentDraft,
          profileDraftRef.current?.name ?? ""
        ) === savedContactSignatureRef.current
      ) {
        return;
      }
      contactRetryAttemptRef.current += 1;
      void saveContactDraft({ quiet: true });
    }, getSaveRetryDelay(contactRetryAttemptRef.current));

    return () => window.clearTimeout(timer);
  }, [
    contactHasUnsavedChanges,
    contactSaveStatus,
    loading,
    previewMode,
    saveContactDraft,
    showLaunchHub,
    userId,
  ]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const handleOnlineSync = () => {
      if (previewMode || loading || showLaunchHub || !userId) return;
      if (profileHasUnsavedChanges && !profileSavePromiseRef.current) {
        void saveProfileDraft({ quiet: true });
      }
      if (contactHasUnsavedChanges && !contactSavePromiseRef.current) {
        void saveContactDraft({ quiet: true });
      }
    };
    window.addEventListener("online", handleOnlineSync);
    return () => window.removeEventListener("online", handleOnlineSync);
  }, [
    contactHasUnsavedChanges,
    loading,
    previewMode,
    profileHasUnsavedChanges,
    saveContactDraft,
    saveProfileDraft,
    showLaunchHub,
    userId,
  ]);

  function updateProfileDraft(updater: (current: ProfileDraft) => ProfileDraft) {
    setProfileDraft((current) => {
      if (!current) return current;
      const next = updater(current);
      profileDraftRef.current = next;
      return next;
    });
    setProfileSaveStatus((current) => (current === "error" ? "idle" : current));
    setStepError(null);
    setSaveError(null);
  }

  function updateContactDraft(
    updater: (current: ContactDraft) => ContactDraft,
    options?: { markReviewed?: boolean }
  ) {
    setContactDraft((current) => {
      if (!current) return current;
      return updater(current);
    });
    if (options?.markReviewed) {
      setContactRequiresReview(false);
    }
    setContactSaveStatus((current) => (current === "error" ? "idle" : current));
    setStepError(null);
    setSaveError(null);
  }

  function updateContactListDraft(
    key: "additionalEmails" | "additionalPhones",
    index: number,
    value: string
  ) {
    updateContactDraft(
      (current) => {
        const next = [...current[key]];
        next[index] = key === "additionalPhones" ? formatPhoneNumber(value) : value;
        return { ...current, [key]: next };
      },
      { markReviewed: true }
    );
  }

  function addContactListDraft(key: "additionalEmails" | "additionalPhones") {
    updateContactDraft(
      (current) => {
        if (current[key].length >= 5) return current;
        return { ...current, [key]: [...current[key], ""] };
      },
      { markReviewed: true }
    );
  }

  function removeContactListDraft(
    key: "additionalEmails" | "additionalPhones",
    index: number
  ) {
    updateContactDraft(
      (current) => ({
        ...current,
        [key]: current[key].filter((_, itemIndex) => itemIndex !== index),
      }),
      { markReviewed: true }
    );
  }

  function focusFieldById(id: string) {
    if (typeof document === "undefined") return;
    window.setTimeout(() => {
      const element = document.getElementById(id);
      if (element instanceof HTMLElement) {
        element.focus();
      }
    }, 40);
  }

  function focusFirstMissingField(stepId: SetupStepId) {
    if (stepId === "profile") {
      if (!profileDraftRef.current?.name.trim()) {
        focusFieldById("setup-name");
        return;
      }
      if (
        !profileDraftRef.current?.handle.trim() ||
        isAutoHandle(profileDraftRef.current.handle)
      ) {
        focusFieldById("setup-handle");
      }
      return;
    }
    if (stepId === "contact") {
      if (!hasContactMethod(contactDraftRef.current)) {
        focusFieldById("setup-email");
      }
      return;
    }
    if (stepId === "links") {
      if (
        !profileDraftRef.current?.links.some((link) => isMeaningfulLink(link.url))
      ) {
        focusFieldById("setup-link-url-0");
      }
    }
  }

  function validateStep(stepIndex: number) {
    switch (SETUP_STEPS[stepIndex]?.id) {
      case "profile":
        if (!profileDraft?.name.trim()) {
          return "Add your name to continue.";
        }
        if (!profileDraft.handle.trim() || isAutoHandle(profileDraft.handle)) {
          return "Choose your public link to continue.";
        }
        return null;
      case "contact":
        if (!hasContactMethod(contactDraft)) {
          return "Add an email or phone number to continue.";
        }
        return null;
      case "links":
        if (!profileDraft?.links.some((link) => isMeaningfulLink(link.url))) {
          return "Add your first link to continue.";
        }
        return null;
      default:
        if (!liveProfileReady) return "Finish your profile first.";
        if (!contactReady) return "Add contact details before you publish.";
        if (contactRequiresReview) {
          return "Review your contact details before you publish.";
        }
        if (!linksReady) return "Add your first link before you publish.";
        return null;
    }
  }

  async function handleContinue() {
    const stepId = SETUP_STEPS[currentStepIndex]?.id;
    void trackEvent(
      "onboarding_continue_clicked",
      trackingMeta({
        step_id: stepId ?? "unknown",
        step_index: currentStepIndex + 1,
      })
    );

    const error = validateStep(currentStepIndex);
    if (error) {
      setStepError(error);
      focusFirstMissingField(currentStep.id);
      void trackEvent(
        "onboarding_step_validation_failed",
        trackingMeta({
          step_id: stepId ?? "unknown",
          step_index: currentStepIndex + 1,
          reason: error,
        })
      );
      return;
    }

    if (stepId === "profile" || stepId === "links") {
      const saved = await saveProfileDraft({ quiet: true });
      if (!saved) return;
    }
    if (stepId === "contact") {
      const saved = await saveContactDraft({
        quiet: true,
        force: contactRequiresReview,
      });
      if (!saved) return;
      setContactRequiresReview(false);
    }

    setStepError(null);
    void trackEvent(
      "onboarding_step_completed",
      trackingMeta({
        step_id: stepId,
        step_index: currentStepIndex + 1,
      })
    );
    if (stepId === "links") {
      void trackEvent("primary_link_added", trackingMeta({ step_id: stepId }));
    }
    if (stepId) {
      setCompletedSetupSteps((current) => ({
        ...current,
        [stepId]: true,
      }));
    }

    setCurrentStepIndex((current) =>
      Math.min(current + 1, SETUP_STEPS.length - 1)
    );
    scrollPageToTop({ behavior: "smooth" });
  }

  async function handlePublish() {
    const error = validateStep(SETUP_STEPS.length - 1);
    if (error) {
      setStepError(error);
      if (!liveProfileReady) {
        setCurrentStepIndex(getSetupStepIndex("profile"));
        focusFirstMissingField("profile");
      } else if (!contactReady || contactRequiresReview) {
        setCurrentStepIndex(getSetupStepIndex("contact"));
        focusFirstMissingField("contact");
      } else if (!linksReady) {
        setCurrentStepIndex(getSetupStepIndex("links"));
        focusFirstMissingField("links");
      }
      scrollPageToTop({ behavior: "smooth" });
      return;
    }

    setStepError(null);
    void trackEvent("onboarding_publish_clicked", trackingMeta());

    if (shouldResetThemeToLight) {
      const previewedTheme = activeThemeValue;
      themePreviewRef.current = null;
      setThemePreview(null);
      writePendingDashboardTheme("light");
      setTheme("light");
      const currentProfileDraft = profileDraftRef.current;
      if (currentProfileDraft && currentProfileDraft.theme !== "light") {
        const nextProfileDraft = { ...currentProfileDraft, theme: "light" as ThemeName };
        profileDraftRef.current = nextProfileDraft;
        setProfileDraft(nextProfileDraft);
        setProfileSaveStatus((current) => (current === "error" ? "idle" : current));
      }
      void trackEvent(
        "theme_preview_reverted",
        trackingMeta({
          theme: previewedTheme ?? "unknown",
          fallback_theme: "light",
        })
      );
    }

    const [savedContact, savedProfile] = await Promise.all([
      saveContactDraft({ quiet: true, force: contactRequiresReview }),
      saveProfileDraft({ quiet: true }),
    ]);
    if (!savedContact || !savedProfile) return;
    setContactRequiresReview(false);

    const published = await saveProfileDraft({ publish: true, quiet: false });
    if (!published) return;

    if (typeof window !== "undefined" && userId) {
      window.sessionStorage.setItem(
        getOnboardingCompletionSessionKey(userId),
        "1"
      );
    }
    setPublishedThisSession(true);
    setShowLaunchHub(true);
    setCompletedSetupSteps({
      profile: true,
      contact: true,
      links: true,
      publish: true,
    });
    setProfileSaveStatus("saved");
    setContactSaveStatus("saved");
    void trackEvent("onboarding_publish_succeeded", trackingMeta());
    toast({
      title: "Your page is live",
      description: "Test it once, then start sharing it.",
      variant: "success",
    });
    scrollPageToTop({ behavior: "smooth" });
  }

  function handleBackStep() {
    const stepId = SETUP_STEPS[currentStepIndex]?.id;
    void trackEvent(
      "onboarding_back_clicked",
      trackingMeta({
        step_id: stepId ?? "unknown",
        step_index: currentStepIndex + 1,
        previous_step_id:
          SETUP_STEPS[Math.max(currentStepIndex - 1, 0)]?.id ?? "profile",
      })
    );
    setCurrentStepIndex((current) => Math.max(current - 1, 0));
    setStepError(null);
    scrollPageToTop({ behavior: "smooth" });
  }

  function handleStepNavigation(targetStepIndex: number) {
    if (targetStepIndex === currentStepIndex) {
      return;
    }

    const targetStep = SETUP_STEPS[targetStepIndex];
    if (!targetStep) {
      return;
    }

    void trackEvent(
      "onboarding_step_navigation_clicked",
      trackingMeta({
        step_id: SETUP_STEPS[currentStepIndex]?.id ?? "unknown",
        step_index: currentStepIndex + 1,
        target_step_id: targetStep.id,
        target_step_index: targetStepIndex + 1,
      })
    );

    if (targetStepIndex > currentStepIndex) {
      for (let index = currentStepIndex; index < targetStepIndex; index += 1) {
        const error = validateStep(index);
        if (error) {
          const blockedStep = SETUP_STEPS[index];
          setStepError(error);
          setCurrentStepIndex(index);
          if (blockedStep) {
            focusFirstMissingField(blockedStep.id);
          }
          void trackEvent(
            "onboarding_step_navigation_blocked",
            trackingMeta({
              step_id: blockedStep?.id ?? "unknown",
              step_index: index + 1,
              target_step_id: targetStep.id,
              target_step_index: targetStepIndex + 1,
              reason: error,
            })
          );
          scrollPageToTop({ behavior: "smooth" });
          return;
        }
      }
    }

    setCurrentStepIndex(targetStepIndex);
    setStepError(null);
    scrollPageToTop({ behavior: "smooth" });
  }

  async function copyTextToClipboard(value: string) {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
      return;
    }
    const element = document.createElement("textarea");
    element.value = value;
    element.setAttribute("readonly", "");
    element.style.position = "absolute";
    element.style.left = "-9999px";
    document.body.appendChild(element);
    element.select();
    document.execCommand("copy");
    element.remove();
  }

  async function handleCopyLink() {
    if (!publicUrl) return;
    try {
      await copyTextToClipboard(publicUrl);
      setShareTestComplete(true);
      toast({
        title: "Link copied",
        description: "Paste it anywhere you want to share your page.",
        variant: "success",
      });
      void trackEvent(
        "copy_public_link_clicked",
        trackingMeta({ public_url: publicUrl })
      );
    } catch {
      toast({
        title: "Copy failed",
        description: "Try copying the URL directly from your browser.",
        variant: "destructive",
      });
    }
  }

  async function handleCopyDraftUrl() {
    if (!publicUrl) return;
    try {
      await copyTextToClipboard(publicUrl);
      toast({
        title: "URL copied",
        description: "This is the URL that will go live after publishing.",
        variant: "success",
      });
    } catch {
      toast({
        title: "Copy failed",
        description: "Try copying the URL directly from your browser.",
        variant: "destructive",
      });
    }
  }

  async function loadClaimedLinketAssignment(assignmentId: string | null) {
    if (!userId || !assignmentId) return null;
    const response = await fetch(
      `/api/linkets?userId=${encodeURIComponent(userId)}`,
      { cache: "no-store" }
    );
    if (!response.ok) return null;
    const assignments = (await response.json().catch(() => [])) as
      | TagAssignmentDetail[]
      | null;
    return (
      assignments?.find((item) => item.assignment.id === assignmentId) ?? null
    );
  }

  async function claimComplimentaryTrialForOnboarding(
    item: TagAssignmentDetail
  ) {
    const response = await fetch("/api/linkets/complimentary-trial", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tagId: item.tag.id,
        assignmentId: item.assignment.id,
      }),
    });
    const payload = (await response.json().catch(() => null)) as
      | {
          error?: string;
          trial?: { endsAt?: string | null };
        }
      | null;
    if (!response.ok) {
      throw new Error(payload?.error || "Unable to claim complimentary trial.");
    }
    return payload?.trial?.endsAt ?? null;
  }

  async function handleClaimLinketCode() {
    if (!userId) {
      setLinketClaimError("Sign in to claim a Linket.");
      return;
    }

    const normalizedClaimCode = normalizeClaimCodeInput(linketClaimCode);
    if (!normalizedClaimCode) {
      setLinketClaimError("Enter a Linket code to claim it.");
      focusFieldById("setup-linket-code");
      return;
    }

    setLinketClaiming(true);
    setLinketClaimError(null);
    setLinketClaimResult(null);
    void trackEvent(
      "onboarding_linket_claim_started",
      trackingMeta({ source_cta: "review_step" })
    );

    try {
      const savedProfile = await saveProfileDraft({ quiet: true });
      if (!savedProfile) {
        throw new Error("Save your profile before claiming a Linket.");
      }

      const response = await fetch("/api/linkets/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          claimCode: normalizedClaimCode,
          profileId:
            savedProfile.id && savedProfile.id !== "preview-profile"
              ? savedProfile.id
              : null,
        }),
      });
      const payload = (await response.json().catch(() => null)) as
        | { assignmentId?: string | null; error?: string }
        | null;
      if (!response.ok) {
        throw new Error(payload?.error || "Unable to claim Linket.");
      }

      const claimedAssignment = await loadClaimedLinketAssignment(
        payload?.assignmentId ?? null
      );
      let result: OnboardingLinketClaimResult = {
        title: "Linket claimed",
        description:
          "This Linket is now attached to your account and ready to manage after setup.",
      };

      if (claimedAssignment?.complimentaryTrial?.claimable) {
        try {
          const trialEndsAt = await claimComplimentaryTrialForOnboarding(
            claimedAssignment
          );
          const trialEndsAtLabel = formatTrialDate(trialEndsAt);
          result = {
            title: "Linket and free trial claimed",
            description: trialEndsAtLabel
              ? `Complimentary Pro is active through ${trialEndsAtLabel}.`
              : "Complimentary Pro is active.",
          };
        } catch (error) {
          result = {
            title: "Linket claimed",
            description:
              error instanceof Error
                ? `The Linket is claimed. Free trial claim needs attention: ${error.message}`
                : "The Linket is claimed. You can finish the free trial claim from the Linkets dashboard.",
          };
        }
      } else if (claimedAssignment?.complimentaryTrial?.claimedByCurrentUser) {
        const trialEndsAtLabel = formatTrialDate(
          claimedAssignment.complimentaryTrial.endsAt
        );
        result = {
          title: "Linket claimed",
          description: trialEndsAtLabel
            ? `The included free trial was already active through ${trialEndsAtLabel}.`
            : "The included free trial was already active.",
        };
      }

      setLinketClaimCode("");
      setLinketClaimResult(result);
      void trackEvent(
        "onboarding_linket_claim_succeeded",
        trackingMeta({
          source_cta: "review_step",
          claimed_trial: result.title.includes("free trial"),
        })
      );
      toast({
        title: result.title,
        description: result.description,
        variant: "success",
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unable to claim Linket.";
      setLinketClaimError(message);
      void trackEvent(
        "onboarding_linket_claim_failed",
        trackingMeta({
          source_cta: "review_step",
          reason: message,
        })
      );
      toast({
        title: "Claim failed",
        description: message,
        variant: "destructive",
      });
    } finally {
      setLinketClaiming(false);
    }
  }

  function handleOpenLiveProfile() {
    if (!publicUrl) return;
    setShareTestComplete(true);
    void trackEvent(
      "open_public_profile_clicked",
      trackingMeta({ public_url: publicUrl })
    );
    window.open(publicUrl, "_blank", "noopener,noreferrer");
  }

  function handleOpenQr() {
    setQrOpen(true);
    void trackEvent("qr_modal_opened", trackingMeta({ public_url: publicUrl }));
  }

  function handleContinueToDashboard(path: string) {
    if (userId) {
      clearOnboardingStepIndex(userId);
    }
    window.location.assign(path);
  }

  function handleEditPublicUrl() {
    setCurrentStepIndex(0);
    setStepError(null);
    scrollPageToTop({ behavior: "smooth" });
    focusFieldById("setup-handle");
  }

  if (loading || !profileDraft || !contactDraft || !userId || !previewProfile) {
    return (
      <div className="min-h-[100svh] bg-[var(--background)] px-4 py-8 text-foreground sm:px-6 lg:px-10">
        <div className="mx-auto max-w-5xl">
          <Card className="rounded-[28px] border-border/60 bg-card/90 shadow-[0_28px_70px_-45px_rgba(15,23,42,0.28)]">
            <CardHeader>
              <Badge
                variant="outline"
                className="w-fit rounded-full border-border/60 bg-background px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground"
              >
                Get Started
              </Badge>
              <CardTitle className="text-2xl font-semibold tracking-tight text-foreground">
                Loading your setup...
              </CardTitle>
              <CardDescription className="text-sm text-muted-foreground">
                Preparing the fastest path to a live Linket page.
              </CardDescription>
            </CardHeader>
          </Card>
        </div>
      </div>
    );
  }

  const currentStep = SETUP_STEPS[currentStepIndex];
  const fieldLabelClassName = "text-sm font-medium text-foreground";
  const fieldHelperClassName = "text-fluid-xs-sm leading-5 text-muted-foreground";
  const fieldInputClassName =
    "h-12 rounded-2xl border-border/60 bg-background text-foreground";
  const compactFieldInputClassName =
    "h-11 rounded-2xl border-border/60 bg-background text-foreground";
  const inlineSlugInputClassName =
    "h-11 border-0 bg-transparent px-2 text-foreground shadow-none focus-visible:ring-0 focus-visible:ring-offset-0 sm:px-3";
  const setupCardClassName =
    "rounded-[28px] border-border/60 bg-card/95 shadow-[0_12px_30px_-24px_rgba(15,23,42,0.28)]";
  const softPanelClassName =
    "rounded-2xl border border-border/60 bg-background/40";
  const stepCompletion = {
    profile:
      completedSetupSteps.profile &&
      liveProfileReady &&
      !profileHasUnsavedChanges,
    contact:
      completedSetupSteps.contact &&
      contactStepComplete &&
      !contactHasUnsavedChanges,
    links:
      completedSetupSteps.links &&
      linksReady &&
      !profileHasUnsavedChanges,
    publish: completedSetupSteps.publish && publishReady,
  };
  const previewDisplayName =
    profileDraft.name.trim() || account.displayName?.trim() || "Your Name";
  const previewTagline =
    profileDraft.headline.trim() || "Your one-line intro will show here.";
  const previewLinks: PhonePreviewLinkItem[] = previewProfile.links.map((link) => ({
    id: link.id,
    label: link.title,
    url: link.url,
    linkType: link.link_type === "resume" ? "resume" : "link",
    visible: link.is_active,
    isOverride: link.is_override,
    clicks: link.click_count ?? 0,
  }));
  const availableThemeOptions = DASHBOARD_THEME_OPTIONS.filter((themeOption) =>
    isThemeAvailableForPlan(themeOption.value, planAccess)
  );
  const lockedThemeOptions = DASHBOARD_THEME_OPTIONS.filter(
    (themeOption) => !isThemeAvailableForPlan(themeOption.value, planAccess)
  );
  const selectedThemeValue = sanitizeThemeForPlan(profileDraft.theme, planAccess);
  const previewingTemporaryTheme =
    themePreview !== null && !canPersistOnboardingTheme(themePreview);
  const activeThemeValue = previewingTemporaryTheme && themePreview
    ? themePreview
    : selectedThemeValue;
  const shouldResetThemeToLight =
    !canPersistOnboardingTheme(selectedThemeValue) ||
    !canPersistOnboardingTheme(activeThemeValue);
  const selectedThemeOption =
    DASHBOARD_THEME_OPTIONS.find((themeOption) => themeOption.value === selectedThemeValue) ??
    availableThemeOptions[0] ??
    DASHBOARD_THEME_OPTIONS[0];
  const activeThemeOption =
    DASHBOARD_THEME_OPTIONS.find((themeOption) => themeOption.value === activeThemeValue) ??
    selectedThemeOption;
  const canChooseTheme = linksReady;
  const publishReviewItems = [
    { label: "Profile basics added", done: liveProfileReady, missing: "Profile basics missing" },
    {
      label: ONBOARDING_MILESTONE_LABELS.contact,
      done: contactStepComplete,
      missing: "Contact card missing",
    },
    { label: ONBOARDING_MILESTONE_LABELS.links, done: linksReady, missing: "Add a first link to continue" },
    { label: `Theme selected: ${selectedThemeOption.label}`, done: true, missing: "Pick a theme" },
  ];
  const stepHeading =
    showLaunchHub
      ? {
          title: "You're live",
          description: "Continue to the dashboard, then share or keep building anytime.",
        }
      : currentStep.id === "profile"
      ? {
          title: "Profile",
          description: "",
        }
      : currentStep.id === "contact"
        ? {
            title: "Contact card",
            description: "This is what gets saved to a phone contact.",
          }
      : currentStep.id === "links"
          ? {
              title: "Add your first link",
              description: "Add the main link people should open first.",
            }
          : {
              title: "Review + publish",
              description: "Check your page once, then go live.",
            };
  const linkButtonLabel = "Add another link";
  const continueButtonLabel =
    currentStep.id === "profile"
      ? "Continue to contact info"
      : currentStep.id === "contact"
        ? "Continue to links"
        : currentStep.id === "links"
          ? "Continue to review"
          : profileSaveStatus === "publishing"
            ? "Publishing..."
            : publishReady
              ? "Update live page"
              : "Publish page";
  const sidebarPreviewWrapperClassName =
    currentStep.id === "profile"
      ? "max-w-[272px] max-h-[470px]"
      : "max-w-[286px] max-h-[560px]";
  const getProfileFieldState = (
    dirty: boolean,
    hasFieldError = false
  ) =>
    getFieldSaveState({
      dirty,
      saveStatus: profileSaveStatus,
      hasError: Boolean(hasFieldError || (profileSaveStatus === "error" && saveError)),
    });
  const getContactFieldState = (dirty: boolean) =>
    getFieldSaveState({
      dirty,
      saveStatus: contactSaveStatus,
      hasError: Boolean(contactSaveStatus === "error" && saveError),
    });
  const nameFieldState = getProfileFieldState(
    areComparableValuesDifferent(profileDraft.name, savedProfileDraft?.name)
  );
  const avatarFieldState = avatarSaveState;
  const handleFieldState = getProfileFieldState(handleIsDirty, Boolean(handleError));
  const headlineFieldState = getProfileFieldState(
    areComparableValuesDifferent(profileDraft.headline, savedProfileDraft?.headline)
  );
  const emailFieldState = getContactFieldState(
    areComparableValuesDifferent(contactDraft.email, savedContactDraft?.email) ||
      areComparableListsDifferent(
        contactDraft.additionalEmails,
        savedContactDraft?.additionalEmails
      )
  );
  const phoneFieldState = getContactFieldState(
    areComparableValuesDifferent(contactDraft.phone, savedContactDraft?.phone) ||
      areComparableListsDifferent(
        contactDraft.additionalPhones,
        savedContactDraft?.additionalPhones
      )
  );
  const titleFieldState = getContactFieldState(
    areComparableValuesDifferent(contactDraft.title, savedContactDraft?.title)
  );
  const companyFieldState = getContactFieldState(
    areComparableValuesDifferent(contactDraft.company, savedContactDraft?.company)
  );
  const contactButtonVisible = contactDraft.contactButtonVisible !== false;
  const contactVisibilityFieldState = getContactFieldState(
    contactButtonVisible !==
      (savedContactDraft?.contactButtonVisible ?? true)
  );
  const themeFieldState = getProfileFieldState(
    normalizeThemeName(
      savedProfileDraft?.theme ?? DEFAULT_DASHBOARD_THEME,
      DEFAULT_DASHBOARD_THEME
    ) !==
      selectedThemeValue
  );
  const mobileStepLabels: Record<SetupStepId, string> = {
    profile: "Profile",
    contact: "Contact",
    links: "Links",
    publish: "Review",
  };
  const previewContactEnabled =
    (showLaunchHub ||
      currentStep.id !== "profile") &&
    contactReady &&
    contactButtonVisible;
  const previewContactDisabledText =
    !contactButtonVisible
      ? ""
      : currentStep.id === "profile"
          ? "Contact card comes next"
          : "Add email or phone";
  const showAvatarSavePill =
    Boolean(account.avatarPath || avatarPreviewUrl) || avatarFieldState !== "saved";
  const showHandleSavePill = handleTouched || Boolean(handleError);
  const normalizedLinketClaimCode = normalizeClaimCodeInput(linketClaimCode);
  const themeSelectionPanel = (
    <div className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <Palette className="h-4 w-4 text-muted-foreground" />
          <div>
            <p className="text-sm font-semibold text-foreground">Theme</p>
            <p className="text-sm text-muted-foreground">
              Pick a theme. You can change it later.
            </p>
          </div>
        </div>
        <FieldSavePill state={themeFieldState} />
      </div>
      {canChooseTheme ? (
        <div className={cn("space-y-3 p-4", softPanelClassName)}>
          <p className="text-sm text-muted-foreground">
            {previewingTemporaryTheme ? "Previewing theme" : "Selected theme"}:{" "}
            <span className="font-semibold text-foreground">
              {activeThemeOption.label}
            </span>
          </p>
          <p className="text-xs text-muted-foreground">
            Light and Dark can stay selected. Other themes are previews during onboarding.
          </p>
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {availableThemeOptions.map((themeOption) => {
              const selected = activeThemeValue === themeOption.value;
              const ThemeIcon = themeOption.icon;
              return (
                <button
                  key={themeOption.value}
                  type="button"
                  onClick={() => {
                    if (canPersistOnboardingTheme(themeOption.value)) {
                      themePreviewRef.current = null;
                      setThemePreview(null);
                      if (selectedThemeValue !== themeOption.value) {
                        writePendingDashboardTheme(themeOption.value);
                      }
                      setTheme(themeOption.value);
                      updateProfileDraft((current) => ({
                        ...current,
                        theme: themeOption.value,
                      }));
                      void trackEvent(
                        "theme_selected",
                        trackingMeta({ theme: themeOption.value })
                      );
                      return;
                    }

                    themePreviewRef.current = themeOption.value;
                    setThemePreview(themeOption.value);
                    void trackEvent(
                      "theme_previewed",
                      trackingMeta({
                        theme: themeOption.value,
                        locked: !isThemeAvailableForPlan(
                          themeOption.value,
                          planAccess
                        ),
                      })
                    );
                  }}
                  className={cn(
                    "overflow-hidden rounded-2xl border text-left transition",
                    selected
                      ? "border-foreground bg-foreground text-background shadow-[0_18px_42px_-30px_rgba(15,23,42,0.45)]"
                      : "border-border/60 bg-card hover:border-border"
                  )}
                >
                  <div
                    className={cn(
                      "relative h-16 w-full",
                      themeOption.swatchClassName
                    )}
                  >
                    <span className="absolute right-3 top-3 inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/60 bg-white/85 text-slate-900 shadow-sm backdrop-blur">
                      <ThemeIcon className="h-5 w-5" />
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2 px-3 py-3">
                    <div>
                      <p className="text-sm font-semibold">{themeOption.label}</p>
                      <p className="mt-1 text-xs opacity-80">
                        {themeOption.description}
                      </p>
                    </div>
                    {selected ? <Check className="h-4 w-4 shrink-0" /> : null}
                  </div>
                </button>
              );
            })}
          </div>
          {!planAccess.hasPaidAccess && lockedThemeOptions.length > 0 ? (
            <div className="space-y-3 rounded-2xl border border-dashed border-border/60 bg-background/55 p-3">
              <div className="space-y-1">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  Paid themes
                </p>
                <p className="text-sm text-muted-foreground">
                  Preview the full library now. Paid themes still need an upgrade before they can stay on your live page.
                </p>
              </div>
              <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                {lockedThemeOptions.map((themeOption) => {
                  const previewing =
                    previewingTemporaryTheme &&
                    themePreview === themeOption.value;
                  const ThemeIcon = themeOption.icon;

                  return (
                    <button
                      key={themeOption.value}
                      type="button"
                      aria-pressed={previewing}
                      onClick={() => {
                        themePreviewRef.current = themeOption.value;
                        setThemePreview(themeOption.value);
                        void trackEvent(
                          "theme_previewed",
                          trackingMeta({
                            theme: themeOption.value,
                            locked: true,
                          })
                        );
                      }}
                      className={cn(
                        "overflow-hidden rounded-2xl border text-left transition",
                        previewing
                          ? "border-foreground bg-foreground text-background shadow-[0_18px_42px_-30px_rgba(15,23,42,0.45)]"
                          : "border-border/60 bg-card/70 hover:border-border hover:bg-card"
                      )}
                    >
                      <div
                        className={cn(
                          "relative h-16 w-full",
                          themeOption.swatchClassName
                        )}
                      >
                        <span className="absolute right-3 top-3 inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/60 bg-white/85 text-slate-900 shadow-sm backdrop-blur">
                          <ThemeIcon className="h-5 w-5" />
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-2 px-3 py-3">
                        <div>
                          <p className="text-sm font-semibold">
                            {themeOption.label}
                          </p>
                          <p className="mt-1 text-xs opacity-80">
                            {themeOption.description}
                          </p>
                        </div>
                        <span
                          className={cn(
                            "rounded-full border px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.16em]",
                            previewing
                              ? "border-background/30 bg-background/10 text-background"
                              : "border-primary/30 bg-primary/10 text-primary"
                          )}
                        >
                          {previewing ? "Preview" : "Paid"}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
              <Button asChild size="sm" className="w-full sm:w-auto">
                <Link href={planAccess.upgradeHref}>Unlock paid themes</Link>
              </Button>
            </div>
          ) : null}
        </div>
      ) : (
        <div className={cn("p-4", softPanelClassName)}>
          <p className="text-sm font-medium text-foreground">
            Add your first link first.
          </p>
        </div>
      )}
    </div>
  );
  const sidebarPreview = (
    <div className={cn("mx-auto w-full overflow-hidden rounded-[36px]", sidebarPreviewWrapperClassName)}>
      <PhonePreviewCard
        profile={{
          name: previewDisplayName,
          tagline: previewTagline,
        }}
        avatarUrl={avatarPreviewUrl}
        headerImageUrl={headerPreviewUrl}
        logoUrl={logoPreviewUrl}
        logoShape={profileDraft.logoShape}
        logoBackgroundWhite={profileDraft.logoBackgroundWhite}
        themeName={activeThemeValue}
        contactEnabled={previewContactEnabled}
        contactDisabledText={previewContactDisabledText}
        links={previewLinks}
        showLeadFormSection={false}
        showClicks={false}
      />
    </div>
  );
  const onboardingThemeClassName = `theme-${activeThemeValue}`;
  const onboardingUsesDarkTheme = isDarkTheme(activeThemeValue);

  return (
    <div
      className={cn(
        "dashboard-overview-page dashboard-setup-page min-h-[100svh] bg-[var(--background)] px-4 pb-[calc(env(safe-area-inset-bottom)+8.5rem)] pt-4 text-foreground sm:px-6 sm:py-5 lg:px-10 lg:py-6",
        onboardingThemeClassName,
        onboardingUsesDarkTheme && "dark"
      )}
    >
      <div className="mx-auto max-w-6xl space-y-4 sm:space-y-5">
        {!showLaunchHub ? (
          <Card className={cn(setupCardClassName, "dashboard-setup-mobile-summary lg:hidden")}>
            <CardContent className="px-3 py-3">
              <div className="grid grid-cols-[repeat(4,minmax(0,1fr))] gap-1.5 sm:gap-2">
                {SETUP_STEPS.map((step, index) => {
                  const isCurrent = index === currentStepIndex;
                  const isDone = stepCompletion[step.id];
                  const shapeLabel = isCurrent
                    ? "active step"
                    : isDone
                      ? "complete step"
                      : "incomplete step";

                  return (
                    <button
                      key={step.id}
                      type="button"
                      aria-label={`${mobileStepLabels[step.id]}: ${shapeLabel}`}
                      aria-current={isCurrent ? "step" : undefined}
                      onClick={() => handleStepNavigation(index)}
                      className={cn(
                        "flex min-h-[104px] min-w-0 flex-col items-center justify-center rounded-2xl border px-1.5 py-2 text-center transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                        isCurrent
                          ? "border-[color:var(--ring)] bg-[color:color-mix(in_srgb,var(--ring)_16%,transparent)] text-foreground"
                          : isDone
                            ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 hover:border-emerald-500/50 hover:bg-emerald-500/15 dark:text-emerald-200"
                            : "border-border/60 bg-background/60 text-muted-foreground hover:border-border hover:bg-background"
                      )}
                    >
                      <span
                        aria-hidden
                        className={cn(
                          "flex h-7 w-7 items-center justify-center",
                          isCurrent
                            ? "rounded-full border-2 border-[color:var(--ring)] bg-[color:color-mix(in_srgb,var(--ring)_22%,transparent)] shadow-[0_0_0_4px_color-mix(in_srgb,var(--ring)_10%,transparent)]"
                            : isDone
                              ? "h-0 w-0 border-x-[0.9rem] border-b-[1.55rem] border-x-transparent border-b-emerald-500"
                              : "rounded-[0.32rem] border-2 border-border/70 bg-card/80"
                        )}
                      />
                      <p className="text-fluid-2xs-xs mt-2 max-w-full truncate font-semibold leading-4">
                        {mobileStepLabels[step.id]}
                      </p>
                      <p className="text-fluid-9-10 mt-1 font-semibold uppercase leading-4 tracking-[0.08em] opacity-75">
                        Step {index + 1}
                      </p>
                    </button>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        ) : null}

        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_332px] lg:items-start xl:gap-6 xl:grid-cols-[minmax(0,1fr)_348px]">
          <div className="space-y-5">
            {showLaunchHub ? (
              <Card className={setupCardClassName}>
                <CardContent className="space-y-5 px-5 py-5 sm:px-6">
                  <div className={cn("space-y-3 p-4", softPanelClassName)}>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-muted-foreground">
                      Your live link
                    </p>
                    <p className="break-all text-base font-semibold text-foreground">
                      {publicUrl}
                    </p>
                  </div>
                  <div className="space-y-3">
                    <div>
                      <p className="text-sm font-semibold text-foreground">
                        Next step
                      </p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Continue to the dashboard to manage your page, leads, and settings.
                      </p>
                    </div>
                    <Button
                      type="button"
                      className="h-12 rounded-2xl px-5 text-sm"
                      onClick={() => handleContinueToDashboard("/dashboard/overview")}
                    >
                      Continue to dashboard
                    </Button>
                  </div>
                  <div className="space-y-3">
                    <div>
                      <p className="text-sm font-semibold text-foreground">
                        Share your page
                      </p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Start with the actions most people use first.
                      </p>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-3">
                      <Button
                        type="button"
                        className="h-12 rounded-2xl text-sm"
                        onClick={handleCopyLink}
                      >
                        Copy link
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        className="h-12 rounded-2xl text-sm"
                        onClick={handleOpenLiveProfile}
                      >
                        Open live page
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        className="h-12 rounded-2xl text-sm"
                        onClick={handleOpenQr}
                      >
                        Show QR
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <Card className={setupCardClassName}>
                  <CardHeader className="gap-1 border-b border-border/60 pb-4">
                    <CardTitle className="text-fluid-2xl-3xl font-semibold tracking-tight text-foreground">
                      {stepHeading.title}
                    </CardTitle>
                    {stepHeading.description ? (
                      <CardDescription className="max-w-2xl text-sm text-muted-foreground">
                        {stepHeading.description}
                      </CardDescription>
                    ) : null}
                  </CardHeader>
                  <CardContent className="space-y-6 px-5 py-5 sm:px-6">
                    {currentStep.id === "profile" ? (
                      <div className="space-y-6">
                        <div className="space-y-3">
                          <div className="space-y-1">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <p className="text-sm font-semibold text-foreground">
                                Profile photo (optional)
                              </p>
                              {showAvatarSavePill ? (
                                <FieldSavePill state={avatarFieldState} showSaved />
                              ) : null}
                            </div>
                            <p className={fieldHelperClassName}>
                              Optional for now. Add a photo if you want a stronger first impression.
                            </p>
                          </div>
                          <AvatarUploader
                            userId={userId}
                            userEmail={userEmail}
                            avatarUrl={avatarPreviewUrl}
                            avatarOriginalFileName={account.avatarOriginalFileName}
                            variant="compact"
                            onSaveStateChange={setAvatarSaveState}
                            onUploaded={(payload) => {
                              const hasAvatar = Boolean(payload.path);
                              setAccount((current) => ({
                                ...current,
                                avatarPath: hasAvatar ? payload.path : null,
                                avatarUpdatedAt: hasAvatar ? payload.version : null,
                                avatarOriginalFileName:
                                  payload.originalFileName ?? null,
                              }));
                              setAvatarPreviewUrl(hasAvatar ? payload.publicUrl : null);
                              if (hasAvatar) {
                                void trackEvent("photo_uploaded", trackingMeta());
                              }
                            }}
                          />
                        </div>

                        <div className="space-y-2.5">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <Label
                              htmlFor="setup-name"
                              className={fieldLabelClassName}
                            >
                              Name
                            </Label>
                            <FieldSavePill state={nameFieldState} />
                          </div>
                          <Input
                            id="setup-name"
                            value={profileDraft.name}
                            placeholder="Jane Smith"
                            className={fieldInputClassName}
                            onChange={(event) => {
                              const nextName = event.target.value;
                              updateProfileDraft((current) => ({
                                ...current,
                                name: nextName,
                                handle:
                                  handleTouched || !userId
                                    ? current.handle
                                    : buildSuggestedHandle(nextName, userId),
                              }));
                              updateContactDraft((current) =>
                                current.fullName.trim()
                                  ? current
                                  : { ...current, fullName: nextName }
                              );
                            }}
                            onBlur={requestProfileSaveSoon}
                          />
                          <p className={fieldHelperClassName}>
                            What people will see first.
                          </p>
                        </div>

                        <div className="space-y-2.5">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <Label
                              htmlFor="setup-handle"
                              className={fieldLabelClassName}
                            >
                              Public URL
                            </Label>
                            {showHandleSavePill ? (
                              <FieldSavePill state={handleFieldState} />
                            ) : null}
                          </div>
                          <div className="rounded-2xl border border-border/60 bg-background px-5 py-3 sm:px-6">
                            <div className="flex items-center gap-3">
                              <span className="shrink-0 text-sm font-medium text-muted-foreground">
                                {DEFAULT_LINK_HOST}/
                              </span>
                              <Input
                                id="setup-handle"
                                value={profileDraft.handle}
                                placeholder="your-link"
                                className={inlineSlugInputClassName}
                                aria-invalid={Boolean(handleError)}
                                onChange={(event) => {
                                  setHandleTouched(true);
                                  setHandleError(null);
                                  updateProfileDraft((current) => ({
                                    ...current,
                                    handle: sanitizeHandleInput(
                                      event.target.value
                                    ),
                                  }));
                                }}
                                onBlur={requestProfileSaveSoon}
                              />
                            </div>
                          </div>
                          <p className={fieldHelperClassName}>
                            Pick a short link to share. This is the link you&apos;ll send.
                          </p>
                          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs">
                            {handleStatus ? (
                              <span
                                className={cn(
                                  "inline-flex items-center gap-2 font-medium",
                                  handleStatus.className
                                )}
                              >
                                {handleStatus.label === "Checking availability" ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : handleStatus.label === "Available" ? (
                                  <CheckCircle2 className="h-4 w-4" />
                                ) : (
                                  <Link2 className="h-4 w-4" />
                                )}
                                {handleStatus.label}
                              </span>
                            ) : null}
                          </div>
                          {handleError ? (
                            <p className="text-sm text-red-600">{handleError}</p>
                          ) : null}
                        </div>

                        <div className="space-y-2.5">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <Label
                              htmlFor="setup-headline"
                              className={fieldLabelClassName}
                            >
                              One-line intro
                            </Label>
                            <FieldSavePill state={headlineFieldState} />
                          </div>
                          <Textarea
                            id="setup-headline"
                            value={profileDraft.headline}
                            placeholder="Product designer helping startups simplify complex ideas."
                            className="min-h-20 rounded-2xl border-border/60 bg-background text-foreground"
                            onChange={(event) =>
                              updateProfileDraft((current) => ({
                                ...current,
                                headline: event.target.value,
                              }))
                            }
                            onBlur={requestProfileSaveSoon}
                          />
                          <p className={fieldHelperClassName}>
                            Keep it short. You can edit later.
                          </p>
                        </div>
                      </div>
                    ) : null}

                    {currentStep.id === "contact" ? (
                      <div className="space-y-6">
                        <div className={cn("space-y-1.5 p-4", softPanelClassName)}>
                          <p className="text-sm font-medium text-foreground">
                            This is what gets saved when someone taps <span className="font-semibold">Save contact</span>.
                          </p>
                          <p className={fieldHelperClassName}>
                            Start with one detail people can use right away.
                          </p>
                        </div>
                        <div className="space-y-2.5">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <Label
                              htmlFor="setup-email"
                              className={fieldLabelClassName}
                            >
                              Email
                            </Label>
                            <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
                              <FieldSavePill state={emailFieldState} />
                              {userEmail &&
                              !contactDraft.email.trim() &&
                              userEmail !== contactDraft.email ? (
                                <Button
                                  type="button"
                                  variant="link"
                                  className="h-auto p-0 text-xs text-muted-foreground"
                                  onClick={() =>
                                    updateContactDraft((current) => ({
                                      ...current,
                                      email: userEmail ?? "",
                                    }), { markReviewed: true })
                                  }
                                >
                                  Use account email
                                </Button>
                              ) : null}
                            </div>
                          </div>
                          <Input
                            id="setup-email"
                            type="email"
                            value={contactDraft.email}
                            placeholder="jane@company.com"
                            className={fieldInputClassName}
                            onChange={(event) =>
                              updateContactDraft((current) => ({
                                ...current,
                                email: event.target.value,
                              }), { markReviewed: true })
                            }
                            onBlur={requestContactSaveSoon}
                          />
                          {contactDraft.additionalEmails.length ? (
                            <div className="space-y-2">
                              {contactDraft.additionalEmails.map((email, index) => (
                                <div
                                  key={`setup-additional-email-${index}`}
                                  className="flex items-center gap-2"
                                >
                                  <Input
                                    type="email"
                                    value={email}
                                    placeholder="another@company.com"
                                    className={fieldInputClassName}
                                    onChange={(event) =>
                                      updateContactListDraft(
                                        "additionalEmails",
                                        index,
                                        event.target.value
                                      )
                                    }
                                    onBlur={requestContactSaveSoon}
                                  />
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    className="h-11 rounded-full px-3 text-xs"
                                    onClick={() =>
                                      removeContactListDraft(
                                        "additionalEmails",
                                        index
                                      )
                                    }
                                  >
                                    Remove
                                  </Button>
                                </div>
                              ))}
                            </div>
                          ) : null}
                          <Button
                            type="button"
                            variant="outline"
                            className="h-11 w-full justify-between rounded-2xl border-border/60 bg-background/55 px-4 text-sm font-medium text-foreground"
                            onClick={() => addContactListDraft("additionalEmails")}
                            disabled={contactDraft.additionalEmails.length >= 5}
                          >
                            Add another email
                            <Plus className="h-4 w-4" />
                          </Button>
                        </div>
                        <div className="space-y-3">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                            Optional
                          </p>
                          {showPhoneField ? (
                            <div className={cn("space-y-3 p-4", softPanelClassName)}>
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <Label
                                  htmlFor="setup-phone"
                                  className={fieldLabelClassName}
                                >
                                  Phone
                                </Label>
                                <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
                                  <FieldSavePill state={phoneFieldState} />
                                  {!contactDraft.phone.trim() ? (
                                    <Button
                                      type="button"
                                      variant="link"
                                      className="h-auto p-0 text-xs text-muted-foreground"
                                      onClick={() => setShowPhoneField(false)}
                                    >
                                      Hide
                                    </Button>
                                  ) : null}
                                </div>
                              </div>
                              <Input
                                id="setup-phone"
                                type="tel"
                                value={contactDraft.phone}
                                placeholder="(555) 123-4567"
                                className={fieldInputClassName}
                                onChange={(event) =>
                                  updateContactDraft((current) => ({
                                    ...current,
                                    phone: formatPhoneNumber(event.target.value),
                                  }), { markReviewed: true })
                                }
                                onBlur={requestContactSaveSoon}
                              />
                              {contactDraft.additionalPhones.length ? (
                                <div className="space-y-2">
                                  {contactDraft.additionalPhones.map((phone, index) => (
                                    <div
                                      key={`setup-additional-phone-${index}`}
                                      className="flex items-center gap-2"
                                    >
                                      <Input
                                        type="tel"
                                        value={phone}
                                        placeholder="(555) 123-4567"
                                        className={fieldInputClassName}
                                        onChange={(event) =>
                                          updateContactListDraft(
                                            "additionalPhones",
                                            index,
                                            event.target.value
                                          )
                                        }
                                        onBlur={requestContactSaveSoon}
                                      />
                                      <Button
                                        type="button"
                                        variant="ghost"
                                        className="h-11 rounded-full px-3 text-xs"
                                        onClick={() =>
                                          removeContactListDraft(
                                            "additionalPhones",
                                            index
                                          )
                                        }
                                      >
                                        Remove
                                      </Button>
                                    </div>
                                  ))}
                                </div>
                              ) : null}
                              <Button
                                type="button"
                                variant="outline"
                                className="h-11 w-full justify-between rounded-2xl border-border/60 bg-background/55 px-4 text-sm font-medium text-foreground"
                                onClick={() =>
                                  addContactListDraft("additionalPhones")
                                }
                                disabled={contactDraft.additionalPhones.length >= 5}
                              >
                                Add another phone
                                <Plus className="h-4 w-4" />
                              </Button>
                            </div>
                          ) : (
                            <Button
                              type="button"
                              variant="outline"
                              className="h-12 w-full justify-between rounded-2xl border-border/60 bg-background/55 px-4 text-sm"
                              onClick={() => setShowPhoneField(true)}
                            >
                              Phone (optional)
                              <Plus className="h-4 w-4" />
                            </Button>
                          )}
                          {showContactExtras ? (
                            <div className={cn("space-y-3 p-4", softPanelClassName)}>
                              <div className="flex items-center justify-between gap-3">
                                <div className="space-y-1">
                                  <p className="text-sm font-semibold text-foreground">
                                    Business details (optional)
                                  </p>
                                  <p className={fieldHelperClassName}>
                                    Add company or job title if you want it saved too.
                                  </p>
                                </div>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  className="rounded-2xl text-sm"
                                  onClick={() => setShowContactExtras(false)}
                                >
                                  Hide
                                </Button>
                              </div>
                              <div className="grid gap-4 md:grid-cols-2">
                                <div className="space-y-2">
                                  <div className="flex flex-wrap items-center justify-between gap-2">
                                    <Label
                                      htmlFor="setup-title"
                                      className={fieldLabelClassName}
                                    >
                                      Job title
                                    </Label>
                                    <FieldSavePill state={titleFieldState} />
                                  </div>
                                  <Input
                                    id="setup-title"
                                    value={contactDraft.title}
                                    placeholder="Founder"
                                    className={fieldInputClassName}
                                    onChange={(event) =>
                                      updateContactDraft((current) => ({
                                        ...current,
                                        title: event.target.value,
                                      }), { markReviewed: true })
                                    }
                                    onBlur={requestContactSaveSoon}
                                  />
                                </div>
                                <div className="space-y-2">
                                  <div className="flex flex-wrap items-center justify-between gap-2">
                                    <Label
                                      htmlFor="setup-company"
                                      className={fieldLabelClassName}
                                    >
                                      Company
                                    </Label>
                                    <FieldSavePill state={companyFieldState} />
                                  </div>
                                  <Input
                                    id="setup-company"
                                    value={contactDraft.company}
                                    placeholder="Linket"
                                    className={fieldInputClassName}
                                    onChange={(event) =>
                                      updateContactDraft((current) => ({
                                        ...current,
                                        company: event.target.value,
                                      }), { markReviewed: true })
                                    }
                                    onBlur={requestContactSaveSoon}
                                  />
                                </div>
                              </div>
                            </div>
                          ) : (
                            <Button
                              type="button"
                              variant="outline"
                              className="h-12 w-full justify-between rounded-2xl border-border/60 bg-background/55 px-4 text-sm"
                              onClick={() => setShowContactExtras(true)}
                            >
                              Business details (optional)
                              <Plus className="h-4 w-4" />
                            </Button>
                          )}
                          <div className={cn("space-y-3 p-4", softPanelClassName)}>
                            <SwitchRow
                              id="setup-contact-button-visible"
                              label="Show Save contact button on public page"
                              description="Turn this off if you want people to view your page without the contact download action."
                              labelPosition="left"
                              checked={contactButtonVisible}
                              onCheckedChange={(value) => {
                                updateContactDraft((current) => ({
                                  ...current,
                                  contactButtonVisible: Boolean(value),
                                }), { markReviewed: true });
                                requestContactSaveSoon();
                              }}
                              textClassName="text-sm font-medium text-foreground"
                            />
                            <div className="flex justify-end">
                              <FieldSavePill state={contactVisibilityFieldState} />
                            </div>
                          </div>
                        </div>
                      </div>
                    ) : null}

                    {currentStep.id === "links" ? (
                      <div className="space-y-5">
                        <div className="space-y-3">
                          <div>
                            <p className="text-sm font-semibold text-foreground">
                              First link
                            </p>
                            <p className="mt-1 text-sm text-muted-foreground">
                              Add the main link people should open first.
                            </p>
                          </div>
                          <div className="space-y-3">
                            {profileDraft.links.map((link, index) => (
                              (() => {
                                const linkFieldKey = getDraftLinkFieldKey(link, index);
                                const savedLink =
                                  (link.id
                                    ? savedProfileDraft?.links.find(
                                        (item) => item.id === link.id
                                      )
                                    : undefined) ??
                                  savedProfileDraft?.links[index];
                                const showTitleField =
                                  index === 0 ||
                                  Boolean(link.title.trim()) ||
                                  Boolean(expandedLinkTitleEditors[linkFieldKey]);
                                const linkTitleFieldState = getProfileFieldState(
                                  areComparableValuesDifferent(
                                    link.title,
                                    savedLink?.title
                                  )
                                );
                                const linkUrlFieldState = getProfileFieldState(
                                  areComparableUrlsDifferent(
                                    link.url,
                                    savedLink?.url
                                  )
                                );

                                return (
                                  <div
                                    key={link.id || `setup-link-${index}`}
                                    className={cn("space-y-3 p-4", softPanelClassName)}
                                  >
                                    <div className="flex items-start justify-between gap-4">
                                      <div className="min-w-0">
                                        <p className="text-sm font-semibold text-foreground">
                                          {index === 0
                                            ? "First link"
                                            : index === 1
                                              ? "Second link"
                                              : `Link ${index + 1}`}
                                        </p>
                                      </div>
                                      {profileDraft.links.length > 1 ? (
                                        <Button
                                          type="button"
                                          variant="ghost"
                                          size="icon"
                                          className="h-11 w-11 rounded-2xl text-muted-foreground"
                                          onClick={() =>
                                            updateProfileDraft((current) => {
                                              const nextLinks = current.links.filter(
                                                (_, itemIndex) => itemIndex !== index
                                              );
                                              return {
                                                ...current,
                                                links: nextLinks.length
                                                  ? nextLinks
                                                  : [buildEmptyLink()],
                                              };
                                            })
                                          }
                                        >
                                          <Trash2 className="h-4 w-4" />
                                        </Button>
                                      ) : null}
                                    </div>
                                    <div
                                      className={cn(
                                        "grid gap-3",
                                        showTitleField
                                          ? "md:grid-cols-[minmax(0,0.72fr)_minmax(0,1.28fr)]"
                                          : ""
                                      )}
                                    >
                                      {showTitleField ? (
                                        <div className="space-y-2">
                                          <div className="flex flex-wrap items-center justify-between gap-2">
                                            <Label
                                              htmlFor={`setup-link-title-${index}`}
                                              className={fieldLabelClassName}
                                            >
                                              Link label
                                            </Label>
                                            <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
                                              <FieldSavePill state={linkTitleFieldState} />
                                              {!link.title.trim() && index !== 0 ? (
                                                <Button
                                                  type="button"
                                                  variant="link"
                                                  className="h-auto p-0 text-xs text-muted-foreground"
                                                  onClick={() =>
                                                    setExpandedLinkTitleEditors((current) => ({
                                                      ...current,
                                                      [linkFieldKey]: false,
                                                    }))
                                                  }
                                                >
                                                  Hide
                                                </Button>
                                              ) : null}
                                            </div>
                                          </div>
                                          <Input
                                            id={`setup-link-title-${index}`}
                                            value={link.title}
                                            placeholder={
                                              index === 0 ? "Website" : "Instagram"
                                            }
                                            className={compactFieldInputClassName}
                                            onChange={(event) =>
                                              updateProfileDraft((current) => ({
                                                ...current,
                                                links: current.links.map(
                                                  (item, itemIndex) =>
                                                    itemIndex === index
                                                      ? {
                                                          ...item,
                                                          title: event.target.value,
                                                        }
                                                      : item
                                                ),
                                              }))
                                            }
                                            onBlur={requestProfileSaveSoon}
                                          />
                                        </div>
                                      ) : null}
                                      <div className="space-y-2">
                                        <div className="flex flex-wrap items-center justify-between gap-2">
                                          <Label
                                            htmlFor={`setup-link-url-${index}`}
                                            className={fieldLabelClassName}
                                          >
                                            URL
                                          </Label>
                                          <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
                                            <FieldSavePill state={linkUrlFieldState} />
                                            {!showTitleField ? (
                                              <Button
                                                type="button"
                                                variant="link"
                                                className="h-auto p-0 text-xs text-muted-foreground"
                                                onClick={() =>
                                                  setExpandedLinkTitleEditors((current) => ({
                                                    ...current,
                                                    [linkFieldKey]: true,
                                                  }))
                                                }
                                              >
                                                Add custom label
                                              </Button>
                                            ) : null}
                                          </div>
                                        </div>
                                        <Input
                                          id={`setup-link-url-${index}`}
                                          value={link.url}
                                          placeholder={
                                            index === 0
                                              ? "yourwebsite.com"
                                              : "instagram.com/yourname"
                                          }
                                          className={compactFieldInputClassName}
                                          onChange={(event) =>
                                            updateProfileDraft((current) => ({
                                              ...current,
                                              links: current.links.map(
                                                (item, itemIndex) =>
                                                  itemIndex === index
                                                    ? {
                                                        ...item,
                                                        url: event.target.value,
                                                      }
                                                    : item
                                              ),
                                            }))
                                          }
                                          onBlur={requestProfileSaveSoon}
                                        />
                                        {!showTitleField ? (
                                          <p className="text-sm text-muted-foreground">
                                            We&apos;ll name the button from the link.
                                          </p>
                                        ) : null}
                                      </div>
                                    </div>
                                  </div>
                                );
                              })()
                            ))}
                          </div>
                          {profileDraft.links.length < MAX_LINK_ROWS ? (
                            <Button
                              type="button"
                              variant="link"
                              className="h-auto p-0 text-sm text-muted-foreground"
                              onClick={() =>
                                updateProfileDraft((current) => ({
                                  ...current,
                                  links: [...current.links, buildEmptyLink()],
                                }))
                              }
                            >
                              <Plus className="mr-2 h-4 w-4" />
                              {linkButtonLabel}
                            </Button>
                          ) : null}
                        </div>
                      </div>
                    ) : null}

                    {currentStep.id === "publish" ? (
                      <div className="space-y-4">
                        <div className={cn("space-y-3 p-4", softPanelClassName)}>
                          <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-muted-foreground">
                            Your public URL
                          </p>
                          <p className="break-all text-base font-semibold text-foreground">
                            {publicUrl}
                          </p>
                          <div className="flex flex-wrap items-center gap-4 text-xs">
                            <Button
                              type="button"
                              variant="link"
                              className="h-auto p-0 text-xs text-muted-foreground"
                              onClick={() => void handleCopyDraftUrl()}
                            >
                              Copy
                            </Button>
                            <Button
                              type="button"
                              variant="link"
                              className="h-auto p-0 text-xs text-muted-foreground"
                              onClick={handleEditPublicUrl}
                            >
                              Edit
                            </Button>
                          </div>
                        </div>
                        <div className={cn("space-y-4 p-4", softPanelClassName)}>
                          <div className="flex items-start gap-3">
                            <span className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl border border-primary/20 bg-primary/10 text-primary">
                              <Gift className="h-4 w-4" aria-hidden="true" />
                            </span>
                            <div className="min-w-0 space-y-1">
                              <p className="text-sm font-semibold text-foreground">
                                Claim your Linket
                              </p>
                              <p className="text-sm leading-6 text-muted-foreground">
                                Have a printed Linket code? Claim it now. If that
                                Linket includes complimentary Pro time, we can
                                claim that too.
                              </p>
                            </div>
                          </div>
                          <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
                            <div className="space-y-2">
                              <Label
                                htmlFor="setup-linket-code"
                                className={fieldLabelClassName}
                              >
                                Linket code
                              </Label>
                              <Input
                                id="setup-linket-code"
                                value={linketClaimCode}
                                placeholder="ABCD-1234-EFGH"
                                className={fieldInputClassName}
                                inputMode="text"
                                autoCapitalize="characters"
                                autoComplete="off"
                                onChange={(event) => {
                                  setLinketClaimCode(
                                    formatClaimCodeDisplay(event.target.value)
                                  );
                                  setLinketClaimError(null);
                                }}
                              />
                            </div>
                            <Button
                              type="button"
                              variant="outline"
                              className="h-12 rounded-2xl px-5 text-sm"
                              disabled={!normalizedLinketClaimCode || linketClaiming}
                              onClick={() => void handleClaimLinketCode()}
                            >
                              {linketClaiming ? (
                                <>
                                  <Loader2
                                    className="mr-2 h-4 w-4 animate-spin"
                                    aria-hidden="true"
                                  />
                                  Claiming...
                                </>
                              ) : (
                                "Claim Linket"
                              )}
                            </Button>
                          </div>
                          {linketClaimResult ? (
                            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                              <p className="font-semibold">
                                {linketClaimResult.title}
                              </p>
                              <p className="mt-1 leading-6">
                                {linketClaimResult.description}
                              </p>
                            </div>
                          ) : null}
                          {linketClaimError ? (
                            <div
                              role="alert"
                              className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
                            >
                              {linketClaimError}
                            </div>
                          ) : null}
                        </div>
                        <div className={cn("space-y-3 p-4", softPanelClassName)}>
                          <div>
                            <p className="text-sm font-semibold text-foreground">
                              Ready to publish
                            </p>
                            <p className="mt-1 text-sm text-muted-foreground">
                              Make sure the essentials are in place before you go live.
                            </p>
                          </div>
                          <div className="space-y-2.5">
                            {publishReviewItems.map((item) => (
                              <div key={item.label} className="flex items-center gap-3">
                                <span
                                  className={cn(
                                    "inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border",
                                    item.done
                                      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                                      : "border-amber-200 bg-amber-50 text-amber-700"
                                  )}
                                >
                                  <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                                </span>
                                <p className="text-sm font-medium text-foreground">
                                  {item.done ? item.label : item.missing}
                                </p>
                              </div>
                            ))}
                          </div>
                        </div>
                        {themeSelectionPanel}
                      </div>
                    ) : null}

                    {stepError ? (
                      <div
                        role="alert"
                        className="rounded-3xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
                      >
                        {stepError}
                      </div>
                    ) : null}
                    {saveError && !stepError ? (
                      <div
                        role="alert"
                        className="rounded-3xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800"
                      >
                        {saveError}
                      </div>
                    ) : null}

                    <div className="hidden sm:block">
                      <div className="sticky bottom-4 z-10 flex items-center justify-between gap-4 rounded-[20px] border border-border/70 bg-card px-4 py-3 shadow-[var(--shadow-grounded)]">
                        <div className="flex min-w-0 items-center gap-3">
                          {currentStepIndex > 0 ? (
                            <Button
                              type="button"
                              variant="ghost"
                              className="h-10 rounded-2xl px-3 text-sm"
                              onClick={handleBackStep}
                            >
                              Back
                            </Button>
                          ) : null}
                        </div>
                        {currentStep.id === "publish" ? (
                          <Button
                            type="button"
                            className="h-12 rounded-2xl px-6 text-sm"
                            disabled={
                              profileSaveStatus === "publishing" ||
                              linketClaiming
                            }
                            onClick={() => void handlePublish()}
                          >
                            {continueButtonLabel}
                          </Button>
                        ) : (
                          <Button
                            type="button"
                            className="h-12 rounded-2xl px-6 text-sm"
                            onClick={() => void handleContinue()}
                          >
                            {continueButtonLabel}
                          </Button>
                        )}
                      </div>
                    </div>
                  </CardContent>
              </Card>
            )}
          </div>

          <aside className="hidden space-y-3 lg:sticky lg:top-5 lg:block" aria-label="Setup preview and checklist">
            {sidebarPreview}
          </aside>
        </div>
      </div>

      <Dialog open={qrOpen} onOpenChange={setQrOpen}>
        <DialogContent className="max-w-md rounded-[28px] border-border/60 bg-card/95 p-6">
          <DialogHeader>
            <DialogTitle className="text-2xl font-semibold text-foreground">Share this QR</DialogTitle>
            <DialogDescription className="text-sm leading-6 text-muted-foreground">Scan this on a phone to test your live page or use it in person.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="mx-auto w-fit rounded-[28px] border border-border/60 bg-background p-4 shadow-sm">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(publicUrl)}`} alt="QR code for your live profile" width={220} height={220} className="h-[220px] w-[220px] rounded-2xl" />
            </div>
            <div className="rounded-2xl border border-border/60 bg-muted/40 px-4 py-3 text-sm text-foreground">{publicUrl}</div>
          </div>
        </DialogContent>
      </Dialog>

      {!showLaunchHub ? (
        <div className="dashboard-setup-mobile-footer fixed inset-x-0 bottom-0 z-40 border-t border-border/70 bg-background px-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] pt-3 shadow-[0_-14px_30px_-26px_rgba(15,23,42,0.35)] sm:hidden">
          <div className="mx-auto max-w-7xl">
            <div className="flex gap-3 max-[359px]:flex-col">
            {currentStepIndex > 0 ? (
              <Button
                type="button"
                variant="outline"
                className="h-12 flex-1 rounded-2xl text-sm max-[359px]:w-full"
                onClick={handleBackStep}
              >
                Back
              </Button>
            ) : null}
            <Button
              type="button"
              className={cn(
                "h-12 rounded-2xl text-sm",
                currentStepIndex > 0
                  ? "flex-1 max-[359px]:w-full"
                  : "w-full"
              )}
              disabled={
                currentStep.id === "publish" &&
                (profileSaveStatus === "publishing" || linketClaiming)
              }
              onClick={() =>
                currentStep.id === "publish"
                  ? void handlePublish()
                  : void handleContinue()
              }
            >
              {continueButtonLabel}
            </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
