"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2, LockKeyhole } from "lucide-react";

import { toast } from "@/components/system/toaster";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { friendlyAuthError } from "@/lib/auth-errors";
import { createPasswordResetClient } from "@/lib/password-reset-auth";
import {
  clearPasswordResetSession,
  clearPasswordResetVerification,
  readPasswordResetSession,
  readPasswordResetVerification,
  writePasswordResetEmail,
} from "@/lib/password-reset-email";

const PASSWORD_LENGTH_ERROR = "Password must be at least 6 characters.";
const PASSWORD_STRENGTH_ERROR =
  "Use a stronger password: include at least 1 lowercase letter, 1 uppercase letter, 1 number, and 1 symbol.";

function getPasswordRequirementStatus(value: string) {
  return {
    minLength: value.length >= 6,
    lowercase: /[a-z]/.test(value),
    uppercase: /[A-Z]/.test(value),
    number: /\d/.test(value),
    symbol: /[^A-Za-z0-9]/.test(value),
  } as const;
}

function hasStrongPassword(value: string) {
  const status = getPasswordRequirementStatus(value);
  return Object.values(status).every(Boolean);
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

export default function ResetPasswordPage() {
  const router = useRouter();
  const resetAuth = useMemo(() => createPasswordResetClient(), []);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [initializing, setInitializing] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [ready, setReady] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [accountEmail, setAccountEmail] = useState("");

  const handleRequestNewResetCode = useCallback(() => {
    writePasswordResetEmail(accountEmail);
    clearPasswordResetVerification();
    clearPasswordResetSession();
    router.push(
      accountEmail
        ? `/forgot-password?email=${encodeURIComponent(accountEmail)}`
        : "/forgot-password"
    );
  }, [accountEmail, router]);

  useEffect(() => {
    let active = true;

    const initializeRecovery = async () => {
      setInitializing(true);
      setError(null);

      try {
        const verificationState = readPasswordResetVerification();
        const resetSession = readPasswordResetSession();
        if (!verificationState || !resetSession) {
          throw new Error(
            "Your reset code has expired or was not confirmed in this tab. Request a new code and try again."
          );
        }

        const { error: sessionError } = await resetAuth.auth.setSession({
          access_token: resetSession.accessToken,
          refresh_token: resetSession.refreshToken,
        });
        if (sessionError) throw sessionError;

        const {
          data: { user },
          error: userError,
        } = await resetAuth.auth.getUser();
        if (userError) throw userError;

        const resolvedEmail = user?.email?.trim() ?? "";
        if (!resolvedEmail) {
          throw new Error(
            "We couldn't verify which account this code belongs to. Request a new code and try again."
          );
        }

        if (
          resolvedEmail.toLowerCase() !== verificationState.email.toLowerCase()
        ) {
          throw new Error(
            "This browser session does not match the account you just verified. Request a new code and try again."
          );
        }

        if (resolvedEmail.toLowerCase() !== resetSession.email.toLowerCase()) {
          throw new Error(
            "This reset session no longer matches the verified account. Request a new code and try again."
          );
        }

        if (!active) return;
        setReady(true);
        setAccountEmail(resolvedEmail);
        writePasswordResetEmail(resolvedEmail);
      } catch (err) {
        if (!active) return;
        const message =
          err instanceof Error
            ? err.message
            : "We couldn't verify this reset code. Request a new one and try again.";
        setError(friendlyAuthError(message, getAuthErrorCode(err)));
        setReady(false);
      } finally {
        if (active) {
          setInitializing(false);
        }
      }
    };

    void initializeRecovery();

    return () => {
      active = false;
    };
  }, [resetAuth.auth]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (!password) {
      setError("Enter a new password.");
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

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setSubmitting(true);

    try {
      const { error: updateError } = await resetAuth.auth.updateUser({
        password,
      });
      if (updateError) throw updateError;

      clearPasswordResetVerification();
      clearPasswordResetSession();
      await resetAuth.auth.signOut({ scope: "local" });
      setSuccess(true);
      toast({
        title: "Password updated",
        description: "Sign in with your new password.",
        variant: "success",
      });
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : "Unable to update your password. Please try again.";
      const description = friendlyAuthError(message, getAuthErrorCode(err));
      setError(description);
      toast({
        title: "Couldn't update password",
        description,
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  }

  const passwordRequirementStatus = useMemo(
    () => getPasswordRequirementStatus(password),
    [password]
  );

  if (success) {
    return (
      <section className="flex min-h-screen items-center justify-center bg-[#fff7ed] px-4 py-16">
        <Card className="w-full max-w-md border border-foreground/10 bg-card shadow-[var(--shadow-grounded-lg)]">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-green-100">
              <CheckCircle2 className="h-6 w-6 text-green-600" />
            </div>
            <CardTitle className="text-2xl">Password updated</CardTitle>
            <CardDescription>
              {accountEmail
                ? `Your password for ${accountEmail} has been reset successfully. Sign in with your new password to continue.`
                : "Your password has been reset successfully. Sign in with your new password to continue."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button
              className="w-full rounded-full"
              onClick={() => router.replace("/auth?view=signin")}
            >
              Go to sign in
            </Button>
          </CardContent>
        </Card>
      </section>
    );
  }

  return (
    <section className="flex min-h-screen items-center justify-center bg-[#fff7ed] px-4 py-16">
      <Card className="w-full max-w-md border border-foreground/10 bg-card shadow-[var(--shadow-grounded-lg)]">
        <CardHeader className="space-y-1">
          <div className="mb-2 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-900 text-white">
              <LockKeyhole className="h-5 w-5" aria-hidden />
            </div>
            <div>
              <CardTitle className="text-2xl font-semibold text-foreground">
                Reset your password
              </CardTitle>
            </div>
          </div>
          <CardDescription>
            {accountEmail
              ? `Choose a new password for ${accountEmail}. Once saved, use it the next time you sign in.`
              : "Choose a new password for your account. Once saved, use it the next time you sign in."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {initializing ? (
            <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white/80 px-4 py-3 text-sm text-slate-600">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              Verifying your reset code...
            </div>
          ) : null}

          {error ? (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
              <p>{error}</p>
              {!ready ? (
                <div className="mt-3">
                  <button
                    type="button"
                    onClick={handleRequestNewResetCode}
                    className="font-medium text-red-700 underline underline-offset-4"
                  >
                    Request a new reset code
                  </button>
                </div>
              ) : null}
            </div>
          ) : null}

          {ready ? (
            <form className="space-y-5" onSubmit={handleSubmit} noValidate>
              <div className="space-y-2">
                <Label htmlFor="password">New password</Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  autoComplete="new-password"
                  placeholder="Create a new password"
                  disabled={submitting}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirmPassword">Confirm new password</Label>
                <Input
                  id="confirmPassword"
                  type="password"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  autoComplete="new-password"
                  placeholder="Re-enter your new password"
                  disabled={submitting}
                  required
                />
              </div>

              <ul className="space-y-2 rounded-2xl border border-slate-200 bg-slate-50/70 px-3 py-3">
                <li
                  className={`text-xs ${passwordRequirementStatus.minLength ? "text-emerald-700" : "text-slate-500"}`}
                >
                  At least 6 characters
                </li>
                <li
                  className={`text-xs ${passwordRequirementStatus.lowercase ? "text-emerald-700" : "text-slate-500"}`}
                >
                  One lowercase letter
                </li>
                <li
                  className={`text-xs ${passwordRequirementStatus.uppercase ? "text-emerald-700" : "text-slate-500"}`}
                >
                  One uppercase letter
                </li>
                <li
                  className={`text-xs ${passwordRequirementStatus.number ? "text-emerald-700" : "text-slate-500"}`}
                >
                  One number
                </li>
                <li
                  className={`text-xs ${passwordRequirementStatus.symbol ? "text-emerald-700" : "text-slate-500"}`}
                >
                  One symbol
                </li>
              </ul>

              <Button
                type="submit"
                className="w-full rounded-full"
                disabled={submitting}
              >
                {submitting ? (
                  <span className="inline-flex items-center gap-2 text-sm">
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                    Updating password...
                  </span>
                ) : (
                  "Save new password"
                )}
              </Button>

              <div className="text-center">
                <Link
                  href="/auth?view=signin"
                  className="text-sm font-medium text-blue-600 hover:underline"
                >
                  Back to sign in
                </Link>
              </div>
            </form>
          ) : null}
        </CardContent>
      </Card>
    </section>
  );
}
