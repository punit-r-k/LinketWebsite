import type { ReactNode } from "react";
import Link from "next/link";

import { Check, Star } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface PricingTier {
  name: string;
  icon: ReactNode;
  price: number | string;
  description: string;
  features: string[];
  popular?: boolean;
  color: string;
  billingLabel?: string;
  audience?: string;
  ctaLabel?: string;
  ctaHref?: string;
  secondaryCtaLabel?: string;
  secondaryCtaHref?: string;
}

function CreativePricing({
  tag = "Linket plans",
  title = "Tap-ready kits for every crew",
  description = "Choose the plan that keeps intros warm - from solo sellers to full go-to-market teams.",
  controls,
  theme = "warm",
  tiers,
}: {
  tag?: string;
  title?: string;
  description?: string;
  controls?: ReactNode;
  theme?: "warm" | "business";
  tiers: PricingTier[];
}) {
  const useTwoColumnLayout = tiers.length === 2;
  const businessTheme = theme === "business";

  return (
    <div
      className="w-full px-0 pt-0 pb-4 sm:px-4 sm:pt-0 sm:pb-8 md:px-12 md:pt-0 md:pb-12"
    >
      <div className="text-center">
        <span
          className={cn(
            "inline-flex items-center gap-2 rounded-full bg-white px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.22em] sm:px-4 sm:text-xs sm:tracking-[0.35em]",
            businessTheme
              ? "border border-[#bfe7f2] text-[#34afcf]"
              : "border border-[#f8ddba] text-[#e3a553]"
          )}
        >
          {tag}
        </span>
        <h2 className="landing-serif mt-4 text-[1.9rem] font-normal tracking-[-0.03em] text-[#0f172a] sm:mt-5 sm:text-4xl">
          {title}
        </h2>
        <p className="mx-auto mt-3 max-w-[34rem] text-sm leading-7 text-slate-600 sm:text-base sm:leading-8">
          {description}
        </p>
        {controls && <div className="mt-4 flex justify-center sm:mt-5">{controls}</div>}
      </div>

      <div
        className={cn(
          "mt-6 grid gap-4 sm:mt-12 sm:gap-6",
          useTwoColumnLayout
            ? "md:mx-auto md:max-w-5xl md:grid-cols-2"
            : "md:grid-cols-3"
        )}
      >
        {tiers.map((tier) => (
          <div
            key={tier.name}
            className={cn(
              "relative flex flex-col gap-4 rounded-[24px] border bg-white/90 p-4 shadow-[0_18px_48px_rgba(15,23,42,0.1)] backdrop-blur sm:gap-6 sm:rounded-[32px] sm:p-6 sm:shadow-[0_25px_90px_rgba(15,23,42,0.12)]",
              businessTheme ? "border-[#c8ebf3]" : "border-[#fde7cc]",
              tier.popular &&
                (businessTheme
                  ? "border-[#58c0e0] bg-gradient-to-b from-white to-[#eefbfd]"
                  : "border-[#f8b878] bg-gradient-to-b from-white to-[#fff6ec]")
            )}
          >
            {tier.popular && (
              <div
                className={cn(
                  "pointer-events-none absolute left-1/2 top-0 z-10 inline-flex -translate-x-1/2 -translate-y-1/2 items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-semibold shadow-lg sm:px-3 sm:text-xs",
                  businessTheme
                    ? "border-[#bfe7f2] bg-gradient-to-r from-[#68d8e0] to-[#58c0e0] text-[#0f172a] shadow-[0_10px_25px_rgba(88,192,224,0.35)]"
                    : "border-[#f8ddba] bg-gradient-to-r from-[#f8d058] via-[#f8b878] to-[#f8b080] text-[#0f172a] shadow-[0_10px_25px_rgba(248,184,120,0.35)]"
                )}
              >
                <Star className="h-3.5 w-3.5" aria-hidden />
                Most popular
              </div>
            )}
            <div className="flex items-start gap-3 pt-1 sm:items-center sm:gap-4 sm:pt-2">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-[#f8d058] via-[#f8b878] to-[#58c0e0] text-[#0f172a]">
                {tier.icon}
              </div>
              <div className="min-w-0">
                <p className="text-[11px] uppercase tracking-[0.22em] text-slate-700 sm:text-xs sm:tracking-[0.35em]">
                  {tier.description}
                </p>
                <h3 className="text-base font-semibold text-[#0f172a] sm:text-xl">
                  {tier.name}
                </h3>
              </div>
            </div>

            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                You pay
              </p>
              <p className="text-[2rem] font-semibold text-[#0f172a] sm:text-4xl">
                {typeof tier.price === "number" ? `$${tier.price}` : tier.price}
              </p>
              <p className="text-sm text-slate-600">
                {tier.billingLabel ?? "every month"}
              </p>
            </div>

            <ul className="space-y-2.5 text-sm text-slate-600">
              {tier.features.map((feature) => (
                <li
                  key={feature}
                  className={cn(
                    "flex items-start gap-3 rounded-2xl border px-3 py-2 text-[#0f172a]",
                    businessTheme
                      ? "border-[#d3edf3] bg-[#f2fbfd]"
                      : "border-[#fde7cc] bg-[#fff8f0]"
                  )}
                >
                  <Check
                    className={cn(
                      "mt-0.5 h-4 w-4 shrink-0",
                      businessTheme ? "text-[#58c0e0]" : "text-[#f8b878]"
                    )}
                    aria-hidden
                  />
                  {feature}
                </li>
              ))}
            </ul>

            {tier.ctaHref ? (
              <div
                className={cn(
                  "grid gap-2",
                  tier.secondaryCtaHref ? "sm:grid-cols-2" : "sm:grid-cols-1"
                )}
              >
                <Button
                  asChild
                  variant={businessTheme ? "custom" : "landingPrimary"}
                  className={cn(
                    "w-full rounded-2xl text-sm font-semibold transition hover:-translate-y-0.5 sm:text-base",
                    businessTheme
                      ? "border border-[#c8ebf3] bg-white text-[#0f172a]"
                      : "",
                    tier.popular &&
                      (businessTheme
                        ? "border-transparent bg-gradient-to-r from-[#68d8e0] to-[#58c0e0] text-[#0f172a] shadow-[0_18px_45px_rgba(88,192,224,0.35)]"
                        : "shadow-[0_18px_45px_rgba(248,184,120,0.35)]")
                  )}
                >
                  <Link
                    href={tier.ctaHref}
                    data-analytics-id="pricing_cta_click"
                    data-analytics-meta={JSON.stringify({
                      section: "landing_pricing",
                      tier: tier.name,
                      price: tier.price,
                      href: tier.ctaHref,
                      billing_interval: "month_or_default",
                    })}
                  >
                    {tier.ctaLabel ?? "Choose this option"}
                  </Link>
                </Button>
                {tier.secondaryCtaHref ? (
                  <Button
                    asChild
                    variant={businessTheme ? "custom" : "landingSecondary"}
                    className={cn(
                      "w-full rounded-2xl text-sm font-semibold transition hover:-translate-y-0.5 sm:text-base",
                      businessTheme
                        ? "border border-[#c8ebf3] bg-white text-[#34afcf]"
                        : ""
                    )}
                  >
                    <Link
                      href={tier.secondaryCtaHref}
                      data-analytics-id="pricing_cta_click"
                      data-analytics-meta={JSON.stringify({
                        section: "landing_pricing",
                        tier: tier.name,
                        price: tier.price,
                        href: tier.secondaryCtaHref,
                        billing_interval: "year",
                      })}
                    >
                      {tier.secondaryCtaLabel ?? "Yearly"}
                    </Link>
                  </Button>
                ) : null}
              </div>
            ) : (
              <Button
                type="button"
                variant={businessTheme ? "custom" : "landingSecondary"}
                disabled
                data-analytics-id="pricing_cta_click"
                data-analytics-meta={JSON.stringify({
                  section: "landing_pricing",
                  tier: tier.name,
                  price: tier.price,
                  disabled: true,
                })}
                className={cn(
                  "w-full rounded-2xl text-sm font-semibold sm:text-base",
                  businessTheme ? "border border-[#c8ebf3] bg-white text-[#0f172a]" : ""
                )}
              >
                {tier.ctaLabel ?? "Choose this option"}
              </Button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export { CreativePricing };
