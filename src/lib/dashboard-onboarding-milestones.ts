export const ONBOARDING_LIVE_STATUS_EVENT = "linket:onboarding-live-status";
export const ONBOARDING_MILESTONE_NAV_EVENT =
  "linket:onboarding-milestone-nav";

export type OnboardingMilestoneTarget = "live" | "contact" | "links" | "publish";

export type OnboardingLiveStatusDetail = {
  visible: boolean;
  contactReady: boolean;
  linksReady: boolean;
};

export const ONBOARDING_MILESTONE_DEFINITIONS: Array<{
  label: string;
  target: OnboardingMilestoneTarget;
  completedByDefault?: boolean;
  statusKey?: "contactReady" | "linksReady";
}> = [
  {
    label: "Live",
    target: "live",
    completedByDefault: true,
  },
  {
    label: "Contact card added",
    target: "contact",
    statusKey: "contactReady",
  },
  {
    label: "First link active",
    target: "links",
    statusKey: "linksReady",
  },
  {
    label: "QR ready",
    target: "publish",
    completedByDefault: true,
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
    complete: milestone.completedByDefault
      ? true
      : milestone.statusKey
        ? status[milestone.statusKey]
        : false,
  }));
}
