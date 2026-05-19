import Link from "next/link";
import { redirect } from "next/navigation";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { getCurrentUserWithAdmin } from "@/lib/admin";
import {
  getProductAnalytics,
  type ProductAnalytics,
  type ProductOnboardingStage,
} from "@/lib/product-analytics";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;

const RANGE_OPTIONS = [7, 30, 90] as const;
const numberFormatter = new Intl.NumberFormat("en-US");
const percentFormatter = new Intl.NumberFormat("en-US", {
  style: "percent",
  maximumFractionDigits: 1,
});
const timestampFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

export default async function AdminProductAnalyticsPage({
  searchParams,
}: {
  searchParams?: Promise<SearchParams> | SearchParams;
}) {
  const { user, isAdmin } = await getCurrentUserWithAdmin();
  if (!user) {
    redirect("/auth?view=signin&next=/dashboard/admin/analytics");
  }
  if (!isAdmin) {
    redirect("/dashboard");
  }

  const params = searchParams ? await searchParams : {};
  const days = parseDays(params.days);
  const analytics = await getProductAnalytics({ days });
  const maxReached = Math.max(
    1,
    ...analytics.onboardingStages.map((stage) => stage.reachedUsers)
  );

  return (
    <div className="space-y-8">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-[0.35em] text-muted-foreground">
            Admin console
          </p>
          <div className="space-y-2">
            <h1 className="text-3xl font-semibold text-foreground">
              Product analytics
            </h1>
            <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
              Backend event reporting for click behavior, setup progress, and
              onboarding drop-off points across the platform.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {RANGE_OPTIONS.map((option) => (
            <Button
              key={option}
              asChild
              size="sm"
              variant={option === days ? "default" : "outline"}
              className="rounded-full"
            >
              <Link href={`/dashboard/admin/analytics?days=${option}`}>
                {option} days
              </Link>
            </Button>
          ))}
        </div>
      </header>

      {!analytics.meta.available ? (
        <section className="rounded-3xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
          <div className="font-semibold">Product analytics unavailable</div>
          <p className="mt-1 text-xs">
            {analytics.meta.error ??
              "Analytics storage is not configured for this environment."}
          </p>
        </section>
      ) : null}

      {analytics.meta.truncated ? (
        <section className="rounded-3xl border border-border/60 bg-card/80 p-5 text-sm text-muted-foreground">
          Showing the newest {numberFormatter.format(analytics.meta.sampledEventCount)} of{" "}
          {numberFormatter.format(analytics.meta.queriedEventCount)} events in
          this window.
        </section>
      ) : null}

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Stored events"
          value={numberFormatter.format(analytics.totals.events)}
          helper={`Last ${days} days`}
        />
        <MetricCard
          label="Known users"
          value={numberFormatter.format(analytics.totals.knownUsers)}
          helper={`${numberFormatter.format(
            analytics.totals.anonymousEvents
          )} anonymous events`}
        />
        <MetricCard
          label="Click events"
          value={numberFormatter.format(analytics.totals.clickEvents)}
          helper="Tracked buttons, CTAs, shares, and navigation"
        />
        <MetricCard
          label="Setup completion"
          value={percentFormatter.format(
            analytics.totals.onboardingCompletionRate
          )}
          helper={`${numberFormatter.format(
            analytics.totals.onboardingCompletions
          )} of ${numberFormatter.format(
            analytics.totals.onboardingStarts
          )} onboarded users`}
        />
      </section>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(320px,0.9fr)]">
        <Card className="rounded-3xl border bg-card/80 shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg font-semibold">
              Onboarding funnel
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Each row shows how many users reached a step, completed it, and
              dropped before the next step.
            </p>
          </CardHeader>
          <CardContent className="space-y-3">
            {analytics.onboardingStages.map((stage, index) => (
              <OnboardingStageRow
                key={stage.key}
                stage={stage}
                maxReached={maxReached}
                isLast={index === analytics.onboardingStages.length - 1}
              />
            ))}
          </CardContent>
        </Card>

        <Card className="rounded-3xl border bg-card/80 shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg font-semibold">
              Where people stop
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Users who entered onboarding but did not reach the live-page step.
            </p>
          </CardHeader>
          <CardContent>
            {analytics.onboardingStops.length > 0 ? (
              <div className="space-y-3">
                {analytics.onboardingStops.map((stop) => (
                  <div
                    key={stop.key}
                    className="rounded-2xl border border-border/70 bg-background/45 p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="font-semibold text-foreground">
                          {stop.label}
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {numberFormatter.format(stop.explicitExitEvents)} exit
                          events recorded here.
                        </p>
                      </div>
                      <div className="text-right text-2xl font-semibold text-foreground">
                        {numberFormatter.format(stop.stoppedUsers)}
                      </div>
                    </div>
                    {stop.lastExitAt ? (
                      <p className="mt-3 text-xs text-muted-foreground">
                        Latest exit {formatTimestamp(stop.lastExitAt)}
                      </p>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState message="No onboarding drop-off has been recorded in this range." />
            )}
          </CardContent>
        </Card>
      </section>

      <Card className="rounded-3xl border bg-card/80 shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg font-semibold">
            Where people click
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Top backend click events across CTAs, dashboard navigation, share
            actions, and onboarding controls.
          </p>
        </CardHeader>
        <CardContent>
          {analytics.topClicks.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2">Click target</th>
                    <th className="px-3 py-2">Event</th>
                    <th className="px-3 py-2">Top path</th>
                    <th className="px-3 py-2 text-right">Clicks</th>
                    <th className="px-3 py-2 text-right">Users</th>
                    <th className="px-3 py-2 text-right">Last seen</th>
                  </tr>
                </thead>
                <tbody>
                  {analytics.topClicks.map((click) => (
                    <tr
                      key={click.key}
                      className="border-t border-border/50"
                    >
                      <td className="px-3 py-3 font-medium text-foreground">
                        {click.label}
                      </td>
                      <td className="px-3 py-3 text-muted-foreground">
                        {click.eventId}
                      </td>
                      <td className="max-w-[280px] truncate px-3 py-3 text-muted-foreground">
                        {click.topPath ?? "Unknown"}
                      </td>
                      <td className="px-3 py-3 text-right font-semibold text-foreground">
                        {numberFormatter.format(click.count)}
                      </td>
                      <td className="px-3 py-3 text-right text-muted-foreground">
                        {numberFormatter.format(click.uniqueUsers)}
                      </td>
                      <td className="px-3 py-3 text-right text-muted-foreground">
                        {click.lastAt ? formatTimestamp(click.lastAt) : "Never"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState message="No click events have been recorded in this range." />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function MetricCard({
  label,
  value,
  helper,
}: {
  label: string;
  value: string;
  helper: string;
}) {
  return (
    <Card className="rounded-3xl border bg-card/80 shadow-sm">
      <CardHeader>
        <CardTitle className="text-sm text-muted-foreground">{label}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-1">
        <div className="text-3xl font-semibold text-foreground">{value}</div>
        <p className="text-xs text-muted-foreground">{helper}</p>
      </CardContent>
    </Card>
  );
}

function OnboardingStageRow({
  stage,
  maxReached,
  isLast,
}: {
  stage: ProductOnboardingStage;
  maxReached: number;
  isLast: boolean;
}) {
  const reachedWidth = Math.round((stage.reachedUsers / maxReached) * 100);
  return (
    <div className="rounded-2xl border border-border/70 bg-background/45 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="font-semibold text-foreground">{stage.label}</div>
          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <span>{numberFormatter.format(stage.reachedUsers)} reached</span>
            <span>{numberFormatter.format(stage.completedUsers)} completed</span>
            {stage.conversionFromPrevious !== null ? (
              <span>
                {percentFormatter.format(stage.conversionFromPrevious)} from
                previous
              </span>
            ) : null}
          </div>
        </div>
        <div className="text-sm text-muted-foreground sm:text-right">
          <div className="font-semibold text-foreground">
            {percentFormatter.format(stage.completionRate)}
          </div>
          {!isLast && stage.dropOffAfterUsers !== null ? (
            <div>
              {numberFormatter.format(stage.dropOffAfterUsers)} stop after
            </div>
          ) : (
            <div>{stage.lastAt ? formatTimestamp(stage.lastAt) : "No data"}</div>
          )}
        </div>
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted/80">
        <div
          className={cn(
            "h-full rounded-full transition-all duration-500",
            stage.key === "live" ? "bg-emerald-500" : "bg-primary"
          )}
          style={{ width: `${reachedWidth}%` }}
        />
      </div>
      {!isLast && stage.dropOffAfterRate !== null ? (
        <p className="mt-2 text-xs text-muted-foreground">
          {percentFormatter.format(stage.dropOffAfterRate)} of users who reached
          this step did not reach the next one.
        </p>
      ) : null}
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-border/70 px-4 py-8 text-center text-sm text-muted-foreground">
      {message}
    </div>
  );
}

function parseDays(value: string | string[] | undefined) {
  const raw = Array.isArray(value) ? value[0] : value;
  const parsed = Number(raw ?? 30);
  if (!Number.isFinite(parsed)) return 30;
  const normalized = Math.trunc(parsed);
  return RANGE_OPTIONS.includes(normalized as (typeof RANGE_OPTIONS)[number])
    ? normalized
    : 30;
}

function formatTimestamp(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return timestampFormatter.format(date);
}
