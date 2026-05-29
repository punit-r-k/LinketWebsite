import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowUpRight } from "lucide-react";

import { LEGAL_PAGE_LINKS } from "@/components/site/legal-page-actions";
import { Button } from "@/components/ui/button";
import { brand } from "@/config/brand";
import { cn } from "@/lib/utils";

type LegalHeroStat = {
  label: string;
  value: string;
  detail: string;
};

type LegalFact = {
  label: string;
  value: string;
  href?: string;
};

type LegalPageProps = {
  currentPath: string;
  kicker?: string;
  title: string;
  subtitle: string;
  summary: string;
  lastUpdated: string;
  supportLabel: string;
  supportHref: string;
  heroStats?: readonly LegalHeroStat[];
  facts?: readonly LegalFact[];
  children: ReactNode;
};

type LegalSectionProps = {
  title: string;
  subtitle?: string;
  id?: string;
  children: ReactNode;
  className?: string;
};

type LegalCard = {
  eyebrow?: string;
  title: string;
  description: string;
};

type LegalCardGridProps = {
  items: readonly LegalCard[];
  columns?: "two" | "three";
  className?: string;
};

type LegalListProps = {
  items: readonly string[];
  className?: string;
};

type LegalCalloutProps = {
  title: string;
  description: string;
  href?: string;
  actionLabel?: string;
  className?: string;
};

export function LegalPage({
  currentPath,
  kicker = "Legal",
  title,
  subtitle,
  summary,
  lastUpdated,
  supportLabel,
  supportHref,
  heroStats = [],
  facts = [],
  children,
}: LegalPageProps) {
  return (
    <section className="landing-page-shell landing-alt-font relative overflow-hidden text-slate-900">
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "linear-gradient(180deg, #f5f7fa 0%, #ffffff 100%)",
        }}
        aria-hidden
      />
      <div
        className="pointer-events-none absolute inset-0 hidden overflow-hidden lg:block landing-decoration-fade"
        aria-hidden
      >
        <div className="landing-ring-float-a absolute left-[6%] top-14 h-20 w-20 rounded-full border-[4px] border-[#f8d058]/38 bg-transparent" />
        <div className="landing-ring-float-b absolute left-[18%] top-[12rem] h-12 w-12 rounded-full border-[4px] border-[#58c0e0]/34 bg-transparent" />
        <div className="landing-ring-float-c absolute right-[10%] top-12 h-24 w-24 rounded-full border-[5px] border-[#68d8e0]/34 bg-transparent" />
        <div className="landing-ring-float-a absolute right-[16%] top-[16rem] h-14 w-14 rounded-full border-[4px] border-[#f8b878]/34 bg-transparent" />
        <div className="landing-ring-float-b absolute right-[20%] bottom-20 h-16 w-16 rounded-full border-[4px] border-[#58c0e0]/30 bg-transparent" />
        <div className="landing-ring-float-c absolute left-[12%] bottom-14 h-16 w-16 rounded-full border-[4px] border-[#f8b878]/28 bg-transparent" />
      </div>

      <div className="relative mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-16">
        <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_290px]">
          <div className="space-y-8">
            <header className="landing-fade-up space-y-6">
              <div className="landing-chip inline-flex items-center gap-3 px-3 py-2">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#1d2334] shadow-[0_10px_26px_-18px_rgba(15,23,42,0.7)]">
                  <Image
                    src={brand.logomark}
                    alt={`${brand.name} mark`}
                    width={28}
                    height={28}
                    className="h-7 w-7"
                  />
                </div>
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-500">
                    {brand.name}
                  </p>
                  <p className="text-sm text-slate-700">{kicker}</p>
                </div>
              </div>

              <div className="space-y-4">
                <h1 className="max-w-4xl text-[2.2rem] font-semibold leading-tight tracking-tight text-slate-900 sm:text-5xl sm:leading-[1.08]">
                  {title}
                </h1>
                <p className="max-w-3xl text-base leading-7 text-slate-600 sm:text-lg sm:leading-8">
                  {subtitle}
                </p>
              </div>

              <div className="landing-surface p-6 sm:p-7">
                <p className="text-xs font-semibold uppercase tracking-[0.26em] text-[#e3a553]">
                  What This Page Covers
                </p>
                <p className="mt-3 max-w-3xl text-base leading-7 text-slate-700">
                  {summary}
                </p>
                <div className="mt-6 flex flex-wrap gap-3">
                  <Button
                    asChild
                    variant="landingPrimary"
                    className="rounded-full px-5"
                  >
                    <Link href="/">Back to landing</Link>
                  </Button>
                  <Button
                    asChild
                    variant="landingSecondary"
                    className="rounded-full px-5"
                  >
                    <Link href={supportHref}>{supportLabel}</Link>
                  </Button>
                </div>
              </div>

              {heroStats.length ? (
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                  {heroStats.map((stat) => (
                    <article
                      key={stat.label}
                      className="landing-card p-5"
                    >
                      <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">
                        {stat.label}
                      </p>
                      <p className="mt-2 text-lg font-semibold text-slate-900">
                        {stat.value}
                      </p>
                      <p className="mt-2 text-sm leading-6 text-slate-600">
                        {stat.detail}
                      </p>
                    </article>
                  ))}
                </div>
              ) : null}
            </header>

            <div className="space-y-6">{children}</div>
          </div>

          <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
            <div className="landing-card p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.26em] text-slate-500">
                Legal Pages
              </p>
              <nav className="mt-4 space-y-2" aria-label="Legal page navigation">
                {LEGAL_PAGE_LINKS.map((link) => {
                  const active = link.href === currentPath;
                  return (
                    <Link
                      key={link.href}
                      href={link.href}
                      className={cn(
                        "flex items-center justify-between rounded-2xl px-3 py-3 text-sm transition-[background-color,color] duration-200 ease-out",
                        active
                          ? "bg-[#1f2537] text-white shadow-[0_14px_30px_-24px_rgba(15,23,42,0.7)]"
                          : "text-slate-700 hover:bg-[#f8fafc] hover:text-slate-900"
                      )}
                      aria-current={active ? "page" : undefined}
                    >
                      <span>{link.label}</span>
                      <ArrowUpRight
                        className={cn(
                          "h-4 w-4",
                          active ? "text-white/80" : "text-slate-400"
                        )}
                        aria-hidden
                      />
                    </Link>
                  );
                })}
              </nav>
            </div>

            <div className="landing-card p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.26em] text-slate-500">
                Quick Facts
              </p>
              <dl className="mt-4 space-y-4 text-sm">
                {facts.map((fact) => (
                  <div key={fact.label} className="space-y-1">
                    <dt className="font-semibold uppercase tracking-[0.16em] text-slate-400">
                      {fact.label}
                    </dt>
                    <dd className="leading-6 text-slate-700">
                      {fact.href ? (
                        <Link
                          href={fact.href}
                          className="text-slate-900 underline decoration-[#58c0e0]/40 underline-offset-4"
                        >
                          {fact.value}
                        </Link>
                      ) : (
                        fact.value
                      )}
                    </dd>
                  </div>
                ))}
                <div className="space-y-1">
                  <dt className="font-semibold uppercase tracking-[0.16em] text-slate-400">
                    Last Updated
                  </dt>
                  <dd className="leading-6 text-slate-700">{lastUpdated}</dd>
                </div>
              </dl>
            </div>

            <LegalCallout
              title="Need help from the Linket team?"
              description="If something here is unclear, reach out directly and include the page you are asking about so we can answer precisely."
              href={supportHref}
              actionLabel={supportLabel}
              className="border-[#bee7f3] bg-[#f4fcfe]"
            />
          </aside>
        </div>
      </div>
    </section>
  );
}

export function LegalSection({
  title,
  subtitle,
  id,
  children,
  className,
}: LegalSectionProps) {
  return (
    <section
      id={id}
      className={cn(
        "landing-surface p-6 sm:p-8",
        className
      )}
    >
      <div className="space-y-2">
        <h2 className="text-2xl font-semibold tracking-tight text-slate-900">
          {title}
        </h2>
        {subtitle ? (
          <p className="max-w-3xl text-sm leading-6 text-slate-600">
            {subtitle}
          </p>
        ) : null}
      </div>
      <div className="mt-6">{children}</div>
    </section>
  );
}

export function LegalCardGrid({
  items,
  columns = "two",
  className,
}: LegalCardGridProps) {
  return (
    <div
      className={cn(
        "grid gap-4",
        columns === "three" ? "md:grid-cols-3" : "md:grid-cols-2",
        className
      )}
    >
      {items.map((item) => (
        <article
          key={`${item.title}-${item.eyebrow ?? ""}`}
          className="landing-card p-5"
        >
          {item.eyebrow ? (
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[#e3a553]">
              {item.eyebrow}
            </p>
          ) : null}
          <h3 className="mt-2 text-base font-semibold text-slate-900">
            {item.title}
          </h3>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            {item.description}
          </p>
        </article>
      ))}
    </div>
  );
}

export function LegalBulletList({ items, className }: LegalListProps) {
  return (
    <ul className={cn("grid gap-3", className)}>
      {items.map((item) => (
        <li
          key={item}
          className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm leading-6 text-slate-700"
        >
          {item}
        </li>
      ))}
    </ul>
  );
}

export function LegalStepList({ items, className }: LegalListProps) {
  return (
    <ol className={cn("grid gap-3", className)}>
      {items.map((item, index) => (
        <li
          key={item}
          className="flex gap-3 rounded-2xl border border-slate-100 bg-[#f5fcfe] px-4 py-4 text-sm leading-6 text-slate-700"
        >
          <span className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#34afcf]/12 text-sm font-semibold text-[#2b91af]">
            {index + 1}
          </span>
          <span>{item}</span>
        </li>
      ))}
    </ol>
  );
}

export function LegalCallout({
  title,
  description,
  href,
  actionLabel,
  className,
}: LegalCalloutProps) {
  return (
    <div
      className={cn(
        "landing-card p-5",
        className
      )}
    >
      <p className="text-xs font-semibold uppercase tracking-[0.26em] text-slate-500">
        Support
      </p>
      <h3 className="mt-2 text-lg font-semibold text-slate-900">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-slate-700">{description}</p>
      {href && actionLabel ? (
        <Button
          asChild
          variant="landingSecondary"
          className="mt-4 rounded-full px-4"
        >
          <Link href={href}>{actionLabel}</Link>
        </Button>
      ) : null}
    </div>
  );
}
