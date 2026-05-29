import type { Metadata } from "next";
import Link from "next/link";

import { MarketingPage, PageSection } from "@/components/site/marketing-page";
import { DISCOVER_PAGES, getDiscoverPage } from "@/config/discover-pages";

const PAGE = getDiscoverPage("/nfc-business-card");
const RELATED_PAGES = DISCOVER_PAGES.filter((page) => page.href !== PAGE.href);

const POST_TAP_VALUE = [
  {
    title: "Open in the browser immediately",
    description:
      "A good NFC business card should send people straight to a clear profile without asking them to install anything first.",
  },
  {
    title: "Let them save your contact",
    description:
      "The tap should lead to a useful next action, not just a page that forces someone to manually copy details.",
  },
  {
    title: "Support links and lead capture",
    description:
      "After the tap, people should be able to visit your links, book, message, or submit their details for follow-up.",
  },
] as const;

const WHY_LINKET = [
  "NFC handles the fastest path on modern phones, while QR covers the cases where tap is unavailable or disabled.",
  "Both sharing methods point to the same live profile, so your messaging stays consistent whether the visitor taps or scans.",
  "Because the profile is live, updates happen after purchase without reissuing new hardware for every change.",
] as const;

const COMMON_QUESTIONS = [
  {
    title: "Will it work on iPhone and Android?",
    answer:
      "That is why Linket uses NFC plus QR. Modern phones can tap, and everyone else still has a scannable fallback.",
  },
  {
    title: "Do recipients need an app?",
    answer:
      "No. The tap or scan opens the page in the browser, which keeps the handoff simple in meetings, campus events, and field settings.",
  },
  {
    title: "What changes after I buy it?",
    answer:
      "Your hardware stays the same while your public profile, links, branding, and lead capture flow can keep evolving.",
  },
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

export default function NfcBusinessCardPage() {
  return (
    <MarketingPage
      kicker="NFC business card"
      title="An NFC business card is only as good as what happens after the tap"
      subtitle="Linket pairs NFC hardware with QR fallback, a live public profile, contact saving, lead capture, and analytics so the tap actually turns into a useful next step."
      actions={[
        { label: "See the demo", href: "/#demo" },
        { label: "Get started", href: "/auth?view=signup", variant: "outline" },
      ]}
      className="landing-alt-font bg-[#fff7ed]"
    >
      <PageSection
        title="Straight answer"
        subtitle="What an NFC business card should really solve"
      >
        <div className="rounded-[28px] border border-slate-200 bg-white/90 p-6 text-base leading-7 text-slate-700 shadow-[0_20px_50px_rgba(15,23,42,0.08)]">
          <p>
            Linket uses NFC to make in-person sharing fast, then backs it up
            with a QR code so the same profile still works when tap is not an
            option. That profile can show your contact details, links, and lead
            form instead of only landing on a static contact page.
          </p>
          <p className="mt-4">
            For most buyers, the real question is not whether NFC works. It is
            whether the tap creates a better experience than a paper card or a
            plain link. That is the part Linket is designed to improve.
          </p>
        </div>
      </PageSection>

      <PageSection
        title="What happens after the tap matters"
        subtitle="These are the parts that make an NFC card worth using repeatedly"
      >
        <div className="grid gap-4 md:grid-cols-3">
          {POST_TAP_VALUE.map((item) => (
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
        title="Why Linket uses NFC plus QR"
        subtitle="Coverage and reliability matter more than choosing one sharing method"
      >
        <div className="rounded-[28px] border border-slate-200 bg-white/90 p-6 shadow-[0_20px_50px_rgba(15,23,42,0.08)]">
          <ul className="grid gap-3 text-sm leading-6 text-slate-700">
            {WHY_LINKET.map((item) => (
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
        title="Common questions"
        subtitle="These are the objections most buyers work through before they choose hardware"
      >
        <div className="grid gap-4 md:grid-cols-3">
          {COMMON_QUESTIONS.map((item) => (
            <article
              key={item.title}
              className="rounded-3xl border border-slate-200 bg-white/85 p-5 shadow-[0_16px_40px_rgba(15,23,42,0.06)]"
            >
              <h3 className="text-base font-semibold text-slate-900">
                {item.title}
              </h3>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                {item.answer}
              </p>
            </article>
          ))}
        </div>
      </PageSection>

      <PageSection
        title="Related guides"
        subtitle="Explore the other product-intent pages connected to NFC contact sharing"
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
