import Link from "next/link";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type PageAction = {
  label: string;
  href: string;
  variant?: "default" | "outline";
};

type MarketingPageProps = {
  kicker?: string;
  title: string;
  subtitle: string;
  actions?: readonly PageAction[];
  children: ReactNode;
  className?: string;
};

export function MarketingPage({
  kicker,
  title,
  subtitle,
  actions,
  children,
  className,
}: MarketingPageProps) {
  return (
    <section className={cn("marketing-page bg-background text-foreground", className)}>
      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 lg:py-16">
        <header className="space-y-4">
          {kicker ? (
            <span className="inline-flex items-center rounded-full border border-border/60 bg-card/60 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground">
              {kicker}
            </span>
          ) : null}
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            {title}
          </h1>
          <p className="max-w-2xl text-base text-muted-foreground">
            {subtitle}
          </p>
          {actions?.length ? (
            <div className="flex flex-wrap gap-3">
              {actions.map((action) => (
                <Button
                  key={action.href}
                  asChild
                  variant={action.variant ?? "default"}
                  className="rounded-full"
                >
                  <Link href={action.href}>{action.label}</Link>
                </Button>
              ))}
            </div>
          ) : null}
        </header>
        <div className="mt-12 space-y-12">{children}</div>
      </div>
    </section>
  );
}

type PageSectionProps = {
  title: string;
  subtitle?: string;
  id?: string;
  children: ReactNode;
  className?: string;
};

export function PageSection({
  title,
  subtitle,
  id,
  children,
  className,
}: PageSectionProps) {
  return (
    <section id={id} className={cn("space-y-6", className)}>
      <div className="space-y-2">
        <h2 className="text-xl font-semibold text-foreground">{title}</h2>
        {subtitle ? (
          <p className="text-sm text-muted-foreground">{subtitle}</p>
        ) : null}
      </div>
      {children}
    </section>
  );
}
