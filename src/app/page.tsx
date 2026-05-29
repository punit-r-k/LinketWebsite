import type { Metadata } from "next";
import { cookies, headers } from "next/headers";
import Link from "next/link";
import Image from "next/image";
import Script from "next/script";
import "@/styles/theme/public-profile.css";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Calendar, Download, Search } from "lucide-react";
import ConsultForm from "@/components/landing/ConsultForm";
import LinketPlansToggle from "@/components/landing/LinketPlansToggle";
import PublicProfilePreview from "@/components/public/PublicProfilePreview";
import { Button } from "@/components/ui/button";
import {
  buildBestValueStarterFaqAnswer,
  getPublicPricingSnapshot,
  type PublicPricingSnapshot,
} from "@/lib/billing/pricing";
import { cn } from "@/lib/utils";
import { brand } from "@/config/brand";
import { DISCOVER_PAGES } from "@/config/discover-pages";
import { getActiveProfileForPublicHandle } from "@/lib/profile-service";
import type { ProfileWithLinks } from "@/lib/profile-service";
import { getConfiguredSiteOrigin } from "@/lib/site-url";
import {
  DEFAULT_LOCALE,
  LOCALE_COOKIE_NAME,
  LOCALE_SOURCE_COOKIE_NAME,
  normalizeLocale,
  resolveDetectedLocale,
  translatePhrase,
} from "@/lib/i18n";

// -----------------------------------------------------------------------------
// Landing page metadata and runtime configuration.
// -----------------------------------------------------------------------------
async function getLandingLocale() {
  const cookieStore = await cookies();
  const headerStore = await headers();
  const cookieSource = cookieStore.get(LOCALE_SOURCE_COOKIE_NAME)?.value;
  const cookieLocale =
    !cookieSource || cookieSource === "manual"
      ? cookieStore.get(LOCALE_COOKIE_NAME)?.value
      : undefined;

  return (
    normalizeLocale(cookieLocale) ??
    resolveDetectedLocale({
      cookieLocale: headerStore.get("x-linket-locale"),
      country:
        headerStore.get("x-vercel-ip-country") ??
        headerStore.get("cf-ipcountry") ??
        headerStore.get("x-country-code"),
      acceptLanguage: headerStore.get("accept-language"),
    }) ??
    DEFAULT_LOCALE
  );
}

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLandingLocale();
  const title = translatePhrase(
    locale,
    "Linket Connect | NFC keychains, digital profiles, and lead capture"
  );
  const description = translatePhrase(
    locale,
    "Linket Connect combines NFC keychains, live digital profiles, and built-in lead capture so students, creators, and teams can share contact info, update links instantly, and track every scan."
  );
  const socialTitle = translatePhrase(
    locale,
    "Linket Connect | NFC keychains and live digital profiles"
  );
  const socialDescription = translatePhrase(
    locale,
    "Share contact info with one tap, keep your profile current, and capture leads with NFC + QR hardware built for students, creators, and teams."
  );

  return {
    title,
    description,
    alternates: {
      canonical: "/",
    },
    openGraph: {
      title: socialTitle,
      description: socialDescription,
      images: [
        {
          url: "/og.png",
          width: 1366,
          height: 768,
          alt: "Linket logo mark.",
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: socialTitle,
      description: translatePhrase(
        locale,
        "NFC keychains, live digital profiles, and lead capture that keep every intro current from the first tap onward."
      ),
      images: ["/og.png"],
    },
  };
}

// Revalidate the landing page every 60 seconds to keep preview data fresh.
export const revalidate = 60;

// -----------------------------------------------------------------------------
// Types used only on the landing page.
// -----------------------------------------------------------------------------
type PublicPreviewAccount = {
  handle: string;
  displayName: string | null;
  avatarPath: string | null;
  avatarUpdatedAt: string | null;
};

type FaqItem = {
  question: string;
  answer: string;
};

// -----------------------------------------------------------------------------
// Marketing content data. These collections drive UI sections below.
// -----------------------------------------------------------------------------
const DASHBOARD_TABS = ["Overview", "Linkets", "Profiles", "Leads"] as const;

// Dashboard summary stats for the hero mock.
const DASHBOARD_STATS = [
  { label: "Qualified leads", value: "128", delta: "+32 vs last quarter" },
  { label: "Verified taps", value: "842", delta: "+19% vs last quarter" },
  {
    label: "Conversion rate",
    value: "15.2%",
    delta: "Leads - scans in this range",
  },
  {
    label: "Active Linkets",
    value: "7",
    delta: "Linkets that got at least one scan",
  },
] as const;

// Bar chart values used in the hero dashboard preview.
const DASHBOARD_BARS = [
  { label: "Jan", value: 72 },
  { label: "Feb", value: 35 },
  { label: "Mar", value: 58 },
  { label: "Apr", value: 82 },
  { label: "May", value: 22 },
  { label: "Jun", value: 48 },
  { label: "Jul", value: 64 },
  { label: "Aug", value: 38 },
  { label: "Sep", value: 52 },
  { label: "Oct", value: 44 },
  { label: "Nov", value: 70 },
  { label: "Dec", value: 86 },
] as const;

// Line chart values used in the hero dashboard preview.
const DASHBOARD_TREND = [
  28, 34, 39, 46, 53, 61, 69, 76, 82, 88, 94, 98,
] as const;

// Recent activity list shown in the mock dashboard.
const RECENT_SALES = [
  { name: "Maya Chen", email: "maya@northstar.studio", amount: "Qualified" },
  { name: "Jordan Lee", email: "jordan@campusfounders.org", amount: "Follow up" },
  {
    name: "Isabel Nguyen",
    email: "isabel@launchlab.co",
    amount: "Demo booked",
  },
  { name: "Will Kim", email: "will@fieldteam.io", amount: "Saved" },
  { name: "Sofia Davis", email: "sofia@eventops.co", amount: "New" },
] as const;

const FOUNDER_PUBLIC_HANDLE = "punit";
const FOUNDER_PUBLIC_PROFILE_URL = "https://www.linketconnect.com/punit";

// -----------------------------------------------------------------------------
// Data loaders: pull the live public profile when it is available.
// -----------------------------------------------------------------------------
async function loadPublicProfilePreview() {
  try {
    const payload = await getActiveProfileForPublicHandle(FOUNDER_PUBLIC_HANDLE);
    if (!payload) return null;
    const { account, profile } = payload;
    const previewAccount: PublicPreviewAccount = {
      handle: profile.handle || account.username,
      displayName: account.display_name ?? null,
      avatarPath: account.avatar_url ?? null,
      avatarUpdatedAt: account.avatar_updated_at ?? null,
    };
    return { profile, account: previewAccount };
  } catch {
    return null;
  }
}

// FAQ content for the accordion + JSON-LD schema.
function buildFaq(pricing: PublicPricingSnapshot): FaqItem[] {
  return [
    {
      question: "Does Linket work with both iPhone and Android?",
      answer:
        "Yes. Modern phones tap via NFC and older devices can scan the etched QR. No downloads needed for either option.",
    },
    {
      question: "Do recipients need a Linket or an app?",
      answer:
        "No. Your Linket opens in the recipient&apos;s browser right away. They can save your contact, follow links, or book time instantly.",
    },
    {
      question: "Can I update my profile after printing?",
      answer:
        "Absolutely. Change your headline, links, colors, or media anytime. Every tap uses the latest version automatically.",
    },
    {
      question: "What is the best-value starter option?",
      answer: buildBestValueStarterFaqAnswer(pricing),
    },
    {
      question: "Is data collection privacy-centered?",
      answer:
        "We only track what matters: tap counts, link clicks, and lead form submissions. No invasive tracking or retargeting pixels.",
    },
  ];
}

// -----------------------------------------------------------------------------
// Page component: composes all landing sections and structured data.
// -----------------------------------------------------------------------------
export default async function Home() {
  // Resolve the site URL for structured data and assets.
  const siteUrl = getConfiguredSiteOrigin();
  const pricing = getPublicPricingSnapshot();
  const faq = buildFaq(pricing);
  // Load the live public profile preview when Supabase is available.
  const publicPreview = await loadPublicProfilePreview();

  // FAQ schema powers rich results for search engines.
  const faqSchema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faq.map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: item.answer,
      },
    })),
  };

  // Organization schema provides a canonical brand footprint.
  const organizationSchema = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: brand.name,
    url: siteUrl,
    logo: `${siteUrl}${brand.logo}`,
    sameAs: [
      "https://www.instagram.com/linket",
      "https://www.linkedin.com/company/linket",
      "https://www.tiktok.com/@linket",
    ],
  };

  const websiteSchema = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: brand.name,
    alternateName: brand.shortName,
    url: siteUrl,
  };

  return (
    // Page wrapper keeps the landing background consistent across sections.
    <div className="landing-page-shell relative overflow-hidden text-foreground">
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="landing-section-bg absolute inset-0" />
      </div>
      <div className="relative z-0 overflow-hidden">
        <div className="pointer-events-none absolute inset-0 z-0">
          <div className="landing-section-bg absolute inset-0" />
        </div>
        <div className="pointer-events-none absolute inset-0 z-[1] hidden overflow-hidden lg:block landing-decoration-fade landing-delay-2" aria-hidden>
          <div className="landing-ring-float-b absolute -left-24 top-8 h-52 w-52 rounded-full border-[5px] border-[#f8b878]/54 bg-transparent" />
          <div className="landing-ring-float-c absolute left-[12%] top-[5rem] h-12 w-12 rounded-full border-[4px] border-[#f8d058]/60 bg-transparent" />
          <div className="landing-ring-float-a absolute -left-12 top-14 h-32 w-32 rounded-full border-[5px] border-[#f8b878]/72 bg-transparent" />
          <div className="landing-ring-float-a absolute left-[19%] top-[18rem] h-16 w-16 rounded-full border-[4px] border-[#58c0e0]/42 bg-transparent" />
          <div className="landing-ring-float-c absolute -left-8 top-[26rem] h-20 w-20 rounded-full border-[4px] border-[#58c0e0]/38 bg-transparent" />
          <div className="landing-ring-float-b absolute left-[14%] top-[32rem] h-28 w-28 rounded-full border-[4px] border-[#f8b878]/34 bg-transparent" />
          <div className="landing-ring-float-b absolute left-[8%] top-[37rem] h-14 w-14 rounded-full border-[4px] border-[#f8d058]/58 bg-transparent" />
          <div className="landing-ring-float-b absolute right-[-5rem] top-10 h-60 w-60 rounded-full border-[5px] border-[#68d8e0]/62 bg-transparent" />
          <div className="landing-ring-float-c absolute right-[4%] top-[7rem] h-12 w-12 rounded-full border-[4px] border-[#68d8e0]/46 bg-transparent" />
          <div className="landing-ring-float-a absolute right-[8%] top-[18rem] h-16 w-16 rounded-full border-[4px] border-[#f8b878]/52 bg-transparent" />
          <div className="landing-ring-float-b absolute right-[-2rem] top-[23rem] h-24 w-24 rounded-full border-[4px] border-[#58c0e0]/34 bg-transparent" />
          <div className="landing-ring-float-c absolute right-[2%] top-[30rem] h-28 w-28 rounded-full border-[4px] border-[#f8d058]/44 bg-transparent" />
          <div className="landing-ring-float-a absolute right-[14%] top-[38rem] h-20 w-20 rounded-full border-[4px] border-[#68d8e0]/48 bg-transparent" />
          <div className="landing-ring-float-c absolute right-[6%] bottom-[4rem] h-14 w-14 rounded-full border-[4px] border-[#f8d058]/42 bg-transparent" />
        </div>
        <div className="relative z-10">
          {/* Primary story arc: hero first. */}
          <HeroSection />
        </div>
      </div>
      <div className="relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0 z-0">
          <div className="landing-section-bg absolute inset-0" />
        </div>
        <div className="pointer-events-none absolute inset-0 z-[1] hidden overflow-hidden lg:block landing-decoration-fade landing-delay-3" aria-hidden>
          <div className="landing-ring-float-b absolute left-[-6rem] top-24 h-52 w-52 rounded-full border-[5px] border-[#f8b878]/34 bg-transparent" />
          <div className="landing-ring-float-a absolute -left-6 top-[34rem] h-24 w-24 rounded-full border-[4px] border-[#58c0e0]/58 bg-transparent" />
          <div className="landing-ring-float-c absolute left-[4%] bottom-10 h-16 w-16 rounded-full border-[4px] border-[#f8d058]/66 bg-transparent" />
          <div className="landing-ring-float-a absolute right-[-2rem] top-[18rem] h-36 w-36 rounded-full border-[5px] border-[#68d8e0]/72 bg-transparent" />
          <div className="landing-ring-float-b absolute right-[6%] top-[8rem] h-20 w-20 rounded-full border-[4px] border-[#f8b878]/60 bg-transparent" />
          <div className="landing-ring-float-c absolute right-[8%] bottom-24 h-48 w-48 rounded-full border-[5px] border-[#58c0e0]/40 bg-transparent" />
          <div className="landing-ring-float-a absolute right-[18%] bottom-10 h-24 w-24 rounded-full border-[4px] border-[#58c0e0]/46 bg-transparent" />
        </div>
        <div className="relative z-10">
          {/* Product explainer + profile preview + pricing + customization + FAQ. */}
          <WhatIsLinketSection />
          <PublicProfilePreviewSection
            preview={publicPreview}
          />
          <PricingSection pricing={pricing} />
          <ExperienceSection />
          <FAQSection items={faq} />
        </div>
      </div>
      {/* Structured data for SEO. */}
      <Script id="linket-faq-schema" type="application/ld+json">
        {JSON.stringify(faqSchema)}
      </Script>
      <Script id="linket-organization-schema" type="application/ld+json">
        {JSON.stringify(organizationSchema)}
      </Script>
      <Script id="linket-website-schema" type="application/ld+json">
        {JSON.stringify(websiteSchema)}
      </Script>
    </div>
  );
}

// -----------------------------------------------------------------------------
// Section components
// -----------------------------------------------------------------------------

// Hero: core headline, CTA, and dashboard preview.
function HeroSection() {
  return (
    <section
      id="hero"
      className="relative isolate text-slate-900"
    >
      <div className="relative z-10 flex min-h-[calc(100svh-3.5rem)] flex-col items-center px-4 pb-6 pt-6 text-center sm:min-h-screen sm:px-6 lg:px-8">
        <div className="mx-auto max-w-4xl py-8 sm:py-12">
          {/* Primary headline + brand callout. */}
          <h1 className="landing-fade-up landing-delay-1 mt-6 text-[2.4rem] font-semibold leading-tight tracking-tight text-slate-950 sm:mt-10 sm:text-6xl lg:text-[4.75rem] lg:leading-[1.03]">
            <span className="block">Linket Connect</span>
            <span className="mx-auto mt-3 block max-w-3xl text-[1.35rem] font-medium leading-snug text-slate-600 sm:text-3xl lg:text-[2.25rem]">
              NFC hardware, live profiles, and lead capture in one system.
            </span>
          </h1>
          {/* Supporting value proposition. */}
          <p className="landing-fade-up landing-delay-2 mx-auto mt-5 max-w-[21rem] text-[15px] leading-7 text-slate-600 sm:max-w-2xl sm:text-lg sm:leading-8">
            One NFC tap opens your live public profile, lets people save your contact,
            and drives qualified leads into your dashboard. Update once, and every
            future scan shares your latest info.
          </p>
          {/* Primary CTA. */}
          <div className="landing-fade-up landing-delay-3 mt-10 flex justify-center">
            <Button
              asChild
              variant="landingPrimary"
              size="lg"
              className="w-full max-w-[15rem] rounded-full px-7 py-5 text-sm font-semibold transition-[background-color,border-color,box-shadow,transform] duration-200 active:scale-[0.985] sm:w-auto sm:max-w-none sm:px-10 sm:py-6 sm:text-base"
            >
              <Link
                href="/auth"
                data-analytics-id="hero_cta_click"
                data-analytics-meta='{"location":"hero","target":"/auth"}'
              >
                Get Started
              </Link>
            </Button>
          </div>
        </div>
        <HeroProductOverview />
        {/* Hero mock dashboard. */}
        <HeroDashboardPreview />
      </div>
    </section>
  );
}

function HeroProductOverview() {
  return (
    <div className="landing-fade-up landing-delay-4 landing-product-rail mb-4 grid w-full max-w-5xl gap-3 p-3 text-left sm:mb-5 sm:grid-cols-[1fr_1fr_auto] sm:p-4">
      <div className="landing-product-asset flex min-h-[8.5rem] items-center gap-4 overflow-hidden p-4">
        <Image
          src="/mockups/keychain.svg"
          alt="Linket NFC keychain hardware mockup"
          width={240}
          height={180}
          className="h-28 w-36 shrink-0 object-contain sm:h-32"
          priority
        />
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
            Physical Linket
          </p>
          <p className="mt-2 text-sm font-semibold text-slate-950">
            NFC + QR hardware that keeps pointing to your latest profile.
          </p>
        </div>
      </div>
      <div className="landing-product-asset flex min-h-[8.5rem] items-center gap-4 overflow-hidden p-4">
        <Image
          src="/mockups/phone.svg"
          alt="Live Linket public profile phone preview"
          width={128}
          height={220}
          className="h-32 w-20 shrink-0 object-contain"
          priority
        />
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
            Live profile
          </p>
          <p className="mt-2 text-sm font-semibold text-slate-950">
            Contact save, key links, and lead capture in one mobile page.
          </p>
        </div>
      </div>
      <div className="landing-card landing-card-muted flex min-h-[8.5rem] flex-col justify-center px-4 py-3 sm:w-44">
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">
          Current flow
        </p>
        <p className="mt-2 text-3xl font-semibold text-slate-950">Tap</p>
        <p className="text-sm text-slate-600">Save, submit, follow up.</p>
      </div>
    </div>
  );
}

// Mock dashboard preview used to visualize analytics value.
function HeroDashboardPreview() {
  // Date range (last 30 days) for the mock date pill.
  const now = new Date();
  const start = new Date(now);
  start.setDate(now.getDate() - 30);
  const formatDate = (value: Date) =>
    value.toLocaleDateString("en-US", {
      month: "short",
      day: "2-digit",
      year: "numeric",
    });
  const dateRange = `${formatDate(start)} - ${formatDate(now)}`;

  // Map trend values into SVG coordinate points.
  const trendPoints = DASHBOARD_TREND.map((value, index) => {
    const x = 10 + (index / (DASHBOARD_TREND.length - 1)) * 300;
    const y = 92 - (value / 100) * 70;
    return { x, y };
  });
  // Create the stroke path + the filled area.
  const trendPath = `M ${trendPoints
    .map((point) => `${point.x} ${point.y}`)
    .join(" L ")}`;
  const trendArea = `${trendPath} L ${
    trendPoints[trendPoints.length - 1].x
  } 110 L ${trendPoints[0].x} 110 Z`;

  return (
    <div className="landing-fade-up landing-delay-5 landing-surface relative w-full max-w-6xl p-3 text-left text-slate-900 sm:p-5">
      {/* Top bar: user badge, tabs, search, date range, and download CTA. */}
      <div className="flex flex-col gap-3 border-b border-[#f8edd7] pb-3 sm:gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex max-w-full items-center gap-3 rounded-2xl border border-slate-200 bg-white px-3 py-2 sm:rounded-full sm:px-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#dff3f7] text-sm font-semibold text-slate-900">
            PK
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-slate-900 sm:text-base">Punit Kothakonda</p>
          </div>
        </div>
        <div className="flex w-full min-w-0 flex-col gap-3 lg:flex-1 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap gap-2">
            {DASHBOARD_TABS.map((tab, index) => (
              <span
                key={tab}
                className={cn(
                  "rounded-full border px-3 py-1.5 text-xs font-medium transition-[background-color,border-color,color] duration-200 sm:px-4 sm:text-sm",
                  index > 0 && "hidden sm:inline-flex",
                  index === 0
                    ? "border-[#f8b878] bg-[#f8b878] text-[#0f172a]"
                    : "border-slate-200 text-slate-700"
                )}
              >
                {tab}
              </span>
            ))}
          </div>
          <div className="flex min-w-0 flex-1 items-center justify-start gap-2 sm:justify-end sm:gap-3">
            <div className="relative hidden w-full max-w-full flex-1 sm:block sm:max-w-xs">
              <Search
                className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-300"
                aria-hidden
              />
              <input
                className="w-full rounded-full border border-slate-200 bg-white py-2 pl-11 pr-4 text-sm text-slate-700 placeholder:text-slate-300 focus:border-[#f8b878] focus:outline-none focus:ring-2 focus:ring-[#f8b878]/30"
                placeholder="Search..."
              />
            </div>
            <div className="hidden items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm text-slate-600 sm:flex">
              <Calendar className="h-4 w-4 text-slate-400" aria-hidden />
              <span>{dateRange}</span>
            </div>
            <button className="hidden items-center gap-2 rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition-[background-color,box-shadow,transform] duration-200 active:scale-[0.985] sm:inline-flex">
              <Download className="h-4 w-4" aria-hidden />
              Download
            </button>
          </div>
        </div>
      </div>
      <div className="mt-3 space-y-5 sm:space-y-6">
        {/* KPI tiles. */}
        <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
          {DASHBOARD_STATS.map((stat) => (
            <div
              key={stat.label}
              className="landing-card landing-card-muted p-3.5 sm:p-4"
            >
              <p className="text-xs uppercase tracking-[0.2em] text-slate-600 sm:tracking-[0.35em]">
                {stat.label}
              </p>
              <p className="mt-2 text-[1.75rem] font-semibold text-slate-900 sm:mt-3 sm:text-2xl">
                {stat.value}
              </p>
              <p className="text-xs text-[#34afcf]">{stat.delta}</p>
            </div>
          ))}
        </div>
        {/* Trend chart + recent activity. */}
        <div className="grid gap-4 lg:grid-cols-[1.4fr_0.6fr]">
          <div className="landing-card landing-card-muted relative hidden justify-center overflow-hidden p-3 md:flex">
            <div className="relative space-y-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                </div>
              </div>
              <div className="grid w-full max-w-[640px] gap-4 lg:grid-cols-1">
                <div className="flex min-h-[320px] flex-col rounded-2xl border border-slate-200 bg-white p-5">
                  <div className="flex items-center justify-between text-xs text-slate-600">
                    <span className="uppercase tracking-[0.35em]">
                      Scans trend
                    </span>
                    <span className="font-semibold text-slate-700">
                      Last 12 months
                    </span>
                  </div>
                  {/* SVG line/area chart for the mock trend. */}
                  <svg
                    viewBox="0 0 320 120"
                    className="mt-4 h-56 w-full flex-1"
                    aria-hidden
                  >
                    <defs>
                      <linearGradient
                        id="scan-trend-line"
                        x1="0"
                        y1="0"
                        x2="1"
                        y2="1"
                      >
                        <stop offset="0%" stopColor="#f8d058" />
                        <stop offset="48%" stopColor="#f8b878" />
                        <stop offset="100%" stopColor="#58c0e0" />
                      </linearGradient>
                    </defs>
                    <path
                      d="M0 24 H320 M0 52 H320 M0 80 H320"
                      stroke="#e8eef6"
                      strokeWidth="1"
                      strokeDasharray="4 6"
                      fill="none"
                    />
                    <path
                      d={trendArea}
                      fill="url(#scan-trend-line)"
                      opacity="0.16"
                    />
                    <path
                      d={trendPath}
                      fill="none"
                      stroke="url(#scan-trend-line)"
                      strokeWidth="4"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    <circle
                      cx={trendPoints[trendPoints.length - 1].x}
                      cy={trendPoints[trendPoints.length - 1].y}
                      r="5"
                      fill="#58c0e0"
                    />
                  </svg>
                  <div className="mt-3 grid grid-cols-6 gap-2 text-[11px] uppercase tracking-[0.25em] text-slate-300 sm:grid-cols-12">
                    {DASHBOARD_BARS.map((bar) => (
                      <span key={bar.label} className="text-center">
                        {bar.label}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div className="landing-card p-4 sm:p-5">
            <p className="text-lg font-semibold text-slate-900">Recent leads</p>
            <p className="text-xs text-slate-600">
              You made {RECENT_SALES.length} new connections this period.
            </p>
            <div className="mt-6 space-y-4">
              {/* Recent lead rows. */}
              {RECENT_SALES.map((sale, index) => {
                const initials = sale.name
                  .split(" ")
                  .map((segment) => segment[0])
                  .join("")
                  .slice(0, 2)
                  .toUpperCase();

                return (
                  <div
                    key={sale.email}
                    className={cn(
                      "flex min-w-0 items-center justify-between gap-2 sm:gap-3",
                      index >= 3 && "hidden sm:flex"
                    )}
                  >
                    <div className="flex min-w-0 flex-1 items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#fff1db] text-base font-semibold text-slate-800">
                        {initials}
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-slate-900">
                          {sale.name}
                        </p>
                        <p className="truncate text-xs text-slate-600">{sale.email}</p>
                      </div>
                    </div>
                    <p className="shrink-0 text-xs font-semibold text-[#e6aa5c] sm:text-sm">
                      {sale.amount}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function WhatIsLinketSection() {
  const pillars = [
    {
      step: "01",
      title: "Tap-to-share hardware",
      description:
        "You start by tapping your Linket so someone can open your info instantly on their phone without downloading an app.",
      tone: "warm",
    },
    {
      step: "02",
      title: "A live public page",
      description:
        "That tap opens a branded page with your photo, headline, contact save, and key links, giving the other person one clear place to understand who you are.",
      tone: "cool",
    },
    {
      step: "03",
      title: "Follow-up tools behind it",
      description:
        "You can update the page anytime, capture leads, and review engagement so every introduction stays current and is easier to follow up on.",
      tone: "warm",
    },
  ] as const;

  return (
    <section
      id="what-is-linket"
      className="landing-alt-font relative pt-10 pb-4 sm:pt-18 sm:pb-8"
    >
      <div className="pointer-events-none absolute inset-0 z-0 hidden overflow-hidden lg:block landing-decoration-fade landing-delay-2" aria-hidden>
        <div className="landing-ring-float-a absolute left-[8%] top-6 h-16 w-16 rounded-full border-[4px] border-[#f8d058]/40 bg-transparent" />
        <div className="landing-ring-float-b absolute left-[22%] top-[9rem] h-12 w-12 rounded-full border-[4px] border-[#58c0e0]/34 bg-transparent" />
        <div className="landing-ring-float-c absolute right-[12%] top-8 h-24 w-24 rounded-full border-[5px] border-[#68d8e0]/40 bg-transparent" />
        <div className="landing-ring-float-a absolute right-[26%] top-[14rem] h-14 w-14 rounded-full border-[4px] border-[#f8b878]/34 bg-transparent" />
        <div className="landing-ring-float-b absolute left-[14%] bottom-10 h-20 w-20 rounded-full border-[4px] border-[#f8b878]/30 bg-transparent" />
        <div className="landing-ring-float-c absolute right-[18%] bottom-8 h-14 w-14 rounded-full border-[4px] border-[#58c0e0]/32 bg-transparent" />
      </div>
      <div className="relative z-10 mx-auto max-w-6xl px-4 sm:px-6">
        <div className="landing-fade-up landing-surface relative overflow-hidden p-5 sm:p-8 lg:p-10">
          <div className="pointer-events-none absolute inset-0 z-0 hidden" aria-hidden>
            <svg
              className="absolute inset-0 h-full w-full"
              viewBox="0 0 1200 640"
              preserveAspectRatio="none"
              fill="none"
            >
              <path
                d="M-140 108C66 -18 282 -10 454 58C606 118 758 112 922 54C1082 0 1218 14 1360 100"
                stroke="#f8b878"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeOpacity="0.28"
                strokeWidth="3.5"
              />
              <path
                d="M-160 142C42 28 248 28 426 86C592 140 758 136 934 88C1102 42 1246 56 1380 132"
                stroke="#58c0e0"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeOpacity="0.22"
                strokeWidth="3"
              />
              <path
                d="M-120 536C114 444 314 426 476 476C626 522 772 524 932 482C1100 438 1240 452 1360 524"
                stroke="#f8d058"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeOpacity="0.18"
                strokeWidth="3"
              />
              <path
                d="M-150 584C82 496 290 478 462 520C620 560 772 562 944 522C1118 482 1266 498 1380 572"
                stroke="#68d8e0"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeOpacity="0.14"
                strokeWidth="2.5"
              />
            </svg>
          </div>

          <div className="relative z-10">
            <div className="mx-auto max-w-4xl text-center">
              <span className="landing-chip px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em]">
                What Is Linket?
              </span>
              <h2 className="mt-4 text-[1.9rem] font-semibold tracking-tight text-slate-950 sm:mt-5 sm:text-4xl">
                Interactive networking with a real handoff
              </h2>
              <p className="mx-auto mt-4 max-w-3xl text-sm leading-7 text-slate-600 sm:text-base sm:leading-8">
                Linket connects physical tap-to-share hardware to a live page and keeps the leads organized.

                Instead of handing over a static card, Linket gives you a physical
                product that opens a living digital introduction. The person you
                meet can save your contact, open your key links, and get a cleaner
                sense of what you do in seconds, while you gain insight and keep control of what
                they see after the conversation.
              </p>
            </div>

            <div className="mt-6 grid gap-3 sm:mt-8 sm:gap-4 lg:grid-cols-3">
              {pillars.map((pillar) => (
                <div
                  key={pillar.step}
                  className="landing-card p-4 sm:p-5"
                >
                  <span
                    className={cn(
                      "inline-flex h-10 w-10 items-center justify-center rounded-full border text-sm font-semibold",
                      pillar.tone === "cool"
                        ? "border-[#bfe7f2] bg-[#eefafd] text-[#34afcf]"
                        : "border-[#f8ddba] bg-[#fff8ee] text-[#e3a553]"
                    )}
                  >
                    {pillar.step}
                  </span>
                  <h3 className="mt-3 text-base font-semibold text-slate-900 sm:mt-4 sm:text-lg">
                    {pillar.title}
                  </h3>
                  <p className="mt-2 text-sm leading-6 text-slate-600 sm:mt-3 sm:leading-7">
                    {pillar.description}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

// Dark-mode spotlight for custom orders and hardware benefits.
function ExperienceSection() {
  return (
    <section
      id="customization"
      className="landing-alt-font relative overflow-hidden bg-[#050816] py-16 text-white sm:py-24"
    >
      {/* Ambient gradients to add depth on the dark section. */}
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_12%,rgba(248,184,120,0.18),transparent_55%),radial-gradient(circle_at_82%_18%,rgba(88,192,224,0.22),transparent_60%)]"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-[#050816] via-[#0a0f1e]/40 to-transparent"
        aria-hidden
      />
      <div className="relative mx-auto flex max-w-6xl flex-col gap-8 px-4 sm:gap-10 sm:px-6 lg:flex-row lg:items-center">
        <div className="landing-fade-up space-y-5 sm:space-y-6 lg:w-3/5">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-white/60">
            Custom orders
          </p>
          {/* Section headline + explanation. */}
          <div>
            <p className="text-[1.9rem] font-semibold tracking-tight sm:text-4xl">
              <span className="text-white/80">
                Work with us to design custom made Linkets for your{" "}
              </span>
              <span className="bg-gradient-to-r from-[#f8d058] via-[#f8b878] to-[#58c0e0] bg-clip-text text-transparent">
                team
              </span>
            </p>
            <p className="mt-4 text-sm leading-7 text-white/70 sm:text-base sm:leading-8">
              Work directly with our hardware team to design custom models that
              match your brand. We handle prototyping, sourcing, and rollout so
              you can stay focused on demos.
            </p>
          </div>
          {/* Feature bullet cards. */}
          <div className="grid gap-3 text-sm text-white/80 sm:grid-cols-2 sm:gap-4">
            {[
              "UV-resistant plastic that holds up to daily wear",
              "Custom models shaped around your logo or brand mark",
              "Customizable public pages that stay on brand",
              "Lead capture tools with analytics for follow-ups",
            ].map((item) => (
              <div
                key={item}
                className="rounded-2xl border border-white/15 bg-white/[0.08] p-3.5 transition-[border-color,background-color] duration-200 hover:border-white/30 sm:p-4"
              >
                {item}
              </div>
            ))}
          </div>
        </div>
        {/* Contact form card. */}
        <div className="landing-fade-up landing-delay-2 w-full max-w-md rounded-[20px] border border-white/15 bg-[#0b1020] p-4 shadow-[0_24px_60px_rgba(5,5,20,0.4)] transition-[border-color,box-shadow] duration-200 hover:border-white/25 sm:p-8">
          <div className="flex items-center gap-3">
            <Image
              src={brand.logomark}
              alt="Linket mark"
              width={56}
              height={56}
              className="h-14 w-14"
            />
            <div>
              <p className="text-lg font-semibold text-white">Get in touch</p>
              <p className="text-xs text-white/60">
                Unlock the full Linket experience with our custom team.
              </p>
            </div>
          </div>
          <ConsultForm />
        </div>
      </div>
    </section>
  );
}

// Public profile preview: show the mobile layout customers will see.
function PublicProfilePreviewSection({
  preview,
}: {
  preview: {
    profile: ProfileWithLinks;
    account: PublicPreviewAccount;
  } | null;
}) {
  return (
    <section
      id="public-preview"
      className="landing-alt-font relative pt-14 pb-2 sm:pt-24 sm:pb-4"
    >
      <div className="pointer-events-none absolute inset-0 z-0 hidden overflow-hidden lg:block landing-decoration-fade landing-delay-2" aria-hidden>
        <div className="landing-ring-float-a absolute left-[10%] top-14 h-20 w-20 rounded-full border-[4px] border-[#f8d058]/46 bg-transparent" />
        <div className="landing-ring-float-b absolute left-[24%] top-6 h-12 w-12 rounded-full border-[4px] border-[#58c0e0]/40 bg-transparent" />
        <div className="landing-ring-float-c absolute left-[42%] top-12 h-16 w-16 rounded-full border-[4px] border-[#f8b878]/34 bg-transparent" />
        <div className="landing-ring-float-a absolute left-[16%] top-[13rem] h-10 w-10 rounded-full border-[4px] border-[#58c0e0]/30 bg-transparent" />
        <div className="landing-ring-float-b absolute left-[34%] bottom-[4rem] h-14 w-14 rounded-full border-[4px] border-[#f8d058]/28 bg-transparent" />
        <div className="landing-ring-float-a absolute right-[16%] top-6 h-28 w-28 rounded-full border-[5px] border-[#68d8e0]/44 bg-transparent" />
        <div className="landing-ring-float-b absolute right-[28%] top-[10rem] h-14 w-14 rounded-full border-[4px] border-[#f8b878]/40 bg-transparent" />
        <div className="landing-ring-float-c absolute right-[10%] top-[22rem] h-20 w-20 rounded-full border-[4px] border-[#58c0e0]/36 bg-transparent" />
        <div className="landing-ring-float-c absolute right-[34%] top-[7rem] h-16 w-16 rounded-full border-[4px] border-[#68d8e0]/28 bg-transparent" />
        <div className="landing-ring-float-a absolute right-[22%] bottom-[7rem] h-12 w-12 rounded-full border-[4px] border-[#f8b878]/26 bg-transparent" />
      </div>
      <div className="relative z-10 mx-auto max-w-6xl px-4 sm:px-6">
        <div className="grid items-start gap-5 sm:gap-8 lg:grid-cols-[1.18fr_0.82fr] lg:items-stretch">
          <div className="landing-fade-up h-full text-slate-900">
            <div className="landing-surface flex h-full w-full max-w-none flex-col p-5 sm:p-8 lg:min-h-[520px]">
              <div className="relative flex h-full flex-col justify-between gap-5 pt-0 sm:gap-6 sm:pt-5">
                <span className="landing-chip px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em]">
                  Public Page
                </span>
                <div className="space-y-5 sm:space-y-6">
                  <div className="space-y-4">
                    <h2 className="text-[1.9rem] font-semibold tracking-tight text-slate-950 sm:text-4xl">
                      This is the founder&apos;s{" "}
                      <span className="text-[#20586e]">live page</span>
                    </h2>
                    <p className="max-w-xl text-sm leading-7 text-slate-600 sm:text-base sm:leading-8">
                      A public page is the live profile people see after they tap
                      your Linket or scan your QR code. It gives them one clean
                      place to save your contact, open your key links, and
                      understand who you are in seconds.
                    </p>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="landing-card p-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#e3a553]">
                        What Lives Here
                      </p>
                      <p className="mt-3 text-sm leading-7 text-slate-600">
                        Your photo, headline, email, contact save button, and
                        important links all stay in one place so the other person
                        knows exactly where to go next.
                      </p>
                    </div>
                    <div className="landing-card p-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#34afcf]">
                        Why It Matters
                      </p>
                      <p className="mt-3 text-sm leading-7 text-slate-600">
                        Instead of sending people to scattered apps and stale
                        links, every tap opens a current, branded page that feels
                        credible and easy to act on.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
          {/* Mobile preview shell with live data. */}
          <div className="landing-fade-up landing-delay-2 relative mx-auto w-full max-w-[19.5rem] sm:max-w-[24rem]">
            <div className="landing-surface relative overflow-hidden p-2">
              <div className="landing-brand-preview h-[420px] w-full overflow-y-auto bg-[#0b1220] sm:h-[520px]">
                {preview ? (
                  <PublicProfilePreview
                    profile={preview.profile}
                    account={preview.account}
                    handle={preview.account.handle}
                    layout="stacked"
                    forceMobile
                    themeOverride="light"
                  />
                ) : (
                  <div className="flex min-h-full flex-col items-center justify-center gap-5 bg-white px-6 text-center text-slate-900">
                    <div className="space-y-2">
                      <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[#e3a553]">
                        Live public page
                      </p>
                      <h3 className="text-3xl font-semibold tracking-tight">
                        Punit&apos;s profile is live
                      </h3>
                      <p className="text-sm leading-7 text-slate-600">
                        Open the current public page directly.
                      </p>
                    </div>
                    <Button asChild variant="landingPrimary" size="lg">
                      <Link href={FOUNDER_PUBLIC_PROFILE_URL}>
                        Open linketconnect.com/punit
                      </Link>
                    </Button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

// Pricing section wrapper around the CreativePricing component.
function PricingSection({ pricing }: { pricing: PublicPricingSnapshot }) {
  return (
    <section
      id="pricing"
      className="landing-alt-font landing-fade-up relative mx-auto max-w-6xl px-4 pt-6 pb-16 sm:px-6 sm:pt-4 sm:pb-24"
    >
      <div className="pointer-events-none absolute inset-0 z-0 hidden overflow-hidden lg:block landing-decoration-fade landing-delay-3" aria-hidden>
        <div className="landing-ring-float-a absolute left-[10%] top-12 h-20 w-20 rounded-full border-[4px] border-[#f8d058]/46 bg-transparent" />
        <div className="landing-ring-float-b absolute left-[24%] top-24 h-12 w-12 rounded-full border-[4px] border-[#58c0e0]/38 bg-transparent" />
        <div className="landing-ring-float-c absolute right-[14%] top-10 h-24 w-24 rounded-full border-[5px] border-[#68d8e0]/42 bg-transparent" />
        <div className="landing-ring-float-a absolute right-[30%] top-[9rem] h-14 w-14 rounded-full border-[4px] border-[#f8b878]/34 bg-transparent" />
        <div className="landing-ring-float-b absolute left-[34%] top-[11rem] h-10 w-10 rounded-full border-[4px] border-[#58c0e0]/28 bg-transparent" />
        <div className="landing-ring-float-c absolute right-[38%] top-[14rem] h-12 w-12 rounded-full border-[4px] border-[#f8d058]/26 bg-transparent" />
        <div className="landing-ring-float-b absolute left-[7%] top-[22rem] h-16 w-16 rounded-full border-[4px] border-[#58c0e0]/34 bg-transparent" />
        <div className="landing-ring-float-c absolute right-[8%] top-[24rem] h-[4.5rem] w-[4.5rem] rounded-full border-[4px] border-[#f8d058]/36 bg-transparent" />
        <div className="landing-ring-float-a absolute left-[18%] bottom-14 h-24 w-24 rounded-full border-[4px] border-[#f8b878]/38 bg-transparent" />
        <div className="landing-ring-float-b absolute left-[42%] bottom-8 h-14 w-14 rounded-full border-[4px] border-[#58c0e0]/34 bg-transparent" />
        <div className="landing-ring-float-c absolute right-[18%] bottom-12 h-20 w-20 rounded-full border-[4px] border-[#68d8e0]/38 bg-transparent" />
        <div className="landing-ring-float-a absolute left-[28%] bottom-[6rem] h-12 w-12 rounded-full border-[4px] border-[#f8d058]/24 bg-transparent" />
        <div className="landing-ring-float-b absolute right-[30%] bottom-[4rem] h-16 w-16 rounded-full border-[4px] border-[#58c0e0]/28 bg-transparent" />
      </div>
      <div className="relative z-10">
        <LinketPlansToggle pricing={pricing} />
      </div>
    </section>
  );
}

// FAQ accordion with structured data handled in the page component.
function FAQSection({ items }: { items: FaqItem[] }) {
  return (
    <section
      id="faq"
      className="landing-alt-font landing-fade-up mx-auto max-w-4xl px-4 py-16 sm:px-6 sm:py-24"
    >
      <div className="text-center">
        <span className="inline-flex items-center gap-2 rounded-full border border-foreground/10 bg-foreground/5 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground sm:tracking-[0.35em]">
          FAQ
        </span>
        <h2 className="mt-4 text-2xl font-semibold tracking-tight sm:text-4xl">
          Answers before you tap
        </h2>
        <p className="mt-4 text-sm text-muted-foreground sm:text-base">
          Everything you need to know about Linket hardware, profiles, and data.
        </p>
      </div>
      {/* FAQ accordion items. */}
      <Accordion type="single" collapsible className="mt-8 space-y-3 sm:mt-10 sm:space-y-4">
        {items.map((item, index) => (
          <AccordionItem
            key={item.question}
            value={`faq-${index}`}
            className="overflow-hidden rounded-2xl border border-slate-200 bg-white px-4 transition-[border-color,background-color] duration-200 hover:border-slate-300 sm:px-5"
          >
            <AccordionTrigger className="text-left text-sm font-semibold text-foreground hover:no-underline sm:text-base">
              {item.question}
            </AccordionTrigger>
            <AccordionContent className="pb-5 text-sm text-muted-foreground">
              {item.answer}
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </section>
  );
}
