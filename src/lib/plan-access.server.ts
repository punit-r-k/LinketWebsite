import "server-only";

import { getLinketBundleComplimentaryWindowForUser } from "@/lib/billing/linket-bundle";
import {
  buildDashboardPlanAccess,
  type DashboardPlanAccess,
} from "@/lib/plan-access";
import { createServerSupabaseReadonly } from "@/lib/supabase/server";
import { isSupabaseAdminAvailable, supabaseAdmin } from "@/lib/supabase-admin";

type ActivePaidPeriodRow = {
  id: string;
};

function isMissingRelationError(message: string) {
  const lowered = message.toLowerCase();
  return (
    lowered.includes("does not exist") ||
    lowered.includes("relation") ||
    lowered.includes("schema cache")
  );
}

async function hasActivePaidBillingPeriod(userId: string) {
  const now = new Date().toISOString();

  const execute = async (
    db:
      | typeof supabaseAdmin
      | Awaited<ReturnType<typeof createServerSupabaseReadonly>>
  ) => {
    const { data, error } = await db
      .from("subscription_billing_periods")
      .select("id")
      .eq("provider", "stripe")
      .eq("user_id", userId)
      .eq("status", "paid")
      .lte("period_start", now)
      .gt("period_end", now)
      .limit(1)
      .maybeSingle<ActivePaidPeriodRow | null>();

    if (error) {
      if (isMissingRelationError(error.message)) return false;
      throw new Error(error.message);
    }

    return Boolean(data?.id);
  };

  if (isSupabaseAdminAvailable) {
    return execute(supabaseAdmin);
  }

  const supabase = await createServerSupabaseReadonly();
  return execute(supabase);
}

async function hasAdminAccess(userId: string) {
  const execute = async (
    db:
      | typeof supabaseAdmin
      | Awaited<ReturnType<typeof createServerSupabaseReadonly>>
  ) => {
    const { data, error } = await db
      .from("admin_users")
      .select("user_id")
      .eq("user_id", userId)
      .limit(1);

    if (error) {
      if (isMissingRelationError(error.message)) return false;
      throw new Error(error.message);
    }

    return Array.isArray(data) && data.length > 0;
  };

  if (isSupabaseAdminAvailable) {
    return execute(supabaseAdmin);
  }

  const supabase = await createServerSupabaseReadonly();
  return execute(supabase);
}

async function hasDatabasePaidAccess(userId: string) {
  const execute = async (
    db:
      | typeof supabaseAdmin
      | Awaited<ReturnType<typeof createServerSupabaseReadonly>>
  ) => {
    const { data, error } = await db.rpc("linket_user_has_paid_access", {
      target_user_id: userId,
    });

    if (error) {
      if (isMissingRelationError(error.message)) return false;
      throw new Error(error.message);
    }

    return data === true;
  };

  if (isSupabaseAdminAvailable) {
    return execute(supabaseAdmin);
  }

  const supabase = await createServerSupabaseReadonly();
  return execute(supabase);
}

export async function getDashboardPlanAccessForUser(
  userId: string
): Promise<DashboardPlanAccess> {
  const [isAdmin, complimentaryWindow, hasActivePaidPeriod] = await Promise.all([
    hasAdminAccess(userId),
    getLinketBundleComplimentaryWindowForUser(userId),
    hasActivePaidBillingPeriod(userId),
  ]);

  if (isAdmin || complimentaryWindow.active || hasActivePaidPeriod) {
    return buildDashboardPlanAccess(true);
  }

  return buildDashboardPlanAccess(await hasDatabasePaidAccess(userId));
}
