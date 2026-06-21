"use client";

import { useMemo, useState } from "react";
import { Package, Palette, Pencil, Star } from "lucide-react";

import { CreativePricing } from "@/components/ui/creative-pricing";
import type { PricingTier } from "@/components/ui/creative-pricing";
import {
  getBundleBillingLabel,
  getBusinessCustomBillingLabel,
  getBusinessCustomPriceLabel,
  getBusinessGenericBillingLabel,
  getBusinessGenericPriceLabel,
  getPersonalProBillingLabel,
  getPersonalProLoyaltyFeature,
  getPersonalProPriceLabel,
  type PublicPricingSnapshot,
} from "@/lib/billing/pricing";
import { cn } from "@/lib/utils";

type Audience = "individual" | "business";

function buildAuthBillingIntentHref(intent: "bundle" | "pro_monthly" | "pro_yearly") {
  const next = `/dashboard/billing?intent=${intent}`;
  return `/auth?view=signin&next=${encodeURIComponent(next)}`;
}

function buildIndividualTiers(pricing: PublicPricingSnapshot): PricingTier[] {
  const bundle = pricing.individual.webPlusLinketBundle;
  return [
    {
      name: "Free Web-Only",
      icon: <Pencil className="h-6 w-6" />,
      price: pricing.individual.freeWebOnly.monthly,
      billingLabel: pricing.individual.freeWebOnly.billingLabel,
      description: "Individual web-only starter",
      audience: "Individuals",
      color: "amber",
      ctaLabel: "Start free",
      ctaHref: "/auth?view=signup&next=%2Fdashboard%2Foverview",
      features: [
        "Share one web profile and your core links",
        "No hardware required",
        "Best for trying Linket at no cost",
        "Upgrade anytime when you need more",
      ],
    },
    {
      name: "Web + Linket Bundle",
      icon: <Star className="h-6 w-6" />,
      price: bundle.oneTime,
      billingLabel: getBundleBillingLabel(pricing),
      description: "Linket + 12 month pro access",
      audience: "Individuals",
      color: "blue",
      ctaLabel: "Buy bundle",
      ctaHref: buildAuthBillingIntentHref("bundle"),
      features: [
        "Get 1 standard Linket",
        `${bundle.includesProMonths} months of Paid Web-Only (Pro) included`,
        getPersonalProLoyaltyFeature(pricing),
        "Best first purchase for one person",
      ],
      popular: true,
    },
    {
      name: "Paid Web-Only (Pro)",
      icon: <Pencil className="h-6 w-6" />,
      price: getPersonalProPriceLabel(pricing),
      billingLabel: getPersonalProBillingLabel(pricing),
      description: "Individual software plan",
      audience: "Individuals",
      color: "amber",
      ctaLabel: "Start monthly",
      ctaHref: buildAuthBillingIntentHref("pro_monthly"),
      secondaryCtaLabel: "Start yearly",
      secondaryCtaHref: buildAuthBillingIntentHref("pro_yearly"),
      features: [
        "Publish your profile and links with no hardware required",
        "Capture unlimited leads",
        "Remove Linket branding",
        "Pick monthly or yearly billing",
        getPersonalProLoyaltyFeature(pricing),
      ],
    },
  ];
}

function buildBusinessTiers(pricing: PublicPricingSnapshot): PricingTier[] {
  return [
    {
      name: `Business Generic (min ${pricing.business.generic.minUnits} units)`,
      icon: <Package className="h-6 w-6" />,
      price: getBusinessGenericPriceLabel(pricing),
      billingLabel: getBusinessGenericBillingLabel(pricing),
      description: "Linket + Web-Platform",
      audience: "Businesses",
      color: "blue",
      ctaLabel: "Contact sales",
      ctaHref: "/contact?topic=business_generic",
      features: [
        "Standard Linkets for your team",
        "Built for business rollout",
        "One-time hardware pricing",
        "Bulk pricing available",
      ],
    },
    {
      name: `Custom Design Add-On (min ${pricing.business.custom.minUnits} units)`,
      icon: <Palette className="h-6 w-6" />,
      price: getBusinessCustomPriceLabel(pricing),
      billingLabel: getBusinessCustomBillingLabel(pricing),
      description: "Custom branded Linkets",
      audience: "Businesses",
      color: "amber",
      ctaLabel: "Book a consult",
      ctaHref: "/contact?topic=business_custom",
      features: [
        "Consult with our 3D design specialists",
        "Custom branded designs",
        "Standard Linkets for your team",
        "Built for business rollout",
        "One-time hardware pricing",
        "Bulk pricing available",
      ],
      popular: true,
    },
  ];
}

type LinketPlansToggleProps = {
  pricing: PublicPricingSnapshot;
};

export default function LinketPlansToggle({ pricing }: LinketPlansToggleProps) {
  const [audience, setAudience] = useState<Audience>("individual");
  const individualTiers = useMemo(
    () => buildIndividualTiers(pricing),
    [pricing]
  );
  const businessTiers = useMemo(() => buildBusinessTiers(pricing), [pricing]);

  const { title, description, tiers, theme } = useMemo(() => {
    if (audience === "individual") {
      return {
        title: "Individual options",
        description:
          "Choose free web-only, paid web-only, or web + Linket bundle.",
        tiers: individualTiers,
        theme: "warm" as const,
      };
    }

    return {
      title: "Business options",
      description:
        "Choose standard business Linkets or book a consult to customize a design.",
      tiers: businessTiers,
      theme: "business" as const,
    };
  }, [audience, businessTiers, individualTiers]);

  return (
    <CreativePricing
      tag="Linket plans"
      title={title}
      description={description}
      controls={
        <div className="relative grid w-full max-w-[22rem] grid-cols-2 rounded-full border border-[#ffd7c0] bg-white p-1">
          <span
            className={cn(
              "pointer-events-none absolute inset-y-1 left-1 w-[calc(50%-0.25rem)] rounded-full transition-all duration-300 ease-out",
              audience === "individual"
                ? "translate-x-0 bg-[#fff2e6] shadow-[0_6px_18px_rgba(180,83,9,0.18)]"
                : "translate-x-full bg-[#ecf6ff] shadow-[0_6px_18px_rgba(29,78,216,0.2)]"
            )}
            aria-hidden
          />
          <button
            type="button"
            onClick={() => setAudience("individual")}
            className={cn(
              "text-fluid-11-sm relative z-10 rounded-full px-3 py-2.5 font-semibold uppercase tracking-[0.14em] transition-colors duration-300 sm:px-4 sm:py-2",
              audience === "individual"
                ? "text-[#b45309]"
                : "text-slate-600 hover:text-slate-900"
            )}
            aria-pressed={audience === "individual"}
          >
            Individual
          </button>
          <button
            type="button"
            onClick={() => setAudience("business")}
            className={cn(
              "text-fluid-11-sm relative z-10 rounded-full px-3 py-2.5 font-semibold uppercase tracking-[0.14em] transition-colors duration-300 sm:px-4 sm:py-2",
              audience === "business"
                ? "text-[#1d4ed8]"
                : "text-slate-600 hover:text-slate-900"
            )}
            aria-pressed={audience === "business"}
          >
            Business
          </button>
        </div>
      }
      theme={theme}
      tiers={tiers}
    />
  );
}
