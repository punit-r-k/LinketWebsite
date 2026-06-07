import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { recordConversionEvent } from "@/lib/server-conversion-events";

const FIRST_LOGIN_REDIRECT = "/dashboard/overview";
const RETURNING_LOGIN_REDIRECT = "/dashboard/overview";

function sanitizeNextPath(value: string | null | undefined) {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed.startsWith("/") || trimmed.startsWith("//")) return null;
  if (trimmed.startsWith("/api/")) return null;
  try {
    const parsed = new URL(trimmed, "http://localhost");
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return null;
  }
}

async function resolveRedirectPath(
  supabase: Awaited<ReturnType<typeof createServerSupabase>>,
  preferredNext?: string | null
) {
  const { data } = await supabase.auth.getUser();
  const user = data.user;
  if (!user) return preferredNext || RETURNING_LOGIN_REDIRECT;
  const metadata = (user.user_metadata ?? {}) as Record<string, unknown>;
  const hasOnboarded = Boolean(metadata.linket_onboarded);
  if (!hasOnboarded) {
    await recordConversionEvent({
      eventId: "signup_start",
      userId: user.id,
      eventSource: "server",
      meta: { source: "auth_callback_inferred" },
    });
    await supabase.auth.updateUser({
      data: { ...metadata, linket_onboarded: true },
    });
    await recordConversionEvent({
      eventId: "signup_complete",
      userId: user.id,
      eventSource: "server",
      meta: { source: "auth_callback" },
    });
    return preferredNext || FIRST_LOGIN_REDIRECT;
  }
  return preferredNext || RETURNING_LOGIN_REDIRECT;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const preferredNext = sanitizeNextPath(url.searchParams.get("next"));
  const shouldPromptToSaveAccount = url.searchParams.get("switch") === "1";
  const supabase = await createServerSupabase();

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      url.pathname = "/auth";
      url.searchParams.set("error", "oauth_callback_failed");
      url.searchParams.set("message", error.message);
      return NextResponse.redirect(url);
    }
  } else {
    await supabase.auth.getSession();
  }

  const redirectPath = await resolveRedirectPath(supabase, preferredNext);
  const redirectUrl = new URL(redirectPath, url.origin);
  if (shouldPromptToSaveAccount) {
    redirectUrl.searchParams.set("saveAccount", "1");
  }
  return NextResponse.redirect(redirectUrl);
}

export async function POST(request: Request) {
  const supabase = await createServerSupabase();
  const body = (await request.json().catch(() => null)) as
    | {
        event?: string;
        session?: {
          access_token?: string;
          refresh_token?: string;
        } | null;
        next?: string | null;
      }
    | null;
  const event = body?.event;
  const session = body?.session;
  const preferredNext = sanitizeNextPath(body?.next);

  if (event === "SIGNED_OUT") {
    await supabase.auth.signOut();
    return NextResponse.json({ ok: true });
  }

  if (
    event === "SIGNED_IN" &&
    session?.access_token &&
    session?.refresh_token
  ) {
    const { error } = await supabase.auth.setSession({
      access_token: session.access_token,
      refresh_token: session.refresh_token,
    });
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
  }

  const redirectTo = await resolveRedirectPath(supabase, preferredNext);
  return NextResponse.json({ ok: true, redirectTo });
}
