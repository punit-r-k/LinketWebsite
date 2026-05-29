"use client";

import { Suspense, useEffect, useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import { ArrowLeft, KeyRound, Loader2, Mail } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/components/system/toaster";
import { friendlyAuthError } from "@/lib/auth-errors";
import { createPasswordResetClient } from "@/lib/password-reset-auth";
import {
  clearPasswordResetSession,
  clearPasswordResetVerification,
  readPasswordResetEmail,
  writePasswordResetEmail,
  writePasswordResetSession,
  writePasswordResetVerification,
} from "@/lib/password-reset-email";

const RESEND_COOLDOWN_MS = 60_000;

function formatOtpError(error: unknown) {
  const message =
    error instanceof Error
      ? error.message
      : "Unable to verify that code. Request a new one and try again.";
  const lowerMessage = message.toLowerCase();

  if (
    lowerMessage.includes("expired") ||
    lowerMessage.includes("token") ||
    lowerMessage.includes("otp")
  ) {
    return "That reset code is invalid or expired. Request a new code and try again.";
  }

  return friendlyAuthError(message);
}

function ForgotPasswordPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const resetAuth = useMemo(() => createPasswordResetClient(), []);
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"email" | "code">("email");
  const [loading, setLoading] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState("");
  const [resendAvailableAt, setResendAvailableAt] = useState<number | null>(
    null
  );
  const [resendCountdownNow, setResendCountdownNow] = useState(() => Date.now());

  useEffect(() => {
    const queryEmail = searchParams.get("email")?.trim().toLowerCase() ?? "";
    const storedEmail = readPasswordResetEmail() ?? "";
    const nextEmail = queryEmail || storedEmail;
    if (!nextEmail) return;
    writePasswordResetEmail(nextEmail);
    setEmail((current) => (current.trim() ? current : nextEmail));
  }, [searchParams]);

  const resendSecondsRemaining = useMemo(() => {
    if (!resendAvailableAt) return 0;
    return Math.max(
      0,
      Math.ceil((resendAvailableAt - resendCountdownNow) / 1000)
    );
  }, [resendAvailableAt, resendCountdownNow]);

  useEffect(() => {
    if (!resendAvailableAt) return;

    const interval = window.setInterval(() => {
      if (Date.now() >= resendAvailableAt) {
        setResendAvailableAt(null);
        window.clearInterval(interval);
      } else {
        setResendCountdownNow(Date.now());
      }
    }, 1000);

    return () => window.clearInterval(interval);
  }, [resendAvailableAt]);

  async function sendCode(targetEmail: string) {
    const normalizedEmail = targetEmail.trim().toLowerCase();
    if (!normalizedEmail) {
      setError("Please enter your email address.");
      return false;
    }

    clearPasswordResetVerification();
    clearPasswordResetSession();
    setLoading(true);
    setError("");

    try {
      const { error: otpError } = await resetAuth.auth.signInWithOtp({
        email: normalizedEmail,
        options: {
          shouldCreateUser: false,
        },
      });

      if (otpError) {
        throw otpError;
      }

      writePasswordResetEmail(normalizedEmail);
      setEmail(normalizedEmail);
      setCode("");
      setStep("code");
      setResendAvailableAt(Date.now() + RESEND_COOLDOWN_MS);
      toast({
        title: "Check your email",
        description:
          "If that address matches an account, we sent a 6-digit reset code.",
        variant: "success",
      });
      return true;
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : "Failed to send reset code. Please try again.";
      const description = friendlyAuthError(message);
      setError(description);
      toast({
        title: "Couldn't send code",
        description,
        variant: "destructive",
      });
      return false;
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (step === "email") {
      await sendCode(email);
      return;
    }

    const normalizedEmail = email.trim().toLowerCase();
    const normalizedCode = code.trim();
    if (!normalizedCode) {
      setError("Enter the reset code from your email.");
      return;
    }

    setVerifying(true);
    setError("");

    try {
      const { data, error: verifyError } = await resetAuth.auth.verifyOtp({
        email: normalizedEmail,
        token: normalizedCode,
        type: "email",
      });

      if (verifyError) {
        throw verifyError;
      }

      if (!data.user?.email) {
        throw new Error(
          "We couldn't verify which account this code belongs to. Request a new code and try again."
        );
      }

      const verifiedEmail = data.user.email.trim().toLowerCase();
      const accessToken = data.session?.access_token?.trim() ?? "";
      const refreshToken = data.session?.refresh_token?.trim() ?? "";

      if (!accessToken || !refreshToken) {
        throw new Error(
          "We couldn't establish a secure password reset session. Request a new code and try again."
        );
      }

      writePasswordResetEmail(verifiedEmail);
      writePasswordResetVerification(verifiedEmail);
      writePasswordResetSession({
        accessToken,
        refreshToken,
        email: verifiedEmail,
      });

      toast({
        title: "Code verified",
        description: "Choose a new password for your account.",
        variant: "success",
      });
      router.replace("/reset-password");
    } catch (err) {
      const description = formatOtpError(err);
      setError(description);
      toast({
        title: "Couldn't verify code",
        description,
        variant: "destructive",
      });
    } finally {
      setVerifying(false);
    }
  }

  return (
    <section className="flex min-h-screen items-center justify-center bg-[#fff7ed] px-4 py-16">
      <Card className="w-full max-w-md border border-foreground/10 bg-card shadow-[var(--shadow-grounded-lg)]">
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl font-semibold text-foreground">
            {step === "email" ? "Reset your password" : "Enter reset code"}
          </CardTitle>
          <CardDescription>
            {step === "email"
              ? "Enter your email address and we'll send a 6-digit reset code."
              : `We emailed a 6-digit reset code to ${email || "your address"}. Enter it below to continue to a new password.`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-5" onSubmit={handleSubmit} noValidate>
            {error && (
              <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">
                {error}
              </div>
            )}

            <div className="space-y-2">
              <Label
                htmlFor="email"
                className="text-sm font-medium text-foreground"
              >
                Email address
              </Label>
              <div className="relative">
                <Mail
                  className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                  aria-hidden
                />
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                  }}
                  autoComplete="email"
                  placeholder="you@example.com"
                  className="pl-9"
                  disabled={loading || verifying || step === "code"}
                  required
                />
              </div>
            </div>

            {step === "code" ? (
              <div className="space-y-2">
                <Label
                  htmlFor="resetCode"
                  className="text-sm font-medium text-foreground"
                >
                  Reset code
                </Label>
                <div className="relative">
                  <KeyRound
                    className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                    aria-hidden
                  />
                  <Input
                    id="resetCode"
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    value={code}
                    onChange={(event) =>
                      setCode(event.target.value.replace(/\s+/g, "").slice(0, 6))
                    }
                    placeholder="123456"
                    className="pl-9 tracking-[0.35em]"
                    disabled={loading || verifying}
                    required
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  Check your inbox and spam folder. The code expires automatically.
                </p>
              </div>
            ) : null}

            <Button
              type="submit"
              className="w-full rounded-full"
              disabled={loading || verifying}
            >
              {loading || verifying ? (
                <span className="inline-flex items-center gap-2 text-sm">
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  {step === "email" ? "Sending..." : "Verifying..."}
                </span>
              ) : (
                step === "email" ? "Send reset code" : "Verify code"
              )}
            </Button>

            <div className="flex flex-col items-center gap-3 text-center">
              {step === "code" ? (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      setStep("email");
                      setCode("");
                      setError("");
                    }}
                    className="inline-flex items-center gap-2 text-sm font-medium text-slate-600 hover:text-slate-900"
                  >
                    <ArrowLeft className="h-4 w-4" aria-hidden />
                    Use a different email
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (resendSecondsRemaining > 0 || loading || verifying) {
                        return;
                      }
                      void sendCode(email);
                    }}
                    disabled={resendSecondsRemaining > 0 || loading || verifying}
                    className="text-sm font-medium text-blue-600 hover:underline disabled:cursor-not-allowed disabled:text-slate-400 disabled:no-underline"
                  >
                    {resendSecondsRemaining > 0
                      ? `Resend code in ${resendSecondsRemaining}s`
                      : "Resend code"}
                  </button>
                </>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Check your inbox and spam folder. You&apos;ll enter the code here
                  to unlock password reset.
                </p>
              )}
              <Link
                href="/auth?view=signin"
                className="text-sm font-medium text-blue-600 hover:underline"
              >
                Back to sign in
              </Link>
            </div>
          </form>
        </CardContent>
      </Card>
    </section>
  );
}

function ForgotPasswordPageFallback() {
  return (
    <section className="flex min-h-screen items-center justify-center bg-[#fff7ed] px-4 py-16">
      <Card className="w-full max-w-md border border-foreground/10 bg-card shadow-[var(--shadow-grounded-lg)]">
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl font-semibold text-foreground">
            Reset your password
          </CardTitle>
          <CardDescription>
            Loading password reset form...
          </CardDescription>
        </CardHeader>
      </Card>
    </section>
  );
}

export default function ForgotPasswordPage() {
  return (
    <Suspense fallback={<ForgotPasswordPageFallback />}>
      <ForgotPasswordPageContent />
    </Suspense>
  );
}
