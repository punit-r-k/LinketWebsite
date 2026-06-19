"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useThemeOptional } from "@/components/theme/theme-provider";
import {
  DASHBOARD_THEME_ICONS,
  DASHBOARD_THEME_LABELS,
  DASHBOARD_THEME_ORDER,
} from "@/components/dashboard/theme-options";
import {
  clearPendingDashboardTheme,
  writePendingDashboardTheme,
} from "@/lib/dashboard-theme-pending";
import { FREE_THEME_NAMES, sanitizeThemeForPlan } from "@/lib/plan-access";
import type { ThemeName } from "@/lib/themes";
import { cn } from "@/lib/utils";
import {
  useDashboardPlanAccess,
  useDashboardUser,
} from "@/components/dashboard/DashboardSessionContext";

export default function ThemeToggle({ showLabel = false }: { showLabel?: boolean }) {
  const { theme, setTheme } = useThemeOptional();
  const user = useDashboardUser();
  const planAccess = useDashboardPlanAccess();
  const abortRef = useRef<AbortController | null>(null);
  const [mounted, setMounted] = useState(false);
  const availableThemes = useMemo(
    () => (planAccess.hasPaidAccess ? DASHBOARD_THEME_ORDER : [...FREE_THEME_NAMES]),
    [planAccess.hasPaidAccess]
  );
  const activeTheme = sanitizeThemeForPlan(theme, planAccess);
  const [index, setIndex] = useState(
    Math.max(0, availableThemes.indexOf(activeTheme))
  );

  useEffect(() => {
    setIndex(Math.max(0, availableThemes.indexOf(activeTheme)));
  }, [activeTheme, availableThemes]);

  useEffect(() => {
    setMounted(true);
  }, []);

  const syncPublicTheme = useCallback(async (nextTheme: ThemeName) => {
    if (!user?.id) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const profilesRes = await fetch(
        `/api/linket-profiles?userId=${encodeURIComponent(user.id)}`,
        { cache: "no-store", signal: controller.signal }
      );
      if (!profilesRes.ok) {
        const info = await profilesRes.json().catch(() => ({}));
        throw new Error(info?.error || "Unable to load profile.");
      }
      const profiles = (await profilesRes.json()) as Array<{
        id: string;
        name: string;
        handle: string;
        headline?: string | null;
        is_active?: boolean | null;
        links?: Array<{ id?: string; title: string; url: string }>;
      }>;
      const activeProfile =
        profiles.find((item) => item.is_active) ?? profiles[0];
      if (!activeProfile) return;

      const payload = {
        id: activeProfile.id,
        name: activeProfile.name,
        handle: activeProfile.handle,
        headline: activeProfile.headline ?? "",
        theme: nextTheme,
        links: (activeProfile.links ?? []).map((link) => ({
          id: link.id,
          title: link.title,
          url: link.url,
        })),
        active: activeProfile.is_active ?? true,
      };

      const saveRes = await fetch("/api/linket-profiles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user.id, profile: payload }),
        signal: controller.signal,
      });
      if (!saveRes.ok) {
        const info = await saveRes.json().catch(() => ({}));
        throw new Error(info?.error || "Unable to update public theme.");
      }
      clearPendingDashboardTheme();
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      const message =
        error instanceof Error ? error.message : "Unable to update public theme.";
      console.warn("Theme update failed:", message);
      clearPendingDashboardTheme();
    }
  }, [user?.id]);

  useEffect(() => {
    if (!mounted || theme === activeTheme) return;
    writePendingDashboardTheme(activeTheme);
    setTheme(activeTheme);
    void syncPublicTheme(activeTheme);
  }, [activeTheme, mounted, setTheme, syncPublicTheme, theme]);

  function next() {
    const nextIndex = (index + 1) % availableThemes.length;
    const value = availableThemes[nextIndex];
    setIndex(nextIndex);
    writePendingDashboardTheme(value);
    setTheme(value);
    void syncPublicTheme(value);
  }

  function previous() {
    const nextIndex = (index - 1 + availableThemes.length) % availableThemes.length;
    const value = availableThemes[nextIndex];
    setIndex(nextIndex);
    writePendingDashboardTheme(value);
    setTheme(value);
    void syncPublicTheme(value);
  }

  const current = availableThemes[index] || availableThemes[0];
  const Icon = DASHBOARD_THEME_ICONS[current];
  const label = DASHBOARD_THEME_LABELS[current];
  const compactIconClassName =
    current === "burnt-orange"
      ? "h-6 w-8"
      : current === "maroon"
        ? "h-8 w-8"
        : "h-5 w-5";
  const lightIconToneClassName =
    activeTheme === "light" ? "text-[color:var(--brand-lilac)]" : "";
  const labelIconClassName = cn(
    "shrink-0",
    lightIconToneClassName,
    current === "burnt-orange"
      ? "h-5 w-10 -mr-2 sm:h-6 sm:w-12 sm:-mr-3"
      : current === "maroon"
        ? "h-7 w-7 -mr-1 sm:h-8 sm:w-8 sm:-mr-1.5"
        : "h-5 w-5 sm:h-6 sm:w-6"
  );
  const labelToggleArrowClassName =
    "h-7 w-5 justify-self-center rounded-lg sm:h-8 sm:w-6";

  if (!mounted) {
    if (!showLabel) {
      return (
        <Button
          variant="ghost"
          size="icon"
          aria-label="Theme"
          title="Theme"
          disabled
        >
          <Sun className={cn("h-5 w-5", lightIconToneClassName)} />
        </Button>
      );
    }
    return (
      <div className="grid w-full max-w-full grid-cols-[1.75rem_minmax(0,1fr)_1.75rem] items-center gap-1.5 rounded-xl border border-border/70 bg-card px-1.5 py-1.5 shadow-sm sm:grid-cols-[2rem_minmax(0,1fr)_2rem] sm:gap-2 sm:px-2">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Previous theme"
          className={labelToggleArrowClassName}
          disabled
        >
          <ChevronLeft className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
        </Button>
        <div className="flex min-w-0 items-center justify-center gap-1.5 rounded-lg px-1 text-xs text-muted-foreground sm:gap-2 sm:px-2">
          <Sun className={cn("h-5 w-5 shrink-0 sm:h-6 sm:w-6", lightIconToneClassName)} />
          <span className="font-medium whitespace-nowrap">Theme</span>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Next theme"
          className={labelToggleArrowClassName}
          disabled
        >
          <ChevronRight className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
        </Button>
      </div>
    );
  }

  if (!showLabel) {
    return (
      <Button
        variant="ghost"
        size="icon"
        aria-label={`Theme: ${label}`}
        onClick={next}
        title={`Theme: ${label}`}
      >
        <Icon className={cn(compactIconClassName, lightIconToneClassName)} />
      </Button>
    );
  }

  return (
    <div className="grid w-full max-w-full grid-cols-[1.75rem_minmax(0,1fr)_1.75rem] items-center gap-1.5 rounded-xl border border-border/70 bg-card px-1.5 py-1.5 shadow-sm sm:grid-cols-[2rem_minmax(0,1fr)_2rem] sm:gap-2 sm:px-2">
      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={previous}
        aria-label="Previous theme"
        className={labelToggleArrowClassName}
      >
        <ChevronLeft className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
      </Button>
      <div
        aria-label={`Theme: ${label}`}
        title={`Theme: ${label}`}
        className="flex min-w-0 items-center justify-center rounded-lg px-1 text-xs sm:px-2"
      >
        <div className="min-w-0 text-center">
          <div className="flex items-center justify-center gap-2">
            <Icon className={labelIconClassName} />
            <span className="font-medium text-muted-foreground whitespace-nowrap">
              {label}
            </span>
          </div>
          {!planAccess.hasPaidAccess ? (
            <div className="truncate text-[9px] text-muted-foreground/80 sm:text-[10px]">
              Unlock Pro
            </div>
          ) : null}
        </div>
      </div>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={next}
        aria-label="Next theme"
        className={labelToggleArrowClassName}
      >
        <ChevronRight className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
      </Button>
    </div>
  );
}
