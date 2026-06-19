# Scaling Changes

Date: 2026-06-18

This file tracks scaling and data-retrieval efficiency changes made during the June 2026 audit remediation pass.

## Changes Made

### Database Indexing And Query Efficiency

- Added `supabase/migrations/20260618000000_security_and_scaling_hardening.sql`.
- Added indexes for active public profile handle lookups, active profile link ordering, lead-form public lookup paths, lead response stats, lead dashboard queries, conversion event analytics, tag-event analytics, and optional profile-link click event analytics.

### Signup Path

- Removed the full auth-user scan from `src/app/api/auth/signup/route.ts`. Signup now relies on Supabase `auth.signUp` result handling instead of paging through every user before account creation.

### Analytics And Public Profile Retrieval

- Public lead-form lookup now prefers the server admin client, allowing direct anonymous `lead_forms` table reads to be removed while keeping `/api/lead-forms/public` functional.
- Removed the public profile per-visitor Supabase Realtime subscription. Public profiles now rely on server rendering/cache revalidation and client-side tracking instead of opening a WebSocket for every visitor.
- Parallelized independent public profile data fetches for plan access, signed media URLs, lead-form lookup, and vCard settings.

### Request Processing Efficiency

- Added request body size preflight checks so oversized JSON, telemetry, consult, lead-form, and upload requests are rejected before expensive parsing work when clients provide `Content-Length`.
- Kept stricter caps on high-frequency telemetry routes and larger caps on lead-form submission/upload routes to reduce avoidable CPU and memory pressure without breaking expected workflows.

### Dependency And Build Health

- Refreshed dependency lockfile with `npm audit fix` and installed the patched transitive tree.
- Added a PostCSS override so installs resolve the patched `postcss@8.5.15` instead of Next.js's vulnerable nested `8.4.31` copy.

## Verification

- `npm run lint` passed.
- `npx tsc --noEmit` passed.
- `npm run test:security` passed: 20 tests.
- `npm run check:security:repo` passed.
- `npm audit --audit-level=moderate` passed with 0 vulnerabilities.
- `npm run build` passed with Next.js `16.2.9`.

## Residual Follow-Up

- Apply the Supabase migration and inspect query plans on production-sized data for the public profile, lead dashboard, and analytics views.
- Watch storage-download and lead-form-upload request volume after private bucket migration; signed URL generation moves access through server routes by design.
- Revisit the PostCSS override after the next stable Next.js release that updates its nested PostCSS dependency.
