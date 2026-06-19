"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import {
  Activity,
  ArrowRight,
  BarChart3,
  Calendar,
  CheckCircle2,
  Circle,
  Crown,
  MessageSquare,
  Star,
  Tags,
  UserRound,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  useDashboardPlanAccess,
  useDashboardUser,
} from "@/components/dashboard/DashboardSessionContext";
import { useThemeOptional } from "@/components/theme/theme-provider";
import PublicProfilePreviewLoader from "@/components/public/PublicProfilePreviewLoader";
import NetworkingModePanel from "@/components/dashboard/overview/NetworkingModePanel";
import { ANALYTICS_BROADCAST_KEY, ANALYTICS_EVENT_NAME } from "@/lib/analytics";
import {
  DASHBOARD_TOUR_STATUS_EVENT,
  getDashboardTourStorageKey,
  readDashboardTourStatus,
} from "@/lib/dashboard-onboarding-tour";
import type { UserAnalytics } from "@/lib/analytics-service";

const numberFormatter = new Intl.NumberFormat("en-US");
const percentFormatter = new Intl.NumberFormat("en-US", {
  style: "percent",
  maximumFractionDigits: 1,
});
const dateTimeFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

type ViewState = {
  loading: boolean;
  error: string | null;
  analytics: UserAnalytics | null;
};

type DashboardNextAction = {
  id: string;
  title: string;
  detail: string;
  href: string;
  buttonLabel: string;
  icon: LucideIcon;
  dismissKey: string;
};

const NEXT_ACTION_DISMISS_STORAGE_PREFIX =
  "linket:dashboard:next-action-dismissed";

export default function OverviewContent() {
  const dashboardUser = useDashboardUser();
  const planAccess = useDashboardPlanAccess();
  const userId = dashboardUser?.id ?? null;
  const [reloadToken, setReloadToken] = useState(0);
  const [isChecklistDismissed, setIsChecklistDismissed] = useState(false);
  const [isChecklistPoppingOut, setIsChecklistPoppingOut] = useState(false);
  const [dismissedNextActionKey, setDismissedNextActionKey] = useState<
    string | null
  >(null);
  const [hasSeenWalkthrough, setHasSeenWalkthrough] = useState(false);
  const checklistCompletionRef = useRef<boolean | null>(null);
  const checklistDismissTimerRef = useRef<number | null>(null);
  const [{ loading, error, analytics }, setState] = useState<ViewState>({
    loading: true,
    error: null,
    analytics: null,
  });

  useEffect(() => {
    if (userId === null) {
      setState({
        loading: false,
        error: "You're not signed in.",
        analytics: null,
      });
      return;
    }

    let cancelled = false;
    setState((prev) => ({ ...prev, loading: true, error: null }));

    const resolvedUserId = userId as string;

    async function load() {
      try {
        const timezoneOffsetMinutes = new Date().getTimezoneOffset();
        const analyticsUrl = `/api/analytics/supabase?userId=${encodeURIComponent(
          resolvedUserId
        )}&days=90&tzOffsetMinutes=${encodeURIComponent(
          String(timezoneOffsetMinutes)
        )}`;
        const [analyticsRes] = await Promise.all([
          fetch(analyticsUrl, { cache: "no-store" }),
        ]);

        if (!analyticsRes.ok) {
          const info = await analyticsRes.json().catch(() => ({}));
          throw new Error(
            info?.error || `Analytics request failed (${analyticsRes.status})`
          );
        }

        const analyticsPayload = (await analyticsRes.json()) as UserAnalytics;

        if (!cancelled) {
          setState({
            loading: false,
            error: analyticsPayload.meta.available
              ? null
              : "Analytics requires a configured Supabase service role key.",
            analytics: analyticsPayload,
          });
        }

        if (cancelled) return;
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Unable to load overview";
        if (!cancelled) {
          setState({ loading: false, error: message, analytics: null });
        }
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [userId, reloadToken]);

  useEffect(() => {
    if (!userId || typeof window === "undefined") {
      setHasSeenWalkthrough(false);
      return;
    }

    const storageKey = getDashboardTourStorageKey(userId);
    const syncStatus = () => {
      setHasSeenWalkthrough(Boolean(readDashboardTourStatus(storageKey)));
    };

    syncStatus();
    window.addEventListener(DASHBOARD_TOUR_STATUS_EVENT, syncStatus);

    return () => {
      window.removeEventListener(DASHBOARD_TOUR_STATUS_EVENT, syncStatus);
    };
  }, [userId]);

  useEffect(() => {
    if (!userId || typeof window === "undefined") return;

    let settleTimer: number | null = null;

    const requestRefresh = () => {
      setReloadToken((value) => value + 1);
      if (settleTimer !== null) {
        window.clearTimeout(settleTimer);
      }
      // Follow-up refresh catches writes that land slightly after the first request.
      settleTimer = window.setTimeout(() => {
        setReloadToken((value) => value + 1);
      }, 1200);
    };

    const handleAnalyticsEvent = (_event: Event) => {
      requestRefresh();
    };

    const handleStorage = (event: StorageEvent) => {
      if (event.key !== ANALYTICS_BROADCAST_KEY || !event.newValue) return;
      requestRefresh();
    };

    window.addEventListener(ANALYTICS_EVENT_NAME, handleAnalyticsEvent);
    window.addEventListener("storage", handleStorage);

    return () => {
      window.removeEventListener(ANALYTICS_EVENT_NAME, handleAnalyticsEvent);
      window.removeEventListener("storage", handleStorage);
      if (settleTimer !== null) {
        window.clearTimeout(settleTimer);
      }
    };
  }, [userId]);

  const totals = analytics?.totals;
  const onboarding = analytics?.onboarding;
  const checklistComplete = Boolean(
    onboarding &&
      onboarding.totalCount > 0 &&
      onboarding.completedCount >= onboarding.totalCount
  );
  const isFreeAnalytics =
    analytics?.meta.analyticsScope === "public_profile_visits";
  const nextAction = useMemo(
    () =>
      buildDashboardNextAction({
        analytics,
        hasPaidAccess: planAccess.hasPaidAccess,
      }),
    [analytics, planAccess.hasPaidAccess]
  );
  const nextActionDismissStorageKey = userId
    ? `${NEXT_ACTION_DISMISS_STORAGE_PREFIX}:${userId}`
    : null;
  const visibleNextAction =
    nextAction && dismissedNextActionKey !== nextAction.dismissKey
      ? nextAction
      : null;

  const overviewItems = [
    {
      label: "Taps in the past week",
      value: totals ? numberFormatter.format(totals.scans7d) : "--",
      icon: Activity,
    },
    {
      label: "Recent leads",
      value: totals ? numberFormatter.format(totals.leads7d) : "--",
      icon: Users,
    },
    {
      label: "Conversion rate (Leads / Taps)",
      value: totals
        ? percentFormatter.format(totals.conversionRate7d || 0)
        : "--",
      icon: BarChart3,
    },
    {
      label: "Leads you should reach out to",
      value: totals ? numberFormatter.format(totals.readyLeads) : "--",
      icon: Star,
    },
  ];

  const [dateLabel, setDateLabel] = useState<string>("");

  useEffect(() => {
    setDateLabel(dateTimeFormatter.format(new Date()));
  }, []);

  useEffect(() => {
    if (!nextActionDismissStorageKey || typeof window === "undefined") {
      setDismissedNextActionKey(null);
      return;
    }

    try {
      setDismissedNextActionKey(
        window.localStorage.getItem(nextActionDismissStorageKey)
      );
    } catch {
      setDismissedNextActionKey(null);
    }
  }, [nextActionDismissStorageKey]);

  const dismissNextAction = useCallback(() => {
    if (!nextAction) return;
    setDismissedNextActionKey(nextAction.dismissKey);
    if (!nextActionDismissStorageKey || typeof window === "undefined") return;

    try {
      window.localStorage.setItem(
        nextActionDismissStorageKey,
        nextAction.dismissKey
      );
    } catch {
      // Local state still dismisses the action for this page view.
    }
  }, [nextAction, nextActionDismissStorageKey]);

  useEffect(() => {
    return () => {
      if (checklistDismissTimerRef.current !== null && typeof window !== "undefined") {
        window.clearTimeout(checklistDismissTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (loading || !onboarding) return;

    const previousCompletion = checklistCompletionRef.current;

    if (!checklistComplete) {
      if (checklistDismissTimerRef.current !== null && typeof window !== "undefined") {
        window.clearTimeout(checklistDismissTimerRef.current);
        checklistDismissTimerRef.current = null;
      }
      setIsChecklistDismissed(false);
      setIsChecklistPoppingOut(false);
    } else if (previousCompletion === false) {
      setIsChecklistPoppingOut(true);
      if (checklistDismissTimerRef.current !== null && typeof window !== "undefined") {
        window.clearTimeout(checklistDismissTimerRef.current);
      }
      checklistDismissTimerRef.current = window.setTimeout(() => {
        setIsChecklistDismissed(true);
        setIsChecklistPoppingOut(false);
        checklistDismissTimerRef.current = null;
      }, 420);
    } else if (previousCompletion === null) {
      // Hide immediately when everything was already complete before this session.
      setIsChecklistDismissed(true);
      setIsChecklistPoppingOut(false);
    }

    checklistCompletionRef.current = checklistComplete;
  }, [checklistComplete, loading, onboarding]);

  if (isFreeAnalytics && analytics) {
    return (
      <FreeOverviewPanel
        analytics={analytics}
        error={error}
        userId={userId}
      />
    );
  }


  return (
    <div className="dashboard-overview-page min-w-0 space-y-6">
      <header className="dashboard-overview-header flex flex-col items-center gap-3 text-center sm:flex-row sm:items-center sm:justify-between sm:text-left">
        <div className="dashboard-overview-intro w-full max-w-lg min-w-0 space-y-1">
          <h1 className="text-2xl font-semibold text-foreground">Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            Live networking mode, lead capture, analytics, and your public profile.
          </p>
        </div>
        <div className="dashboard-date-pill mx-auto inline-flex items-center gap-2 rounded-full border border-border/60 bg-card/80 px-4 py-2 text-center text-xs font-medium text-muted-foreground shadow-sm sm:mx-0">
          <Calendar className="h-4 w-4 text-muted-foreground" aria-hidden />
          {dateLabel}
        </div>
      </header>

      {error && !loading && !analytics ? (
        <Card className="rounded-3xl border border-destructive/40 bg-destructive/10 shadow-sm">
          <CardHeader className="px-5 text-center sm:px-7 sm:text-left">
            <CardTitle className="text-lg font-semibold text-destructive">
              Analytics unavailable
            </CardTitle>
          </CardHeader>
          <CardContent className="px-5 text-center sm:px-7 sm:text-left">
            <p className="text-sm text-destructive">{error}</p>
          </CardContent>
        </Card>
      ) : null}

      {visibleNextAction ? (
        <DashboardNextActionCard
          action={visibleNextAction}
          onDismiss={dismissNextAction}
        />
      ) : null}

      <div className="dashboard-overview-grid grid min-w-0 gap-6 lg:grid-cols-12">
        <div className="dashboard-overview-column min-w-0 space-y-6 lg:col-span-7">
          <Card className="dashboard-overview-card dashboard-overview-section-card min-w-0 w-full rounded-3xl border border-border/70 bg-card/90 shadow-[0_18px_45px_rgba(15,23,42,0.08)]">
            <CardHeader className="space-y-1 px-5 text-center sm:px-7 sm:text-left">
              <CardTitle className="text-lg font-semibold text-foreground">
                Performance snapshot
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                Taps, leads, and conversion at a glance.
              </p>
            </CardHeader>
            <CardContent className="dashboard-overview-metrics grid min-w-0 grid-cols-1 gap-4 px-5 sm:grid-cols-2 sm:px-7">
              {overviewItems.map((item) => (
                <MetricRow
                  key={item.label}
                  icon={item.icon}
                  label={item.label}
                  value={item.value}
                  loading={loading && !analytics}
                />
              ))}
            </CardContent>
          </Card>

          <NetworkingModePanel userId={userId} />

          {isChecklistDismissed ? null : (
            <Card
              className={`dashboard-overview-section-card dashboard-overview-checklist-card min-w-0 w-full rounded-3xl border border-border/70 bg-card/90 shadow-[0_18px_45px_rgba(15,23,42,0.08)] ${isChecklistPoppingOut ? "dashboard-overview-checklist-card--exiting" : ""}`}
              data-tour="overview-checklist"
            >
              <CardHeader className="space-y-2 px-5 text-center sm:px-7 sm:text-left">
                <div className="flex flex-col items-center gap-2 text-center sm:flex-row sm:items-start sm:justify-between sm:text-left">
                  <CardTitle className="text-lg font-semibold text-foreground">
                    First-run checklist
                  </CardTitle>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="w-full rounded-full sm:w-auto"
                    onClick={() => {
                      if (typeof window === "undefined") return;
                      window.dispatchEvent(
                        new CustomEvent("linket:onboarding-tour:start")
                      );
                    }}
                  >
                    {hasSeenWalkthrough ? "Open walkthrough" : "Start walkthrough"}
                  </Button>
                </div>
                <p className="text-sm text-muted-foreground">
                  Complete these steps to launch your profile and start capturing leads.
                </p>
              </CardHeader>
              <CardContent className="min-w-0 space-y-4 px-5 sm:px-7">
                {loading && !analytics ? (
                  <div className="space-y-2">
                    <div className="dashboard-skeleton h-2 w-full animate-pulse rounded bg-muted" data-skeleton />
                    <div className="dashboard-skeleton h-10 w-full animate-pulse rounded-2xl bg-muted" data-skeleton />
                    <div className="dashboard-skeleton h-10 w-full animate-pulse rounded-2xl bg-muted" data-skeleton />
                    <div className="dashboard-skeleton h-10 w-full animate-pulse rounded-2xl bg-muted" data-skeleton />
                  </div>
                ) : onboarding ? (
                  <>
                    <div className="flex flex-col items-center gap-1 text-center sm:flex-row sm:justify-between sm:text-left">
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">
                        Progress
                      </p>
                      <p className="text-sm font-semibold text-foreground">
                        {onboarding.completedCount}/{onboarding.totalCount}
                      </p>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-primary transition-all"
                        style={{ width: `${Math.round(onboarding.progress * 100)}%` }}
                      />
                    </div>
                    <div className="space-y-2">
                      {onboarding.items.map((item) => (
                        <ChecklistItemRow
                          key={item.id}
                          label={item.label}
                          detail={item.detail}
                          completed={item.completed}
                        />
                      ))}
                    </div>
                  </>
                ) : (
                  <EmptyState message="Checklist unavailable right now." />
                )}
              </CardContent>
            </Card>
          )}
        </div>

        <div className="hidden md:block lg:col-span-5">
          <Card className="h-full rounded-[44px] border border-border/70 bg-card/90 py-3 shadow-[0_18px_45px_rgba(15,23,42,0.08)]">
            <CardContent className="flex h-full items-stretch px-6 py-2">
              <PublicProfilePreviewPanel userId={userId ?? null} />
            </CardContent>
          </Card>
        </div>

      </div>
    </div>
  );
}

function buildDashboardNextAction({
  analytics,
  hasPaidAccess,
}: {
  analytics: UserAnalytics | null;
  hasPaidAccess: boolean;
}): DashboardNextAction | null {
  if (!analytics) return null;

  const pending = new Set(
    analytics.onboarding.items
      .filter((item) => !item.completed)
      .map((item) => item.id)
  );

  const readyLeads = analytics.totals.readyLeads;

  if (readyLeads > 0 && hasPaidAccess) {
    return {
      id: "review_leads",
      title: "Review new leads",
      detail: `${numberFormatter.format(readyLeads)} open lead${
        readyLeads === 1 ? "" : "s"
      } ${readyLeads === 1 ? "is" : "are"} ready for follow-up.`,
      href: "/dashboard/leads",
      buttonLabel: "Open leads",
      icon: MessageSquare,
      dismissKey: `review_leads:${readyLeads}`,
    };
  }

  if (analytics.totals.activeTags === 0) {
    return {
      id: "claim_linket",
      title: "Claim your first Linket",
      detail: "Connect a physical Linket so scans route to this dashboard.",
      href: "/dashboard/linkets",
      buttonLabel: "Claim Linket",
      icon: Tags,
      dismissKey: "claim_linket",
    };
  }

  if (
    pending.has("set_handle") ||
    pending.has("add_three_links") ||
    pending.has("publish_profile")
  ) {
    return {
      id: "finish_profile",
      title: "Finish your public profile",
      detail: "Complete the basics, links, and publish state visitors see first.",
      href: "/dashboard/profiles",
      buttonLabel: "Finish profile",
      icon: UserRound,
      dismissKey: Array.from(pending).sort().join("|") || "finish_profile",
    };
  }

  if (pending.has("publish_lead_form")) {
    return {
      id: "add_lead_form",
      title: "Add a lead form",
      detail: "Turn visits into follow-up opportunities from your public page.",
      href: "/dashboard/profiles",
      buttonLabel: "Open profile builder",
      icon: Users,
      dismissKey: "add_lead_form",
    };
  }

  if (!hasPaidAccess) {
    return {
      id: "upgrade",
      title: "Upgrade for full dashboard signal",
      detail: "Unlock lead workflow labels, deeper analytics, and customization.",
      href: "/dashboard/billing",
      buttonLabel: "View upgrade",
      icon: Crown,
      dismissKey: "upgrade",
    };
  }

  return null;
}

function DashboardNextActionCard({
  action,
  onDismiss,
}: {
  action: DashboardNextAction;
  onDismiss: () => void;
}) {
  const Icon = action.icon;
  return (
    <Card className="dashboard-overview-section-card rounded-3xl border border-primary/25 bg-primary/5 shadow-[0_18px_45px_rgba(15,23,42,0.08)]">
      <CardContent className="flex flex-col gap-4 px-5 py-5 text-center sm:flex-row sm:items-center sm:justify-between sm:px-7 sm:text-left">
        <div className="flex min-w-0 flex-col items-center gap-3 sm:flex-row sm:items-start">
          <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary/12 text-primary">
            <Icon className="h-5 w-5" aria-hidden />
          </span>
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Next action
            </p>
            <h2 className="mt-1 text-lg font-semibold text-foreground">
              {action.title}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {action.detail}
            </p>
          </div>
        </div>
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
          <Button asChild className="w-full rounded-full sm:w-auto">
            <Link href={action.href}>
              {action.buttonLabel}
              <ArrowRight className="ml-2 h-4 w-4" aria-hidden />
            </Link>
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="mx-auto h-9 w-9 rounded-full text-muted-foreground hover:text-foreground sm:mx-0"
            aria-label={`Dismiss ${action.title}`}
            onClick={onDismiss}
          >
            <X className="h-4 w-4" aria-hidden />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function FreeOverviewPanel({
  analytics,
  error,
  userId,
}: {
  analytics: UserAnalytics;
  error: string | null;
  userId: string | null;
}) {
  const publicProfileLabel = analytics.meta.publicProfileHandle
    ? `linketconnect.com/${analytics.meta.publicProfileHandle}`
    : "your public profile";

  return (
    <div className="dashboard-overview-page min-w-0 space-y-6">
      <header className="dashboard-overview-header flex flex-col items-center gap-3 text-center sm:flex-row sm:items-center sm:justify-between sm:text-left">
        <div className="dashboard-overview-intro w-full max-w-lg min-w-0 space-y-1">
          <h1 className="text-2xl font-semibold text-foreground">Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            Free tracks visits to {publicProfileLabel}. Paid unlocks lead analytics, conversion insights, follow-up reminders, and star ratings.
          </p>
        </div>
      </header>

      {error ? (
        <Card className="rounded-3xl border border-destructive/40 bg-destructive/10 shadow-sm">
          <CardHeader className="px-5 text-center sm:px-7 sm:text-left">
            <CardTitle className="text-lg font-semibold text-destructive">
              Analytics unavailable
            </CardTitle>
          </CardHeader>
          <CardContent className="px-5 text-center sm:px-7 sm:text-left">
            <p className="text-sm text-destructive">{error}</p>
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-12">
        <div className="space-y-6 lg:col-span-7">
          <Card className="min-w-0 w-full rounded-3xl border border-border/70 bg-card/90 shadow-[0_18px_45px_rgba(15,23,42,0.08)]">
            <CardHeader className="space-y-1 px-5 text-center sm:px-7 sm:text-left">
              <CardTitle className="text-lg font-semibold text-foreground">
                Public profile visits
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                Counts for {publicProfileLabel}.
              </p>
            </CardHeader>
            <CardContent className="grid min-w-0 grid-cols-1 gap-4 px-5 sm:grid-cols-2 sm:px-7">
              <MetricRow
                icon={Activity}
                label="Visits in the past week"
                value={numberFormatter.format(analytics.totals.scans7d)}
                loading={false}
              />
              <MetricRow
                icon={Calendar}
                label="Visits today"
                value={numberFormatter.format(analytics.totals.scansToday)}
                loading={false}
              />
            </CardContent>
          </Card>

          <Card className="min-w-0 w-full rounded-3xl border border-primary/20 bg-primary/5 shadow-sm">
            <CardHeader className="space-y-1 px-5 text-center sm:px-7 sm:text-left">
              <CardTitle className="text-lg font-semibold text-foreground">
                Paid unlocks deeper insight
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                See lead trends, conversion rate, top links, and manage follow-up status as leads move through your pipeline.
              </p>
            </CardHeader>
            <CardContent className="flex flex-wrap justify-center gap-3 px-5 sm:justify-start sm:px-7">
              <Button asChild size="sm" className="w-full sm:w-auto">
                <Link href="/dashboard/billing">Unlock Paid</Link>
              </Button>
              <Button asChild size="sm" variant="outline" className="w-full sm:w-auto">
                <Link href="/dashboard/leads">Open leads inbox</Link>
              </Button>
            </CardContent>
          </Card>
        </div>

        <div className="hidden md:block lg:col-span-5">
          <Card className="h-full rounded-[44px] border border-border/70 bg-card/90 py-3 shadow-[0_18px_45px_rgba(15,23,42,0.08)]">
            <CardContent className="flex h-full items-stretch px-6 py-2">
              <PublicProfilePreviewPanel userId={userId} />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function MetricRow({
  icon: Icon,
  label,
  value,
  loading,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  loading: boolean;
}) {
  return (
    <div className="dashboard-metric-row flex min-w-0 flex-col items-center gap-3 rounded-2xl border border-border/60 bg-background/70 px-4 py-4 text-center sm:flex-row sm:justify-between sm:text-left">
      <div className="dashboard-metric-main flex min-w-0 flex-col items-center gap-3 sm:flex-row">
        <span className="dashboard-metric-icon inline-flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Icon className="h-4 w-4" aria-hidden />
        </span>
        <span
          className="dashboard-metric-label min-w-0 max-w-[14rem] text-sm font-medium text-foreground"
          title={label}
        >
          {label}
        </span>
      </div>
      <span className="dashboard-metric-value text-sm font-semibold text-foreground">
        {loading ? <span className="text-muted-foreground">--</span> : value}
      </span>
    </div>
  );
}

function ChecklistItemRow({
  label,
  detail,
  completed,
}: {
  label: string;
  detail: string;
  completed: boolean;
}) {
  return (
    <div className="dashboard-overview-checklist-item flex min-w-0 flex-col items-center gap-3 rounded-2xl border border-border/60 bg-background/70 px-4 py-4 text-center sm:flex-row sm:items-start sm:justify-between sm:text-left">
      <div className="flex min-w-0 flex-col items-center gap-3 sm:flex-row sm:items-start">
        <span className="mt-0.5 text-primary" aria-hidden>
          {completed ? (
            <CheckCircle2 className="h-4 w-4" />
          ) : (
            <Circle className="h-4 w-4 text-muted-foreground" />
          )}
        </span>
        <div className="min-w-0">
          <p className="dashboard-overview-checklist-label text-sm font-medium text-foreground">{label}</p>
          <p className="dashboard-overview-checklist-detail text-xs text-muted-foreground">{detail}</p>
        </div>
      </div>
      <span className="dashboard-overview-checklist-status text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {completed ? "Done" : "Pending"}
      </span>
    </div>
  );
}

function PublicProfilePreviewPanel({ userId }: { userId: string | null }) {
  const { theme } = useThemeOptional();
  const hasHydrated = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [publicHandle, setPublicHandle] = useState<string | null>(null);
  const [frameReady, setFrameReady] = useState(false);
  const [frameVersion, setFrameVersion] = useState(0);

  const reloadFrame = useCallback(() => {
    setFrameReady(false);
    setFrameVersion((value) => value + 1);
  }, []);

  const fetchPublicHandle = useCallback(async () => {
    if (!userId) {
      throw new Error("Sign in to see your live preview.");
    }
    const accountRes = await fetch(
      `/api/account/handle?userId=${encodeURIComponent(userId)}`,
      { cache: "no-store" }
    );
    if (!accountRes.ok) {
      const info = await accountRes.json().catch(() => ({}));
      throw new Error(info?.error || "Unable to load account.");
    }
    const accountPayload = (await accountRes.json()) as {
      handle?: string | null;
    };
    const resolvedHandle = accountPayload.handle?.trim().toLowerCase();
    if (!resolvedHandle) {
      throw new Error("Create a public profile to see the preview.");
    }
    return resolvedHandle;
  }, [userId]);

  useEffect(() => {
    if (!userId) return;

    let active = true;

    (async () => {
      if (!active) return;
      setLoading(true);
      setError(null);
      setPublicHandle(null);
      setFrameReady(false);
      try {
        const resolvedHandle = await fetchPublicHandle();
        if (!active) return;
        setPublicHandle(resolvedHandle);
        setFrameReady(false);
        setLoading(false);
      } catch (err) {
        if (!active) return;
        setError(err instanceof Error ? err.message : "Preview unavailable.");
        setPublicHandle(null);
        setFrameReady(false);
        setLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [fetchPublicHandle, userId]);

  useEffect(() => {
    if (!userId || typeof window === "undefined") return;

    const refreshFromServer = async () => {
      try {
        const nextHandle = await fetchPublicHandle();
        setPublicHandle((prev) => (prev === nextHandle ? prev : nextHandle));
        setError(null);
        reloadFrame();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Preview unavailable.");
      }
    };

    const handleProfilesUpdated = () => {
      void refreshFromServer();
    };

    const handleHandleUpdated = (event: Event) => {
      const detail = (event as CustomEvent<{ handle?: string }>).detail;
      const nextHandle = detail?.handle?.trim().toLowerCase();
      if (nextHandle) {
        setPublicHandle(nextHandle);
        setError(null);
        return;
      }
      void refreshFromServer();
    };

    window.addEventListener("linket-profiles:updated", handleProfilesUpdated);
    window.addEventListener("linket:handle-updated", handleHandleUpdated);

    return () => {
      window.removeEventListener("linket-profiles:updated", handleProfilesUpdated);
      window.removeEventListener("linket:handle-updated", handleHandleUpdated);
    };
  }, [fetchPublicHandle, reloadFrame, userId]);

  if (!hasHydrated) {
    return (
      <div className="flex h-full w-full items-center justify-center rounded-[36px] border border-border/60 bg-background px-4 text-center text-sm text-muted-foreground shadow-[0_20px_40px_-30px_rgba(15,23,42,0.3)]">
        Loading preview...
      </div>
    );
  }

  if (!userId) {
    return (
      <div className="flex h-full w-full items-center justify-center rounded-[36px] border border-border/60 bg-background px-4 text-center text-sm text-muted-foreground shadow-[0_20px_40px_-30px_rgba(15,23,42,0.3)]">
        Sign in to see your live preview.
      </div>
    );
  }

  const previewSrc = publicHandle
    ? `/u/${encodeURIComponent(publicHandle)}/preview?overviewPreview=${frameVersion}&theme=${encodeURIComponent(theme)}`
    : null;

  return (
    <div className="flex h-full w-full items-center justify-center">
      <div className="relative h-full w-full max-w-sm overflow-hidden rounded-[36px] border border-border/60 bg-black shadow-[0_24px_48px_-32px_rgba(15,23,42,0.45)]">
        {previewSrc ? (
          <iframe
            key={previewSrc}
            src={previewSrc}
            title="Public profile phone preview"
            loading="lazy"
            referrerPolicy="strict-origin-when-cross-origin"
            onLoad={() => setFrameReady(true)}
            className="h-full w-full border-0 bg-background"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-background px-4 text-center text-sm text-muted-foreground">
            {loading ? "Loading preview..." : error ?? "Preview unavailable."}
          </div>
        )}
        {previewSrc && (loading || !frameReady) ? (
          <PublicProfilePreviewLoadingState />
        ) : null}
        {error && previewSrc ? (
          <div className="absolute inset-x-3 bottom-3 z-30 rounded-xl border border-border/60 bg-background/95 px-3 py-2 text-xs text-muted-foreground shadow-sm">
            {error}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function PublicProfilePreviewLoadingState() {
  return <PublicProfilePreviewLoader overlay className="rounded-[36px]" />;
}

function EmptyState({ message }: { message: string }) {
  return (
    <p className="rounded-2xl border border-dashed px-3 py-8 text-center text-sm text-muted-foreground">
      {message}
    </p>
  );
}
