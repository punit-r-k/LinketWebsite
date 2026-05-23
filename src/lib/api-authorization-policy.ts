export type PrivilegedRouteId =
  | "DELETE /api/linket-profiles/[id]"
  | "GET /api/account/handle"
  | "GET /api/admin/linkets/complimentary-grant"
  | "GET /api/admin/mint/batch/[batchId]"
  | "GET /api/admin/mint/master-log"
  | "GET /api/admin/mint/next-batch"
  | "GET /api/admin/notifications"
  | "GET /api/analytics/supabase"
  | "GET /api/billing/bundle-checkout"
  | "GET /api/billing/bundle-session-status"
  | "GET /api/billing/portal"
  | "GET /api/billing/subscribe"
  | "GET /api/dashboard/notifications"
  | "GET /api/lead-forms"
  | "GET /api/lead-forms/responses"
  | "GET /api/linket-profiles"
  | "GET /api/linkets"
  | "GET /api/linkets/transfers/[token]"
  | "GET /api/me"
  | "GET /api/vcard/profile"
  | "PATCH /api/admin/linkets/complimentary-grant"
  | "PATCH /api/admin/notifications"
  | "PATCH /api/linkets/[id]"
  | "POST /api/account/delete"
  | "POST /api/admin/linkets/complimentary-grant"
  | "POST /api/admin/mint"
  | "POST /api/admin/notifications"
  | "POST /api/billing/bundle-checkout"
  | "POST /api/billing/payment-method/default"
  | "POST /api/billing/payment-method/remove"
  | "POST /api/billing/portal"
  | "POST /api/billing/setup-intent"
  | "POST /api/billing/subscribe"
  | "POST /api/billing/subscription/cancel"
  | "POST /api/dashboard/notifications"
  | "POST /api/linket-profiles/[id]/activate"
  | "POST /api/linket-profiles"
  | "POST /api/linkets/claim"
  | "POST /api/linkets/complimentary-trial"
  | "POST /api/linkets/transfers"
  | "POST /api/linkets/transfers/[token]/accept"
  | "POST /api/vcard/profile"
  | "PUT /api/lead-forms";

export type RouteAccessPolicy = "admin" | "authenticated" | "self";
export type ActorRole = "admin" | "anonymous" | "user";

export const PRIVILEGED_ROUTE_POLICIES: Record<
  PrivilegedRouteId,
  RouteAccessPolicy
> = {
  "DELETE /api/linket-profiles/[id]": "self",
  "GET /api/account/handle": "self",
  "GET /api/admin/linkets/complimentary-grant": "admin",
  "GET /api/admin/mint/batch/[batchId]": "admin",
  "GET /api/admin/mint/master-log": "admin",
  "GET /api/admin/mint/next-batch": "admin",
  "GET /api/admin/notifications": "admin",
  "GET /api/analytics/supabase": "self",
  "GET /api/billing/bundle-checkout": "authenticated",
  "GET /api/billing/bundle-session-status": "authenticated",
  "GET /api/billing/portal": "authenticated",
  "GET /api/billing/subscribe": "authenticated",
  "GET /api/dashboard/notifications": "authenticated",
  "GET /api/lead-forms": "self",
  "GET /api/lead-forms/responses": "self",
  "GET /api/linket-profiles": "self",
  "GET /api/linkets": "authenticated",
  "GET /api/linkets/transfers/[token]": "authenticated",
  "GET /api/me": "authenticated",
  "GET /api/vcard/profile": "self",
  "PATCH /api/admin/linkets/complimentary-grant": "admin",
  "PATCH /api/admin/notifications": "admin",
  "PATCH /api/linkets/[id]": "authenticated",
  "POST /api/account/delete": "authenticated",
  "POST /api/admin/linkets/complimentary-grant": "admin",
  "POST /api/admin/mint": "admin",
  "POST /api/admin/notifications": "admin",
  "POST /api/billing/bundle-checkout": "authenticated",
  "POST /api/billing/payment-method/default": "authenticated",
  "POST /api/billing/payment-method/remove": "authenticated",
  "POST /api/billing/portal": "authenticated",
  "POST /api/billing/setup-intent": "authenticated",
  "POST /api/billing/subscribe": "authenticated",
  "POST /api/billing/subscription/cancel": "authenticated",
  "POST /api/dashboard/notifications": "authenticated",
  "POST /api/linket-profiles/[id]/activate": "self",
  "POST /api/linket-profiles": "self",
  "POST /api/linkets/claim": "authenticated",
  "POST /api/linkets/complimentary-trial": "authenticated",
  "POST /api/linkets/transfers": "authenticated",
  "POST /api/linkets/transfers/[token]/accept": "authenticated",
  "POST /api/vcard/profile": "self",
  "PUT /api/lead-forms": "self",
};

const ROLE_ALLOWLIST: Record<ActorRole, readonly PrivilegedRouteId[]> = {
  anonymous: [],
  user: Object.entries(PRIVILEGED_ROUTE_POLICIES)
    .filter(([, policy]) => policy !== "admin")
    .map(([routeId]) => routeId as PrivilegedRouteId),
  admin: Object.keys(PRIVILEGED_ROUTE_POLICIES) as PrivilegedRouteId[],
};

export type RouteAccessDecision = {
  allowed: boolean;
  policy: RouteAccessPolicy;
  role: ActorRole;
  status: 200 | 401 | 403;
};

export function evaluateRouteAccess(args: {
  actorRole: ActorRole;
  actorUserId?: string | null;
  resourceUserId?: string | null;
  routeId: PrivilegedRouteId;
}): RouteAccessDecision {
  const policy = PRIVILEGED_ROUTE_POLICIES[args.routeId];
  const allowedRoutes = new Set(ROLE_ALLOWLIST[args.actorRole]);

  if (!allowedRoutes.has(args.routeId)) {
    return {
      allowed: false,
      policy,
      role: args.actorRole,
      status: args.actorRole === "anonymous" ? 401 : 403,
    };
  }

  if (
    policy === "self" &&
    (!args.actorUserId ||
      !args.resourceUserId ||
      args.actorUserId !== args.resourceUserId)
  ) {
    return {
      allowed: false,
      policy,
      role: args.actorRole,
      status: args.actorRole === "anonymous" ? 401 : 403,
    };
  }

  return {
    allowed: true,
    policy,
    role: args.actorRole,
    status: 200,
  };
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function routePathToRegex(pathname: string) {
  const escaped = escapeRegex(pathname).replace(
    /\\\[[^/]+?\\\]/g,
    "[^/]+"
  );
  return new RegExp(`^${escaped}$`);
}

export function matchPrivilegedRouteId(
  method: string,
  pathname: string
): PrivilegedRouteId | null {
  const normalizedMethod = method.trim().toUpperCase();
  for (const routeId of Object.keys(PRIVILEGED_ROUTE_POLICIES) as PrivilegedRouteId[]) {
    const firstSpace = routeId.indexOf(" ");
    const routeMethod = routeId.slice(0, firstSpace);
    const routePath = routeId.slice(firstSpace + 1);
    if (routeMethod !== normalizedMethod) {
      continue;
    }
    if (routePathToRegex(routePath).test(pathname)) {
      return routeId;
    }
  }
  return null;
}
