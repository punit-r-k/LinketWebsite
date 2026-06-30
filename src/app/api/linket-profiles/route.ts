import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { requireRouteAccess } from "@/lib/api-authorization";
import {
  getProfilesForUser,
  saveProfileForUser,
  isHandleConflictError,
  type ProfilePayload,
} from "@/lib/profile-service";
import { validateJsonBody, validateSearchParams } from "@/lib/request-validation";
import { ensurePublishedLeadFormRow } from "@/lib/lead-form.server";
import { sanitizeThemeForPlan } from "@/lib/plan-access";
import { getDashboardPlanAccessForUser } from "@/lib/plan-access.server";
import { sanitizePublicLinkUrl } from "@/lib/security";
import { normalizeThemeName } from "@/lib/themes";
import { isSupabaseAdminAvailable } from "@/lib/supabase-admin";
import { createServerSupabase } from "@/lib/supabase/server";
import { revalidatePublicProfileHandles } from "@/lib/public-profile-revalidation";
import { recordConversionEvent } from "@/lib/server-conversion-events";
import {
  getConfiguredSiteHost,
  getDefaultProfileLinkUrl,
} from "@/lib/site-url";
import { rejectUntrustedWrite } from "@/lib/request-security";
import type { ProfileLinkRecord, UserProfileRecord } from "@/types/db";

type ProfileWithLinks = UserProfileRecord & { links: ProfileLinkRecord[] };
type ServerSupabase = Awaited<ReturnType<typeof createServerSupabase>>;
const DEFAULT_PROFILE_LINK_URL = getDefaultProfileLinkUrl();
const DEFAULT_PROFILE_NAME = "Linket Public Profile";
const DEFAULT_THEME = normalizeThemeName("autumn", "autumn");
const DEFAULT_LINK_HOST = getConfiguredSiteHost();

const linketProfilesQuerySchema = z.object({
  userId: z.string().uuid(),
});

const linketProfilesPostSchema = z.object({
  profile: z.object({}).passthrough(),
  userId: z.string().uuid(),
});

function normalizeHandle(handle: string) {
  return handle.trim().toLowerCase();
}

function sortLinks(links: ProfileLinkRecord[] | null | undefined) {
  return (links ?? [])
    .slice()
    .sort(
      (a, b) =>
        (a.order_index ?? 0) - (b.order_index ?? 0) ||
        a.created_at.localeCompare(b.created_at)
    );
}

async function fetchOwnedProfileHandle(
  supabase: ServerSupabase,
  userId: string,
  profileId: string | null | undefined
) {
  if (!profileId) return null;
  const { data, error } = await supabase
    .from("user_profiles")
    .select("handle")
    .eq("id", profileId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error && error.code !== "PGRST116") throw new Error(error.message);
  return (data?.handle as string | null | undefined) ?? null;
}

async function fetchActivePublicHandles(
  supabase: ServerSupabase,
  userId: string
) {
  const { data, error } = await supabase
    .from("user_profiles")
    .select("handle")
    .eq("user_id", userId)
    .eq("is_active", true);
  if (error) throw new Error(error.message);
  return (data ?? [])
    .map((row) => (row as { handle?: string | null }).handle)
    .filter((handle): handle is string => Boolean(handle));
}

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

function isDefaultStarterLinkUrl(url: string | null | undefined) {
  const normalized = normaliseLinkUrl(url);
  return (
    normalized === DEFAULT_LINK_HOST ||
    normalized === `${DEFAULT_LINK_HOST}/`
  );
}

function needsStarterLinkRepair(links: ProfileLinkRecord[] | null | undefined) {
  const sorted = sortLinks(links);
  if (sorted.length === 0) return true;
  const defaultLinkCount = sorted.filter((link) =>
    isDefaultStarterLinkUrl(link.url)
  ).length;
  return defaultLinkCount > 1;
}

async function enforceSingleStarterDefaultLink(
  supabase: Awaited<ReturnType<typeof createServerSupabase>>,
  userId: string,
  profileId: string
) {
  let changed = false;
  let { data, error } = await supabase
    .from("profile_links")
    .select("*")
    .eq("profile_id", profileId)
    .eq("user_id", userId);
  if (error) throw new Error(error.message);

  let links = sortLinks((data as ProfileLinkRecord[] | null | undefined) ?? []);

  if (links.length === 0) {
    const { error: insertLinkError } = await supabase.from("profile_links").insert({
      profile_id: profileId,
      user_id: userId,
      title: "Website",
      url: DEFAULT_PROFILE_LINK_URL,
      order_index: 0,
      is_active: true,
    });
    if (insertLinkError) throw new Error(insertLinkError.message);
    changed = true;

    const { data: refreshedLinks, error: refreshedError } = await supabase
      .from("profile_links")
      .select("*")
      .eq("profile_id", profileId)
      .eq("user_id", userId);
    if (refreshedError) throw new Error(refreshedError.message);
    links = sortLinks(
      (refreshedLinks as ProfileLinkRecord[] | null | undefined) ?? []
    );
  }

  const defaultLinks = sortLinks(
    links.filter((link) => isDefaultStarterLinkUrl(link.url))
  );
  if (defaultLinks.length > 1) {
    const idsToDelete = defaultLinks.slice(1).map((link) => link.id);
    if (idsToDelete.length > 0) {
      const { error: deleteLinksError } = await supabase
        .from("profile_links")
        .delete()
        .eq("profile_id", profileId)
        .eq("user_id", userId)
        .in("id", idsToDelete);
      if (deleteLinksError) throw new Error(deleteLinksError.message);
      changed = true;
    }
  }

  return changed;
}

async function fetchProfilesForUserViaClient(
  supabase: Awaited<ReturnType<typeof createServerSupabase>>,
  userId: string
) {
  const { data, error } = await supabase
    .from("user_profiles")
    .select("*, links:profile_links(*)")
    .eq("user_id", userId)
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  const profiles = (data as ProfileWithLinks[] | null | undefined) ?? [];
  return profiles.map((profile) => ({
    ...profile,
    links: sortLinks(profile.links),
  }));
}

async function resolveStarterProfileSeed(
  supabase: Awaited<ReturnType<typeof createServerSupabase>>,
  userId: string
) {
  const fallbackHandle = normalizeHandle(`user-${userId.slice(0, 8)}`);
  let handleSeed = fallbackHandle;
  let displayName = DEFAULT_PROFILE_NAME;

  const { data, error } = await supabase
    .from("profiles")
    .select("username, display_name")
    .eq("user_id", userId)
    .maybeSingle();
  if (error && error.code !== "PGRST116") {
    return { handleSeed, displayName };
  }

  const username = (data?.username as string | null | undefined)?.trim();
  if (username) {
    handleSeed = normalizeHandle(username);
  }

  const accountDisplayName = (
    data?.display_name as string | null | undefined
  )?.trim();
  if (accountDisplayName) {
    displayName = accountDisplayName;
  }

  return { handleSeed, displayName };
}

async function resolveAvailableHandle(
  supabase: Awaited<ReturnType<typeof createServerSupabase>>,
  handleSeed: string
) {
  let candidate = normalizeHandle(handleSeed);
  for (let attempt = 1; attempt <= 100; attempt += 1) {
    const { data, error } = await supabase
      .from("user_profiles")
      .select("id")
      .eq("handle", candidate)
      .maybeSingle();
    if (error && error.code !== "PGRST116") {
      throw new Error(error.message);
    }
    if (!data) {
      return candidate;
    }
    candidate = `${handleSeed}-${attempt}`;
  }
  return `${handleSeed}-${Date.now().toString(36)}`;
}

async function ensureStarterProfileWithDefaultLink(
  supabase: Awaited<ReturnType<typeof createServerSupabase>>,
  userId: string,
  defaultTheme: string
) {
  const existing = await fetchProfilesForUserViaClient(supabase, userId);
  if (existing.length > 0) {
    const active = existing.find((profile) => profile.is_active) ?? existing[0];
    const changed = await enforceSingleStarterDefaultLink(
      supabase,
      userId,
      active.id
    );
    if (changed) {
      const refreshed = await fetchProfilesForUserViaClient(supabase, userId);
      return refreshed.find((profile) => profile.id === active.id) ?? refreshed[0];
    }
    return active;
  }

  const { handleSeed, displayName } = await resolveStarterProfileSeed(
    supabase,
    userId
  );
  const handle = await resolveAvailableHandle(supabase, handleSeed);

  const { data: createdProfile, error: createProfileError } = await supabase
    .from("user_profiles")
    .insert({
      user_id: userId,
      name: displayName,
      handle,
      headline: null,
      theme: defaultTheme,
      is_active: true,
    })
    .select("id")
    .single();

  if (createProfileError) {
    // Another request may have created a profile in parallel.
    const raced = await fetchProfilesForUserViaClient(supabase, userId);
    if (raced.length > 0) {
      const active = raced.find((profile) => profile.is_active) ?? raced[0];
      const changed = await enforceSingleStarterDefaultLink(
        supabase,
        userId,
        active.id
      );
      if (changed) {
        const refreshed = await fetchProfilesForUserViaClient(supabase, userId);
        return refreshed.find((profile) => profile.id === active.id) ?? refreshed[0];
      }
      return active;
    }
    throw new Error(createProfileError.message);
  }

  const profileId = (createdProfile as { id: string }).id;
  await enforceSingleStarterDefaultLink(supabase, userId, profileId);

  const created = await fetchProfilesForUserViaClient(supabase, userId);
  const starter = created.find((profile) => profile.id === profileId);
  if (!starter) throw new Error("Starter profile missing after creation");
  return starter;
}

function applyThemeAccessToProfile<T extends { theme: string }>(
  profile: T,
  hasPaidAccess: boolean
) {
  return {
    ...profile,
    theme: sanitizeThemeForPlan(
      normalizeThemeName(profile.theme, DEFAULT_THEME),
      hasPaidAccess
    ),
  };
}

function isUuid(value: string | null | undefined): value is string {
  if (!value) return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    value
  );
}

type ExistingLinkState = {
  is_active: boolean;
  is_override: boolean;
};

type IncomingLinkForSave = {
  id?: string;
  title: string;
  url: string;
  linkType: "link" | "resume";
  order_index: number;
  isActive: boolean;
  isOverride: boolean;
};

function normalizeIncomingLinksForSave(
  links: Array<{
    id?: string;
    title: string;
    url: string;
    linkType?: "link" | "resume";
    isActive?: boolean;
    isOverride?: boolean;
  }>,
  existingById: Map<string, ExistingLinkState>
): IncomingLinkForSave[] {
  const indexed = links.map((link, index) => ({
    ...link,
    order_index: index,
  }));
  const hasExplicitOverride = indexed.some(
    (link) => typeof link.isOverride === "boolean"
  );
  let overrideIndex = -1;
  if (hasExplicitOverride) {
    overrideIndex = indexed.findIndex((link) => link.isOverride === true);
  } else {
    overrideIndex = indexed.findIndex(
      (link) => isUuid(link.id) && existingById.get(link.id)?.is_override === true
    );
  }

  return indexed.map((link, index) => {
    const suppliedId = isUuid(link.id) ? link.id : undefined;
    if (suppliedId && !existingById.has(suppliedId)) {
      throw new Error("Profile link id is not owned by this profile.");
    }

    const existing = suppliedId ? existingById.get(suppliedId) : undefined;
    const isOverride = index === overrideIndex;
    const hasExplicitActive = typeof link.isActive === "boolean";
    const isActive = isOverride
      ? true
      : hasExplicitActive
      ? Boolean(link.isActive)
      : existing?.is_active ?? true;
    return {
      id: suppliedId,
      title: link.title,
      url: sanitizePublicLinkUrl(link.url),
      linkType: link.linkType === "resume" ? "resume" : "link",
      order_index: index,
      isActive,
      isOverride,
    };
  });
}

async function ensureHasActiveProfile(
  supabase: Awaited<ReturnType<typeof createServerSupabase>>,
  userId: string,
  fallbackId: string
) {
  const { data, error } = await supabase
    .from("user_profiles")
    .select("id")
    .eq("user_id", userId)
    .eq("is_active", true)
    .maybeSingle();
  if (error && error.code !== "PGRST116") throw new Error(error.message);
  if (data?.id) return;
  await supabase
    .from("user_profiles")
    .update({ is_active: true, updated_at: new Date().toISOString() })
    .eq("id", fallbackId)
    .eq("user_id", userId);
}

async function suggestHandles(
  supabase: Awaited<ReturnType<typeof createServerSupabase>>,
  handle: string
): Promise<string[]> {
  const { data } = await supabase
    .from("user_profiles")
    .select("handle")
    .like("handle", `${handle}%`)
    .limit(25);
  const taken = new Set(
    (data ?? [])
      .map((row) => (row as { handle?: string | null }).handle)
      .filter((value): value is string => Boolean(value))
  );
  taken.add(handle);
  const suggestions: string[] = [];
  for (let i = 1; i <= 50 && suggestions.length < 3; i += 1) {
    const candidate = `${handle}-${i}`;
    if (!taken.has(candidate)) {
      suggestions.push(candidate);
    }
  }
  return suggestions;
}

export async function GET(request: NextRequest) {
  try {
    const parsedQuery = validateSearchParams(
      request.nextUrl.searchParams,
      linketProfilesQuerySchema
    );
    if (!parsedQuery.ok) {
      return parsedQuery.response;
    }
    const { userId } = parsedQuery.data;

    const access = await requireRouteAccess("GET /api/linket-profiles", {
      resourceUserId: userId,
    });
    if (access instanceof NextResponse) {
      return access;
    }
    const planAccess = await getDashboardPlanAccessForUser(userId);
    const defaultTheme = sanitizeThemeForPlan(DEFAULT_THEME, planAccess);
    const supabase = await createServerSupabase();

    if (isSupabaseAdminAvailable) {
      try {
        const profiles = await getProfilesForUser(userId);
        if (profiles.length === 0) {
          const starter = await ensureStarterProfileWithDefaultLink(
            supabase,
            userId,
            defaultTheme
          );
          return NextResponse.json(
            [applyThemeAccessToProfile(starter, planAccess.hasPaidAccess)],
            {
              headers: {
                "Cache-Control": "no-store, max-age=0",
              },
            }
          );
        }
        const active = profiles.find((profile) => profile.is_active) ?? profiles[0];
        if (needsStarterLinkRepair(active?.links)) {
          const starter = await ensureStarterProfileWithDefaultLink(
            supabase,
            userId,
            defaultTheme
          );
          return NextResponse.json(
            [applyThemeAccessToProfile(starter, planAccess.hasPaidAccess)],
            {
              headers: {
                "Cache-Control": "no-store, max-age=0",
              },
            }
          );
        }
        return NextResponse.json(
          profiles.map((profile) =>
            applyThemeAccessToProfile(profile, planAccess.hasPaidAccess)
          ),
          {
            headers: {
              "Cache-Control": "no-store, max-age=0",
            },
          }
        );
      } catch (adminError) {
        console.error("Linket profiles admin fetch error:", adminError);
      }
    }

    const mapped = await fetchProfilesForUserViaClient(supabase, userId);
    if (mapped.length === 0) {
      const starter = await ensureStarterProfileWithDefaultLink(
        supabase,
        userId,
        defaultTheme
      );
      return NextResponse.json(
        [applyThemeAccessToProfile(starter, planAccess.hasPaidAccess)],
        {
          headers: {
            "Cache-Control": "no-store, max-age=0",
          },
        }
      );
    }
    const active = mapped.find((profile) => profile.is_active) ?? mapped[0];
    if (needsStarterLinkRepair(active?.links)) {
      const starter = await ensureStarterProfileWithDefaultLink(
        supabase,
        userId,
        defaultTheme
      );
      return NextResponse.json(
        [applyThemeAccessToProfile(starter, planAccess.hasPaidAccess)],
        {
          headers: {
            "Cache-Control": "no-store, max-age=0",
          },
        }
      );
    }

    return NextResponse.json(
      mapped.map((profile) =>
        applyThemeAccessToProfile(profile, planAccess.hasPaidAccess)
      ),
      {
        headers: {
          "Cache-Control": "no-store, max-age=0",
        },
      }
    );
  } catch (error) {
    console.error("Linket profiles API error:", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to fetch profiles",
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const untrusted = rejectUntrustedWrite(request);
    if (untrusted) return untrusted;

    const parsedBody = await validateJsonBody(request, linketProfilesPostSchema);
    if (!parsedBody.ok) {
      return parsedBody.response;
    }
    const { profile, userId } = parsedBody.data as {
      profile: ProfilePayload;
      userId: string;
    };

    const access = await requireRouteAccess("POST /api/linket-profiles", {
      resourceUserId: userId,
    });
    if (access instanceof NextResponse) {
      return access;
    }
    const planAccess = await getDashboardPlanAccessForUser(userId);
    const supabase = await createServerSupabase();
    const sanitizedProfile = {
      ...profile,
      theme: sanitizeThemeForPlan(
        normalizeThemeName(profile.theme, DEFAULT_THEME),
        planAccess
      ),
    };
    const previousHandle = await fetchOwnedProfileHandle(
      supabase,
      userId,
      sanitizedProfile.id
    );
    const previousActiveHandles = await fetchActivePublicHandles(supabase, userId);

    if (isSupabaseAdminAvailable) {
      try {
        const saved = await saveProfileForUser(userId, sanitizedProfile);
        revalidatePublicProfileHandles(
          previousHandle,
          ...previousActiveHandles,
          saved.handle
        );
        return NextResponse.json(
          applyThemeAccessToProfile(saved, planAccess.hasPaidAccess),
          {
            headers: {
              "Cache-Control": "no-store, max-age=0",
            },
          }
        );
      } catch (adminError) {
        if (isHandleConflictError(adminError)) {
          return NextResponse.json(
            { error: adminError.message, suggestions: adminError.suggestions },
            { status: 409 }
          );
        }
        console.error("Linket profiles admin save error:", adminError);
        return NextResponse.json(
          {
            error:
              adminError instanceof Error
                ? adminError.message
                : "Failed to save profile",
          },
          { status: 500 }
        );
      }
    }

    const name = sanitizedProfile.name?.trim();
    const handle = normalizeHandle(sanitizedProfile.handle ?? "");
    const theme = sanitizeThemeForPlan(
      normalizeThemeName(sanitizedProfile.theme, "autumn"),
      planAccess
    );
    if (!name) {
      return NextResponse.json(
        { error: "Profile name is required" },
        { status: 400 }
      );
    }
    if (!handle) {
      return NextResponse.json(
        { error: "Handle is required" },
        { status: 400 }
      );
    }

    if (sanitizedProfile.id) {
      const { data } = await supabase
        .from("user_profiles")
        .select("id")
        .eq("handle", handle)
        .maybeSingle();
      if (data && (data as { id?: string }).id !== sanitizedProfile.id) {
        return NextResponse.json(
          {
            error: "Handle already taken",
            suggestions: await suggestHandles(supabase, handle),
          },
          { status: 409 }
        );
      }
    } else {
      const { data } = await supabase
        .from("user_profiles")
        .select("id")
        .eq("handle", handle)
        .maybeSingle();
      if (data) {
        return NextResponse.json(
          {
            error: "Handle already taken",
            suggestions: await suggestHandles(supabase, handle),
          },
          { status: 409 }
        );
      }
    }

    let profileId = sanitizedProfile.id ?? null;
    const incomingLinks = sanitizedProfile.links ?? [];
    const linksForSave =
      !profileId && incomingLinks.length === 0
        ? [{ title: "Website", url: DEFAULT_PROFILE_LINK_URL }]
        : incomingLinks;
    if (!profileId) {
      const { data, error: insertError } = await supabase
        .from("user_profiles")
        .insert({
          user_id: userId,
          name,
          handle,
          headline: sanitizedProfile.headline?.trim() || null,
          avatar_visible: sanitizedProfile.avatarVisible ?? true,
          header_image_url: sanitizedProfile.headerImageUrl ?? null,
          header_image_updated_at: sanitizedProfile.headerImageUpdatedAt ?? null,
          header_image_original_file_name:
            sanitizedProfile.headerImageOriginalFileName ?? null,
          logo_url: sanitizedProfile.logoUrl ?? null,
          logo_updated_at: sanitizedProfile.logoUpdatedAt ?? null,
          logo_original_file_name: sanitizedProfile.logoOriginalFileName ?? null,
          logo_shape: sanitizedProfile.logoShape ?? "circle",
          logo_bg_white: sanitizedProfile.logoBackgroundWhite ?? false,
          theme,
          is_active: false,
        })
        .select("*")
        .single();
      if (insertError) throw new Error(insertError.message);
      profileId = (data as UserProfileRecord).id;
    } else {
      const updatePayload: Record<string, unknown> = {
        name,
        handle,
        headline: sanitizedProfile.headline?.trim() || null,
        theme,
        updated_at: new Date().toISOString(),
      };
      if (sanitizedProfile.avatarVisible !== undefined) {
        updatePayload.avatar_visible = sanitizedProfile.avatarVisible;
      }
      if (sanitizedProfile.headerImageUrl !== undefined) {
        updatePayload.header_image_url = sanitizedProfile.headerImageUrl;
      }
      if (sanitizedProfile.headerImageUpdatedAt !== undefined) {
        updatePayload.header_image_updated_at = sanitizedProfile.headerImageUpdatedAt;
      }
      if (sanitizedProfile.headerImageOriginalFileName !== undefined) {
        updatePayload.header_image_original_file_name =
          sanitizedProfile.headerImageOriginalFileName;
      }
      if (sanitizedProfile.logoUrl !== undefined) {
        updatePayload.logo_url = sanitizedProfile.logoUrl;
      }
      if (sanitizedProfile.logoUpdatedAt !== undefined) {
        updatePayload.logo_updated_at = sanitizedProfile.logoUpdatedAt;
      }
      if (sanitizedProfile.logoOriginalFileName !== undefined) {
        updatePayload.logo_original_file_name =
          sanitizedProfile.logoOriginalFileName;
      }
      if (sanitizedProfile.logoShape !== undefined) {
        updatePayload.logo_shape = sanitizedProfile.logoShape;
      }
      if (sanitizedProfile.logoBackgroundWhite !== undefined) {
        updatePayload.logo_bg_white = sanitizedProfile.logoBackgroundWhite;
      }
      const { error: updateError } = await supabase
        .from("user_profiles")
        .update(updatePayload)
        .eq("id", profileId)
        .eq("user_id", userId);
      if (updateError) throw new Error(updateError.message);
    }

    const { data: existingLinks, error: existingError } = await supabase
      .from("profile_links")
      .select("id,is_active,is_override")
      .eq("profile_id", profileId);
    if (existingError) throw new Error(existingError.message);

    const existingLinkStateById = new Map<string, ExistingLinkState>(
      (existingLinks ?? []).map((row) => [
        row.id as string,
        {
          is_active: Boolean((row as { is_active?: boolean | null }).is_active),
          is_override: Boolean(
            (row as { is_override?: boolean | null }).is_override
          ),
        },
      ])
    );
    const normalizedLinks = normalizeIncomingLinksForSave(
      linksForSave,
      existingLinkStateById
    );
    const selectedOverrideOrderIndex =
      normalizedLinks.find((link) => link.isOverride)?.order_index ?? null;
    const incomingIds = new Set(
      normalizedLinks.filter((link) => isUuid(link.id)).map((link) => link.id!)
    );
    const idsToDelete = (existingLinks ?? [])
      .map((row) => row.id as string)
      .filter((id) => !incomingIds.has(id));

    if (idsToDelete.length) {
      const { error: deleteError } = await supabase
        .from("profile_links")
        .delete()
        .in("id", idsToDelete);
      if (deleteError) throw new Error(deleteError.message);
    }

    const upsertLinks = normalizedLinks
      .filter((link) => isUuid(link.id))
      .map((link) => ({
        id: link.id!,
        profile_id: profileId,
        user_id: userId,
        title: link.title?.trim() || "Link",
        url: link.url?.trim() || "https://",
        link_type: link.linkType,
        order_index: link.order_index,
        is_active: link.isActive,
        is_override: false,
      }));
    if (upsertLinks.length) {
      const { error: upsertLinksError } = await supabase
        .from("profile_links")
        .upsert(upsertLinks, { onConflict: "id" });
      if (upsertLinksError) throw new Error(upsertLinksError.message);
    }

    const newLinks = normalizedLinks.filter((link) => !isUuid(link.id));
    if (newLinks.length) {
      const formatted = newLinks.map((link) => ({
        profile_id: profileId,
        user_id: userId,
        title: link.title?.trim() || "Link",
        url: link.url?.trim() || "https://",
        link_type: link.linkType,
        order_index: link.order_index,
        is_active: link.isActive,
        is_override: false,
      }));
      const { error: insertLinksError } = await supabase
        .from("profile_links")
        .insert(formatted);
      if (insertLinksError) throw new Error(insertLinksError.message);
    }

    const { error: clearOverrideError } = await supabase
      .from("profile_links")
      .update({ is_override: false })
      .eq("profile_id", profileId)
      .eq("user_id", userId)
      .eq("is_override", true);
    if (clearOverrideError) throw new Error(clearOverrideError.message);

    if (selectedOverrideOrderIndex !== null) {
      const { error: setOverrideError } = await supabase
        .from("profile_links")
        .update({ is_override: true, is_active: true })
        .eq("profile_id", profileId)
        .eq("user_id", userId)
        .eq("order_index", selectedOverrideOrderIndex);
      if (setOverrideError) throw new Error(setOverrideError.message);
    }

    if (sanitizedProfile.active) {
      const { error: deactivateError } = await supabase
        .from("user_profiles")
        .update({ is_active: false })
        .eq("user_id", userId);
      if (deactivateError) throw new Error(deactivateError.message);
      const { error: activateError } = await supabase
        .from("user_profiles")
        .update({ is_active: true, updated_at: new Date().toISOString() })
        .eq("id", profileId)
        .eq("user_id", userId);
      if (activateError) throw new Error(activateError.message);
      await recordConversionEvent({
        eventId: "profile_published",
        userId,
        eventSource: "server",
        meta: {
          profileId,
          source: "profile-save",
        },
      });
    } else {
      await ensureHasActiveProfile(supabase, userId, profileId);
    }

    await ensurePublishedLeadFormRow({
      client: supabase,
      userId,
      handle: sanitizedProfile.handle,
      profileId,
    });

    const { data: saved, error: fetchError } = await supabase
      .from("user_profiles")
      .select("*, links:profile_links(*)")
      .eq("id", profileId)
      .maybeSingle();
    if (fetchError) throw new Error(fetchError.message);
    if (!saved) throw new Error("Profile not found after save");

    const payload = applyThemeAccessToProfile(
      {
        ...(saved as ProfileWithLinks),
        links: sortLinks((saved as ProfileWithLinks).links),
      },
      planAccess.hasPaidAccess
    );
    revalidatePublicProfileHandles(
      previousHandle,
      ...previousActiveHandles,
      payload.handle
    );

    return NextResponse.json(payload, {
      headers: {
        "Cache-Control": "no-store, max-age=0",
      },
    });
  } catch (error) {
    console.error("Linket profiles API error:", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to save profile",
      },
      { status: 500 }
    );
  }
}
