"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { usePathname, useRouter } from "next/navigation";
import Image from "next/image";
import {
  ArrowUpRight,
  Bell,
  CheckCircle2,
  IdCard,
  Link2,
  LogOut,
  Menu,
  MessageSquare,
  Plus,
  RefreshCw,
  User,
  X,
} from "lucide-react";

import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { getSignedAvatarUrl } from "@/lib/avatar-client";
import { brand } from "@/config/brand";
import { AdaptiveNavPill } from "@/components/ui/3d-adaptive-navigation-bar";
import { isPublicProfilePathname } from "@/lib/routing";
import { toast } from "@/components/system/toaster";
import { LEGAL_PAGE_LINKS } from "@/components/site/legal-page-actions";
import LanguageSwitcher from "@/components/i18n/LanguageSwitcher";
import { getSiteOrigin } from "@/lib/site-url";
import { scrollWindowTo } from "@/lib/scroll";
import type { DashboardNotificationItem } from "@/lib/dashboard-notifications";
import { confirmRemove } from "@/lib/confirm-remove";
import { isSavedAccount, saveAccount } from "@/lib/saved-accounts";

type UserLite = {
  id: string;
  email: string | null;
  fullName?: string | null;
} | null;

type DashboardSetupLiveStatus = {
  visible: boolean;
  contactReady: boolean;
  linksReady: boolean;
};

const LANDING_LINKS = [
  {
    id: "what-is-linket",
    label: "What Is Linket?",
    gradient: "linear-gradient(120deg,#f8d058 0%,#f8b878 46%,#58c0e0 100%)",
    shadow: "0 10px 24px rgba(248,184,120,0.24)",
  },
  {
    id: "pricing",
    label: "Pricing",
    gradient: "linear-gradient(120deg,#68d8e0 0%,#58c0e0 52%,#f8b878 100%)",
    shadow: "0 10px 24px rgba(88,192,224,0.28)",
  },
  {
    id: "customization",
    label: "Customization",
    gradient: "linear-gradient(120deg,#f8d058 0%,#f8b878 58%,#58c0e0 100%)",
    shadow: "0 10px 24px rgba(248,184,120,0.28)",
  },
  {
    id: "faq",
    label: "FAQ",
    gradient: "linear-gradient(120deg,#f8b878 0%,#58c0e0 100%)",
    shadow: "0 10px 24px rgba(88,192,224,0.26)",
  },
] as const;

type LandingSectionId = (typeof LANDING_LINKS)[number]["id"];

const PROFILE_SECTIONS = [
  { id: "profile", label: "Profile", icon: User },
  { id: "contact", label: "Contact", icon: IdCard },
  { id: "links", label: "Links", icon: Link2 },
  { id: "lead", label: "Lead Form", icon: MessageSquare },
] as const;

const NOTIFICATIONS_POLL_INTERVAL_OPEN_MS = 30_000;
const NOTIFICATIONS_POLL_INTERVAL_IDLE_MS = 120_000;
const NOTIFICATIONS_LAST_READ_STORAGE_KEY_PREFIX =
  "linket:dashboard-notifications:last-read-at";
const NOTIFICATIONS_INBOX_RETENTION_MS = 2 * 24 * 60 * 60 * 1000;

function toUserLite(
  value: {
    id: string;
    email?: string | null;
    user_metadata?: { full_name?: string | null };
    email_confirmed_at?: string | null;
  } | null
): UserLite {
  if (!value) return null;
  return {
    id: value.id,
    email: value.email ?? null,
    fullName: (value.user_metadata?.full_name as string | null) ?? null,
  };
}

const notificationTimeFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

async function persistDashboardNotificationState(
  action: "view" | "dismiss",
  notificationIds: string[]
) {
  if (notificationIds.length === 0) return;

  const response = await fetch("/api/dashboard/notifications", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, notificationIds }),
  });
  if (response.ok) return;

  const payload = (await response.json().catch(() => null)) as
    | { error?: string }
    | null;
  throw new Error(payload?.error || "Unable to save notification state.");
}

function Navbar() {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<UserLite>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [dashboardAuthResolved, setDashboardAuthResolved] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [isAtTop, setIsAtTop] = useState(true);
  const [currentHash, setCurrentHash] = useState("");
  const [lockedSection, setLockedSection] = useState<string | null>(null);
  const lockTimeout = useRef<number | null>(null);
  const lockedSectionRef = useRef<string | null>(null);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const accountButtonRef = useRef<HTMLButtonElement | null>(null);
  const [accountHandle, setAccountHandle] = useState<string | null>(null);
  const [copyLinkLabel, setCopyLinkLabel] = useState("copy link");
  const copyLinkTimeout = useRef<number | null>(null);
  const [dashboardSidebarOpen, setDashboardSidebarOpen] = useState(false);
  const [dashboardSetupLiveStatus, setDashboardSetupLiveStatus] =
    useState<DashboardSetupLiveStatus>({
      visible: false,
      contactReady: false,
      linksReady: false,
    });
  const [activeProfileSection, setActiveProfileSection] = useState<
    (typeof PROFILE_SECTIONS)[number]["id"] | null
  >(null);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [notificationsLoading, setNotificationsLoading] = useState(false);
  const [notificationsError, setNotificationsError] = useState<string | null>(
    null
  );
  const [notifications, setNotifications] = useState<DashboardNotificationItem[]>(
    []
  );
  const [notificationsLastReadAt, setNotificationsLastReadAt] = useState<
    number | null
  >(null);
  const [notificationsOpenedAtById, setNotificationsOpenedAtById] = useState<
    Record<string, number>
  >({});
  const [notificationsDismissedById, setNotificationsDismissedById] = useState<
    Record<string, true>
  >({});
  const notificationsButtonRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    lockedSectionRef.current = lockedSection;
  }, [lockedSection]);

  useEffect(() => {
    return () => {
      if (lockTimeout.current) {
        window.clearTimeout(lockTimeout.current);
      }
      if (copyLinkTimeout.current) {
        window.clearTimeout(copyLinkTimeout.current);
      }
    };
  }, []);
  const isDashboard = pathname?.startsWith("/dashboard");
  const isDashboardSetupRoute =
    pathname?.startsWith("/dashboard/get-started") ?? false;
  const isPublicProfile = isPublicProfilePathname(pathname);
  const isPublic = !isDashboard;
  const isLandingPage = pathname === "/";
  const isLegalPage = LEGAL_PAGE_LINKS.some((page) => page.href === pathname);
  const isAuthPage =
    pathname?.startsWith("/auth") ||
    pathname?.startsWith("/forgot-password") ||
    pathname?.startsWith("/reset-password");
  const isProfileEditor = pathname?.startsWith("/dashboard/profiles") ?? false;
  const isMarketingPage =
    isPublic && !isLandingPage && !isPublicProfile && !isAuthPage && !isLegalPage;
  const shouldShowNotifications = Boolean(
    isDashboard && !isDashboardSetupRoute && user
  );
  const notificationsReadStorageKey = user?.id
    ? `${NOTIFICATIONS_LAST_READ_STORAGE_KEY_PREFIX}:${user.id}`
    : null;

  useEffect(() => {
    if (!isDashboard) {
      setUser(null);
      setAccountHandle(null);
      setDashboardAuthResolved(false);
      return;
    }

    let active = true;
    let unsubscribe: (() => void) | null = null;

    (async () => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!active) return;
        setUser(toUserLite(user ?? null));
      } finally {
        if (active) {
          setDashboardAuthResolved(true);
        }
      }
    })().catch(() => {
      if (!active) return;
      setUser(null);
      setDashboardAuthResolved(true);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(toUserLite(session?.user ?? null));
      setDashboardAuthResolved(true);
    });
    unsubscribe = () => sub.subscription.unsubscribe();

    return () => {
      active = false;
      unsubscribe?.();
    };
  }, [isDashboard]);

  useEffect(() => {
    if (!isDashboard || !user?.id) {
      setAccountHandle(null);
      return;
    }
    let active = true;
    (async () => {
      try {
        const response = await fetch(
          `/api/account/handle?userId=${encodeURIComponent(user.id)}`,
          { cache: "no-store" }
        );
        if (!response.ok) return;
        const payload = (await response.json()) as { handle?: string | null };
        if (!active) return;
        setAccountHandle(payload.handle ?? null);
      } catch {
        if (active) setAccountHandle(null);
      }
    })();
    return () => {
      active = false;
    };
  }, [isDashboard, user?.id]);

  useEffect(() => {
    if (!isDashboard) return;
    const handleUpdated = (event: Event) => {
      const detail = (event as CustomEvent<{ handle?: string | null }>).detail;
      if (detail?.handle) {
        setAccountHandle(detail.handle);
      }
    };
    window.addEventListener("linket:handle-updated", handleUpdated);
    return () => {
      window.removeEventListener("linket:handle-updated", handleUpdated);
    };
  }, [isDashboard]);

  useEffect(() => {
    if (!isProfileEditor) {
      setActiveProfileSection(null);
      return;
    }
    const handleSection = (event: Event) => {
      const detail = (event as CustomEvent<{ section?: string }>).detail;
      const next = detail?.section;
      if (!next) return;
      if (PROFILE_SECTIONS.some((section) => section.id === next)) {
        setActiveProfileSection(next as (typeof PROFILE_SECTIONS)[number]["id"]);
      }
    };
    window.addEventListener("linket:profile-section-updated", handleSection);
    return () => {
      window.removeEventListener("linket:profile-section-updated", handleSection);
    };
  }, [isProfileEditor]);

  useEffect(() => {
    if (!isDashboard) {
      setDashboardSidebarOpen(false);
      setDashboardSetupLiveStatus({
        visible: false,
        contactReady: false,
        linksReady: false,
      });
      return;
    }
    const handleSidebarState = (event: Event) => {
      const detail = (event as CustomEvent<{ open?: boolean }>).detail;
      setDashboardSidebarOpen(Boolean(detail?.open));
    };
    window.addEventListener("linket:dashboard-sidebar-state", handleSidebarState);
    return () => {
      window.removeEventListener("linket:dashboard-sidebar-state", handleSidebarState);
    };
  }, [isDashboard]);

  useEffect(() => {
    if (!isDashboardSetupRoute) {
      setDashboardSetupLiveStatus({
        visible: false,
        contactReady: false,
        linksReady: false,
      });
      return;
    }

    const handleLiveStatus = (event: Event) => {
      const detail = (
        event as CustomEvent<Partial<DashboardSetupLiveStatus>>
      ).detail;
      setDashboardSetupLiveStatus({
        visible: Boolean(detail?.visible),
        contactReady: Boolean(detail?.contactReady),
        linksReady: Boolean(detail?.linksReady),
      });
    };
    window.addEventListener("linket:onboarding-live-status", handleLiveStatus);
    return () => {
      window.removeEventListener(
        "linket:onboarding-live-status",
        handleLiveStatus
      );
    };
  }, [isDashboardSetupRoute]);

  useEffect(() => {
    setNotificationsOpen(false);
  }, [pathname, user?.id]);

  useEffect(() => {
    if (!shouldShowNotifications || !notificationsReadStorageKey) {
      setNotificationsLastReadAt(null);
      return;
    }

    const rawValue = window.localStorage.getItem(notificationsReadStorageKey);
    if (!rawValue) {
      setNotificationsLastReadAt(null);
      return;
    }
    const parsed = Number(rawValue);
    setNotificationsLastReadAt(Number.isFinite(parsed) ? parsed : null);
  }, [notificationsReadStorageKey, shouldShowNotifications]);

  useEffect(() => {
    if (shouldShowNotifications) return;
    setNotificationsOpenedAtById({});
    setNotificationsDismissedById({});
  }, [shouldShowNotifications]);

  useEffect(() => {
    if (!shouldShowNotifications || !user?.id) {
      setNotifications([]);
      setNotificationsLoading(false);
      setNotificationsError(null);
      return;
    }

    let active = true;

    const loadNotifications = async (background = false) => {
      if (!background) {
        setNotificationsLoading(true);
      }
      try {
        const response = await fetch("/api/dashboard/notifications?limit=8", {
          cache: "no-store",
        });
        const payload = (await response.json().catch(() => null)) as
          | { notifications?: DashboardNotificationItem[]; error?: string }
          | null;
        if (!response.ok) {
          throw new Error(payload?.error || "Unable to load notifications.");
        }
        if (!active) return;
        const nextNotifications = Array.isArray(payload?.notifications)
          ? payload.notifications
          : [];
        setNotifications(nextNotifications);
        setNotificationsOpenedAtById((previous) => {
          let hasChanges = false;
          const next = { ...previous };

          for (const notification of nextNotifications) {
            if (!notification.viewedAt) continue;
            const viewedAt = Date.parse(notification.viewedAt);
            if (!Number.isFinite(viewedAt)) continue;
            if (next[notification.id] === viewedAt) continue;
            next[notification.id] = viewedAt;
            hasChanges = true;
          }

          return hasChanges ? next : previous;
        });
        setNotificationsError(null);
      } catch (error) {
        if (!active) return;
        const description =
          error instanceof Error
            ? error.message
            : "Unable to load notifications.";
        setNotificationsError(description);
      } finally {
        if (!background && active) {
          setNotificationsLoading(false);
        }
      }
    };

    const pollIntervalMs = notificationsOpen
      ? NOTIFICATIONS_POLL_INTERVAL_OPEN_MS
      : NOTIFICATIONS_POLL_INTERVAL_IDLE_MS;

    void loadNotifications();
    const poller = window.setInterval(() => {
      if (document.hidden) return;
      void loadNotifications(true);
    }, pollIntervalMs);

    return () => {
      active = false;
      window.clearInterval(poller);
    };
  }, [notificationsOpen, shouldShowNotifications, user?.id]);

  const markNotificationsAsRead = useCallback(() => {
    if (!notificationsReadStorageKey) return;

    const latestTimestamp = notifications.reduce((max, item) => {
      const timestamp = Date.parse(item.createdAt);
      if (!Number.isFinite(timestamp)) return max;
      return Math.max(max, timestamp);
    }, Date.now());

    setNotificationsLastReadAt((previous) => {
      const next = Math.max(previous ?? 0, latestTimestamp);
      window.localStorage.setItem(notificationsReadStorageKey, String(next));
      return next;
    });
  }, [notifications, notificationsReadStorageKey]);

  const markNotificationsAsOpened = useCallback(() => {
    if (notifications.length === 0) return;

    const now = Date.now();
    const next: Record<string, number> = {};
    let hasChanges = false;

    for (const [id, openedAt] of Object.entries(notificationsOpenedAtById)) {
      if (now - openedAt <= NOTIFICATIONS_INBOX_RETENTION_MS) {
        next[id] = openedAt;
      } else {
        hasChanges = true;
      }
    }

    const notificationIdsToPersist: string[] = [];
    for (const notification of notifications) {
      if (notificationsDismissedById[notification.id]) continue;
      if (typeof next[notification.id] === "number") continue;
      next[notification.id] = now;
      notificationIdsToPersist.push(notification.id);
      hasChanges = true;
    }

    if (hasChanges) {
      setNotificationsOpenedAtById(next);
    }

    if (notificationIdsToPersist.length > 0) {
      void persistDashboardNotificationState("view", notificationIdsToPersist).catch(
        () => {
          toast({
            title: "Notification view was not saved",
            description: "This message may stay visible until your next refresh.",
            variant: "destructive",
          });
        }
      );
    }
  }, [notifications, notificationsDismissedById, notificationsOpenedAtById]);

  const dismissNotification = useCallback(
    (notification: DashboardNotificationItem) => {
      setNotificationsDismissedById((previous) =>
        previous[notification.id]
          ? previous
          : {
              ...previous,
              [notification.id]: true,
            }
      );
      void persistDashboardNotificationState("dismiss", [notification.id]).catch(
        (error) => {
          setNotificationsDismissedById((previous) => {
            if (!previous[notification.id]) return previous;
            const next = { ...previous };
            delete next[notification.id];
            return next;
          });
          toast({
            title: "Notification was not dismissed",
            description:
              error instanceof Error
                ? error.message
                : "Please try dismissing it again.",
            variant: "destructive",
          });
        }
      );
    },
    []
  );

  const notificationsInboxItems = useMemo(() => {
    const now = Date.now();
    return notifications.filter((notification) => {
      if (notificationsDismissedById[notification.id]) {
        return false;
      }
      const openedAt = notificationsOpenedAtById[notification.id];
      if (!Number.isFinite(openedAt)) return true;
      return now - openedAt <= NOTIFICATIONS_INBOX_RETENTION_MS;
    });
  }, [notifications, notificationsDismissedById, notificationsOpenedAtById]);

  const unreadNotificationsCount = useMemo(() => {
    return notificationsInboxItems.reduce((count, notification) => {
      const createdAt = Date.parse(notification.createdAt);
      if (!Number.isFinite(createdAt)) return count;
      if (notificationsLastReadAt === null || createdAt > notificationsLastReadAt) {
        return count + 1;
      }
      return count;
    }, 0);
  }, [notificationsInboxItems, notificationsLastReadAt]);

  const visibleNotificationsBadgeCount = notificationsOpen
    ? 0
    : unreadNotificationsCount;

  const handleNotificationsOpenChange = useCallback(
    (open: boolean) => {
      setNotificationsOpen(open);
      if (open) {
        markNotificationsAsOpened();
        markNotificationsAsRead();
      }
    },
    [markNotificationsAsOpened, markNotificationsAsRead]
  );

  const handleNotificationsToggle = useCallback(() => {
    setNotificationsOpen((open) => {
      const nextOpen = !open;
      if (nextOpen) {
        markNotificationsAsOpened();
        markNotificationsAsRead();
      }
      return nextOpen;
    });
  }, [markNotificationsAsOpened, markNotificationsAsRead]);

  useEffect(() => {
    if (!notificationsOpen) return;
    markNotificationsAsOpened();
    markNotificationsAsRead();
  }, [markNotificationsAsOpened, markNotificationsAsRead, notificationsOpen]);

  const profileUrl = accountHandle ? buildPublicProfileUrl(accountHandle) : null;

  const handleViewProfile = () => {
    if (!profileUrl) return;
    window.open(profileUrl, "_blank", "noreferrer");
  };

  const markProfileLinkCopied = () => {
    setCopyLinkLabel("link copied");
    if (copyLinkTimeout.current) {
      window.clearTimeout(copyLinkTimeout.current);
    }
    copyLinkTimeout.current = window.setTimeout(() => {
      setCopyLinkLabel("copy link");
      copyLinkTimeout.current = null;
    }, 2000);
  };

  const copyProfileLinkToClipboard = async () => {
    if (!profileUrl) return;
    await navigator.clipboard.writeText(profileUrl);
    markProfileLinkCopied();
  };

  const handleCopyProfileLink = async () => {
    if (!profileUrl) return;
    try {
      await copyProfileLinkToClipboard();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unable to copy link";
      toast({ title: "Copy failed", description: message, variant: "destructive" });
    }
  };

  const handleShareProfileLink = async () => {
    if (!profileUrl) return;
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({
          title: `${brand.name} public profile`,
          url: profileUrl,
        });
        return;
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }
      }
    }
    try {
      await copyProfileLinkToClipboard();
      toast({
        title: "Link copied",
        description: "Public page link copied to clipboard.",
        variant: "success",
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unable to share link";
      toast({ title: "Share failed", description: message, variant: "destructive" });
    }
  };

  const signOutAndRedirect = async ({
    redirectTo,
    successTitle,
    successDescription,
    failureTitle,
  }: {
    redirectTo: string;
    successTitle: string;
    successDescription: string;
    failureTitle: string;
  }) => {
    if (loggingOut) return;
    setLoggingOut(true);
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      await fetch("/auth/callback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event: "SIGNED_OUT" }),
      }).catch(() => null);
      toast({
        title: successTitle,
        description: successDescription,
        variant: "success",
      });
      window.location.assign(redirectTo);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Please try again.";
      toast({
        title: failureTitle,
        description: message,
        variant: "destructive",
      });
      setLoggingOut(false);
    }
  };

  const handleLogout = async () => {
    await signOutAndRedirect({
      redirectTo: "/auth?view=signin",
      successTitle: "Signed out",
      successDescription: "You have been logged out safely.",
      failureTitle: "Sign out failed",
    });
  };

  const handleSwitchAccount = async () => {
    await signOutAndRedirect({
      redirectTo: "/auth?view=signin&switch=1&next=%2Fdashboard",
      successTitle: "Ready to switch accounts",
      successDescription: "Sign in with another account to continue.",
      failureTitle: "Switch account failed",
    });
  };

  const handleDashboardMenuToggle = () => {
    if (typeof window === "undefined") return;
    window.dispatchEvent(new CustomEvent("linket:dashboard-sidebar-toggle"));
  };

  useEffect(() => {
    const userId = user?.id;
    if (!isDashboard || !userId) {
      setAvatarUrl(null);
      return;
    }
    (async () => {
      const { data } = await supabase
        .from("profiles")
        .select("avatar_url, updated_at")
        .eq("user_id", userId)
        .maybeSingle();
      const signed = await getSignedAvatarUrl(
        (data?.avatar_url as string | null) ?? null,
        (data?.updated_at as string | null) ?? null
      );
      setAvatarUrl(signed);
    })();
  }, [user, isDashboard]);

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (typeof window === "undefined" || !user?.email) return;
    const url = new URL(window.location.href);
    if (url.searchParams.get("saveAccount") !== "1") return;

    const cleanSavePromptParam = () => {
      url.searchParams.delete("saveAccount");
      window.history.replaceState(
        null,
        "",
        `${url.pathname}${url.search}${url.hash}`
      );
    };

    if (isSavedAccount(user.email)) {
      cleanSavePromptParam();
      return;
    }

    let cancelled = false;
    (async () => {
      const shouldSave = await confirmRemove({
        title: "Save this account?",
        description:
          "Save this email on this device so it is easier to switch back to this account later. Passwords and sessions are not saved.",
        confirmLabel: "Save account",
        cancelLabel: "Not now",
        variant: "default",
      });
      if (cancelled) return;
      if (shouldSave) {
        saveAccount(user.email ?? "");
        toast({
          title: "Account saved",
          description: "You can select it from the sign-in screen next time.",
          variant: "success",
        });
      }
      cleanSavePromptParam();
    })();

    return () => {
      cancelled = true;
    };
  }, [user?.email, pathname]);

  useEffect(() => {
    if (!isLandingPage || typeof window === "undefined") {
      setCurrentHash("");
      return;
    }
    const nextHash = window.location.hash || `#${LANDING_LINKS[0].id}`;
    setCurrentHash(nextHash);
    const handleHash = () =>
      setCurrentHash(window.location.hash || `#${LANDING_LINKS[0].id}`);
    window.addEventListener("hashchange", handleHash);
    return () => window.removeEventListener("hashchange", handleHash);
  }, [isLandingPage]);

  useEffect(() => {
    if (!isLandingPage || typeof window === "undefined") return;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (lockedSectionRef.current) return;
        if (visible?.target?.id) {
          const nextHash = `#${visible.target.id}`;
          setCurrentHash((prev) => (prev === nextHash ? prev : nextHash));
        }
      },
      {
        threshold: [0.3, 0.5, 0.7],
        rootMargin: "-15% 0px -35% 0px",
      }
    );
    LANDING_LINKS.forEach((link) => {
      const section = document.getElementById(link.id);
      if (section) observer.observe(section);
    });
    return () => observer.disconnect();
  }, [isLandingPage]);

  useEffect(() => {
    if (!isPublic) {
      setIsAtTop(true);
      return;
    }
    let frame: number | null = null;
    const handleScroll = () => {
      if (frame !== null) return;
      frame = window.requestAnimationFrame(() => {
        frame = null;
        const nextIsAtTop = window.scrollY <= 16;
        setIsAtTop((current) =>
          current === nextIsAtTop ? current : nextIsAtTop
        );
      });
    };
    handleScroll();
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      if (frame !== null) {
        window.cancelAnimationFrame(frame);
      }
      window.removeEventListener("scroll", handleScroll);
    };
  }, [isPublic]);

  if (isPublicProfile || isLegalPage) {
    return null;
  }

  const overlayMode = isPublic && isAtTop && isLandingPage;
  const isDashboardAuthPending = isDashboard && !dashboardAuthResolved;
  const showDashboardSignedInChrome = isDashboard && Boolean(user);
  const showDashboardSignedOutChrome =
    isDashboard && dashboardAuthResolved && !user;

  const headerClassName = cn(
    "top-0 z-50 w-full border-b transition-[background-color,border-color,color] duration-200 ease-out",
    isDashboard || isMarketingPage
      ? "sticky border-border/80 bg-background/95"
      : "fixed border-slate-200 bg-white/95",
    overlayMode &&
      "border-transparent bg-transparent text-white backdrop-blur-none supports-[backdrop-filter]:bg-transparent"
  );

  const brandNameClass = cn(
    "text-xl font-semibold tracking-tight transition-colors",
    isDashboard
      ? "text-foreground"
      : overlayMode
      ? "text-white drop-shadow"
      : "text-[#0f172a]"
  );

  const activeLandingSection = isLandingPage
    ? currentHash
      ? currentHash.replace("#", "")
      : LANDING_LINKS[0].id
    : null;

  const scrollToSection = (sectionId: LandingSectionId) => {
    if (typeof window === "undefined") return;
    const element = document.getElementById(sectionId);
    if (!element) return;
    const headerOffset = 80;
    const offsetPosition =
      element.getBoundingClientRect().top + window.scrollY - headerOffset;
    scrollWindowTo({
      top: Math.max(offsetPosition, 0),
      behavior: "smooth",
    });
    if (lockTimeout.current) {
      window.clearTimeout(lockTimeout.current);
    }
    setLockedSection(sectionId);
    lockTimeout.current = window.setTimeout(() => {
      setLockedSection(null);
      lockTimeout.current = null;
    }, 900);
    const hash = `#${sectionId}`;
    setCurrentHash(hash);
    window.history.replaceState(null, "", hash);
  };

  const handlePillSelect = (sectionId: string) => {
    const validSectionId = sectionId as LandingSectionId;
    if (isLandingPage) {
      scrollToSection(validSectionId);
    } else {
      router.push(`/#${validSectionId}`);
    }
  };

  const handleDropdownSelect = (sectionId: LandingSectionId) => {
    handlePillSelect(sectionId);
    setMobileOpen(false);
  };

  const mobilePanelClass = cn(
    "fixed inset-x-0 bottom-0 top-auto z-50 rounded-t-[24px] border-x-0 border-b-0 border-t p-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] shadow-[0_-18px_42px_-28px_rgba(15,23,42,0.45)] sm:inset-x-4 sm:bottom-4 sm:rounded-[24px] sm:border sm:p-5",
    isDashboard
      ? "border-border/60 bg-background/95"
      : "border-slate-200 bg-white text-[#0b1220]"
  );

  const mobileAvatarFrame = cn(
    "inline-flex h-7 w-7 items-center justify-center overflow-hidden rounded-full border bg-white",
    isDashboard
      ? "border-border/60 bg-card"
      : "border-slate-200"
  );

  const mobilePrimaryCta = (
    <Link
      href="/#pricing"
      aria-label="Buy Linket"
      onClick={() => setMobileOpen(false)}
      className="inline-flex min-h-12 w-full items-center justify-between rounded-2xl bg-[linear-gradient(135deg,#f8d058_0%,#f8b878_58%,#68d8e0_100%)] px-5 py-3 text-sm font-semibold text-[#0b1220] shadow-[0_18px_40px_rgba(88,192,224,0.2)] transition-[filter,box-shadow] duration-200 hover:brightness-[0.98]"
    >
      <span>Buy Linket</span>
      <ArrowUpRight className="h-4 w-4" aria-hidden />
    </Link>
  );

  const mobileSecondaryAction = user ? (
    <Link
      href="/dashboard/linkets"
      onClick={() => setMobileOpen(false)}
      className="inline-flex min-h-12 w-full items-center justify-between rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-[#0b1220] shadow-[0_10px_30px_rgba(15,23,42,0.08)] transition-[background-color,border-color] duration-200 hover:border-slate-300 hover:bg-slate-50"
      aria-label={`Go to ${brand.name} dashboard`}
    >
      <span className="inline-flex items-center gap-3">
        {avatarUrl ? (
          <span className={mobileAvatarFrame} aria-hidden="true">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={avatarUrl}
              alt="avatar"
              className="h-full w-full object-cover"
            />
          </span>
        ) : null}
        Dashboard
      </span>
      <ArrowUpRight className="h-4 w-4" aria-hidden />
    </Link>
  ) : (
    <Link
      href="/auth?view=signin"
      onClick={() => setMobileOpen(false)}
      className="inline-flex min-h-12 w-full items-center justify-between rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-[#0b1220] shadow-[0_10px_30px_rgba(15,23,42,0.08)] transition-[background-color,border-color] duration-200 hover:border-slate-300 hover:bg-slate-50"
      aria-label="Sign in"
    >
      <span>Sign in</span>
      <ArrowUpRight className="h-4 w-4" aria-hidden />
    </Link>
  );

  const desktopLinks = (
    <div className="w-full max-w-[720px] px-4">
      <AdaptiveNavPill
        items={LANDING_LINKS}
        activeId={activeLandingSection}
        onSelect={handlePillSelect}
      />
    </div>
  );

  const loginButton = user ? (
    <Link
      href="/dashboard/linkets"
      className={cn(
        "inline-flex h-10 items-center justify-center rounded-full px-4 text-xs font-semibold uppercase tracking-[0.08em] transition md:h-12 md:px-5 md:text-sm",
        isDashboard
          ? "bg-foreground text-background hover:bg-foreground/90"
          : overlayMode
          ? "border border-white/40 bg-white/5 text-white shadow-[0_16px_32px_rgba(15,23,42,0.25)] hover:bg-white/15"
          : "bg-[#0b1220] text-white shadow-[0_18px_32px_rgba(15,23,42,0.25)] hover:bg-[#141c32]"
      )}
      aria-label={`Go to ${brand.name} dashboard`}
    >
      Dashboard
    </Link>
  ) : (
    <Button
      asChild
      variant={isLandingPage ? "landingSecondary" : undefined}
      className={cn(
        "h-10 rounded-full px-4 text-xs font-semibold uppercase tracking-[0.08em] md:h-12 md:px-6 md:text-sm",
        isLandingPage
          ? ""
          : isDashboard
            ? "border border-foreground/20 bg-background text-foreground hover:bg-foreground/5"
            : overlayMode
              ? "bg-white text-slate-900 shadow-[0_18px_35px_rgba(15,23,42,0.25)] hover:bg-white/90"
              : "bg-white text-[#0b1220] shadow-[0_12px_30px_rgba(15,23,42,0.12)] hover:bg-white/95"
      )}
      aria-label="Sign in"
    >
      <Link href="/auth?view=signin">Sign in</Link>
    </Button>
  );

  const primaryCta = (
    <Button
      asChild
      variant={isLandingPage ? "landingPrimary" : undefined}
      className={cn(
        "h-10 rounded-full px-4 text-xs font-semibold uppercase tracking-[0.08em] md:h-12 md:px-6 md:text-sm",
        isLandingPage
          ? "shadow-[0_22px_48px_-28px_rgba(236,132,78,0.45)]"
          : isDashboard
            ? "shadow-[0_12px_40px_rgba(16,200,120,0.15)] hover:shadow-[0_18px_45px_rgba(16,200,120,0.22)]"
            : overlayMode
              ? "bg-white text-slate-900 shadow-[0_22px_50px_rgba(15,23,42,0.35)] hover:bg-white/90"
              : "bg-gradient-to-r from-[#58c0e0] via-[#68d8e0] to-[#8fe6ea] text-[#0b1220] shadow-[0_20px_45px_rgba(88,192,224,0.32)] hover:bg-gradient-to-r hover:from-[#f8d058] hover:via-[#f8b878] hover:to-[#58c0e0]"
      )}
    >
      <Link href="/#pricing" aria-label="Buy Linket">
        Buy Linket
      </Link>
    </Button>
  );

  const showBuyLinketCta = isMarketingPage;

  const navClassName = cn(
    "mx-auto flex max-w-6xl items-center justify-between px-3 py-2 md:px-6 md:py-3",
    overlayMode ? "text-white" : "text-foreground"
  );

  const activeLandingId = (activeLandingSection ??
    LANDING_LINKS[0].id) as LandingSectionId;

  const dashboardSignInButton = (
    <Button
      variant="outline"
      size="sm"
      asChild
      className="rounded-full border-border/70 bg-card text-foreground hover:bg-card"
    >
      <Link href="/auth?view=signin">Sign in</Link>
    </Button>
  );

  const dashboardAvatar = showDashboardSignedInChrome ? (
    <button
      type="button"
      ref={accountButtonRef}
      onClick={() => setAccountMenuOpen(true)}
      className="dashboard-avatar-button inline-flex h-11 w-11 items-center justify-center rounded-full border border-border/60 bg-card/90 text-sm font-semibold uppercase text-foreground transition hover:bg-card"
      aria-label={
        isDashboardSetupRoute
          ? `Signed in as ${user?.email ?? "this account"}`
          : "Account menu"
      }
      title={user?.email ? `Signed in as ${user.email}` : "Signed in account"}
    >
      {avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={avatarUrl}
          alt="avatar"
          className="h-full w-full rounded-full object-cover"
        />
      ) : (
        getUserInitials(user?.fullName ?? user?.email ?? "PK")
      )}
    </button>
  ) : showDashboardSignedOutChrome ? (
    dashboardSignInButton
  ) : null;

  const dashboardProfileActions = showDashboardSignedInChrome ? (
    <div className="dashboard-nav-actions hidden items-center gap-2 md:flex">
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="dashboard-copy-link-button rounded-full cursor-pointer disabled:cursor-not-allowed"
        onClick={handleCopyProfileLink}
        disabled={!profileUrl}
      >
        {copyLinkLabel}
      </Button>
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="dashboard-view-profile-button rounded-full cursor-pointer disabled:cursor-not-allowed"
        onClick={handleViewProfile}
        disabled={!profileUrl}
        aria-label="Open public profile"
        title="Open public profile"
      >
        <span className="dashboard-view-profile-icon" aria-hidden="true">
          <ArrowUpRight className="h-4 w-4" />
        </span>
      </Button>
    </div>
  ) : null;

  const dashboardNotificationsButton =
    showDashboardSignedInChrome && shouldShowNotifications ? (
      <button
        type="button"
        ref={notificationsButtonRef}
        onClick={handleNotificationsToggle}
        className="dashboard-notifications-button relative inline-flex h-10 w-10 items-center justify-center rounded-full border border-border/70 bg-card text-foreground transition hover:bg-card"
        aria-label="Open notifications"
        aria-expanded={notificationsOpen}
        aria-haspopup="dialog"
      >
        <Bell className="h-4 w-4" aria-hidden />
        {visibleNotificationsBadgeCount > 0 ? (
          <span className="absolute -right-1 -top-1 inline-flex min-w-[20px] items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground">
            {Math.min(9, visibleNotificationsBadgeCount)}
          </span>
        ) : null}
      </button>
    ) : null;
  const dashboardSetupLiveStatusNav =
    showDashboardSignedInChrome &&
    isDashboardSetupRoute &&
    dashboardSetupLiveStatus.visible ? (
      <div
        className="dashboard-onboarding-live-status hidden min-w-0 flex-[2] items-center justify-end gap-3 lg:flex"
        aria-label="Live status"
      >
        <div className="min-w-0 text-right">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Live status
          </p>
          <p className="truncate text-sm text-muted-foreground">
            Next step: continue to the dashboard.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {[
            { label: "Live", tone: "text-emerald-700" },
            {
              label: "Contact card added",
              tone: dashboardSetupLiveStatus.contactReady
                ? "text-foreground"
                : "text-muted-foreground",
            },
            {
              label: "First link active",
              tone: dashboardSetupLiveStatus.linksReady
                ? "text-foreground"
                : "text-muted-foreground",
            },
            { label: "QR ready", tone: "text-foreground" },
          ].map((item) => (
            <span
              key={item.label}
              className="inline-flex h-10 items-center gap-2 rounded-full border border-border/60 bg-background/70 px-3 text-sm font-semibold shadow-sm"
            >
              <CheckCircle2 className={cn("h-4 w-4", item.tone)} aria-hidden />
              <span className={item.tone}>{item.label}</span>
            </span>
          ))}
        </div>
      </div>
    ) : null;

  if (isDashboard) {
    return (
      <header
        className="dashboard-navbar font-dashboard sticky top-0 z-50 w-full border-b border-border/80 bg-background text-foreground"
      >
        <nav
          className="dashboard-navbar-inner mx-auto flex max-w-6xl items-center justify-between px-2 py-3 text-foreground sm:px-3 md:px-6"
          aria-label="Dashboard"
        >
          <div className="dashboard-navbar-left flex min-w-0 flex-1 items-center gap-4 pr-3">
            <Link
              href="/dashboard"
              className="dashboard-brand ml-0 inline-flex items-center gap-3 md:-ml-8 lg:-ml-10"
              aria-label={`${brand.name} dashboard`}
            >
              {brand.logo ? (
                <span className="dashboard-logo relative h-14 w-44 overflow-hidden">
                  <Image
                    src={brand.logo}
                    alt={`${brand.name} logo`}
                    fill
                    className="object-contain"
                    sizes="128px"
                    priority
                  />
                </span>
              ) : (
                <span className="dashboard-logo-fallback inline-flex h-12 w-12 items-center justify-center rounded-2xl text-xl font-bold">
                  {(brand.shortName ?? brand.name).slice(0, 2)}
                </span>
              )}
            </Link>
            {isProfileEditor ? (
              <>
                <div className="hidden min-w-0 max-w-[550px] flex-1 lg:ml-5 lg:flex">
                  <div className="flex min-h-[52px] w-full items-center rounded-2xl border border-border/70 bg-card px-3 py-2 shadow-[var(--shadow-grounded)]">
                    <div className="flex w-full flex-nowrap items-center gap-2">
                      {PROFILE_SECTIONS.map((section) => {
                        const Icon = section.icon;
                        const isActive = activeProfileSection === section.id;
                        return (
                          <button
                            key={section.id}
                            type="button"
                            onClick={() => {
                              window.dispatchEvent(
                                new CustomEvent("linket:profile-section-nav", {
                                  detail: { section: section.id },
                                })
                              );
                            }}
                            className={cn(
                              "dashboard-profile-section-pill flex min-w-0 flex-1 items-center justify-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold transition cursor-pointer",
                              isActive
                                ? "bg-muted text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.12)]"
                                : "text-muted-foreground"
                            )}
                          >
                            <Icon
                              className={cn(
                                "shrink-0",
                                section.id === "contact" ? "h-7 w-7" : "h-5 w-5"
                              )}
                              aria-hidden
                            />
                            <span className="min-w-0 truncate whitespace-nowrap">
                              {section.label}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </>
            ) : null}
          </div>

          {dashboardSetupLiveStatusNav}

          <div className="dashboard-navbar-right flex shrink-0 items-center gap-3">
            {!isDashboardSetupRoute ? dashboardProfileActions : null}
            {!isDashboardSetupRoute ? dashboardNotificationsButton : null}
            {showDashboardSignedInChrome && !isDashboardSetupRoute ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="dashboard-view-profile-button dashboard-share-link-button rounded-full cursor-pointer disabled:cursor-not-allowed md:hidden"
                onClick={handleShareProfileLink}
                disabled={!profileUrl}
                aria-label="Share public profile link"
                title="Share public profile link"
              >
                <span className="dashboard-view-profile-icon" aria-hidden="true">
                  <ArrowUpRight className="h-4 w-4" />
                </span>
              </Button>
            ) : null}
            {showDashboardSignedInChrome && !isDashboardSetupRoute ? (
              <Button
                asChild
                size="sm"
                className="dashboard-new-linket-button hidden rounded-full lg:inline-flex"
              >
                <Link href="/dashboard/linkets">New Linket</Link>
              </Button>
            ) : null}
            {showDashboardSignedInChrome && !isDashboardSetupRoute ? (
              <Button
                asChild
                size="sm"
                className="dashboard-new-linket-button dashboard-new-linket-button--mobile rounded-full lg:hidden"
              >
                <Link
                  href="/dashboard/linkets"
                  aria-label="Create new Linket"
                  className="inline-flex items-center gap-1.5"
                >
                  <Plus
                    className="dashboard-new-linket-icon h-4 w-4"
                    aria-hidden="true"
                  />
                  <span className="dashboard-new-linket-label">New Linket</span>
                </Link>
              </Button>
            ) : null}
            {dashboardAvatar}
            {showDashboardSignedInChrome &&
            !isDashboardAuthPending &&
            !isDashboardSetupRoute ? (
              <button
                type="button"
                className="dashboard-mobile-toggle inline-flex items-center justify-center rounded-full border border-border/60 p-2 text-foreground lg:hidden"
                onClick={handleDashboardMenuToggle}
                aria-label={
                  dashboardSidebarOpen ? "Close navigation" : "Open navigation"
                }
                aria-expanded={dashboardSidebarOpen}
              >
                {dashboardSidebarOpen ? (
                  <X className="h-5 w-5" aria-hidden />
                ) : (
                  <Menu className="h-5 w-5" aria-hidden />
                )}
              </button>
            ) : null}
          </div>
        </nav>
        {user && (
          <PopoverDialog
            open={accountMenuOpen}
            onOpenChange={setAccountMenuOpen}
            anchorRef={accountButtonRef}
            align="end"
            title={isDashboardSetupRoute ? undefined : "Account menu"}
          >
            <div className="dashboard-account-menu-content space-y-2 text-sm">
              <div className="dashboard-account-menu-email rounded-lg border border-border/70 bg-card px-3 py-2 text-xs text-muted-foreground">
                {user?.email ?? "Not signed in"}
              </div>
              {!isDashboardSetupRoute ? (
                <>
                  <MenuLink href="/dashboard/settings">Account settings</MenuLink>
                  <MenuLink href="/dashboard/billing">Billing</MenuLink>
                  <MenuButton
                    onClick={() =>
                      window.dispatchEvent(new CustomEvent("open-support"))
                    }
                  >
                    Support
                  </MenuButton>
                  <MenuButton onClick={handleSwitchAccount} disabled={loggingOut}>
                    <RefreshCw className="mr-2 h-4 w-4" /> Switch account
                  </MenuButton>
                  <MenuButton onClick={handleLogout} disabled={loggingOut}>
                    <LogOut className="mr-2 h-4 w-4" /> Logout
                  </MenuButton>
                </>
              ) : null}
            </div>
          </PopoverDialog>
        )}
        {dashboardNotificationsButton && (
          <PopoverDialog
            open={notificationsOpen}
            onOpenChange={handleNotificationsOpenChange}
            anchorRef={notificationsButtonRef}
            align="end"
            title="Notifications"
          >
            <div className="space-y-3">
              {notificationsLoading ? (
                <p className="text-sm text-muted-foreground">Loading notifications...</p>
              ) : notificationsError ? (
                <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {notificationsError}
                </p>
              ) : notificationsInboxItems.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No developer notifications right now.
                </p>
              ) : (
                notificationsInboxItems.map((notification) => (
                  <article
                    key={notification.id}
                    className={cn(
                      "rounded-xl border px-3 py-2",
                      getNotificationToneClass(notification.severity)
                    )}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold">
                          {notification.title}
                        </p>
                        <span className="mt-0.5 block text-[11px] font-medium opacity-80">
                          {formatNotificationTime(notification.createdAt)}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => dismissNotification(notification)}
                        className="shrink-0 rounded-full border border-current/20 p-1 opacity-70 transition hover:opacity-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--ring)]"
                        aria-label={`Dismiss ${notification.title} notification`}
                        title="Dismiss notification"
                      >
                        <X className="h-3.5 w-3.5" aria-hidden />
                      </button>
                    </div>
                    <p className="mt-2 text-xs leading-relaxed opacity-90">
                      {notification.message}
                    </p>
                  </article>
                ))
              )}
            </div>
          </PopoverDialog>
        )}
      </header>
    );
  }

  if (isAuthPage) return null;

  return (
    <header role="banner" className={headerClassName} aria-label="Site header">
      <nav className={navClassName} aria-label="Main">
        <div className="flex flex-1 items-center gap-3 md:gap-4">
          <Link
            href="/"
            className="inline-flex items-center gap-2 rounded-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--ring)]"
            aria-label={`${brand.name} home`}
          >
            {brand.logo ? (
                <span className="relative block h-[3.5rem] w-28 sm:h-[3.75rem] sm:w-32 md:h-[4.5rem] md:w-40">
                  <Image
                    src={brand.logo}
                    alt={`${brand.name} logo`}
                  fill
                  className="object-contain"
                  priority
                  sizes="(max-width: 1024px) 160px, 200px"
                />
              </span>
            ) : (
              <span
                className="inline-flex h-9 w-9 items-center justify-center rounded-md bg-foreground text-sm font-bold text-background"
                aria-hidden
              >
                {(brand.shortName ?? brand.name).slice(0, 2)}
              </span>
            )}
            {!brand.logo && (
              <span className={brandNameClass}>{brand.name}</span>
            )}
          </Link>
        <div
          className="hidden flex-1 items-center justify-center lg:flex"
          aria-label="Primary"
        >
          {isLandingPage ? desktopLinks : null}
        </div>
        </div>
        <div className="flex items-center gap-2 sm:gap-3 md:gap-4">
          {isLandingPage || isMarketingPage ? (
            <div className="hidden items-center gap-2 sm:flex md:gap-4">
              <LanguageSwitcher
                compact
                className={cn(
                  overlayMode
                    ? "border-white/40 bg-white/90 text-slate-900"
                    : "border-foreground/10 bg-white"
                )}
              />
              {loginButton}
              {showBuyLinketCta ? primaryCta : null}
            </div>
          ) : null}
          {isLandingPage || isMarketingPage ? (
            <button
              type="button"
              className={cn(
                "inline-flex h-11 w-11 items-center justify-center rounded-full border transition lg:hidden focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--ring)]",
                isDashboard
                  ? "border-border/60 bg-background/70 text-foreground"
                  : overlayMode
                  ? "border-white/70 bg-white/90 text-slate-900 shadow-[0_10px_25px_rgba(15,15,30,0.2)]"
                  : "border-foreground/10 bg-white text-foreground"
              )}
              onClick={() => setMobileOpen((open) => !open)}
              aria-label={mobileOpen ? "Close navigation" : "Open navigation"}
            >
              {mobileOpen ? (
                <X className="h-5 w-5" aria-hidden />
              ) : (
                <Menu className="h-5 w-5" aria-hidden />
              )}
            </button>
          ) : null}
        </div>
      </nav>
      {(isLandingPage || isMarketingPage) && mobileOpen && (
        <div className="lg:hidden">
          <button
            type="button"
            className="fixed inset-0 z-40 bg-[rgba(15,23,42,0.22)]"
            aria-label="Close navigation overlay"
            onClick={() => setMobileOpen(false)}
          />
          <div className={mobilePanelClass}>
            <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-slate-200" aria-hidden />
            <nav
              aria-label="Mobile primary"
              className="relative z-10 grid max-h-[min(82svh,42rem)] gap-3 overflow-y-auto overscroll-contain pb-1"
            >
              <div className="px-1">
                <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-500">
                  Menu
                </p>
              </div>
              {isLandingPage ? (
                <div className="grid gap-2">
                  {LANDING_LINKS.map((link, index) => {
                    const isActive = activeLandingId === link.id;
                    return (
                      <button
                        key={link.id}
                        type="button"
                        onClick={() => handleDropdownSelect(link.id)}
                        className={cn(
                          "group flex min-h-14 items-center justify-between gap-3 rounded-2xl border px-4 py-3 text-left transition-[border-color,background-color,box-shadow] duration-200",
                          isActive
                            ? "border-[#20586e]/50 bg-[#eef8fb] text-[#20586e] shadow-[var(--shadow-grounded)]"
                            : "border-slate-200 bg-white text-[#0b1220] shadow-[var(--shadow-grounded)] hover:border-[#dbe6ee] hover:bg-slate-50"
                        )}
                        aria-label={`Go to ${link.label}`}
                      >
                        <span className="flex min-w-0 items-center gap-3">
                          <span
                            className={cn(
                              "text-[11px] font-semibold uppercase tracking-[0.16em]",
                              isActive ? "text-[#b45309]/70" : "text-slate-400"
                            )}
                          >
                            {String(index + 1).padStart(2, "0")}
                          </span>
                          <span className="truncate text-[15px] font-semibold leading-snug">
                            {link.label}
                          </span>
                        </span>
                        <ArrowUpRight className="h-4 w-4 shrink-0 opacity-70" aria-hidden />
                      </button>
                    );
                  })}
                </div>
              ) : null}
              <div
                className={cn(
                  "sticky bottom-0 -mx-1 grid gap-2 rounded-2xl bg-white/95 p-1 pt-2 shadow-[0_-14px_28px_-28px_rgba(15,23,42,0.4)]",
                  showBuyLinketCta ? "grid-cols-1 sm:grid-cols-2" : "grid-cols-1"
                )}
              >
                {showBuyLinketCta ? (
                  <div className="w-full">{mobilePrimaryCta}</div>
                ) : null}
                <div className="w-full">{mobileSecondaryAction}</div>
              </div>
              <LanguageSwitcher className="w-full justify-center bg-white" />
            </nav>
          </div>
        </div>
      )}
    </header>
  );
}

function PopoverDialog({
  open,
  onOpenChange,
  anchorRef,
  align = "start",
  title,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  anchorRef: React.RefObject<HTMLElement | null>;
  align?: "start" | "end";
  title?: string;
  children: React.ReactNode;
}) {
  const position = usePopoverPosition(anchorRef, open, align);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="dashboard-account-menu-popover w-72 translate-x-0 translate-y-0 rounded-2xl border border-border/60 bg-background p-4 shadow-lg"
        style={position}
      >
        {title ? (
          <DialogHeader>
            <DialogTitle className="text-sm font-semibold">{title}</DialogTitle>
          </DialogHeader>
        ) : null}
        {children}
      </DialogContent>
    </Dialog>
  );
}

function MenuButton({
  children,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="dashboard-account-menu-item flex w-full items-center rounded-lg px-2 py-2 text-left text-sm text-foreground hover:bg-accent disabled:opacity-50"
    >
      {children}
    </button>
  );
}

function MenuLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      className="dashboard-account-menu-item flex w-full items-center rounded-lg px-2 py-2 text-left text-sm text-foreground hover:bg-accent"
    >
      {children}
    </a>
  );
}

function usePopoverPosition(
  anchorRef: React.RefObject<HTMLElement | null>,
  open: boolean,
  align: "start" | "end"
) {
  const [style, setStyle] = useState<CSSProperties>({});

  useLayoutEffect(() => {
    if (!open) return;
    let frame: number | null = null;
    const update = () => {
      const anchor = anchorRef.current;
      if (!anchor) return;
      const rect = anchor.getBoundingClientRect();
      const padding = 12;
      const maxWidth = Math.min(288, window.innerWidth - padding * 2);
      const desiredLeft = align === "end" ? rect.right - maxWidth : rect.left;
      const left = Math.min(Math.max(padding, desiredLeft), window.innerWidth - maxWidth - padding);
      const top = Math.min(rect.bottom + 8, window.innerHeight - padding);
      setStyle({
        position: "fixed",
        top,
        left,
      });
    };
    const scheduleUpdate = () => {
      if (frame !== null) return;
      frame = window.requestAnimationFrame(() => {
        frame = null;
        update();
      });
    };
    const scrollOptions = { capture: true, passive: true } as const;
    update();
    window.addEventListener("resize", scheduleUpdate);
    window.addEventListener("scroll", scheduleUpdate, scrollOptions);
    return () => {
      if (frame !== null) {
        window.cancelAnimationFrame(frame);
      }
      window.removeEventListener("resize", scheduleUpdate);
      window.removeEventListener("scroll", scheduleUpdate, scrollOptions);
    };
  }, [anchorRef, open, align]);

  return style;
}

function formatNotificationTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return notificationTimeFormatter.format(date);
}

function getNotificationToneClass(
  severity: DashboardNotificationItem["severity"]
) {
  switch (severity) {
    case "success":
      return "border-emerald-300 bg-emerald-100/70 text-emerald-950";
    case "warning":
      return "border-amber-300 bg-amber-100/70 text-amber-950";
    case "critical":
      return "border-rose-300 bg-rose-100/70 text-rose-950";
    case "info":
    default:
      return "border-sky-300 bg-sky-100/70 text-sky-950";
  }
}

function buildPublicProfileUrl(handle: string) {
  const base = getSiteOrigin();
  return `${base.replace(/\/$/, "")}/${encodeURIComponent(handle)}`;
}

function getUserInitials(seed: string) {
  const [first, second] = String(seed).split(" ");
  const initialOne = first?.[0] ?? "P";
  const initialTwo = second?.[0] ?? "K";
  return `${initialOne}${initialTwo}`.toUpperCase();
}

export default Navbar;
