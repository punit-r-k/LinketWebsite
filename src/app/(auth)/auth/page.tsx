"use client";

import type { FormEvent } from "react";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { Check, Trash2, UserRound } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { toast } from "@/components/system/toaster";
import { trackEvent } from "@/lib/analytics";
import { getSiteOrigin } from "@/lib/site-url";
import { friendlyAuthError } from "@/lib/auth-errors";
import { brand, hasBrandMark } from "@/config/brand";
import {
  getSavedAccounts,
  removeSavedAccount,
  type SavedAccount,
} from "@/lib/saved-accounts";

const DEFAULT_NEXT = "/dashboard";
const PASSWORD_LENGTH_ERROR = "Password must be at least 6 characters.";
const PASSWORD_STRENGTH_ERROR =
  "Use a stronger password: include at least 1 lowercase letter, 1 uppercase letter, 1 number, and 1 symbol.";

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

function getPasswordRequirementStatus(value: string) {
  return (
    {
      minLength: value.length >= 6,
      lowercase: /[a-z]/.test(value),
      uppercase: /[A-Z]/.test(value),
      number: /\d/.test(value),
      symbol: /[^A-Za-z0-9]/.test(value),
    } as const
  );
}

function hasStrongPassword(value: string) {
  const status = getPasswordRequirementStatus(value);
  return Object.values(status).every(Boolean);
}

function addSaveAccountPromptParam(path: string) {
  try {
    const url = new URL(path, "http://localhost");
    url.searchParams.set("saveAccount", "1");
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return `${DEFAULT_NEXT}?saveAccount=1`;
  }
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

function AuthPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextParam = searchParams.get("next");
  const next = useMemo(() => {
    return sanitizeAuthNextPath(nextParam);
  }, [nextParam]);
  const oauthError = searchParams.get("error");
  const oauthMessage = searchParams.get("message");
  const view = searchParams.get("view") ?? "signin";
  const accountParam = searchParams.get("account");
  const isSwitchAccountFlow = searchParams.get("switch") === "1";
  const supabase = useMemo(() => createClient(), []);
  const siteUrl = getSiteOrigin();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAccounts, setSavedAccounts] = useState<SavedAccount[]>([]);
  const isSignUp = view === "signup";

  useEffect(() => {
    setSavedAccounts(getSavedAccounts());
  }, []);

  useEffect(() => {
    if (!accountParam || email) return;
    setEmail(accountParam);
  }, [accountParam, email]);

  const passwordRequirementStatus = useMemo(
    () => getPasswordRequirementStatus(password),
    [password]
  );
  const passwordStrengthValid = Object.values(passwordRequirementStatus).every(Boolean);
  const passwordChecklistItems = [
    {
      key: "minLength",
      label: "At least 6 characters",
      met: passwordRequirementStatus.minLength,
    },
    {
      key: "lowercase",
      label: "One lowercase letter (a-z)",
      met: passwordRequirementStatus.lowercase,
    },
    {
      key: "uppercase",
      label: "One uppercase letter (A-Z)",
      met: passwordRequirementStatus.uppercase,
    },
    {
      key: "number",
      label: "One number (0-9)",
      met: passwordRequirementStatus.number,
    },
    {
      key: "symbol",
      label: "One symbol (e.g. !@#$)",
      met: passwordRequirementStatus.symbol,
    },
  ] as const;
  const showPasswordStrengthState = isSignUp && password.length > 0;
  const passwordInputBorderClass = showPasswordStrengthState
    ? passwordStrengthValid
      ? "border-emerald-500 focus-visible:border-emerald-600 focus-visible:outline-emerald-600"
      : "border-red-500 focus-visible:border-red-600 focus-visible:outline-red-600"
    : "border-slate-300 focus-visible:border-[color:var(--ring)] focus-visible:outline-[color:var(--ring)]";

  const resolveRedirect = useCallback(
    async (session: unknown): Promise<string | null> => {
      try {
        const response = await fetch("/auth/callback", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ event: "SIGNED_IN", session, next }),
        });
        if (!response.ok) return null;
        const payload = await response.json().catch(() => null);
        if (payload && typeof payload.redirectTo === "string") {
          return payload.redirectTo;
        }
      } catch {
        return null;
      }
      return next || DEFAULT_NEXT;
    },
    [next]
  );

  const handlePasswordSignUp = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const trimmedEmail = email.trim();
      if (!trimmedEmail || !password) {
        setError("Email and password are required.");
        return;
      }

      if (password.length < 6) {
        setError(PASSWORD_LENGTH_ERROR);
        return;
      }
      if (!hasStrongPassword(password)) {
        setError(PASSWORD_STRENGTH_ERROR);
        return;
      }

      void trackEvent("signup_start", { method: "email" });
      setPending(true);
      setError(null);

      try {
        const response = await fetch("/api/auth/signup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: trimmedEmail,
            password,
            next,
          }),
        });
        const payload = (await response.json().catch(() => null)) as
          | { error?: string; requiresEmailConfirmation?: boolean }
          | null;

        if (!response.ok) {
          throw new Error(
            payload?.error || "Unable to create account. Please try again."
          );
        }

        if (payload?.requiresEmailConfirmation) {
          toast({
            title: "Check your email",
            description:
              "Confirm your email address, then sign in to open your dashboard.",
            variant: "success",
          });
          setPassword("");
          return;
        }

        const { data, error } = await supabase.auth.signInWithPassword({
          email: trimmedEmail,
          password,
        });
        if (error) throw error;

        const destination = data.session
          ? await resolveRedirect(data.session)
          : next || DEFAULT_NEXT;
        if (!destination) {
          throw new Error("We couldn't complete sign-in. Please try again.");
        }

        toast({
          title: "Account created",
          description: "Your dashboard is ready to manage Linkets.",
          variant: "success",
        });
        router.replace(
          isSwitchAccountFlow
            ? addSaveAccountPromptParam(destination)
            : destination
        );
      } catch (err) {
        const message =
          err instanceof Error
            ? err.message
            : "Unable to create account. Please try again.";
        setError(friendlyAuthError(message, getAuthErrorCode(err)));
      } finally {
        setPending(false);
      }
    },
    [email, isSwitchAccountFlow, password, next, resolveRedirect, router, supabase]
  );

  const handlePasswordSignIn = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!email || !password) {
        setError("Email and password are required.");
        return;
      }

      setPending(true);
      setError(null);

      try {
        const { data, error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) {
          throw error;
        }

        const destination = data.session
          ? await resolveRedirect(data.session)
          : next || DEFAULT_NEXT;
        if (!destination) {
          throw new Error("We couldn't complete sign-in. Please try again.");
        }

        toast({
          title: "Welcome back!",
          description: "Your dashboard is ready to manage Linkets.",
          variant: "success",
        });

        router.replace(
          isSwitchAccountFlow
            ? addSaveAccountPromptParam(destination)
            : destination
        );
      } catch (err) {
        const message =
          err instanceof Error
            ? err.message
            : "Unable to sign in. Please try again.";
        setError(friendlyAuthError(message, getAuthErrorCode(err)));
      } finally {
        setPending(false);
      }
    },
    [email, isSwitchAccountFlow, password, supabase, router, next, resolveRedirect]
  );

  const handleOAuth = useCallback(
    async (provider: "google") => {
      if (view === "signup") {
        void trackEvent("signup_start", { method: provider });
      }
      setPending(true);
      setError(null);

      const callbackUrl = new URL(`${siteUrl}/auth/callback`);
      callbackUrl.searchParams.set("next", next);
      if (isSwitchAccountFlow) {
        callbackUrl.searchParams.set("switch", "1");
      }

      const { data, error } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo: callbackUrl.toString(),
          queryParams:
            provider === "google" ? { prompt: "select_account" } : undefined,
          skipBrowserRedirect: true,
        },
      });

      if (error) {
        setError(friendlyAuthError(error.message, getAuthErrorCode(error)));
        setPending(false);
        return;
      }

      if (!data?.url) {
        setError("Unable to start Google sign-in. Please try again.");
        setPending(false);
        return;
      }

      window.location.assign(data.url);
    },
    [supabase, isSwitchAccountFlow, next, siteUrl, view]
  );

  const displayedError = error
    ? friendlyAuthError(error)
    : oauthMessage
    ? friendlyAuthError(oauthMessage, oauthError ?? undefined)
    : null;
  const forgotPasswordHref = useMemo(() => {
    const trimmedEmail = email.trim();
    if (!trimmedEmail) return "/forgot-password";
    return `/forgot-password?email=${encodeURIComponent(trimmedEmail)}`;
  }, [email]);
  const signInHref = `/auth?next=${encodeURIComponent(next)}&view=signin${
    isSwitchAccountFlow ? "&switch=1" : ""
  }`;
  const signUpHref = `/auth?next=${encodeURIComponent(next)}&view=signup${
    isSwitchAccountFlow ? "&switch=1" : ""
  }`;
  const handleRemoveSavedAccount = useCallback(
    (accountEmail: string) => {
      const nextAccounts = removeSavedAccount(accountEmail);
      setSavedAccounts(nextAccounts);
      if (email.trim().toLowerCase() === accountEmail.trim().toLowerCase()) {
        setEmail("");
        setPassword("");
      }
      toast({
        title: "Account removed",
        description:
          "This device will no longer show that shortcut. Sign in normally to use it again.",
        variant: "success",
      });
    },
    [email]
  );
  const formHeading = isSignUp ? "Start your dashboard" : "Access your dashboard";
  const formDescription = isSignUp
    ? "Use email or Google to create your workspace."
    : "Use your saved account, email, or Google to continue.";

  return (
    <div className="landing-page-shell landing-alt-font min-h-screen overflow-hidden bg-[#fff7ed] text-slate-900">
      <div className="relative z-0 overflow-hidden bg-[#fff7ed]">
        <div className="pointer-events-none absolute inset-0 z-0">
          <div className="absolute inset-0 bg-[#fff7ed]" />
        </div>
        <div
          className="pointer-events-none absolute inset-0 z-[1] hidden overflow-hidden lg:block landing-decoration-fade landing-delay-2"
          aria-hidden
        >
          <div className="landing-ring-float-b absolute -left-24 top-8 h-52 w-52 rounded-full border-[5px] border-[#f8b878]/54 bg-transparent" />
          <div className="landing-ring-float-c absolute left-[12%] top-[5rem] h-12 w-12 rounded-full border-[4px] border-[#f8d058]/60 bg-transparent" />
          <div className="landing-ring-float-a absolute -left-12 top-14 h-32 w-32 rounded-full border-[5px] border-[#f8b878]/72 bg-transparent" />
          <div className="landing-ring-float-a absolute left-[19%] top-[18rem] h-16 w-16 rounded-full border-[4px] border-[#58c0e0]/42 bg-transparent" />
          <div className="landing-ring-float-c absolute -left-8 top-[26rem] h-20 w-20 rounded-full border-[4px] border-[#58c0e0]/38 bg-transparent" />
          <div className="landing-ring-float-b absolute left-[14%] top-[32rem] h-28 w-28 rounded-full border-[4px] border-[#f8b878]/34 bg-transparent" />
          <div className="landing-ring-float-b absolute right-[-5rem] top-10 h-60 w-60 rounded-full border-[5px] border-[#68d8e0]/62 bg-transparent" />
          <div className="landing-ring-float-c absolute right-[4%] top-[7rem] h-12 w-12 rounded-full border-[4px] border-[#68d8e0]/46 bg-transparent" />
          <div className="landing-ring-float-a absolute right-[8%] top-[18rem] h-16 w-16 rounded-full border-[4px] border-[#f8b878]/52 bg-transparent" />
          <div className="landing-ring-float-b absolute right-[-2rem] top-[23rem] h-24 w-24 rounded-full border-[4px] border-[#58c0e0]/34 bg-transparent" />
          <div className="landing-ring-float-c absolute right-[2%] top-[30rem] h-28 w-28 rounded-full border-[4px] border-[#f8d058]/44 bg-transparent" />
          <div className="landing-ring-float-a absolute right-[14%] top-[38rem] h-20 w-20 rounded-full border-[4px] border-[#68d8e0]/48 bg-transparent" />
        </div>

        <section className="relative isolate z-10 mx-auto flex min-h-svh w-full max-w-6xl flex-col items-center justify-center px-4 py-2 text-center sm:px-6 sm:py-6 lg:px-8">
          <div
            className="landing-fade-up landing-delay-1 grid w-full max-w-[24rem] gap-0 rounded-[24px] border border-[#f8ddba]/80 bg-white/90 p-2 text-left text-slate-900 shadow-[0_24px_70px_rgba(248,184,120,0.2)] backdrop-blur sm:max-w-[26rem] sm:rounded-[32px] sm:p-3 sm:shadow-[0_45px_120px_rgba(248,184,120,0.34)]"
          >
            <section
              className="relative rounded-[22px] border border-[#f8edd7] bg-[#fff9f3] p-3.5 sm:p-5"
            >
              <div
                className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full border border-[#f8ddba] bg-white/85 text-xs font-semibold text-slate-900 shadow-[0_8px_20px_rgba(248,184,120,0.18)] sm:right-5 sm:top-5 sm:h-9 sm:w-9"
                aria-hidden="true"
              >
                {hasBrandMark() ? (
                  <Image
                    src={(brand.logomark || brand.logo) ?? ""}
                    alt=""
                    width={20}
                    height={20}
                    className="h-[18px] w-[18px] object-contain sm:h-5 sm:w-5"
                  />
                ) : (
                  <span>{(brand.shortName ?? brand.name).slice(0, 2)}</span>
                )}
              </div>

              <header className="space-y-1.5 pr-10">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                  Secure access
                </p>
                <h2 className="text-lg font-semibold leading-tight text-slate-900 sm:text-2xl">
                  {formHeading}
                </h2>
                <p className="text-sm leading-5 text-slate-600">
                  {formDescription}
                </p>
              </header>

              {displayedError ? (
                <div className="mt-5 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
                  <p>{displayedError}</p>
                </div>
              ) : null}

              {!isSignUp && savedAccounts.length > 0 ? (
                <div className="mt-5 rounded-2xl border border-[#f8ddba] bg-white/80 px-4 py-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">
                    Saved accounts
                  </p>
                  <div className="mt-3 grid gap-2">
                    {savedAccounts.map((account) => (
                      <div
                        key={account.email}
                        className="flex min-w-0 items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 p-1 transition-[background-color,border-color] hover:border-[#f8ddba] hover:bg-white"
                      >
                        <button
                          type="button"
                          onClick={() => {
                            setEmail(account.email);
                            setPassword("");
                            setError(null);
                          }}
                          className="flex min-w-0 flex-1 items-center gap-3 rounded-lg px-2 py-2 text-left text-sm font-medium text-slate-800 transition-colors hover:bg-white focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#58c0e0]"
                        >
                          <UserRound className="h-4 w-4 shrink-0 text-slate-500" />
                          <span className="truncate">{account.email}</span>
                        </button>
                        <button
                          type="button"
                          aria-label={`Remove ${account.email} from saved accounts`}
                          title="Remove saved account"
                          onClick={() => handleRemoveSavedAccount(account.email)}
                          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-red-50 hover:text-red-600 focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-500"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              <form
                onSubmit={isSignUp ? handlePasswordSignUp : handlePasswordSignIn}
                className="mt-4 space-y-3"
              >
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="email" className="text-sm font-medium text-slate-700">
                    Email
                  </label>
                  <input
                    id="email"
                    type="email"
                    value={email}
                    autoComplete="email"
                    onChange={(event) => setEmail(event.target.value)}
                    className="w-full rounded-2xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-500 focus:outline-none focus-visible:border-[#58c0e0] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#58c0e0] focus-visible:ring-0"
                    placeholder="you@example.com"
                    required
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label htmlFor="password" className="text-sm font-medium text-slate-700">
                    Password
                  </label>
                  <input
                    id="password"
                    type="password"
                    value={password}
                    autoComplete={isSignUp ? "new-password" : "current-password"}
                    onChange={(event) => {
                      const nextPassword = event.target.value;
                      setPassword(nextPassword);
                      if (
                        isSignUp &&
                        (error === PASSWORD_STRENGTH_ERROR ||
                          error === PASSWORD_LENGTH_ERROR)
                      ) {
                        setError(null);
                      }
                    }}
                    className={`w-full rounded-2xl border bg-white px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-500 focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:ring-0 ${passwordInputBorderClass}`}
                    placeholder={
                      isSignUp
                        ? "Create a password (6+ characters)"
                        : "Enter your password"
                    }
                    style={{ minHeight: "42px" }}
                    required
                  />
                  {isSignUp && (
                    <ul className="mt-2 space-y-1.5 rounded-2xl border border-slate-200 bg-white/70 px-3 py-2.5">
                      {passwordChecklistItems.map((item) => (
                        <li
                          key={item.key}
                          className={`flex items-center gap-2 text-xs ${item.met ? "text-emerald-700" : "text-slate-500"}`}
                        >
                          <span
                            className={`flex h-4 w-4 items-center justify-center rounded-full border ${item.met ? "border-emerald-500 bg-emerald-500 text-white" : "border-slate-300 text-transparent"}`}
                            aria-hidden="true"
                          >
                            <Check className="h-3 w-3" />
                          </span>
                          <span
                            className={item.met ? "line-through decoration-emerald-500/70" : ""}
                          >
                            {item.label}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={pending}
                  className="button-landing-primary inline-flex w-full items-center justify-center rounded-full border px-4 py-2.5 text-sm font-semibold transition-[transform,box-shadow,background] duration-200 hover:-translate-y-0.5 active:scale-[0.985] disabled:cursor-not-allowed disabled:translate-y-0 disabled:opacity-70 disabled:shadow-none"
                >
                  {pending
                    ? isSignUp
                      ? "Creating account..."
                      : "Signing in..."
                    : isSignUp
                    ? "Create account"
                    : "Sign in with email"}
                </button>

                {!isSignUp && (
                  <div className="flex justify-end">
                    <Link
                      href={forgotPasswordHref}
                      className="text-sm font-medium text-slate-600 transition-colors hover:text-slate-900"
                    >
                      Forgot password?
                    </Link>
                  </div>
                )}
              </form>

              <div className="mt-4 space-y-2.5">
                <div className="flex items-center gap-3 text-xs uppercase tracking-[0.2em] text-slate-500">
                  <span className="h-px flex-1 bg-[#f8ddba]" />
                  <span>or continue with</span>
                  <span className="h-px flex-1 bg-[#f8ddba]" />
                </div>

                <div className="flex justify-center">
                  <button
                    type="button"
                    onClick={() => handleOAuth("google")}
                    disabled={pending}
                    className="button-landing-secondary inline-flex w-full items-center justify-center gap-3 rounded-full border px-3.5 py-2.5 text-sm font-semibold transition-[transform,box-shadow,background,color] duration-200 hover:-translate-y-0.5 active:scale-[0.985] disabled:cursor-not-allowed disabled:translate-y-0 disabled:opacity-70 disabled:shadow-none"
                  >
                    <svg className="h-5 w-5" viewBox="0 0 24 24">
                      <path
                        fill="#4285F4"
                        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                      />
                      <path
                        fill="#34A853"
                        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                      />
                      <path
                        fill="#FBBC05"
                        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                      />
                      <path
                        fill="#EA4335"
                        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                      />
                    </svg>
                    <span>Continue with Google</span>
                  </button>
                </div>
              </div>

              {isSignUp ? (
                <p className="mt-4 text-center text-sm text-slate-600">
                  Already have an account?{" "}
                  <Link
                    href={signInHref}
                    className="font-semibold text-slate-900 transition-colors hover:text-slate-700"
                  >
                    Sign in
                  </Link>
                </p>
              ) : (
                <p className="mt-4 text-center text-sm text-slate-600">
                  New to Linket?{" "}
                  <Link
                    href={signUpHref}
                    className="font-semibold text-slate-900 transition-colors hover:text-slate-700"
                  >
                    Create an account
                  </Link>
                </p>
              )}
            </section>

          </div>
        </section>
      </div>
    </div>
  );
}

function AuthPageFallback() {
  return (
    <div className="landing-page-shell landing-alt-font min-h-screen overflow-hidden bg-[#fff7ed] text-slate-900">
      <div className="relative z-0 overflow-hidden bg-[#fff7ed]">
        <div className="pointer-events-none absolute inset-0 z-0">
          <div className="absolute inset-0 bg-[#fff7ed]" />
        </div>
        <section className="relative isolate z-10 mx-auto flex min-h-screen w-full max-w-6xl flex-col items-center px-4 py-8 text-center sm:px-6 sm:py-12 lg:px-8">
          <div className="landing-fade-up landing-delay-1 w-full rounded-[24px] border border-[#f8ddba]/80 bg-white/90 p-6 text-left text-slate-900 shadow-[0_24px_70px_rgba(248,184,120,0.2)] backdrop-blur sm:rounded-[32px] sm:shadow-[0_45px_120px_rgba(248,184,120,0.34)]">
            <div className="h-3 w-36 rounded-full bg-[#f8ddba]/70" />
            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              <div className="h-28 rounded-2xl border border-[#f8edd7] bg-[#fff9f3]" />
              <div className="hidden h-28 rounded-2xl border border-slate-200 bg-[#fff7ef] sm:block" />
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

export default function AuthPage() {
  return (
    <Suspense fallback={<AuthPageFallback />}>
      <AuthPageContent />
    </Suspense>
  );
}
