import type { Metadata } from "next";
import Link from "next/link";

import { MarketingPage, PageSection } from "@/components/site/marketing-page";
import { DISCOVER_PAGES, getDiscoverPage } from "@/config/discover-pages";

const PAGE = getDiscoverPage("/link-in-bio");
const RELATED_PAGES = DISCOVER_PAGES.filter((page) => page.href !== PAGE.href);

const CREATOR_PRIORITIES = [
  {
    title: "Fast updates",
    description:
      "Your bio page should change quickly when new links, products, or campaigns go live.",
  },
  {
    title: "A branded profile",
    description:
      "The page should look like a real destination, not just a utility list of links.",
  },
  {
    title: "Contact and lead capture",
    description:
      "Some visitors want to book, collaborate, or ask a question instead of only clicking out to another platform.",
  },
  {
    title: "Signals on what people use",
    description:
      "Simple analytics help you see which links, offers, or intros are actually driving action.",
  },
] as const;

const LINKET_ADVANTAGES = [
  {
    title: "More than a social bio link",
    detail:
      "Linket works as a normal bio page URL, but it also works face to face through NFC tap and QR sharing.",
  },
  {
    title: "Better contact handoff",
    detail:
      "Visitors can save your contact details and not just browse outbound links, which is useful for photographers, founders, and service businesses.",
  },
  {
    title: "Lead-ready by default",
    detail:
      "If the goal is collaboration or client acquisition, a lead form creates a clearer next step than a generic list of platforms.",
  },
] as const;

const BEST_FOR = [
  "Creators who want one page for social bios, in-person intros, and QR placements on products or booths.",
  "Freelancers and service businesses that need both a portfolio-style profile and a way to collect inquiries.",
  "Student organizations, campus creators, and small teams that want a bio page with stronger real-world sharing.",
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

export default function LinkInBioPage() {
  return (
    <MarketingPage
      kicker="Link in bio"
      title="A link in bio page that also works in person"
      subtitle="Linket gives creators and small teams a branded profile they can use in social bios, QR placements, and NFC sharing without splitting traffic across separate tools."
      actions={[
        { label: "Get started", href: "/auth?view=signup" },
        { label: "See the profile demo", href: "/#demo", variant: "outline" },
      ]}
      className="landing-alt-font bg-[#fff7ed]"
    >
      <PageSection
        title="Straight answer"
        subtitle="How Linket fits the link-in-bio category"
      >
        <div className="rounded-[28px] border border-slate-200 bg-white/90 p-6 text-base leading-7 text-slate-700 shadow-[0_20px_50px_rgba(15,23,42,0.08)]">
          <p>
            Linket works like a link in bio page, but it is built to keep
            working when the audience comes from real-world touchpoints too.
            Your profile can live in Instagram or TikTok, and the same page can
            open from an NFC keychain or QR code during an event, meet-up, or
            customer interaction.
          </p>
          <p className="mt-4">
            That makes it useful when your brand lives both online and in
            person. Instead of juggling a bio page for social media and a
            separate tool for contact sharing, you can use one destination.
          </p>
        </div>
      </PageSection>

      <PageSection
        title="What creators usually care about"
        subtitle="These are the jobs a link-in-bio page has to handle well"
      >
        <div className="grid gap-4 md:grid-cols-2">
          {CREATOR_PRIORITIES.map((item) => (
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
        title="Where Linket goes beyond a basic link list"
        subtitle="This is where the product crosses from bio page into real-world profile sharing"
      >
        <div className="grid gap-4 md:grid-cols-3">
          {LINKET_ADVANTAGES.map((item) => (
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
        title="Best fit"
        subtitle="Linket is strongest when one profile has to serve both online traffic and in-person discovery"
      >
        <div className="rounded-[28px] border border-slate-200 bg-white/90 p-6 shadow-[0_20px_50px_rgba(15,23,42,0.08)]">
          <ul className="grid gap-3 text-sm leading-6 text-slate-700">
            {BEST_FOR.map((item) => (
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
        subtitle="Explore the other comparison pages people tend to open alongside link-in-bio tools"
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
