import { notFound } from "next/navigation";
import type { User } from "@supabase/supabase-js";

import "@/styles/theme/dashboard.css";
import "@/styles/theme/public-profile.css";
import DashboardSetupFlow from "@/components/dashboard/DashboardSetupFlow";
import { DashboardSessionProvider } from "@/components/dashboard/DashboardSessionContext";
import { ThemeProvider } from "@/components/theme/theme-provider";
import type { DashboardOnboardingState } from "@/lib/dashboard-onboarding-types";
import { getDefaultDashboardPlanAccess } from "@/lib/plan-access";
import { normalizeThemeName, type ThemeName } from "@/lib/themes";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const MOCK_USER_ID = "00000000-0000-4000-8000-000000000001";
const DEFAULT_THEME: ThemeName = "forest";

function readFirstParam(
  value: string | string[] | undefined,
  fallback: string
) {
  if (Array.isArray(value)) return value[0] ?? fallback;
  return value ?? fallback;
}

function buildSteps(step: string) {
  switch (step) {
    case "contact":
      return {
        profile: true,
        contact: false,
        links: false,
        publish: false,
        share: false,
      };
    case "links":
      return {
        profile: true,
        contact: true,
        links: false,
        publish: false,
        share: false,
      };
    case "publish":
      return {
        profile: true,
        contact: true,
        links: true,
        publish: false,
        share: false,
      };
    default:
      return {
        profile: false,
        contact: false,
        links: false,
        publish: false,
        share: false,
      };
  }
}

function buildPreviewState(
  step: string,
  theme: ThemeName
): DashboardOnboardingState {
  const steps = buildSteps(step);
  const now = new Date().toISOString();
  const includeLink = step === "links" || step === "publish";

  return {
    userId: MOCK_USER_ID,
    requiresOnboarding: true,
    isLaunchReady: false,
    hasPublished: false,
    hasTestedShare: false,
    dashboardTourSeen: false,
    publishEventCount: 0,
    shareTestCount: 0,
    claimedLinketCount: 0,
    account: {
      displayName: "Jordan Lee",
      avatarPath: null,
      avatarUpdatedAt: null,
    },
    contact: {
      fullName: "Jordan Lee",
      email: step === "profile" ? "" : "jordan@linketconnect.com",
      phone: step === "publish" ? "(555) 123-4567" : "",
      company: step === "publish" ? "Linket Connect" : "",
      title: step === "publish" ? "Founder" : "",
      contactButtonVisible: true,
    },
    activeProfile: {
      id: "preview-profile",
      name: "Jordan Lee",
      handle: step === "profile" ? `user-${MOCK_USER_ID.slice(0, 8)}` : "jordan-lee",
      headline:
        step === "profile"
          ? ""
          : "Helping people share the right next step in one tap.",
      theme,
      links: includeLink
        ? [
            {
              id: "preview-link-1",
              profile_id: "preview-profile",
              user_id: MOCK_USER_ID,
              title: "Book a call",
              url: "https://cal.com/jordan-lee",
              order_index: 0,
              is_active: true,
              is_override: false,
              click_count: 0,
              created_at: now,
              updated_at: now,
            },
          ]
        : [],
      isActive: true,
    },
    steps,
  };
}

export default async function OnboardingPreviewPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  if (process.env.NODE_ENV === "production") {
    notFound();
  }

  const params = await searchParams;
  const step = readFirstParam(params.step, "profile");
  const theme = normalizeThemeName(
    readFirstParam(params.theme, DEFAULT_THEME),
    DEFAULT_THEME
  );
  const initialOnboardingState = buildPreviewState(step, theme);
  const mockUser = {
    id: MOCK_USER_ID,
    email: "jordan@linketconnect.com",
  } as User;

  return (
    <>
      <style>{`
        header[role="banner"],
        footer {
          display: none !important;
        }

        nextjs-portal,
        [data-next-badge-root] {
          display: none !important;
        }

        #main {
          min-height: 100svh;
        }
      `}</style>
      <ThemeProvider
        initial={theme}
        scopeSelector="#dashboard-theme-scope"
        storageKey={null}
      >
        <DashboardSessionProvider
          user={mockUser}
          planAccess={getDefaultDashboardPlanAccess()}
        >
          <div id="dashboard-theme-scope" className="font-dashboard min-h-[100svh] bg-[var(--background)]">
            <DashboardSetupFlow
              initialOnboardingState={initialOnboardingState}
              previewMode
            />
          </div>
        </DashboardSessionProvider>
      </ThemeProvider>
    </>
  );
}
