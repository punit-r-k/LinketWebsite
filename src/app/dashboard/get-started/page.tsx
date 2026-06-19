import { redirect } from "next/navigation";

import DashboardSetupFlow from "@/components/dashboard/DashboardSetupFlow";
import { getDashboardOnboardingState } from "@/lib/dashboard-onboarding";
import { createServerSupabaseReadonly } from "@/lib/supabase/server";

export default async function DashboardGetStartedPage() {
  const supabase = await createServerSupabaseReadonly();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth?view=signin&next=%2Fdashboard");
  }

  const onboardingState = await getDashboardOnboardingState(user.id);

  return <DashboardSetupFlow initialOnboardingState={onboardingState} />;
}
