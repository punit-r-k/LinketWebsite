export const ONBOARDING_LIVE_STATUS_EVENT = "linket:onboarding-live-status";
export const ONBOARDING_MILESTONE_NAV_EVENT =
  "linket:onboarding-milestone-nav";

export type OnboardingMilestoneTarget =
  | "profile"
  | "contact"
  | "links"
  | "publish";

export type OnboardingLiveStatusDetail = {
  visible: boolean;
  profileReady: boolean;
  contactReady: boolean;
  linksReady: boolean;
  publishReady: boolean;
};

export const ONBOARDING_MILESTONE_DEFINITIONS: Array<{
  label: string;
  target: OnboardingMilestoneTarget;
  statusKey:
    | "profileReady"
    | "contactReady"
    | "linksReady"
    | "publishReady";
}> = [
  {
    label: "Profile",
    target: "profile",
    statusKey: "profileReady",
  },
  {
    label: "Contact card",
    target: "contact",
    statusKey: "contactReady",
  },
  {
    label: "First link",
    target: "links",
    statusKey: "linksReady",
  },
  {
    label: "Review + publish",
    target: "publish",
    statusKey: "publishReady",
  },
];

export const ONBOARDING_MILESTONE_LABELS = Object.fromEntries(
  ONBOARDING_MILESTONE_DEFINITIONS.map((milestone) => [
    milestone.target,
    milestone.label,
  ])
) as Record<OnboardingMilestoneTarget, string>;

export function buildOnboardingMilestones(status: OnboardingLiveStatusDetail) {
  return ONBOARDING_MILESTONE_DEFINITIONS.map((milestone) => ({
    ...milestone,
    complete: status[milestone.statusKey],
  }));
}
