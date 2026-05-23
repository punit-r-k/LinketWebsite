"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  Clock3,
  Mail,
  User,
} from "lucide-react";

import { SignOutButton } from "@/components/auth/SignOutButton";
import { useDashboardUser } from "@/components/dashboard/DashboardSessionContext";
import { toast } from "@/components/system/toaster";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { getSignedAvatarUrl } from "@/lib/avatar-client";
import { supabase } from "@/lib/supabase";

const DATE_TIME_FORMATTER = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

export default function SettingsContent() {
  const router = useRouter();
  const user = useDashboardUser();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [avatarLoading, setAvatarLoading] = useState(true);

  const email = user?.email ?? "";
  const lastSignInLabel = formatDateTime(user?.last_sign_in_at ?? null);
  const memberSinceLabel = formatDateTime(user?.created_at ?? null);
  const initials = useMemo(() => {
    if (email) return email.slice(0, 1).toUpperCase();
    return "L";
  }, [email]);

  useEffect(() => {
    if (!user?.id) return;

    let active = true;
    (async () => {
      setAvatarLoading(true);
      try {
        const { data, error } = await supabase
          .from("profiles")
          .select("avatar_url, updated_at")
          .eq("user_id", user.id)
          .maybeSingle();
        if (!active) return;
        if (error) throw error;
        const signed = await getSignedAvatarUrl(
          data?.avatar_url ?? null,
          data?.updated_at ?? null
        );
        if (!active) return;
        setAvatarUrl(signed);
      } catch (error) {
        if (!active) return;
        console.warn("Settings avatar load failed:", error);
        setAvatarUrl(null);
      } finally {
        if (active) setAvatarLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [user?.id]);

  const handleDeleteAccount = async () => {
    if (deleting) return;
    setDeleting(true);
    try {
      const response = await fetch("/api/account/delete", { method: "POST" });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload?.error || "Unable to delete account");
      }
      toast({
        title: "Account deleted",
        description: "Your account has been removed.",
      });
      setDeleteOpen(false);
      router.push("/");
      router.refresh();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unable to delete account";
      toast({
        title: "Delete failed",
        description: message,
        variant: "destructive",
      });
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card
        className="rounded-3xl border bg-card/80 shadow-sm"
        data-tour="settings-account"
      >
        <CardHeader className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <CardTitle className="text-2xl font-semibold">Settings</CardTitle>
              <Badge variant="secondary" className="rounded-full">
                Account only
              </Badge>
            </div>
            <p className="max-w-3xl text-sm text-muted-foreground">
              Settings is reserved for account access, security, and destructive
              account actions.
            </p>
          </div>
          <SignOutButton className="shrink-0" />
        </CardHeader>
        <CardContent>
          <div className="rounded-3xl border border-border/60 bg-background/70 p-5">
            <div className="flex items-center gap-4">
              <div className="relative h-24 w-24 overflow-hidden rounded-full border-2 border-[var(--accent)] bg-muted">
                {avatarLoading ? (
                  <div className="h-full w-full animate-pulse bg-muted" />
                ) : avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={avatarUrl}
                    alt="Profile"
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-xl font-semibold text-muted-foreground">
                    {initials}
                  </div>
                )}
              </div>
              <div className="space-y-2">
                <div className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                  Account overview
                </div>
                <div className="text-lg font-semibold text-foreground">
                  {email || "Email unavailable"}
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
        <Card className="rounded-3xl border bg-card/80 shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg font-semibold">
              Security & session
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Account access details stay here. Public profile editing does not.
            </p>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            <SettingsFact
              icon={Mail}
              label="Authentication email"
              value={email || "--"}
              helper="This is your actual sign-in address."
            />
            <SettingsFact
              icon={Clock3}
              label="Last sign in"
              value={lastSignInLabel ?? "Unavailable"}
              helper="Most recent successful dashboard session."
            />
            <SettingsFact
              icon={User}
              label="Member since"
              value={memberSinceLabel ?? "Unavailable"}
              helper="Account creation timestamp from your auth profile."
            />
          </CardContent>
        </Card>

        <Card className="rounded-3xl border border-destructive/20 bg-card/80 shadow-sm">
          <CardHeader>
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" aria-hidden />
              <CardTitle className="text-lg font-semibold text-destructive">
                Danger zone
              </CardTitle>
            </div>
            <p className="text-sm text-muted-foreground">
              Permanent actions live on their own so they never compete with
              normal account controls.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-2xl border border-destructive/15 bg-destructive/5 p-4 text-sm text-muted-foreground">
              Deleting your account removes your profile, Linket assignments,
              analytics and claim metadata, lead forms, stored images, billing
              records, and related account data. This cannot be undone.
            </div>
            <Button
              variant="destructive"
              className="rounded-full"
              onClick={() => setDeleteOpen(true)}
            >
              Delete account
            </Button>
          </CardContent>
        </Card>
      </div>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete account</DialogTitle>
            <DialogDescription>
              This permanently deletes your account and removes your profile,
              Linket metadata, analytics history, lead forms, billing records,
              and stored images. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteAccount}
              disabled={deleting}
            >
              {deleting ? "Deleting..." : "Delete account"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SettingsFact({
  icon: Icon,
  label,
  value,
  helper,
}: {
  icon: typeof Mail;
  label: string;
  value: string;
  helper: string;
}) {
  return (
    <div className="rounded-2xl border bg-background/70 p-4">
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
        <Icon className="h-4 w-4" aria-hidden="true" />
        {label}
      </div>
      <p className="mt-2 text-sm font-semibold text-foreground">{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{helper}</p>
    </div>
  );
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return DATE_TIME_FORMATTER.format(date);
}
