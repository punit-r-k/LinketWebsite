# Security Changes

Date: 2026-06-18

This file tracks security hardening changes made during the June 2026 audit remediation pass.

## Changes Made

### Supabase Access Boundary Hardening

- Added `supabase/migrations/20260618000000_security_and_scaling_hardening.sql`.
- Removed direct anonymous `select` access to `user_profiles`, `profile_links`, `lead_form_settings`, and `lead_forms`; public reads should go through application routes.
- Removed direct anonymous and authenticated inserts into `conversion_events`, `consult_requests`, and `lead_form_responses`; public writes should go through validated, rate-limited server routes.
- Made `lead-form-uploads` and `profile-resumes` private storage buckets and dropped public read policies for sensitive uploaded files.

### Route And Request Hardening

- Added `src/lib/request-security.ts` with a shared `rejectUntrustedWrite` helper that centralizes same-origin/CSRF enforcement for state-changing routes.
- Added shared request body size preflight helpers. JSON routes using `validateJsonBody` now reject oversized or ambiguous request bodies before JSON parsing, and public telemetry/lead-form/upload routes have route-specific limits.
- Applied the trusted-origin guard to account deletion, vCard saves, lead-form saves, resume uploads, Linket claim/update/transfer/trial routes, and profile delete/activate routes.
- Applied the trusted-origin guard to profile saves, signup, public lead-form upload/submit/edit flows, analytics events, consult requests, public link-click tracking, and client error reports.
- Applied origin protection to dashboard notification state updates and admin mutation routes. Stripe webhooks intentionally remain outside this guard and rely on Stripe signature verification.
- Changed signup from service-role `admin.createUser({ email_confirm: true })` to normal Supabase `auth.signUp` with an email callback URL, so account confirmation follows the Supabase project policy instead of force-confirming every new account.
- Updated the auth page to show a confirmation-required success state instead of attempting immediate sign-in when Supabase does not return a session from signup.

### Upload And Download Hardening

- Added database/storage migration support for private lead-form attachments and resume files.
- Added authenticated `GET /api/lead-forms/upload?path=...` handling for lead-form attachments. New lead-form uploads now return app download URLs instead of public Supabase object URLs.
- Changed resume uploads to verify PDF magic bytes and return app download URLs backed by private storage.
- Changed resume downloads to avoid server-fetching arbitrary resume URLs. Active published resume links now resolve private Supabase objects through short-lived signed URLs; direct `path` downloads require owner authentication.
- Public lead-form submissions, lead-form response edits, consult requests, and analytics event storage now use the service-role server client instead of falling back to direct anon table writes.
- Removed the direct anon fallback from `recordConversionEvent`; server-side conversion events now no-op when service-role storage is unavailable.
- Restricted anonymous analytics handle attribution to public profile/share/contact events and capped analytics metadata to 4 KB of JSON-serializable data.

### Dependency Security

- Ran `npm audit fix` and refreshed `package-lock.json`.
- Upgraded vulnerable transitive paths, including the Supabase CLI `tar` path, Supabase realtime `ws` path, `@babel/core`, and `js-yaml`.
- Upgraded the installed Next.js package to `16.2.9`.
- Added a `package.json` override that forces `postcss@8.5.15` across the dependency tree. This is required because current Next.js stable still declares `postcss@8.4.31` internally, which `npm audit` flags.
- Verified `npm audit --audit-level=moderate` reports `found 0 vulnerabilities`.

## Verification

- `npm run lint` passed.
- `npx tsc --noEmit` passed.
- `npm run test:security` passed: 20 tests.
- `npm run check:security:repo` passed.
- `npm audit --audit-level=moderate` passed with 0 vulnerabilities.
- `npm run build` passed with Next.js `16.2.9`.
- Mutation-route coverage scan passed: every state-changing `src/app/api` route has trusted-origin protection or is the Stripe webhook signature endpoint.

## Residual Follow-Up

- Confirm the migration is applied in Supabase before relying on app-only public reads and writes in production.
- Keep the PostCSS override until Next.js ships a stable release that no longer pins the vulnerable nested PostCSS version, then remove the override and rerun `npm audit`.
