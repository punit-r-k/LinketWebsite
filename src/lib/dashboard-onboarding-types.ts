import type { ProfileWithLinks } from "@/lib/profile-service";
import type { ThemeName } from "@/lib/themes";

export type DashboardOnboardingStepStatus = {
  profile: boolean;
  contact: boolean;
  links: boolean;
  publish: boolean;
  share: boolean;
};

export type DashboardOnboardingAccountState = {
  displayName: string | null;
  avatarPath: string | null;
  avatarUpdatedAt: string | null;
};

export type DashboardOnboardingContactState = {
  fullName: string;
  email: string;
  additionalEmails: string[];
  phone: string;
  additionalPhones: string[];
  company: string;
  title: string;
  contactButtonVisible: boolean;
};

export type DashboardOnboardingProfileState = {
  id: string | null;
  name: string;
  handle: string;
  headline: string;
  theme: ThemeName;
  links: ProfileWithLinks["links"];
  isActive: boolean;
};

export type DashboardOnboardingState = {
  userId: string;
  requiresOnboarding: boolean;
  isLaunchReady: boolean;
  hasPublished: boolean;
  hasTestedShare: boolean;
  dashboardTourSeen: boolean;
  publishEventCount: number;
  shareTestCount: number;
  claimedLinketCount: number;
  account: DashboardOnboardingAccountState;
  contact: DashboardOnboardingContactState;
  activeProfile: DashboardOnboardingProfileState;
  steps: DashboardOnboardingStepStatus;
};
