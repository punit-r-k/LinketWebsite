import type { Metadata } from "next";

import {
  LegalBulletList,
  LegalCallout,
  LegalCardGrid,
  LegalPage,
  LegalSection,
  LegalStepList,
} from "@/components/site/legal-page";

export const metadata: Metadata = {
  title: "Privacy",
  description: "Learn how Linket Connect collects, uses, and protects your data.",
};

const PRIVACY_STATS = [
  {
    label: "Applies To",
    value: "Accounts, profiles, and lead forms",
    detail:
      "This page covers the information used to run your Linket account, public profile, and any lead capture flows you enable.",
  },
  {
    label: "Your Control",
    value: "Export, update, or delete",
    detail:
      "You can request data changes or removal whenever you need your records updated or your account closed.",
  },
  {
    label: "Questions",
    value: "privacy@linketconnect.com",
    detail:
      "Reach out directly if you need clarification about how your information is handled.",
  },
] as const;

const PRIVACY_FACTS = [
  { label: "Support", value: "privacy@linketconnect.com", href: "mailto:privacy@linketconnect.com" },
  { label: "Includes", value: "Profile analytics, contact save, lead capture" },
  { label: "Audience", value: "Customers, profile visitors, and form submitters" },
] as const;

const COLLECTION_AREAS = [
  {
    eyebrow: "Account",
    title: "Identity and login information",
    description:
      "We use details like your name, email, and organization to create your account, authenticate access, and support your team.",
  },
  {
    eyebrow: "Profile",
    title: "Content you choose to publish",
    description:
      "Your public profile may include a display name, headline, links, media, branding, and other information you actively add to your page.",
  },
  {
    eyebrow: "Usage",
    title: "Operational and analytics data",
    description:
      "When Linket is used, we record signals such as taps, scans, link clicks, onboarding progress, and lead form submissions so the product can function and report activity.",
  },
] as const;

const USE_CASES = [
  "Operate the core product, including public profiles, QR and NFC routing, contact saving, and lead capture.",
  "Show analytics dashboards so you can understand visits, scans, clicks, and follow-up activity.",
  "Respond to support questions, account requests, and reliability issues.",
  "Improve the product by identifying broken flows, onboarding drop-off points, performance issues, and frequently used features.",
  "Protect the service, investigate misuse, and comply with legal or safety obligations when necessary.",
] as const;

const SHARING_SCENARIOS = [
  {
    eyebrow: "Service providers",
    title: "Infrastructure and operations",
    description:
      "We may rely on vendors that help with hosting, authentication, storage, email delivery, or payments so Linket can run reliably.",
  },
  {
    eyebrow: "Your workflow",
    title: "Lead delivery to you",
    description:
      "When a visitor submits a form to your Linket page, that information is delivered to your account so you can review and act on it.",
  },
  {
    eyebrow: "Legal or safety",
    title: "Required disclosures",
    description:
      "Information may be disclosed when we are required to respond to lawful requests, protect users, or investigate abuse of the service.",
  },
] as const;

const CONTROL_STEPS = [
  "Review and update the information on your public profile directly from your dashboard whenever your role, links, or branding changes.",
  "Contact the Linket team if you need account-level corrections, access help, or assistance with information tied to a specific lead or profile.",
  "Request export or deletion if you no longer want us to retain your account information, subject to any records we must keep for legal or operational reasons.",
  "If you manage a team, limit access to the people who need it and remove access promptly when responsibilities change.",
] as const;

export default function PrivacyPage() {
  return (
    <LegalPage
      currentPath="/privacy"
      title="Privacy policy"
      subtitle="A straightforward explanation of what information Linket uses, why we use it, and how you can stay in control."
      summary="Linket needs a focused set of account, profile, analytics, and lead-form data to run the product well. We use that information to operate your account, deliver your public page, show performance insights, and support the people using the platform."
      lastUpdated="April 22, 2026"
      supportLabel="Email privacy team"
      supportHref="mailto:privacy@linketconnect.com"
      heroStats={PRIVACY_STATS}
      facts={PRIVACY_FACTS}
    >
      <LegalSection
        title="Information we collect"
        subtitle="We keep this centered on the information needed to operate Linket accounts, public profiles, and lead capture."
      >
        <LegalCardGrid items={COLLECTION_AREAS} columns="three" />
      </LegalSection>

      <LegalSection
        title="How we use information"
        subtitle="The purpose is operational: power the product, keep it usable, and help customers understand results."
      >
        <LegalBulletList items={USE_CASES} />
      </LegalSection>

      <LegalSection
        title="When information is shared"
        subtitle="Sharing is limited to the cases where it is necessary to deliver the service, support your workflows, or respond to legal or safety requirements."
      >
        <LegalCardGrid items={SHARING_SCENARIOS} columns="three" />
      </LegalSection>

      <LegalSection
        title="Your controls"
        subtitle="If you need data changed, exported, or removed, there is a clear path."
      >
        <LegalStepList items={CONTROL_STEPS} />
      </LegalSection>

      <LegalSection title="Questions and requests">
        <LegalCallout
          title="Need clarification about privacy?"
          description="Email privacy@linketconnect.com with the relevant page, account, or issue so we can answer the right question quickly."
          href="mailto:privacy@linketconnect.com"
          actionLabel="Contact privacy"
        />
      </LegalSection>
    </LegalPage>
  );
}
