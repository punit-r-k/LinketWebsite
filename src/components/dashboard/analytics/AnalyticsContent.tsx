"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { useThemeOptional } from "@/components/theme/theme-provider";
import { readLocalStorage, writeLocalStorage } from "@/lib/browser-storage";
import { ANALYTICS_BROADCAST_KEY, ANALYTICS_EVENT_NAME } from "@/lib/analytics";
import { getSiteHost, getSiteOrigin } from "@/lib/site-url";
import type { UserAnalytics } from "@/lib/analytics-service";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
} from "recharts";
import { Download, Star } from "lucide-react";
import {
  getLeadFlagBadgeClassName,
  getLeadFlagLabel,
  getLeadRatingLabel,
  normalizeLeadFlag,
  normalizeLeadRating,
} from "@/lib/lead-workflow";

const numberFormatter = new Intl.NumberFormat("en-US");
const shortDate = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
});
const mobileDate = new Intl.DateTimeFormat("en-US", {
  month: "numeric",
  day: "numeric",
});
const timestampFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});
const relativeTimeFormatter = new Intl.RelativeTimeFormat("en-US", {
  numeric: "auto",
});

const RANGES = [
  { label: "7 days", value: 7 },
  { label: "30 days", value: 30 },
  { label: "90 days", value: 90 },
] as const;
const DEFAULT_RANGE = 30;
const ANALYTICS_RANGE_STORAGE_KEY = "linket:analytics:range";
const ANALYTICS_CACHE_TTL_MS = 60_000;
const DARK_DELTA_TEXT_THEMES = new Set([
  "light",
  "dream",
  "rose",
  "autumn",
  "honey",
  "maroon",
  "burnt-orange",
]);

type TimelineDatum = {
  date: string;
  label: string;
  scans: number | null;
  leads: number | null;
};

type ConversionDatum = {
  date: string;
  label: string;
  rate: number;
};

type ViewState = {
  loading: boolean;
  error: string | null;
  analytics: UserAnalytics | null;
};

type CachedAnalyticsEntry = {
  fetchedAt: number;
  payload: UserAnalytics;
};

type DeltaBadge = {
  text: string;
  tone: "up" | "down" | "neutral";
};

type ActionInsight = {
  kicker: string;
  title: string;
  detail: string;
  tone: "primary" | "accent" | "neutral";
};

export default function AnalyticsContent() {
  const { theme } = useThemeOptional();
  const useDarkDeltaText = DARK_DELTA_TEXT_THEMES.has(theme);
  const siteHost = useMemo(() => getSiteHost(getSiteOrigin()), []);
  const [userId, setUserId] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const [isPhone, setIsPhone] = useState(false);
  const [range, setRange] = useState<number>(DEFAULT_RANGE);
  const [hasLoadedPersistedRange, setHasLoadedPersistedRange] = useState(false);
  const analyticsCacheRef = useRef<Map<string, CachedAnalyticsEntry>>(
    new Map(),
  );
  const analyticsInFlightRef = useRef<Map<string, Promise<UserAnalytics>>>(
    new Map(),
  );
  const lastReloadTokenRef = useRef(0);

  useEffect(() => {
    const saved = Number(readLocalStorage(ANALYTICS_RANGE_STORAGE_KEY));
    if (
      Number.isFinite(saved) &&
      RANGES.some((option) => option.value === saved)
    ) {
      setRange(saved);
    }
    setHasLoadedPersistedRange(true);
  }, []);
  const [{ loading, error, analytics }, setState] = useState<ViewState>({
    loading: true,
    error: null,
    analytics: null,
  });

  useEffect(() => {
    if (!hasLoadedPersistedRange) return;
    writeLocalStorage(ANALYTICS_RANGE_STORAGE_KEY, String(range));
  }, [hasLoadedPersistedRange, range]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mediaQuery = window.matchMedia("(max-width: 640px)");
    const update = () => setIsPhone(mediaQuery.matches);
    update();
    if (typeof mediaQuery.addEventListener === "function") {
      mediaQuery.addEventListener("change", update);
      return () => mediaQuery.removeEventListener("change", update);
    }
    mediaQuery.addListener(update);
    return () => mediaQuery.removeListener(update);
  }, []);

  useEffect(() => {
    let active = true;
    supabase.auth
      .getUser()
      .then(({ data }) => {
        if (!active) return;
        const user = data.user;
        setUserId(user?.id ?? null);
        if (!user) {
          setState({
            loading: false,
            error: "You're not signed in.",
            analytics: null,
          });
        }
      })
      .catch(() => {
        if (active)
          setState({
            loading: false,
            error: "Unable to verify session.",
            analytics: null,
          });
      });
    return () => {
      active = false;
    };
  }, []);

  const fetchAnalyticsForRange = useCallback(
    async (
      activeUserId: string,
      days: number,
      timezoneOffsetMinutes: number,
    ) => {
      const cacheKey = `${activeUserId}:${days}:${timezoneOffsetMinutes}`;
      const inFlight = analyticsInFlightRef.current.get(cacheKey);
      if (inFlight) return inFlight;

      const request = (async () => {
        const analyticsUrl = `/api/analytics/supabase?userId=${encodeURIComponent(activeUserId)}&days=${days}&tzOffsetMinutes=${encodeURIComponent(String(timezoneOffsetMinutes))}`;
        const response = await fetch(analyticsUrl, { cache: "no-store" });
        if (!response.ok) {
          const info = await response.json().catch(() => ({}));
          throw new Error(
            info?.error || `Analytics request failed (${response.status})`,
          );
        }
        const payload = (await response.json()) as UserAnalytics;
        analyticsCacheRef.current.set(cacheKey, {
          fetchedAt: Date.now(),
          payload,
        });
        return payload;
      })();

      analyticsInFlightRef.current.set(cacheKey, request);
      try {
        return await request;
      } finally {
        analyticsInFlightRef.current.delete(cacheKey);
      }
    },
    [],
  );

  const prefetchOtherRanges = useCallback(
    (
      activeUserId: string,
      activeRange: number,
      timezoneOffsetMinutes: number,
    ) => {
      for (const option of RANGES) {
        if (option.value === activeRange) continue;
        const cacheKey = `${activeUserId}:${option.value}:${timezoneOffsetMinutes}`;
        const cached = analyticsCacheRef.current.get(cacheKey);
        const isFresh = cached
          ? Date.now() - cached.fetchedAt < ANALYTICS_CACHE_TTL_MS
          : false;
        if (isFresh) continue;
        void fetchAnalyticsForRange(
          activeUserId,
          option.value,
          timezoneOffsetMinutes,
        ).catch(() => undefined);
      }
    },
    [fetchAnalyticsForRange],
  );

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    const timezoneOffsetMinutes = new Date().getTimezoneOffset();
    const cacheKey = `${userId}:${range}:${timezoneOffsetMinutes}`;
    const cached = analyticsCacheRef.current.get(cacheKey);
    const isCacheFresh = cached
      ? Date.now() - cached.fetchedAt < ANALYTICS_CACHE_TTL_MS
      : false;
    const hasForcedRefresh = reloadToken !== lastReloadTokenRef.current;
    lastReloadTokenRef.current = reloadToken;

    if (cached) {
      setState({
        loading: false,
        error: cached.payload.meta.available
          ? null
          : "Analytics requires a configured Supabase service role key.",
        analytics: cached.payload,
      });
      if (isCacheFresh && !hasForcedRefresh) {
        prefetchOtherRanges(userId, range, timezoneOffsetMinutes);
        return () => {
          cancelled = true;
        };
      }
    } else {
      setState((prev) => ({ ...prev, loading: true, error: null }));
    }

    async function load() {
      try {
        if (!userId) throw new Error("User ID is missing");
        const payload = await fetchAnalyticsForRange(
          userId,
          range,
          timezoneOffsetMinutes,
        );
        if (!cancelled) {
          setState({
            loading: false,
            error: payload.meta.available
              ? null
              : "Analytics requires a configured Supabase service role key.",
            analytics: payload,
          });
          prefetchOtherRanges(userId, range, timezoneOffsetMinutes);
        }
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Unable to load analytics";
        if (!cancelled) {
          if (cached) {
            setState((prev) => ({ ...prev, loading: false, error: message }));
          } else {
            setState({ loading: false, error: message, analytics: null });
          }
        }
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [fetchAnalyticsForRange, prefetchOtherRanges, reloadToken, range, userId]);

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

  useEffect(() => {
    if (!userId) return;
    if (!canUseRealtime()) return;

    let channel: ReturnType<typeof supabase.channel> | null = null;
    let refreshTimer: number | null = null;
    let settleTimer: number | null = null;

    const requestRefresh = () => {
      if (refreshTimer !== null) window.clearTimeout(refreshTimer);
      refreshTimer = window.setTimeout(() => {
        setReloadToken((value) => value + 1);
      }, 300);
      if (settleTimer !== null) window.clearTimeout(settleTimer);
      settleTimer = window.setTimeout(() => {
        setReloadToken((value) => value + 1);
      }, 1200);
    };

    try {
      channel = supabase
        .channel(`analytics-live-${userId}`)
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "leads",
            filter: `user_id=eq.${userId}`,
          },
          requestRefresh,
        )
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "profile_links",
            filter: `user_id=eq.${userId}`,
          },
          requestRefresh,
        )
        .on(
          "postgres_changes",
          {
            event: "UPDATE",
            schema: "public",
            table: "tag_assignments",
            filter: `user_id=eq.${userId}`,
          },
          requestRefresh,
        )
        .subscribe((status) => {
          if (status === "CHANNEL_ERROR") {
            console.warn(
              "Realtime unavailable for analytics auto-refresh; continuing without live updates.",
            );
          }
        });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : String(error ?? "Unknown realtime error");
      console.warn(`Realtime disabled for analytics: ${message}`);
      channel = null;
    }

    return () => {
      if (refreshTimer !== null) window.clearTimeout(refreshTimer);
      if (settleTimer !== null) window.clearTimeout(settleTimer);
      if (channel) {
        supabase.removeChannel(channel);
      }
    };
  }, [userId]);

  const totals = analytics?.totals;

  const chartData: TimelineDatum[] = useMemo(() => {
    if (!analytics) return [];
    return analytics.timeline.map((point) => ({
      date: point.date,
      label: formatTimelineLabel(point.date),
      scans: point.scans,
      leads: point.leads,
    }));
  }, [analytics]);
  const currentTimelineDate =
    chartData.length > 0 ? chartData[chartData.length - 1].date : null;

  const rangeTotals = useMemo(() => {
    if (!analytics) return { scans: 0, leads: 0, conversion: 0 };
    const scans = analytics.timeline.reduce(
      (acc, point) => acc + point.scans,
      0,
    );
    const leads = analytics.timeline.reduce(
      (acc, point) => acc + point.leads,
      0,
    );
    const conversion = scans > 0 ? leads / scans : 0;
    return { scans, leads, conversion };
  }, [analytics]);

  const conversionSeries: ConversionDatum[] = useMemo(() => {
    if (!analytics) return [];
    return analytics.timeline.map((point) => ({
      date: point.date,
      label: shortDate.format(new Date(point.date)),
      rate: point.scans > 0 ? point.leads / point.scans : 0,
    }));
  }, [analytics]);

  const trendDeltas = useMemo(() => {
    if (!analytics || analytics.timeline.length === 0) return null;
    const points = analytics.timeline;
    const windowSize = Math.max(1, Math.floor(points.length / 2));
    const recentWindow = points.slice(-windowSize);
    const previousWindow = points.slice(-(windowSize * 2), -windowSize);
    if (!previousWindow.length) return null;

    const recent = summarizeTimelineWindow(recentWindow);
    const previous = summarizeTimelineWindow(previousWindow);

    return {
      scans: formatPercentDelta(recent.scans, previous.scans),
      leads: formatPercentDelta(recent.leads, previous.leads),
      conversion: formatRateDelta(recent.conversion, previous.conversion),
    };
  }, [analytics]);

  const topLinksTotalClicks = useMemo(() => {
    if (!analytics?.topLinks?.length) return 0;
    return analytics.topLinks.reduce((total, item) => total + item.clicks, 0);
  }, [analytics]);
  const recentLeads = useMemo(
    () => analytics?.recentLeads.slice(0, 5) ?? [],
    [analytics],
  );
  const latestLead = recentLeads[0] ?? null;
  const followUpLeads = latestLead
    ? recentLeads.slice(1, 4)
    : recentLeads.slice(0, 3);
  const topProfile = analytics?.topProfiles?.[0] ?? null;
  const topLink = analytics?.topLinks?.[0] ?? null;
  const onboarding = analytics?.onboarding ?? null;
  const incompleteOnboardingItems = useMemo(
    () => onboarding?.items.filter((item) => !item.completed) ?? [],
    [onboarding],
  );
  const nextSteps = useMemo<ActionInsight[]>(() => {
    const items: ActionInsight[] = [];

    if (latestLead) {
      const leadName =
        latestLead.name?.trim() || latestLead.email || "New contact";
      items.push({
        kicker: "Follow up first",
        title: leadName,
        detail: `Shared contact details ${formatRelativeTime(latestLead.created_at)}. Reach out while the conversation is still fresh.`,
        tone: "primary",
      });
    } else if (rangeTotals.scans > 0 && rangeTotals.leads === 0) {
      items.push({
        kicker: "Capture gap",
        title: "Scans are not becoming contacts yet",
        detail:
          "Publish your lead form and test the share flow so taps turn into follow-up-ready people instead of anonymous traffic.",
        tone: "accent",
      });
    } else if (rangeTotals.scans === 0) {
      items.push({
        kicker: "Start the funnel",
        title: "No scan activity in this window",
        detail:
          "Share your Linket at the next networking moment so this page can show who engaged and what converted.",
        tone: "neutral",
      });
    }

    if (topProfile) {
      const profileLabel = topProfile.handle
        ? `${siteHost}/${topProfile.handle}`
        : topProfile.nickname || "Assigned Linket";
      const captureRate =
        topProfile.scans > 0 ? (topProfile.leads / topProfile.scans) * 100 : 0;

      items.push({
        kicker: "Best Linket",
        title: topProfile.displayName || "Linket driving activity",
        detail: `${profileLabel} generated ${numberFormatter.format(
          topProfile.scans,
        )} scans and ${numberFormatter.format(
          topProfile.leads,
        )} leads in the last ${range} days${
          topProfile.scans > 0 ? ` (${captureRate.toFixed(1)}% capture)` : ""
        }.`,
        tone: "neutral",
      });
    }

    if (topLink) {
      const sharePercent =
        topLinksTotalClicks > 0
          ? (topLink.clicks / topLinksTotalClicks) * 100
          : 0;
      items.push({
        kicker: "Top CTA",
        title: topLink.title,
        detail: `${formatLinkUrl(topLink.url)} drove ${numberFormatter.format(
          topLink.clicks,
        )} clicks${
          topLinksTotalClicks > 0
            ? ` and ${sharePercent.toFixed(1)}% of all link engagement`
            : ""
        }. Keep high-intent links near the top of your page.`,
        tone: "primary",
      });
    }

    const firstGap = incompleteOnboardingItems[0];
    if (firstGap) {
      items.push({
        kicker: "Reduce friction",
        title: firstGap.label,
        detail: firstGap.detail,
        tone: "accent",
      });
    }

    return items.slice(0, 4);
  }, [
    incompleteOnboardingItems,
    latestLead,
    range,
    rangeTotals.leads,
    rangeTotals.scans,
    siteHost,
    topLink,
    topLinksTotalClicks,
    topProfile,
  ]);
  const primaryInsight = nextSteps[0] ?? null;
  const supportingInsights = nextSteps.slice(1, 4);
  const isFreeAnalytics =
    analytics?.meta.analyticsScope === "public_profile_visits";
  const publicProfileLabel = analytics?.meta.publicProfileHandle
    ? `${siteHost}/${analytics.meta.publicProfileHandle}`
    : "your public profile";

  const handleExport = useCallback(() => {
    if (!analytics) return;
    const rows =
      analytics.meta.analyticsScope === "public_profile_visits"
        ? ["date,visits"].concat(
            analytics.timeline.map((point) => `${point.date},${point.scans}`),
          )
        : ["date,scans,leads"].concat(
            analytics.timeline.map(
              (point) => `${point.date},${point.scans},${point.leads}`,
            ),
          );
    const csv = rows.join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `linket-analytics-${range}d.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, [analytics, range]);

  if (isFreeAnalytics && analytics) {
    return (
      <FreeAnalyticsView
        analytics={analytics}
        chartData={chartData}
        currentTimelineDate={currentTimelineDate}
        error={error}
        isPhone={isPhone}
        publicProfileLabel={publicProfileLabel}
        range={range}
        onExport={handleExport}
        onRangeChange={setRange}
        onRefresh={() => setReloadToken((value) => value + 1)}
      />
    );
  }

  return (
    <div
      className="dashboard-analytics-page w-full space-y-6"
      data-tour="analytics-overview"
    >
      <header className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold text-foreground sm:text-3xl">
            Analytics
          </h1>
          <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
            Scans, captured contacts, conversion, and the links people choose.
          </p>
        </div>
        <div className="dashboard-analytics-range flex w-full max-w-full flex-nowrap items-center gap-1 overflow-x-auto rounded-full p-1 sm:w-auto sm:overflow-visible">
          {RANGES.map((option) => (
            <Button
              key={option.value}
              variant="outline"
              size="sm"
              className={cn(
                "rounded-full dashboard-analytics-range-button transition",
                range === option.value
                  ? "border-accent bg-accent text-accent-foreground shadow-[0_16px_40px_rgba(0,0,0,0.25)] ring-2 ring-accent/40 ring-offset-2 ring-offset-background hover:bg-accent/90"
                  : "border-border/60 text-muted-foreground hover:border-accent/50 hover:text-foreground",
              )}
              onClick={() => setRange(option.value)}
              data-selected={range === option.value ? "true" : "false"}
            >
              {option.label}
            </Button>
          ))}
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="dashboard-analytics-export-button h-10 w-10 shrink-0 rounded-full px-0 sm:h-9 sm:w-auto sm:px-4"
            onClick={handleExport}
            disabled={!analytics || analytics.timeline.length === 0}
            aria-label="Export CSV"
            title="Export CSV"
          >
            <Download className="h-4 w-4 sm:mr-2" />
            <span className="hidden sm:inline">Export CSV</span>
          </Button>
        </div>
      </header>

      {error && (
        <Card className="dashboard-analytics-card rounded-3xl border bg-card/80 shadow-sm">
          <CardContent className="space-y-4 py-8 text-center">
            <p className="text-sm text-destructive">{error}</p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setReloadToken((value) => value + 1)}
            >
              Retry analytics
            </Button>
          </CardContent>
        </Card>
      )}

      <section id="analytics-start-here">
        <Card className="dashboard-analytics-card rounded-[32px] border bg-card/85 shadow-[0_22px_55px_rgba(15,23,42,0.08)]">
          <CardHeader>
            <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
              <div className="space-y-1">
                <CardTitle className="text-xl font-semibold text-foreground sm:text-2xl">
                  Follow-up
                </CardTitle>
                <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
                  Who shared contact details, and what should you check next.
                </p>
              </div>
              <div className="flex flex-wrap gap-3">
                <Button asChild size="sm" className="rounded-full">
                  <Link href="/dashboard/leads">Open leads inbox</Link>
                </Button>
                <Button
                  asChild
                  variant="outline"
                  size="sm"
                  className="rounded-full"
                >
                  <Link href="/dashboard/profiles">Improve capture flow</Link>
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid gap-4 xl:grid-cols-[minmax(0,1.08fr)_minmax(320px,0.92fr)]">
              <div className="space-y-4">
                <div className="rounded-[28px] border border-primary/20 bg-primary/5 p-5 sm:p-6">
                  {loading ? (
                    <div className="space-y-3">
                      <div
                        className="dashboard-skeleton h-5 w-32 animate-pulse rounded-full bg-muted"
                        data-skeleton
                      />
                      <div
                        className="dashboard-skeleton h-10 w-3/4 animate-pulse rounded-2xl bg-muted"
                        data-skeleton
                      />
                      <div
                        className="dashboard-skeleton h-20 w-full animate-pulse rounded-3xl bg-muted"
                        data-skeleton
                      />
                    </div>
                  ) : latestLead ? (
                    <div className="space-y-5">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="space-y-2">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-primary/80">
                            Newest Captured Contact
                          </p>
                          <h2 className="text-xl font-semibold text-foreground sm:text-2xl">
                            {latestLead.name?.trim() ||
                              latestLead.email ||
                              "Unknown contact"}
                          </h2>
                          <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
                            {latestLead.message?.trim()
                              ? truncateText(latestLead.message.trim(), 180)
                              : (primaryInsight?.detail ??
                                "Reach out while the in-person conversation is still fresh.")}
                          </p>
                        </div>
                        <div className="rounded-full border border-primary/15 bg-background/70 px-3 py-1.5 text-xs font-medium text-muted-foreground">
                          {formatRelativeTime(latestLead.created_at)}
                        </div>
                      </div>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <PriorityInfoChip
                          label="Email"
                          value={latestLead.email || "No email shared"}
                        />
                        <PriorityInfoChip
                          label="Company"
                          value={latestLead.company || "No company captured"}
                        />
                        <PriorityInfoChip
                          label="Source"
                          value={
                            latestLead.handle
                              ? latestLead.handle
                              : latestLead.source_url
                                ? formatLinkUrl(latestLead.source_url)
                                : "Direct capture"
                          }
                        />
                        <PriorityInfoChip
                          label="Captured"
                          value={timestampFormatter.format(
                            new Date(latestLead.created_at),
                          )}
                        />
                      </div>
                    </div>
                  ) : primaryInsight ? (
                    <div className="space-y-3">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-primary/80">
                        {primaryInsight.kicker}
                      </p>
                      <h2 className="text-xl font-semibold text-foreground sm:text-2xl">
                        {primaryInsight.title}
                      </h2>
                      <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
                        {primaryInsight.detail}
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-primary/80">
                        Ready for activity
                      </p>
                      <h2 className="text-xl font-semibold text-foreground sm:text-2xl">
                        Share your Linket to start building signal.
                      </h2>
                      <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
                        Once scans and contacts start coming in, this space will
                        pull the most urgent follow-up to the top.
                      </p>
                    </div>
                  )}
                </div>

                {supportingInsights.length > 0 ? (
                  <div className="grid gap-3 sm:grid-cols-2">
                    {supportingInsights.map((item) => (
                      <CompactInsightCard
                        key={`${item.kicker}-${item.title}`}
                        insight={item}
                      />
                    ))}
                  </div>
                ) : null}
              </div>

              <div className="rounded-[28px] border border-border/70 bg-background/45 p-5 sm:p-6">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h3 className="text-base font-semibold text-foreground">
                      Recent contacts
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      The people most likely to still remember the interaction.
                    </p>
                  </div>
                  <Button
                    asChild
                    variant="outline"
                    size="sm"
                    className="rounded-full"
                  >
                    <Link href="/dashboard/leads">View all</Link>
                  </Button>
                </div>

                <div className="mt-5 space-y-3">
                  {loading ? (
                    Array.from({ length: 3 }).map((_, index) => (
                      <div
                        key={`recent-contact-skeleton-${index}`}
                        className="dashboard-skeleton h-20 animate-pulse rounded-2xl bg-muted"
                        data-skeleton
                      />
                    ))
                  ) : followUpLeads.length > 0 ? (
                    followUpLeads.map((lead) => (
                      <RecentLeadListItem key={lead.id} lead={lead} />
                    ))
                  ) : latestLead ? (
                    <EmptyState message="The highlighted contact on the left is the newest one. Additional captures will appear here as they come in." />
                  ) : (
                    <EmptyState
                      message="No contacts captured yet. Publish your lead form and keep the share flow simple so taps become people."
                      actionLabel="Open profile setup"
                      onAction={() => {
                        window.location.href = "/dashboard/profiles";
                      }}
                    />
                  )}
                </div>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <PriorityMetricCard
                label="Scans"
                value={
                  analytics
                    ? numberFormatter.format(rangeTotals.scans)
                    : loading
                      ? "--"
                      : "0"
                }
                helper={`Taps and opens in the last ${range} days`}
                delta={trendDeltas?.scans}
                darkDeltaText={useDarkDeltaText}
              />
              <PriorityMetricCard
                label="Contacts captured"
                value={
                  analytics
                    ? numberFormatter.format(rangeTotals.leads)
                    : loading
                      ? "--"
                      : "0"
                }
                helper="People you can follow up with"
                delta={trendDeltas?.leads}
                darkDeltaText={useDarkDeltaText}
              />
              <PriorityMetricCard
                label="Capture rate"
                value={
                  analytics
                    ? `${(rangeTotals.conversion * 100).toFixed(1)}%`
                    : loading
                      ? "--"
                      : "0%"
                }
                helper="Contacts captured / scans"
                delta={trendDeltas?.conversion}
                darkDeltaText={useDarkDeltaText}
              />
              <PriorityMetricCard
                label="CTA clicks"
                value={
                  analytics?.topLinks?.length
                    ? numberFormatter.format(topLinksTotalClicks)
                    : loading
                      ? "--"
                      : "0"
                }
                helper={
                  topLink
                    ? `${truncateText(topLink.title, 30)} is leading current click share`
                    : "Across active profile links"
                }
              />
            </div>
          </CardContent>
        </Card>
      </section>

      <section id="analytics-trends">
        <Card className="dashboard-analytics-card rounded-[32px] border bg-card/80 shadow-sm">
          <CardHeader>
            <CardTitle className="text-xl font-semibold text-foreground">
              Traffic and capture
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Daily scans, captured contacts, and capture rate.
            </p>
          </CardHeader>
          <CardContent>
              <div className="grid gap-6 xl:grid-cols-[minmax(0,1.32fr)_minmax(320px,0.88fr)]">
            <div className="min-w-0">
              {loading ? (
                <div
                  className="dashboard-skeleton h-64 w-full animate-pulse rounded-2xl bg-muted sm:h-72"
                  data-skeleton
                />
              ) : chartData.length === 0 ? (
                <EmptyState
                  message="No scans recorded in this range."
                  actionLabel="Refresh"
                  onAction={() => setReloadToken((value) => value + 1)}
                />
              ) : isPhone ? (
                <PhoneScansLeadsChart data={chartData} />
              ) : (
                <div className="dashboard-analytics-chart h-64 w-full sm:h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart
                      data={chartData}
                      margin={
                        isPhone
                          ? { left: -10, right: 14, top: 8, bottom: 0 }
                          : { left: 0, right: 14, top: 12, bottom: 0 }
                      }
                    >
                      <CartesianGrid
                        vertical={false}
                        strokeDasharray="4 4"
                        className="stroke-muted"
                      />
                      <XAxis
                        dataKey="label"
                        tickLine={false}
                        axisLine={false}
                        minTickGap={isPhone ? 30 : 22}
                        interval="preserveStartEnd"
                        tickMargin={isPhone ? 6 : 8}
                        tick={{ fontSize: isPhone ? 10 : 12 }}
                        className="text-xs text-muted-foreground"
                      />
                      <YAxis
                        tickFormatter={(val) =>
                          numberFormatter.format(val as number)
                        }
                        tickLine={false}
                        axisLine={false}
                        width={isPhone ? 36 : 48}
                        tickCount={isPhone ? 4 : 6}
                        allowDecimals={false}
                        tick={{ fontSize: isPhone ? 10 : 12 }}
                        className="text-xs text-muted-foreground"
                      />
                      <Tooltip
                        content={<SeriesTooltip />}
                        wrapperStyle={{ outline: "none" }}
                      />
                      <Legend
                        iconSize={isPhone ? 8 : 10}
                        wrapperStyle={{
                          fontSize: isPhone ? "0.68rem" : "0.75rem",
                        }}
                      />
                      <Line
                        type="monotone"
                        dataKey="scans"
                        name="Scans"
                        stroke="var(--primary)"
                        strokeWidth={2}
                        dot={
                          <CurrentTimelineDot
                            targetDate={currentTimelineDate}
                            color="var(--primary)"
                          />
                        }
                        connectNulls={false}
                      />
                      <Line
                        type="monotone"
                        dataKey="leads"
                        name="Leads"
                        stroke="var(--accent)"
                        strokeWidth={2}
                        dot={
                          <CurrentTimelineDot
                            targetDate={currentTimelineDate}
                            color="var(--accent)"
                          />
                        }
                        connectNulls={false}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>

            <div className="rounded-[28px] border border-border/70 bg-background/45 p-5 sm:p-6">
              <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-1">
                <PriorityInfoChip
                  label="7-day scans"
                  value={
                    totals
                      ? numberFormatter.format(totals.scans7d)
                      : loading
                        ? "--"
                        : "0"
                  }
                />
                <PriorityInfoChip
                  label="7-day contacts"
                  value={
                    totals
                      ? numberFormatter.format(totals.leads7d)
                      : loading
                        ? "--"
                        : "0"
                  }
                />
                <PriorityInfoChip
                  label="7-day capture"
                  value={
                    totals
                      ? `${(totals.conversionRate7d * 100).toFixed(1)}%`
                      : loading
                        ? "--"
                        : "0%"
                  }
                />
              </div>

            </div>
            </div>
          </CardContent>
        </Card>
      </section>

      <section
        id="analytics-breakdowns"
        className="grid gap-6 xl:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)]"
      >
        <Card className="dashboard-analytics-card rounded-[32px] border bg-card/80 shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg font-semibold text-foreground">
              Top Linkets
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Scans, contacts, and capture rate by profile.
            </p>
          </CardHeader>
          <CardContent>
              {loading ? (
                <div className="space-y-2">
                  <div
                    className="dashboard-skeleton h-12 animate-pulse rounded-2xl bg-muted"
                    data-skeleton
                  />
                  <div
                    className="dashboard-skeleton h-12 animate-pulse rounded-2xl bg-muted"
                    data-skeleton
                  />
                  <div
                    className="dashboard-skeleton h-12 animate-pulse rounded-2xl bg-muted"
                    data-skeleton
                  />
                </div>
              ) : analytics?.topProfiles?.length ? (
                <div className="space-y-2">
                  {analytics.topProfiles.map((profile) => {
                    const subtitle = profile.handle
                      ? `${siteHost}/${profile.handle}`
                      : profile.nickname || "Unassigned";
                    const conversion =
                      profile.scans > 0 ? profile.leads / profile.scans : 0;
                    return (
                      <div
                        key={`${profile.profileId ?? "np"}-${profile.handle ?? "nh"}`}
                        className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border px-3 py-2"
                      >
                        <div>
                          <div className="text-sm font-medium text-foreground">
                            {profile.displayName || "Linket"}
                          </div>
                          <p className="text-xs text-muted-foreground">
                            {subtitle}
                          </p>
                        </div>
                        <div className="text-right text-xs text-muted-foreground">
                          <div className="font-semibold text-foreground">
                            {numberFormatter.format(profile.scans)} scans
                          </div>
                          <div>
                            {profile.leads
                              ? `${numberFormatter.format(profile.leads)} leads`
                              : "0 leads"}
                          </div>
                          <div>{(conversion * 100).toFixed(1)}% capture</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <EmptyState
                  message="No Linkets generated activity in this range."
                  actionLabel="Refresh"
                  onAction={() => setReloadToken((value) => value + 1)}
                />
              )}
          </CardContent>
        </Card>

        <Card className="dashboard-analytics-card rounded-[32px] border bg-card/80 shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg font-semibold text-foreground">
              Top links
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Click distribution across your public profile links.
            </p>
          </CardHeader>
          <CardContent>
              {loading ? (
                <div className="space-y-2">
                  <div
                    className="dashboard-skeleton h-12 animate-pulse rounded-2xl bg-muted"
                    data-skeleton
                  />
                  <div
                    className="dashboard-skeleton h-12 animate-pulse rounded-2xl bg-muted"
                    data-skeleton
                  />
                  <div
                    className="dashboard-skeleton h-12 animate-pulse rounded-2xl bg-muted"
                    data-skeleton
                  />
                </div>
              ) : analytics?.topLinks?.length ? (
                <div className="space-y-3">
                  {analytics.topLinks.map((link) => {
                    const clickShare =
                      topLinksTotalClicks > 0
                        ? link.clicks / topLinksTotalClicks
                        : 0;
                    const sharePercent = clickShare * 100;
                    const barPercent =
                      link.clicks > 0
                        ? Math.max(4, Math.round(sharePercent))
                        : 0;
                    const displayUrl = formatLinkUrl(link.url);
                    return (
                      <div
                        key={link.id}
                        className="space-y-3 rounded-2xl border border-border/70 bg-background/20 px-4 py-3"
                      >
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                          <div className="min-w-0 space-y-1">
                            <div className="truncate text-base font-semibold text-foreground">
                              {link.title}
                            </div>
                            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                              {link.handle ? (
                                <span
                                  className={cn(
                                    "rounded-full bg-muted px-2 py-0.5 font-medium",
                                    theme === "dark" ||
                                      theme === "gilded" ||
                                      theme === "midnight"
                                      ? "text-slate-100"
                                      : "text-slate-900",
                                  )}
                                >
                                  {link.handle}
                                </span>
                              ) : null}
                              <span className="min-w-0 truncate">
                                {displayUrl}
                              </span>
                            </div>
                          </div>
                          <div className="flex items-baseline justify-between gap-3 text-xs text-muted-foreground sm:flex-col sm:items-end sm:justify-start sm:gap-0.5">
                            <div className="text-base font-semibold text-foreground">
                              {numberFormatter.format(link.clicks)} clicks
                            </div>
                            <div>{sharePercent.toFixed(1)}% share</div>
                          </div>
                        </div>
                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between text-[11px] uppercase tracking-wide text-muted-foreground">
                            <span>Share</span>
                            <span>{sharePercent.toFixed(1)}%</span>
                          </div>
                          <div className="h-2 overflow-hidden rounded-full bg-muted/80">
                            <div
                              className="h-full rounded-full bg-primary transition-all duration-500"
                              style={{ width: `${barPercent}%` }}
                            />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <EmptyState
                  message="No link clicks yet. Put your highest-value CTA near the top of the page and test again."
                  actionLabel="Refresh"
                  onAction={() => setReloadToken((value) => value + 1)}
                />
              )}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}

function FreeAnalyticsView({
  analytics,
  chartData,
  currentTimelineDate,
  error,
  isPhone,
  publicProfileLabel,
  range,
  onExport,
  onRangeChange,
  onRefresh,
}: {
  analytics: UserAnalytics;
  chartData: TimelineDatum[];
  currentTimelineDate: string | null;
  error: string | null;
  isPhone: boolean;
  publicProfileLabel: string;
  range: number;
  onExport: () => void;
  onRangeChange: (range: number) => void;
  onRefresh: () => void;
}) {
  const visitsInRange = analytics.timeline.reduce(
    (total, point) => total + point.scans,
    0,
  );

  return (
    <div
      className="dashboard-analytics-page w-full space-y-6"
      data-tour="analytics-overview"
    >
      <header className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div className="space-y-1">
          <h1 className="text-xl font-semibold text-foreground">
            Profile visits overview
          </h1>
          <p className="text-sm text-muted-foreground">
            Start simple: free shows visits to {publicProfileLabel}. Paid adds
            contact capture, conversion, and link-performance analytics.
          </p>
        </div>
        <div className="dashboard-analytics-range flex w-full max-w-full flex-nowrap items-center gap-1 overflow-x-auto rounded-full p-1 sm:w-auto sm:overflow-visible">
          {RANGES.map((option) => (
            <Button
              key={option.value}
              variant="outline"
              size="sm"
              className={cn(
                "rounded-full dashboard-analytics-range-button transition",
                range === option.value
                  ? "border-accent bg-accent text-accent-foreground"
                  : "border-border/60 text-muted-foreground",
              )}
              onClick={() => onRangeChange(option.value)}
              data-selected={range === option.value ? "true" : "false"}
            >
              {option.label}
            </Button>
          ))}
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="dashboard-analytics-export-button h-10 w-10 shrink-0 rounded-full px-0 sm:h-9 sm:w-auto sm:px-4"
            onClick={onExport}
            disabled={analytics.timeline.length === 0}
            aria-label="Export CSV"
            title="Export CSV"
          >
            <Download className="h-4 w-4 sm:mr-2" />
            <span className="hidden sm:inline">Export CSV</span>
          </Button>
        </div>
      </header>

      {error ? (
        <Card className="rounded-3xl border bg-card/80 shadow-sm">
          <CardContent className="space-y-4 py-6">
            <p className="text-sm text-destructive">{error}</p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onRefresh}
            >
              Retry analytics
            </Button>
          </CardContent>
        </Card>
      ) : null}

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <StatCard
          label="Profile visits"
          value={numberFormatter.format(visitsInRange)}
          helper={`Last ${range} days`}
        />
        <StatCard
          label="Visits this week"
          value={numberFormatter.format(analytics.totals.scans7d)}
          helper="Last 7 days"
        />
        <Card className="dashboard-analytics-card min-w-0 rounded-3xl border border-primary/20 bg-primary/5 shadow-sm">
          <CardHeader>
            <CardTitle className="text-sm text-foreground">
              Paid analytics
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>
              Unlock lead capture trends, conversion rate, top links, and
              link-by-link performance.
            </p>
            <Button asChild size="sm" className="w-full sm:w-auto">
              <Link href="/dashboard/billing">Unlock paid analytics</Link>
            </Button>
          </CardContent>
        </Card>
      </section>

      <Card className="dashboard-analytics-card rounded-3xl border bg-card/80 shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg font-semibold">
            Public profile visits
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Daily visits to {publicProfileLabel}.
          </p>
        </CardHeader>
        <CardContent>
          {chartData.length === 0 ? (
            <EmptyState
              message="No profile visits recorded in this range."
              actionLabel="Refresh"
              onAction={onRefresh}
            />
          ) : isPhone ? (
            <PhoneScansLeadsChart
              data={chartData.map((point) => ({
                ...point,
                leads: null,
              }))}
            />
          ) : (
            <div className="dashboard-analytics-chart h-64 w-full sm:h-72">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={chartData}
                  margin={
                    isPhone
                      ? { left: -10, right: 14, top: 8, bottom: 0 }
                      : { left: 0, right: 14, top: 12, bottom: 0 }
                  }
                >
                  <CartesianGrid
                    vertical={false}
                    strokeDasharray="4 4"
                    className="stroke-muted"
                  />
                  <XAxis
                    dataKey="label"
                    tickLine={false}
                    axisLine={false}
                    minTickGap={isPhone ? 30 : 22}
                    interval="preserveStartEnd"
                    tickMargin={isPhone ? 6 : 8}
                    tick={{ fontSize: isPhone ? 10 : 12 }}
                    className="text-xs text-muted-foreground"
                  />
                  <YAxis
                    tickFormatter={(val) =>
                      numberFormatter.format(val as number)
                    }
                    tickLine={false}
                    axisLine={false}
                    width={isPhone ? 36 : 48}
                    tickCount={isPhone ? 4 : 6}
                    allowDecimals={false}
                    tick={{ fontSize: isPhone ? 10 : 12 }}
                    className="text-xs text-muted-foreground"
                  />
                  <Tooltip
                    content={<SeriesTooltip />}
                    wrapperStyle={{ outline: "none" }}
                  />
                  <Line
                    type="monotone"
                    dataKey="scans"
                    name="Visits"
                    stroke="var(--primary)"
                    strokeWidth={2}
                    dot={
                      <CurrentTimelineDot
                        targetDate={currentTimelineDate}
                        color="var(--primary)"
                      />
                    }
                    connectNulls={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="dashboard-analytics-card rounded-3xl border border-dashed border-border/60 bg-card/80 shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg font-semibold">
            Upgrade for more insight
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Paid adds lead analytics, conversion trendlines, and top-performing
            links so you can see what turns profile traffic into conversations.
          </p>
        </CardHeader>
        <CardContent>
          <Button asChild size="sm">
            <Link href="/dashboard/billing">See Paid features</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

type StatCardProps = {
  label: string;
  value: string;
  helper?: string;
  delta?: DeltaBadge;
  darkDeltaText?: boolean;
};

function StatCard({
  label,
  value,
  helper,
  delta,
  darkDeltaText = false,
}: StatCardProps) {
  return (
    <Card className="dashboard-analytics-card min-w-0 rounded-3xl border bg-card/80 shadow-sm">
      <CardHeader className="flex-col items-center justify-center gap-2 space-y-0 text-center sm:flex-row sm:flex-wrap sm:items-start sm:justify-between sm:text-left sm:gap-3">
        <CardTitle className="text-sm text-muted-foreground">{label}</CardTitle>
        {delta ? (
          <span
            className={cn(
              "rounded-full px-2 py-1 text-[10px] font-semibold uppercase tracking-wide",
              delta.tone === "up" &&
                cn(
                  "bg-emerald-500/10",
                  darkDeltaText ? "text-slate-900" : "text-emerald-300",
                ),
              delta.tone === "down" &&
                cn(
                  "bg-amber-500/10",
                  darkDeltaText ? "text-slate-900" : "text-amber-300",
                ),
              delta.tone === "neutral" &&
                cn(
                  "bg-muted",
                  darkDeltaText ? "text-slate-900" : "text-muted-foreground",
                ),
            )}
          >
            {delta.text}
          </span>
        ) : null}
      </CardHeader>
      <CardContent className="space-y-1 text-center sm:text-left">
        <div className="text-2xl font-semibold text-foreground sm:text-3xl">
          {value}
        </div>
        {helper && (
          <div className="text-xs text-muted-foreground">{helper}</div>
        )}
      </CardContent>
    </Card>
  );
}

function PriorityMetricCard({
  label,
  value,
  helper,
  delta,
  darkDeltaText = false,
}: StatCardProps) {
  return (
    <div
      className={cn(
        "rounded-[24px] border border-border/70 bg-background/45 px-4 py-4 shadow-sm",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
            {label}
          </p>
          <div className="text-2xl font-semibold text-foreground">{value}</div>
        </div>
        {delta ? (
          <span
            className={cn(
              "rounded-full px-2 py-1 text-[10px] font-semibold uppercase tracking-wide",
              delta.tone === "up" &&
                cn(
                  "bg-emerald-500/10",
                  darkDeltaText ? "text-slate-900" : "text-emerald-300",
                ),
              delta.tone === "down" &&
                cn(
                  "bg-amber-500/10",
                  darkDeltaText ? "text-slate-900" : "text-amber-300",
                ),
              delta.tone === "neutral" &&
                cn(
                  "bg-muted",
                  darkDeltaText ? "text-slate-900" : "text-muted-foreground",
                ),
            )}
          >
            {delta.text}
          </span>
        ) : null}
      </div>
      {helper ? (
        <p className="mt-2 text-xs leading-5 text-muted-foreground">{helper}</p>
      ) : null}
    </div>
  );
}

function PriorityInfoChip({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-border/60 bg-background/65 px-4 py-3">
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 text-sm font-medium text-foreground">{value}</p>
    </div>
  );
}

function CompactInsightCard({ insight }: { insight: ActionInsight }) {
  const accentClasses =
    insight.tone === "primary"
      ? "border-primary/15 bg-primary/5"
      : insight.tone === "accent"
        ? "border-accent/20 bg-accent/10"
        : "border-border/70 bg-background/45";

  return (
    <div
      className={cn("rounded-2xl border px-4 py-4 shadow-sm", accentClasses)}
    >
      <div className="space-y-2">
        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
          {insight.kicker}
        </p>
        <h3 className="text-sm font-semibold text-foreground">
          {insight.title}
        </h3>
        <p className="text-sm leading-6 text-muted-foreground">
          {insight.detail}
        </p>
      </div>
    </div>
  );
}

function RecentLeadListItem({
  lead,
}: {
  lead: UserAnalytics["recentLeads"][number];
}) {
  const sourceLabel = lead.handle
    ? `From ${lead.handle}`
    : lead.source_url
      ? formatLinkUrl(lead.source_url)
      : null;

  return (
    <div className="rounded-2xl border border-border/60 bg-background/55 px-4 py-3 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <div className="truncate text-sm font-semibold text-foreground">
            {lead.name?.trim() || lead.email || "Unknown contact"}
          </div>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
            <span>{lead.email || "No email shared"}</span>
            {lead.company ? <span>{lead.company}</span> : null}
            {sourceLabel ? <span>{sourceLabel}</span> : null}
          </div>
        </div>
        <div className="text-right text-[11px] text-muted-foreground">
          <div>{formatRelativeTime(lead.created_at)}</div>
          <div>{timestampFormatter.format(new Date(lead.created_at))}</div>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <LeadFlagBadge flag={normalizeLeadFlag(lead.lead_flag)} />
        <LeadRatingBadge rating={normalizeLeadRating(lead.lead_rating)} />
        {lead.next_follow_up_at ? (
          <span className="text-[11px] text-muted-foreground">
            Follow-up due {formatRelativeTime(lead.next_follow_up_at)}.
          </span>
        ) : null}
      </div>
      {lead.message ? (
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          {truncateText(lead.message, 110)}
        </p>
      ) : null}
    </div>
  );
}

function LeadFlagBadge({ flag }: { flag: "follow_up" | "done" }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold",
        getLeadFlagBadgeClassName(flag)
      )}
    >
      {getLeadFlagLabel(flag)}
    </span>
  );
}

function LeadRatingBadge({ rating }: { rating: number }) {
  const normalized = normalizeLeadRating(rating);
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-amber-300/60 bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/15 dark:text-amber-100">
      <span
        className="inline-flex items-center gap-0.5"
        aria-label={getLeadRatingLabel(normalized)}
      >
        {Array.from({ length: 5 }).map((_, index) => (
          <Star
            key={index}
            className={cn(
              "h-3.5 w-3.5",
              index < normalized ? "fill-current" : "opacity-30"
            )}
            aria-hidden
          />
        ))}
      </span>
      <span>{normalized}</span>
    </span>
  );
}

function PhoneScansLeadsChart({ data }: { data: TimelineDatum[] }) {
  const points = data.slice(-7);
  const showLeads = points.some((point) => point.leads !== null);
  const maxValue = Math.max(
    1,
    ...points.map((point) =>
      Math.max(point.scans ?? 0, showLeads ? (point.leads ?? 0) : 0),
    ),
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3 text-[11px] font-medium text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-primary" />
          {showLeads ? "Scans" : "Visits"}
        </span>
        {showLeads ? (
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-accent" />
            Leads
          </span>
        ) : null}
      </div>
      <div
        className="grid gap-2"
        style={{
          gridTemplateColumns: `repeat(${points.length}, minmax(0, 1fr))`,
        }}
      >
        {points.map((point) => {
          const scans = point.scans ?? 0;
          const leads = point.leads ?? 0;
          const scansHeight =
            scans > 0 ? Math.max(6, Math.round((scans / maxValue) * 100)) : 0;
          const leadsHeight =
            leads > 0 ? Math.max(6, Math.round((leads / maxValue) * 100)) : 0;
          return (
            <div key={point.date} className="space-y-1">
              <div className="flex h-28 items-end justify-center gap-1 rounded-xl border bg-muted/25 px-1.5 py-2">
                <div
                  className="w-2 rounded-full bg-primary/90"
                  style={{ height: `${scansHeight}%` }}
                  aria-label={`${scans} scans`}
                />
                {showLeads ? (
                  <div
                    className="w-2 rounded-full bg-accent/90"
                    style={{ height: `${leadsHeight}%` }}
                    aria-label={`${leads} leads`}
                  />
                ) : null}
              </div>
              <div className="text-center text-[10px] font-medium text-muted-foreground">
                {formatMobileDate(point.date)}
              </div>
              <div className="text-center text-[9px] leading-tight">
                <span className="block font-medium text-primary">
                  {numberFormatter.format(scans)}{" "}
                  {showLeads ? "scans" : "visits"}
                </span>
                {showLeads ? (
                  <span className="block font-medium text-accent">
                    {numberFormatter.format(leads)} leads
                  </span>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function PhoneConversionTrend({ data }: { data: ConversionDatum[] }) {
  const points = data.slice(-7);

  return (
    <div className="space-y-2.5">
      {points.map((point) => {
        const percent = Math.max(0, Math.min(100, point.rate * 100));
        const barWidth = percent > 0 ? Math.max(4, Math.round(percent)) : 0;
        return (
          <div key={point.date} className="space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-muted-foreground">
                {formatMobileDate(point.date)}
              </span>
              <span className="font-semibold text-foreground">
                {percent.toFixed(1)}%
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-muted/70">
              <div
                className="h-full rounded-full bg-primary transition-all duration-500"
                style={{ width: `${barWidth}%` }}
                aria-label={`${percent.toFixed(1)}% conversion`}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

type SeriesTooltipProps = {
  active?: boolean;
  payload?: Array<{ name: string; value: number | null }>;
  label?: string;
};

function SeriesTooltip({ active, payload, label }: SeriesTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  const primarySeries =
    payload.find((item) => item.name === "Scans") ??
    payload.find((item) => item.name === "Visits") ??
    payload[0];
  const scans = primarySeries?.value ?? null;
  const leads = payload.find((item) => item.name === "Leads")?.value ?? null;
  const hasData = typeof scans === "number" || typeof leads === "number";
  return (
    <div className="dashboard-analytics-tooltip rounded-md border border-border/70 bg-background/95 px-3 py-2 text-xs shadow">
      <div className="font-medium text-foreground">{label}</div>
      {hasData ? (
        <div className="mt-1 space-y-1">
          <div className="flex items-center justify-between gap-6">
            <span className="text-muted-foreground">
              {primarySeries?.name ?? "Scans"}
            </span>
            <span className="font-medium text-foreground">
              {numberFormatter.format(scans ?? 0)}
            </span>
          </div>
          {typeof leads === "number" ? (
            <div className="flex items-center justify-between gap-6">
              <span className="text-muted-foreground">Leads</span>
              <span className="font-medium text-foreground">
                {numberFormatter.format(leads ?? 0)}
              </span>
            </div>
          ) : null}
        </div>
      ) : (
        <div className="mt-1 text-muted-foreground">No data yet.</div>
      )}
    </div>
  );
}

type ConversionTooltipProps = {
  active?: boolean;
  payload?: Array<{ value: number }>;
  label?: string;
};

function ConversionTooltip({ active, payload, label }: ConversionTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  const rate = payload[0]?.value ?? 0;
  return (
    <div className="dashboard-analytics-tooltip rounded-md border border-border/70 bg-background/95 px-3 py-2 text-xs shadow">
      <div className="font-medium text-foreground">{label}</div>
      <div className="mt-1 text-muted-foreground">
        {(Number(rate) * 100).toFixed(1)}% conversion
      </div>
    </div>
  );
}

function EmptyState({
  message,
  actionLabel,
  onAction,
}: {
  message: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <div className="rounded-2xl border border-dashed px-3 py-8 text-center">
      <p className="text-sm text-muted-foreground">{message}</p>
      {actionLabel && onAction ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="mt-3"
          onClick={onAction}
        >
          {actionLabel}
        </Button>
      ) : null}
    </div>
  );
}

function summarizeTimelineWindow(points: UserAnalytics["timeline"]) {
  const scans = points.reduce((acc, point) => acc + point.scans, 0);
  const leads = points.reduce((acc, point) => acc + point.leads, 0);
  const conversion = scans > 0 ? leads / scans : 0;
  return { scans, leads, conversion };
}

function formatTimelineLabel(date: string) {
  const [year, month, day] = date.split("-").map((part) => Number(part));
  if (!year || !month || !day) {
    return shortDate.format(new Date(date));
  }
  return shortDate.format(new Date(year, month - 1, day));
}

function formatMobileDate(date: string) {
  const [year, month, day] = date.split("-").map((part) => Number(part));
  if (!year || !month || !day) {
    return mobileDate.format(new Date(date));
  }
  return mobileDate.format(new Date(year, month - 1, day));
}

function formatRelativeTime(date: string) {
  const target = new Date(date).getTime();
  if (Number.isNaN(target)) return "Recently";

  const diffMs = target - Date.now();
  const diffMinutes = Math.round(diffMs / 60_000);

  if (Math.abs(diffMinutes) < 60) {
    return relativeTimeFormatter.format(diffMinutes, "minute");
  }

  const diffHours = Math.round(diffMinutes / 60);
  if (Math.abs(diffHours) < 24) {
    return relativeTimeFormatter.format(diffHours, "hour");
  }

  const diffDays = Math.round(diffHours / 24);
  if (Math.abs(diffDays) < 30) {
    return relativeTimeFormatter.format(diffDays, "day");
  }

  const diffMonths = Math.round(diffDays / 30);
  if (Math.abs(diffMonths) < 12) {
    return relativeTimeFormatter.format(diffMonths, "month");
  }

  const diffYears = Math.round(diffDays / 365);
  return relativeTimeFormatter.format(diffYears, "year");
}

function truncateText(value: string, maxLength: number) {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, Math.max(0, maxLength - 3)).trimEnd()}...`;
}

function formatLinkUrl(url: string) {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./, "");
    const path = parsed.pathname === "/" ? "" : parsed.pathname;
    return `${host}${path}${parsed.search}`;
  } catch {
    return url.replace(/^https?:\/\//i, "");
  }
}

type CurrentTimelineDotProps = {
  cx?: number;
  cy?: number;
  payload?: TimelineDatum;
  targetDate: string | null;
  color: string;
};

function CurrentTimelineDot({
  cx,
  cy,
  payload,
  targetDate,
  color,
}: CurrentTimelineDotProps) {
  if (
    !targetDate ||
    !payload ||
    payload.date !== targetDate ||
    typeof cx !== "number" ||
    typeof cy !== "number"
  ) {
    return null;
  }

  return (
    <circle
      cx={cx}
      cy={cy}
      r={4}
      fill={color}
      stroke="var(--background)"
      strokeWidth={2}
    />
  );
}

function formatPercentDelta(current: number, previous: number): DeltaBadge {
  if (previous === 0 && current === 0) {
    return { text: "No change", tone: "neutral" };
  }
  if (previous === 0) {
    return { text: "New activity", tone: "up" };
  }
  const delta = ((current - previous) / previous) * 100;
  if (Math.abs(delta) < 0.1) {
    return { text: "No change", tone: "neutral" };
  }
  const precision = Math.abs(delta) >= 10 ? 0 : 1;
  const text = `${delta > 0 ? "+" : ""}${delta.toFixed(precision)}% vs prev`;
  return {
    text,
    tone: delta > 0 ? "up" : "down",
  };
}

function formatRateDelta(current: number, previous: number): DeltaBadge {
  const delta = (current - previous) * 100;
  if (Math.abs(delta) < 0.1) {
    return { text: "No change", tone: "neutral" };
  }
  return {
    text: `${delta > 0 ? "+" : ""}${delta.toFixed(1)}pp vs prev`,
    tone: delta > 0 ? "up" : "down",
  };
}

function canUseRealtime() {
  if (typeof window === "undefined") return false;
  if (typeof window.WebSocket !== "function") return false;
  if (window.isSecureContext) return true;

  const hostname = window.location.hostname.toLowerCase();
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "[::1]" ||
    hostname.endsWith(".local")
  );
}
