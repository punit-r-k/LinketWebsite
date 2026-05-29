import type { Metadata } from "next";
import Link from "next/link";

import { MarketingPage, PageSection } from "@/components/site/marketing-page";
import { DISCOVER_PAGES, getDiscoverPage } from "@/config/discover-pages";

const PAGE = getDiscoverPage("/digital-business-card");
const RELATED_PAGES = DISCOVER_PAGES.filter((page) => page.href !== PAGE.href);

const BUYER_JOBS = [
  {
    title: "Share contact details quickly",
    description:
      "People should be able to save your phone, email, and links in seconds without downloading an app.",
  },
  {
    title: "Update your info later",
    description:
      "A digital business card should stay current after the first meeting so role changes, new offers, and new links do not require a reprint.",
  },
  {
    title: "Work on iPhone and Android",
    description:
      "Modern sharing should support NFC when available and offer a QR fallback when it is not.",
  },
  {
    title: "Capture the next step",
    description:
      "The best setups do more than show a profile. They help you turn interest into a lead, booking, or follow-up.",
  },
] as const;

const COMPARISON_ITEMS = [
  {
    title: "Paper card",
    detail:
      "Familiar and simple, but static once printed and easy to lose after an event.",
  },
  {
    title: "Basic QR page",
    detail:
      "Better than paper for updates, but less natural in face-to-face settings and usually weaker on contact saving.",
  },
  {
    title: "Linket",
    detail:
      "Combines NFC + QR sharing with a live profile, contact save, lead capture, and analytics in one flow.",
  },
] as const;

const FITS_BEST = [
  "Students and job seekers who need one profile that can change as applications, portfolios, and resumes evolve.",
  "Creators and freelancers who want a profile that works from social media, campus events, client meetings, and pop-up shops.",
  "Founders, sales reps, and teams who want to capture leads instead of only handing out contact details.",
  "Events and field teams that need physical sharing hardware without giving up live page updates.",
] as const;

export const metadata: Metadata = {
  title: PAGE.metaTitle,
  description: PAGE.metaDescription,
  alternates: {
    canonical: PAGE.href,
  },
  openGraph: {
    title: PAGE.metaTitle,
    description: PAGE.metaDescription,
  },
  twitter: {
    card: "summary_large_image",
    title: PAGE.metaTitle,
    description: PAGE.metaDescription,
  },
};

export default function DigitalBusinessCardPage() {
  return (
    <MarketingPage
      kicker="Digital business card"
      title="A digital business card should keep working after the first meeting"
      subtitle="Linket combines tap-to-share hardware, a live public profile, contact saving, lead capture, and analytics so your card is not just a static landing page."
      actions={[
        { label: "Get started", href: "/auth?view=signup" },
        { label: "View pricing", href: "/#pricing", variant: "outline" },
      ]}
      className="landing-alt-font bg-[#fff7ed]"
    >
      <PageSection
        title="Straight answer"
        subtitle="What people usually mean when they search for a digital business card"
      >
        <div className="rounded-[28px] border border-slate-200 bg-white/90 p-6 text-base leading-7 text-slate-700 shadow-[0_20px_50px_rgba(15,23,42,0.08)]">
          <p>
            Linket is a digital business card system for people who want one
            profile they can share by NFC tap, QR code, or direct link. When
            someone opens it, they can save your contact, browse your key
            links, and submit their own info if you are collecting leads.
          </p>
          <p className="mt-4">
            The important difference is that the hardware stays the same while
            the page behind it stays live. You can update your details later
            without replacing the item you carry.
          </p>
        </div>
      </PageSection>

      <PageSection
        title="What buyers usually want"
        subtitle="These are the jobs a digital business card has to do well to be worth carrying"
      >
        <div className="grid gap-4 md:grid-cols-2">
          {BUYER_JOBS.map((item) => (
            <article
              key={item.title}
              className="rounded-3xl border border-slate-200 bg-white/85 p-5 shadow-[0_16px_40px_rgba(15,23,42,0.06)]"
            >
              <h3 className="text-base font-semibold text-slate-900">
                {item.title}
              </h3>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                {item.description}
              </p>
            </article>
          ))}
        </div>
      </PageSection>

      <PageSection
        title="How Linket compares"
        subtitle="The point is not just replacing paper. It is improving what happens after the handoff."
      >
        <div className="grid gap-4 md:grid-cols-3">
          {COMPARISON_ITEMS.map((item) => (
            <article
              key={item.title}
              className="rounded-3xl border border-slate-200 bg-white/85 p-5 shadow-[0_16px_40px_rgba(15,23,42,0.06)]"
            >
              <h3 className="text-base font-semibold text-slate-900">
                {item.title}
              </h3>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                {item.detail}
              </p>
            </article>
          ))}
        </div>
      </PageSection>

      <PageSection
        title="Who Linket fits best"
        subtitle="Linket is strongest when you want both a physical handoff and a live profile behind it"
      >
        <div className="rounded-[28px] border border-slate-200 bg-white/90 p-6 shadow-[0_20px_50px_rgba(15,23,42,0.08)]">
          <ul className="grid gap-3 text-sm leading-6 text-slate-700">
            {FITS_BEST.map((item) => (
              <li
                key={item}
                className="rounded-2xl border border-slate-100 bg-[#fff7ed] px-4 py-3"
              >
                {item}
              </li>
            ))}
          </ul>
        </div>
      </PageSection>

      <PageSection
        title="Related guides"
        subtitle="Explore the adjacent intents people compare before they choose a profile-sharing tool"
      >
        <div className="grid gap-4 md:grid-cols-2">
          {RELATED_PAGES.map((page) => (
            <Link
              key={page.href}
              href={page.href}
              className="rounded-3xl border border-slate-200 bg-white/85 p-5 shadow-[0_16px_40px_rgba(15,23,42,0.06)] transition-[border-color,box-shadow] duration-200 hover:border-slate-300 hover:shadow-[0_14px_32px_rgba(15,23,42,0.08)]"
            >
              <h3 className="text-base font-semibold text-slate-900">
                {page.label}
              </h3>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                {page.cardDescription}
              </p>
            </Link>
          ))}
        </div>
      </PageSection>
    </MarketingPage>
  );
}
