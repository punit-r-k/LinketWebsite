"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import ThemeToggle from "@/components/dashboard/ThemeToggle";
import { createClient } from "@/lib/supabase/client";
import { trackEvent } from "@/lib/analytics";
import type { DashboardOnboardingState } from "@/lib/dashboard-onboarding-types";
import {
  LayoutDashboard,
  BarChart3,
  MessageSquare,
  CreditCard,
  Settings,
  ChevronLeft,
  ChevronRight,
  Package,
  Megaphone,
  Flag,
  User,
  Wrench,
} from "lucide-react";

const BASE_NAV = [
  { href: "/dashboard/overview", label: "Overview", icon: LayoutDashboard },
  {
    href: "/dashboard/profiles",
    label: "Public Profile",
    icon: User,
  },
  { href: "/dashboard/leads", label: "Leads", icon: MessageSquare },
  { href: "/dashboard/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/dashboard/billing", label: "Billing", icon: CreditCard },
  { href: "/dashboard/settings", label: "Settings", icon: Settings },
];

const STORAGE_KEY = "dash:sidebar-collapsed";

function readSidebarCollapsed() {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

function writeSidebarCollapsed(collapsed: boolean) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, collapsed ? "1" : "0");
  } catch {
    // Ignore storage failures (private browsing / restricted storage).
  }
}

export default function Sidebar({
  className,
  variant = "desktop",
  onNavigate,
  onboardingState,
}: {
  className?: string;
  variant?: "desktop" | "mobile";
  onNavigate?: () => void;
  onboardingState?: DashboardOnboardingState;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(() => {
    if (variant === "mobile") return false;
    return readSidebarCollapsed();
  });
  const [isAdmin, setIsAdmin] = useState(false);
  const supabase = useMemo(() => createClient(), []);
  const isMobile = variant === "mobile";
  const isProfileEditor = pathname?.startsWith("/dashboard/profiles") ?? false;
  const canCollapse = !isMobile;
  const isCollapsed = canCollapse && collapsed;

  useEffect(() => {
    if (isMobile) return;
    writeSidebarCollapsed(collapsed);
  }, [collapsed, isMobile]);

  useEffect(() => {
    let active = true;
    (async () => {
      const { data: userData } = await supabase.auth.getUser();
      if (!active) return;
      const userId = userData.user?.id;
      if (!userId) {
        setIsAdmin(false);
        return;
      }

      const { data, error } = await supabase
        .from("admin_users")
        .select("id,user_id")
        .eq("user_id", userId)
        .limit(1);
      if (!active) return;
      if (error) {
        setIsAdmin(false);
        return;
      }
      setIsAdmin(Array.isArray(data) ? data.length > 0 : Boolean(data));
    })().catch(() => {
      if (active) setIsAdmin(false);
    });
    return () => {
      active = false;
    };
  }, [supabase]);

  const navItems = useMemo(() => {
    if (onboardingState?.requiresOnboarding) {
      return [
        {
          href: "/dashboard/get-started",
          label: "Get Started",
          icon: Flag,
        },
      ];
    }
    if (!isAdmin) return BASE_NAV;
    return [
      ...BASE_NAV,
      {
        href: "/dashboard/admin/analytics",
        label: "Product Analytics",
        icon: BarChart3,
      },
      { href: "/dashboard/admin/mint", label: "Minting", icon: Package },
      {
        href: "/dashboard/admin/entitlements",
        label: "Entitlements",
        icon: Wrench,
      },
      {
        href: "/dashboard/admin/notifications",
        label: "Notifications",
        icon: Megaphone,
      },
    ];
  }, [isAdmin, onboardingState?.requiresOnboarding]);


  const requestAutosave = useCallback(() => {
    if (typeof window === "undefined") return;
    window.dispatchEvent(new CustomEvent("linket:save-request"));
  }, []);

  const requestNavigation = useCallback(
    (href: string) => {
      requestAutosave();
      onNavigate?.();
      router.push(href);
    },
    [onNavigate, requestAutosave, router]
  );

  return (
    <aside
      data-tour="dashboard-sidebar"
      className={cn(
        "dashboard-sidebar h-full shrink-0 border-r bg-sidebar",
        isCollapsed ? "w-[72px]" : "w-[200px]",
        className
      )}
      aria-label="Primary"
    >
      <div className="flex min-h-full flex-col">
        <div className="flex items-center justify-end gap-2 px-4 py-5">
          {canCollapse && (
            <button
              aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
              onClick={() => setCollapsed((v) => !v)}
              className="rounded-md p-1 text-muted-foreground hover:bg-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--ring)]"
            >
              {isCollapsed ? (
                <ChevronRight className="h-4 w-4" />
              ) : (
                <ChevronLeft className="h-4 w-4" />
              )}
            </button>
          )}
        </div>
        {!onboardingState?.requiresOnboarding ? (
          <div className={cn("px-3 pb-2", isCollapsed && "flex justify-center")}>
            <ThemeToggle showLabel={!isCollapsed || isMobile} />
          </div>
        ) : null}
        <nav className="flex-1 space-y-1 px-2">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active =
              pathname === item.href ||
              (item.href === "/dashboard/overview" && pathname === "/dashboard");
            return (
              <Link
                key={item.href}
                href={item.href}
                title={item.label}
                data-active={active ? "true" : "false"}
                className={cn(
                  "dashboard-sidebar-link group relative flex items-center gap-3 rounded-xl px-2.5 py-2 text-sm outline-none transition",
                  isCollapsed && !isMobile && "justify-center",
                  active
                    ? "bg-gradient-to-r from-[var(--primary)]/20 to-[var(--accent)]/20 text-foreground ring-1 ring-[var(--ring)]/40 shadow-[var(--shadow-ambient)]"
                    : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                )}
                onClick={(event) => {
                  void trackEvent("dashboard_nav_clicked", {
                    href: item.href,
                    label: item.label,
                    source: variant,
                    from_path: pathname ?? null,
                  });
                  requestAutosave();
                  if (!isProfileEditor) {
                    onNavigate?.();
                    return;
                  }
                  event.preventDefault();
                  requestNavigation(item.href);
                }}
              >
                <Icon className="h-4 w-4 shrink-0" />
                {(!isCollapsed || isMobile) && (
                  <span className="truncate">{item.label}</span>
                )}
                {isCollapsed && !isMobile && (
                  <span className="pointer-events-none absolute left-[54px] top-1/2 hidden -translate-y-1/2 rounded-md bg-popover px-2 py-1 text-xs text-popover-foreground shadow-md ring-1 ring-border group-hover:block">
                    {item.label}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>
        <div className="mt-auto space-y-2 p-2">
          <div className="px-2 pb-2 text-[10px] text-muted-foreground">
            v0.1.0
          </div>
        </div>
      </div>
    </aside>
  );
}
