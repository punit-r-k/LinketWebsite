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
  description:
    "Learn how Linket Connect collects, uses, shares, retains, and protects personal information.",
};

const PRIVACY_EMAIL = "privacy@linketconnect.com";
const PRIVACY_MAILTO = `mailto:${PRIVACY_EMAIL}`;
const LAST_UPDATED = "June 2, 2026";

const PRIVACY_STATS = [
  {
    label: "Applies To",
    value: "Accounts, profiles, visitors, and leads",
    detail:
      "This notice covers Linket accounts, hosted public profiles, QR and NFC routing, analytics, support, billing, and lead capture flows.",
  },
  {
    label: "Your Control",
    value: "Access, correct, export, or delete",
    detail:
      "You can update most account and profile data in your dashboard and request help with access, correction, export, deletion, or applicable privacy rights.",
  },
  {
    label: "Privacy Contact",
    value: PRIVACY_EMAIL,
    detail:
      "Use this contact for privacy questions, data requests, opt-out questions, and concerns about a submitted lead form.",
  },
] as const;

const PRIVACY_FACTS = [
  { label: "Contact", value: PRIVACY_EMAIL, href: PRIVACY_MAILTO },
  {
    label: "Covers",
    value: "Profiles, analytics, billing, lead capture, and support",
  },
  {
    label: "Audience",
    value: "Customers, admins, profile visitors, and lead form submitters",
  },
] as const;

const COLLECTION_CATEGORIES = [
  {
    eyebrow: "Identifiers",
    title: "Account and contact details",
    description:
      "Name, email address, phone number, account identifiers, public handle, company or organization, profile URL, and similar details you provide or generate through the service.",
  },
  {
    eyebrow: "Profile content",
    title: "Information you publish",
    description:
      "Display name, headline, biography, links, images, logos, themes, contact card details, lead form settings, and other content you choose to place on a Linket profile.",
  },
  {
    eyebrow: "Lead data",
    title: "Information submitted by visitors",
    description:
      "Lead form submissions may include name, email, phone, company, message, custom field answers, source page, timestamps, follow-up notes, ratings, and workflow status.",
  },
  {
    eyebrow: "Device and usage",
    title: "Operational analytics",
    description:
      "IP-derived request data, browser and device signals, page paths, referrers, QR or NFC routing events, scan events, link clicks, contact-save events, onboarding progress, and error logs.",
  },
  {
    eyebrow: "Commercial records",
    title: "Orders and billing",
    description:
      "Plan status, product orders, Linket claim and transfer records, subscription and entitlement records, payment status, limited payment metadata, and billing support history.",
  },
  {
    eyebrow: "Support and security",
    title: "Communications and safeguards",
    description:
      "Messages you send us, support tickets, administrative actions, security logs, abuse reports, account deletion requests, and records needed to protect the platform.",
  },
] as const;

const COLLECTION_SOURCES = [
  "You provide information directly when you create an account, edit a profile, publish links, configure lead forms, contact support, or buy Linket products.",
  "Visitors provide information when they open a public profile, save contact details, click links, scan QR codes, tap NFC hardware, or submit a lead form.",
  "We collect product and security data automatically from browsers, devices, servers, Supabase, Stripe, email delivery tools, storage providers, and similar service infrastructure.",
  "Account owners and team administrators may provide or configure information about team members, profiles, Linkets, lead forms, and intended recipients.",
] as const;

const USE_CASES = [
  "Create, authenticate, secure, and administer Linket accounts.",
  "Host public profiles, contact cards, QR and NFC routing, Linket claim flows, and link-in-bio pages.",
  "Capture, store, display, export, and deliver lead form submissions to the account owner who configured the form.",
  "Provide analytics for scans, profile visits, link clicks, contact saves, lead submissions, onboarding progress, and platform optimization.",
  "Process orders, subscriptions, entitlements, payment status, warranties, refunds, and customer support requests.",
  "Send transactional messages, security notices, account updates, product updates, and support communications.",
  "Detect abuse, debug errors, prevent fraud, protect users, enforce policies, and comply with law.",
  "Improve product reliability, onboarding, accessibility, performance, and feature design.",
] as const;

const SHARING_SCENARIOS = [
  {
    eyebrow: "Account owners",
    title: "Lead delivery and dashboard access",
    description:
      "If a visitor submits a lead form, the submission is made available to the account owner or authorized workspace users who manage that Linket profile.",
  },
  {
    eyebrow: "Service providers",
    title: "Infrastructure and operations",
    description:
      "We use vendors for hosting, databases, authentication, storage, analytics infrastructure, email, payment processing, security, debugging, and customer support.",
  },
  {
    eyebrow: "Payments",
    title: "Billing processors",
    description:
      "Payment information is processed by payment providers. We receive payment status and limited billing metadata, but we do not store full card numbers.",
  },
  {
    eyebrow: "Legal and safety",
    title: "Required or protective disclosures",
    description:
      "We may disclose information when required by law, legal process, fraud prevention, security investigations, user safety, or to protect our rights and the service.",
  },
  {
    eyebrow: "Business changes",
    title: "Financing, merger, or transfer",
    description:
      "Information may be transferred or reviewed as part of financing, diligence, merger, acquisition, reorganization, bankruptcy, or sale of assets.",
  },
  {
    eyebrow: "Your direction",
    title: "Integrations and exports",
    description:
      "We share or export information when you ask us to, such as copying links, exporting leads, opening billing portals, or connecting future integrations.",
  },
] as const;

const CONTROL_STEPS = [
  "Update your public profile, links, lead form settings, branding, and contact card details from the dashboard.",
  "Use account deletion or contact us to request deletion, correction, access, portability, or help with data tied to your account or a submitted lead form.",
  "If you are a visitor who submitted a lead form, contact the profile owner for their use of your submission and contact us for Linket platform records.",
  "If privacy laws grant you additional rights, email us with enough information to verify and process your request.",
  "Use unsubscribe or contact options where available for non-essential messages. Transactional, security, and service messages may still be sent.",
] as const;

const STATE_PRIVACY_RIGHTS = [
  "Right to know or access the categories and specific pieces of personal information we process, where applicable.",
  "Right to correct inaccurate personal information.",
  "Right to delete personal information, subject to legal, security, billing, fraud-prevention, backup, and operational exceptions.",
  "Right to receive a portable copy of certain personal information.",
  "Right to opt out of sale, sharing, targeted advertising, or certain profiling if those activities apply.",
  "Right not to be discriminated against for exercising applicable privacy rights.",
] as const;

const DATA_RETENTION_ITEMS = [
  "Account, profile, and workspace data is generally kept while your account is active or as needed to provide the service.",
  "Lead data is kept for the account owner until deleted, account closure occurs, or retention is otherwise required for legal, security, backup, or operational reasons.",
  "Billing, order, tax, fraud-prevention, support, and security records may be kept longer where needed for legitimate business or legal purposes.",
  "Analytics and logs may be retained in identifiable, pseudonymous, aggregated, or de-identified form depending on the purpose and system design.",
  "Backups and archival records may persist for a limited period before being overwritten or deleted through normal retention cycles.",
] as const;

const SECURITY_ITEMS = [
  "We use technical and organizational safeguards designed to protect personal information, including access controls, encrypted transport, managed infrastructure, and role-aware administrative access.",
  "No online service can guarantee perfect security. You are responsible for using a strong password, protecting account access, and managing authorized users.",
  "If we determine that a security incident legally requires notice, we will provide notice consistent with applicable law.",
] as const;

const INTERNATIONAL_ITEMS = [
  "Linket is operated from the United States. If you access the service from another country, your information may be processed in the United States or other locations where our service providers operate.",
  "Where laws such as the GDPR or UK GDPR apply, we process personal information based on contract performance, legitimate interests, legal obligations, consent where required, or other applicable legal bases.",
  "Where required, you may have rights to access, rectify, erase, restrict, object, port data, withdraw consent, or complain to a supervisory authority.",
] as const;

const CHILDREN_ITEMS = [
  "Linket is not directed to children under 13 and is intended for business, creator, student, event, and professional networking use.",
  "We do not knowingly collect personal information from children under 13. If you believe a child provided personal information, contact us so we can review and delete it where required.",
] as const;

const SELLING_AND_TRACKING_ITEMS = [
  "We do not sell personal information for money.",
  "We do not knowingly sell or share personal information of people under 16.",
  "We do not use sensitive personal information to infer characteristics.",
  "We do not currently use cross-context behavioral advertising cookies in the product. If that changes, we will update this policy and provide any legally required choices.",
] as const;

const POLICY_CHANGE_ITEMS = [
  "We may update this policy when the product, data practices, vendors, or legal requirements change.",
  "The Last Updated date shows when the current version took effect.",
  "If a change is material, we will provide notice in a reasonable way, such as through the site, dashboard, or email.",
] as const;

export default function PrivacyPage() {
  return (
    <LegalPage
      currentPath="/privacy"
      title="Privacy policy"
      subtitle="How Linket Connect collects, uses, shares, retains, and protects personal information across accounts, public profiles, analytics, billing, and lead capture."
      summary="This policy explains the personal information Linket Connect handles, the purposes for that handling, when information is shared, how long it is kept, and the privacy choices that may be available to you."
      lastUpdated={LAST_UPDATED}
      supportLabel="Email privacy team"
      supportHref={PRIVACY_MAILTO}
      heroStats={PRIVACY_STATS}
      facts={PRIVACY_FACTS}
    >
      <LegalSection
        title="Scope"
        subtitle="This policy applies to Linket Connect websites, dashboards, public profiles, QR and NFC routing, lead forms, analytics, billing workflows, support, and related services."
      >
        <LegalBulletList
          items={[
            "When you manage a Linket account, we process information about you as a customer, account user, team member, or administrator.",
            "When you visit a public Linket profile or submit a lead form, we process information needed to display the page, route the tap or scan, record analytics, and deliver the submission to the profile owner.",
            "If a customer uses Linket to collect leads, that customer may independently control how they use the submitted lead information after receiving it.",
          ]}
        />
      </LegalSection>

      <LegalSection
        title="Information we collect"
        subtitle="The categories below describe the types of personal information we may collect depending on how you use Linket."
      >
        <LegalCardGrid items={COLLECTION_CATEGORIES} columns="three" />
      </LegalSection>

      <LegalSection
        title="Sources of information"
        subtitle="Information comes from account users, public profile visitors, service infrastructure, and configured workflows."
      >
        <LegalBulletList items={COLLECTION_SOURCES} />
      </LegalSection>

      <LegalSection
        title="How we use information"
        subtitle="We use personal information for product operation, analytics, support, safety, compliance, and improvement."
      >
        <LegalBulletList items={USE_CASES} />
      </LegalSection>

      <LegalSection
        title="Analytics and optimization"
        subtitle="Analytics are used to make the product usable and measurable, including where people click and where users stop during onboarding."
      >
        <LegalBulletList
          items={[
            "Customer dashboards may show profile visits, NFC or QR scans, public link clicks, contact-save actions, lead capture activity, and conversion metrics.",
            "Internal product analytics may show feature usage, onboarding steps reached, validation failures, exit points, navigation clicks, performance issues, and error patterns.",
            "We use this information to debug, protect, and improve Linket, including reducing onboarding friction and identifying features that need design or reliability work.",
            "Where practical, we use aggregated or de-identified views for product decisions instead of reviewing individual-level activity.",
          ]}
        />
      </LegalSection>

      <LegalSection
        title="When information is shared"
        subtitle="We share personal information only as needed to provide the service, follow your direction, support legal or safety needs, or operate the business."
      >
        <LegalCardGrid items={SHARING_SCENARIOS} columns="three" />
      </LegalSection>

      <LegalSection
        title="No sale of personal information"
        subtitle="This section explains current sale, sharing, sensitive information, and advertising practices in plain language."
      >
        <LegalBulletList items={SELLING_AND_TRACKING_ITEMS} />
      </LegalSection>

      <LegalSection
        title="Your choices and controls"
        subtitle="You can control much of your account and profile information directly, and you can contact us for privacy requests."
      >
        <LegalStepList items={CONTROL_STEPS} />
      </LegalSection>

      <LegalSection
        title="State privacy rights"
        subtitle="Depending on where you live and whether a privacy law applies to Linket, you may have some or all of these rights."
      >
        <LegalBulletList items={STATE_PRIVACY_RIGHTS} />
        <LegalCallout
          title="Submit a privacy request"
          description={`Email ${PRIVACY_EMAIL} and include your account email, the type of request, and enough information for us to verify the request. Authorized agents should include proof of authorization.`}
          href={PRIVACY_MAILTO}
          actionLabel="Email privacy"
          className="mt-5 border-[#bee7f3] bg-[#f4fcfe]"
        />
      </LegalSection>

      <LegalSection
        title="Retention"
        subtitle="We keep information for as long as needed for the purposes described in this policy unless a shorter or longer period is required by law."
      >
        <LegalBulletList items={DATA_RETENTION_ITEMS} />
      </LegalSection>

      <LegalSection
        title="Security"
        subtitle="We use reasonable safeguards for the nature of the service and data, but no system is risk-free."
      >
        <LegalBulletList items={SECURITY_ITEMS} />
      </LegalSection>

      <LegalSection
        title="International users"
        subtitle="Linket is operated from the United States, and international access may involve cross-border processing."
      >
        <LegalBulletList items={INTERNATIONAL_ITEMS} />
      </LegalSection>

      <LegalSection
        title="Children"
        subtitle="The service is not intended for children."
      >
        <LegalBulletList items={CHILDREN_ITEMS} />
      </LegalSection>

      <LegalSection
        title="Changes to this policy"
        subtitle="Privacy notices should stay accurate as the product and legal requirements change."
      >
        <LegalBulletList items={POLICY_CHANGE_ITEMS} />
      </LegalSection>

      <LegalSection title="Questions and requests">
        <LegalCallout
          title="Need clarification about privacy?"
          description={`Email ${PRIVACY_EMAIL} with the relevant account, public profile, lead form, or request type so we can route it correctly.`}
          href={PRIVACY_MAILTO}
          actionLabel="Contact privacy"
        />
      </LegalSection>
    </LegalPage>
  );
}
