"use client";

import type { CSSProperties } from "react";
import { useEffect, useLayoutEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { X } from "lucide-react";
import Sidebar from "@/components/dashboard/Sidebar";
import DashboardOnboardingTour from "@/components/dashboard/DashboardOnboardingTour";
import { useThemeOptional } from "@/components/theme/theme-provider";
import type { DashboardOnboardingState } from "@/lib/dashboard-onboarding-types";
import { isDarkTheme } from "@/lib/themes";
import { cn } from "@/lib/utils";

const ONBOARDING_COMPLETION_SESSION_KEY_PREFIX =
  "linket:onboarding-complete";

function getOnboardingCompletionSessionKey(userId: string) {
  return `${ONBOARDING_COMPLETION_SESSION_KEY_PREFIX}:${userId}`;
}

export default function DashboardAppShell({
  children,
  onboardingState,
}: {
  children: React.ReactNode;
  onboardingState: DashboardOnboardingState;
}) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [dashboardNavHeight, setDashboardNavHeight] = useState(64);
  const pathname = usePathname() ?? "";
  const router = useRouter();
  const { theme } = useThemeOptional();
  const isSetupRoute = pathname.startsWith("/dashboard/get-started");
  const onboardingCompletionSessionKey =
    getOnboardingCompletionSessionKey(onboardingState.userId);
  const [hasOnboardingCompletionOverride] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.sessionStorage.getItem(onboardingCompletionSessionKey) === "1";
  });
  const effectiveRequiresOnboarding =
    onboardingState.requiresOnboarding &&
    !(hasOnboardingCompletionOverride && !isSetupRoute);
  const effectiveOnboardingState: DashboardOnboardingState = {
    ...onboardingState,
    requiresOnboarding: effectiveRequiresOnboarding,
  };
  const shouldHideChrome = isSetupRoute;
  const shouldRedirectToSetup =
    effectiveRequiresOnboarding && !isSetupRoute;

  useLayoutEffect(() => {
    document.documentElement.classList.add("dashboard-scroll-locked");
    document.body.classList.add("dashboard-scroll-locked");

    return () => {
      document.documentElement.classList.remove("dashboard-scroll-locked");
      document.body.classList.remove("dashboard-scroll-locked");
    };
  }, []);

  useLayoutEffect(() => {
    const measureNavbarHeight = () => {
      const navbar = document.querySelector<HTMLElement>(".dashboard-navbar");
      if (!navbar) return;
      setDashboardNavHeight(Math.round(navbar.getBoundingClientRect().height));
    };

    measureNavbarHeight();

    const navbar = document.querySelector<HTMLElement>(".dashboard-navbar");
    if (!navbar || typeof ResizeObserver === "undefined") {
      return;
    }

    const observer = new ResizeObserver(measureNavbarHeight);
    observer.observe(navbar);
    window.addEventListener("resize", measureNavbarHeight);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measureNavbarHeight);
    };
  }, [pathname]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!onboardingState.requiresOnboarding) {
      window.sessionStorage.removeItem(onboardingCompletionSessionKey);
    }
  }, [onboardingCompletionSessionKey, onboardingState.requiresOnboarding]);

  useEffect(() => {
    const onResize = () => {
      if (window.innerWidth >= 1024) {
        setSidebarOpen(false);
      }
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    const handleToggle = () => setSidebarOpen((prev) => !prev);
    const handleOpen = () => setSidebarOpen(true);
    const handleClose = () => setSidebarOpen(false);
    window.addEventListener("linket:dashboard-sidebar-toggle", handleToggle);
    window.addEventListener("linket:dashboard-sidebar-open", handleOpen);
    window.addEventListener("linket:dashboard-sidebar-close", handleClose);
    return () => {
      window.removeEventListener("linket:dashboard-sidebar-toggle", handleToggle);
      window.removeEventListener("linket:dashboard-sidebar-open", handleOpen);
      window.removeEventListener("linket:dashboard-sidebar-close", handleClose);
    };
  }, []);

  useEffect(() => {
    window.dispatchEvent(
      new CustomEvent("linket:dashboard-sidebar-state", {
        detail: { open: sidebarOpen },
      })
    );
  }, [sidebarOpen]);

  useEffect(() => {
    if (!shouldRedirectToSetup) return;
    router.replace("/dashboard/get-started");
  }, [router, shouldRedirectToSetup]);

  if (shouldRedirectToSetup) {
    return (
      <div
        id="dashboard-theme-scope"
        className={cn(
          "font-dashboard flex min-h-[100svh] items-center justify-center bg-[var(--background)] px-6",
          `theme-${theme}`,
          isDarkTheme(theme) && "dark"
        )}
      >
        <div className="w-full max-w-md rounded-3xl border border-border/60 bg-card/90 px-6 py-8 text-center shadow-[0_28px_70px_-45px_rgba(15,23,42,0.35)]">
          <p className="text-sm font-semibold text-foreground">
            Redirecting to setup...
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            Taking you to the fastest path to a live Linket profile.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      id="dashboard-theme-scope"
      className={cn(
        "font-dashboard flex min-h-0 overflow-hidden bg-[var(--background)]",
        `theme-${theme}`,
        isDarkTheme(theme) && "dark"
      )}
      style={
        {
          "--dashboard-nav-height": `${dashboardNavHeight}px`,
          height: `calc(100svh - ${dashboardNavHeight}px)`,
        } as CSSProperties
      }
    >
      {!shouldHideChrome ? (
        <div className="relative z-30 hidden h-[calc(100vh-var(--dashboard-nav-height))] lg:sticky lg:top-[var(--dashboard-nav-height)] lg:block">
          <Sidebar onboardingState={effectiveOnboardingState} />
        </div>
      ) : null}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <div
          className={cn(
            "dashboard-scroll-area scroll-native-y min-h-0 flex-1 overflow-x-hidden overflow-y-auto",
            shouldHideChrome
              ? "px-0 pb-0 pt-0"
              : "px-5 pb-6 pt-4 sm:px-6 sm:pb-8 sm:pt-5 lg:px-8 lg:pb-10"
          )}
          data-page-scroll
          role="region"
          aria-label="Dashboard content"
          tabIndex={0}
        >
          <div
            className={cn(
              "dashboard-content mx-auto w-full",
              shouldHideChrome ? "max-w-none" : "max-w-none lg:max-w-7xl"
            )}
          >
            {children}
          </div>
        </div>
      </div>
      {!shouldHideChrome ? (
        <div
          className={cn(
            "fixed inset-0 z-40 transition lg:hidden",
            sidebarOpen ? "pointer-events-auto" : "pointer-events-none"
          )}
          aria-hidden={!sidebarOpen}
        >
          <div
            className={cn(
              "dashboard-sidebar-overlay absolute inset-0 bg-black/40 transition-opacity",
              sidebarOpen ? "opacity-100" : "opacity-0"
            )}
            onClick={() => setSidebarOpen(false)}
          />
          <div
            className={cn(
              "dashboard-sidebar-panel absolute inset-x-0 bottom-0 max-h-[min(82svh,44rem)] w-full transform rounded-t-3xl border-t border-border/60 bg-background pb-[env(safe-area-inset-bottom)] shadow-2xl transition-transform duration-300 [transition-timing-function:cubic-bezier(0.32,0.72,0,1)] will-change-transform",
              sidebarOpen ? "translate-y-0" : "translate-y-full"
            )}
          >
            <div className="relative flex items-center justify-center px-4 py-3">
              <span className="text-sm font-semibold text-foreground">
                Navigation
              </span>
              <button
                type="button"
                onClick={() => setSidebarOpen(false)}
                className="absolute right-4 inline-flex h-11 w-11 items-center justify-center rounded-full text-muted-foreground hover:bg-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--ring)]"
                aria-label="Close navigation"
              >
                <X className="h-4 w-4" aria-hidden />
              </button>
            </div>
            <Sidebar
              onboardingState={effectiveOnboardingState}
              variant="mobile"
              className="h-full w-full border-r-0 bg-transparent pb-[calc(env(safe-area-inset-bottom)+1rem)]"
              onNavigate={() => setSidebarOpen(false)}
            />
          </div>
        </div>
      ) : null}
      {!shouldHideChrome ? (
        <DashboardOnboardingTour
          initialSeen={effectiveOnboardingState.dashboardTourSeen}
        />
      ) : null}
    </div>
  );
}
