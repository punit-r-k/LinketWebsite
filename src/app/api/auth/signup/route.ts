import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import {
  friendlyAuthError,
} from "@/lib/auth-errors";
import { limitRequest } from "@/lib/rate-limit";
import { validateJsonBody } from "@/lib/request-validation";
import { rejectUntrustedWrite } from "@/lib/request-security";
import { getConfiguredSiteOrigin } from "@/lib/site-url";

const DEFAULT_NEXT = "/dashboard";
const PASSWORD_LENGTH_ERROR = "Password must be at least 6 characters.";
const PASSWORD_STRENGTH_ERROR =
  "Use a stronger password: include at least 1 lowercase letter, 1 uppercase letter, 1 number, and 1 symbol.";

const signupSchema = z.object({
  email: z.string().trim().email("Enter a valid email address."),
  password: z.string().min(6, PASSWORD_LENGTH_ERROR),
  next: z.string().nullish(),
});

function sanitizeAuthNextPath(value: string | null | undefined) {
  if (!value) return DEFAULT_NEXT;
  const trimmed = value.trim();
  if (!trimmed) return DEFAULT_NEXT;

  const withLeadingSlash = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  if (withLeadingSlash.startsWith("//")) return DEFAULT_NEXT;
  if (withLeadingSlash.startsWith("/api/")) return DEFAULT_NEXT;

  try {
    const parsed = new URL(withLeadingSlash, "http://localhost");
    if (parsed.pathname.startsWith("/api/")) return DEFAULT_NEXT;
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return DEFAULT_NEXT;
  }
}

function hasStrongPassword(value: string) {
  return (
    value.length >= 6 &&
    /[a-z]/.test(value) &&
    /[A-Z]/.test(value) &&
    /\d/.test(value) &&
    /[^A-Za-z0-9]/.test(value)
  );
}

function getAuthErrorCode(error: unknown): string | undefined {
  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof (error as { code?: unknown }).code === "string"
  ) {
    return (error as { code: string }).code;
  }
  return undefined;
}

function createSignupClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error("Account creation is not configured.");
  }
  return createClient(url, anonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

function buildEmailRedirectTo(next: string) {
  const callbackUrl = new URL("/auth/callback", getConfiguredSiteOrigin());
  callbackUrl.searchParams.set("next", next);
  return callbackUrl.toString();
}

export async function POST(request: NextRequest) {
  const untrusted = rejectUntrustedWrite(request);
  if (untrusted) return untrusted;

  if (await limitRequest(request, "auth-signup", 10, 60_000)) {
    return NextResponse.json(
      { error: "Too many signup attempts. Please wait a minute and try again." },
      { status: 429 }
    );
  }

  const parsed = await validateJsonBody(request, signupSchema);
  if (!parsed.ok) {
    return parsed.response;
  }

  const email = parsed.data.email.trim().toLowerCase();
  const password = parsed.data.password;
  const next = sanitizeAuthNextPath(parsed.data.next);

  if (!hasStrongPassword(password)) {
    return NextResponse.json({ error: PASSWORD_STRENGTH_ERROR }, { status: 400 });
  }

  try {
    const supabase = createSignupClient();
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: buildEmailRedirectTo(next),
      },
    });

    if (error) {
      const message = friendlyAuthError(error.message, getAuthErrorCode(error));
      return NextResponse.json({ error: message }, { status: 400 });
    }

    return NextResponse.json({
      ok: true,
      next,
      requiresEmailConfirmation: !data.session,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to create account.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
