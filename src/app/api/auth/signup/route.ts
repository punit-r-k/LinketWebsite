import { NextResponse } from "next/server";
import { z } from "zod";

import {
  DUPLICATE_ACCOUNT_ERROR,
  friendlyAuthError,
} from "@/lib/auth-errors";
import { limitRequest } from "@/lib/rate-limit";
import { validateJsonBody } from "@/lib/request-validation";
import { supabaseAdmin, isSupabaseAdminAvailable } from "@/lib/supabase-admin";

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

async function doesAuthUserExist(email: string) {
  const targetEmail = email.trim().toLowerCase();
  let page = 1;

  while (true) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({
      page,
      perPage: 1000,
    });

    if (error) {
      throw new Error(error.message);
    }

    const users = data?.users ?? [];
    if (
      users.some((user) => user.email?.trim().toLowerCase() === targetEmail)
    ) {
      return true;
    }

    if (!data?.nextPage || users.length === 0) {
      return false;
    }

    page = data.nextPage;
  }
}

export async function POST(request: Request) {
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

  if (!isSupabaseAdminAvailable) {
    return NextResponse.json(
      { error: "Account creation is not configured." },
      { status: 500 }
    );
  }

  try {
    const existingUser = await doesAuthUserExist(email);
    if (existingUser) {
      return NextResponse.json(
        { error: DUPLICATE_ACCOUNT_ERROR },
        { status: 409 }
      );
    }

    const { error } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });

    if (error) {
      const message = friendlyAuthError(error.message, getAuthErrorCode(error));
      return NextResponse.json(
        { error: message },
        { status: message === DUPLICATE_ACCOUNT_ERROR ? 409 : 400 }
      );
    }

    return NextResponse.json({
      ok: true,
      next,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to create account.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
