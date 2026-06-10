"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  AlertCircle,
  ArrowRightLeft,
  Copy,
  ExternalLink,
  Gift,
  Loader2,
  RefreshCcw,
  Tags,
  Trash2,
} from "lucide-react";

import { supabase } from "@/lib/supabase";
import type { ProfileWithLinks } from "@/lib/profile-service";
import type { TagAssignmentDetail } from "@/lib/linket-tags";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/components/system/toaster";
import {
  formatClaimCodeDisplay,
  normalizeClaimCodeInput,
} from "@/lib/linket-claim-code";
import { cn } from "@/lib/utils";
import { useDashboardUser } from "@/components/dashboard/DashboardSessionContext";

type LinketsContentProps = {
  variant?: "standalone" | "embedded";
};

type CreatedTransfer = {
  id: string;
  token: string;
  recipientEmail: string;
  expiresAt: string;
  nickname: string | null;
  chipUid: string | null;
  claimCode: string | null;
  directUrl: string;
  inviteUrl: string;
};

type TransferPreview = {
  id: string;
  assignmentId: string | null;
  chipUid: string | null;
  claimCode: string | null;
  nickname: string | null;
  recipientEmail: string;
  status: "pending" | "accepted" | "canceled" | "expired";
  expiresAt: string;
  createdAt: string;
  isSender: boolean;
  canAccept: boolean;
  alreadyAcceptedByCurrentUser: boolean;
};

const linketDateTimeFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
});
const TRIAL_DISMISS_STORAGE_PREFIX = "linket:complimentary-trial:dismissed";

function formatLinketTimestamp(value: string | null | undefined) {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return linketDateTimeFormatter.format(parsed);
}

function getTrialDismissStorageKey(userId: string, tagId: string) {
  return `${TRIAL_DISMISS_STORAGE_PREFIX}:${userId}:${tagId}`;
}

function hasDismissedTrialOffer(userId: string | null, tagId: string) {
  if (!userId || typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(getTrialDismissStorageKey(userId, tagId)) === "1";
  } catch {
    return false;
  }
}

function dismissTrialOffer(userId: string | null, tagId: string) {
  if (!userId || typeof window === "undefined") return;
  try {
    window.localStorage.setItem(getTrialDismissStorageKey(userId, tagId), "1");
  } catch {
    // The card-level claim button remains available if local storage is unavailable.
  }
}

export default function LinketsContent({ variant = "standalone" }: LinketsContentProps) {
  const isEmbedded = variant === "embedded";
  const router = useRouter();
  const searchParams = useSearchParams();
  const dashboardUser = useDashboardUser();
  const [userId, setUserId] = useState<string | null>(dashboardUser?.id ?? null);
  const [loading, setLoading] = useState(true);
  const [linkets, setLinkets] = useState<TagAssignmentDetail[]>([]);
  const [profiles, setProfiles] = useState<ProfileWithLinks[]>([]);
  const [claimCode, setClaimCode] = useState("");
  const [claiming, setClaiming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [transferDialogAssignment, setTransferDialogAssignment] =
    useState<TagAssignmentDetail | null>(null);
  const [transferRecipientEmail, setTransferRecipientEmail] = useState("");
  const [transferSubmitting, setTransferSubmitting] = useState(false);
  const [createdTransfer, setCreatedTransfer] = useState<CreatedTransfer | null>(
    null
  );
  const [transferPreview, setTransferPreview] = useState<TransferPreview | null>(
    null
  );
  const [transferPreviewLoading, setTransferPreviewLoading] = useState(false);
  const [transferPreviewError, setTransferPreviewError] = useState<string | null>(
    null
  );
  const [acceptingTransfer, setAcceptingTransfer] = useState(false);
  const [trialDialogAssignment, setTrialDialogAssignment] =
    useState<TagAssignmentDetail | null>(null);
  const [claimingTrialTagId, setClaimingTrialTagId] = useState<string | null>(null);
  const claimedAssignmentFromQuery =
    searchParams.get("claimedAssignment")?.trim() ?? "";
  const transferTokenFromQuery = searchParams.get("transfer")?.trim() ?? "";
  const claimCodeFromQuery = useMemo(() => {
    const claimCodePrefill = searchParams.get("claimCode");
    if (claimCodePrefill) {
      return formatClaimCodeDisplay(claimCodePrefill);
    }

    const legacyClaimPrefill = searchParams.get("claim");
    return legacyClaimPrefill?.trim() ?? "";
  }, [searchParams]);
  const hasClaimCodePrefill = useMemo(
    () => Boolean(searchParams.get("claimCode")),
    [searchParams]
  );

  useEffect(() => {
    if (dashboardUser) {
      setUserId(dashboardUser.id ?? null);
    } else {
      setUserId(null);
    }
  }, [dashboardUser]);

  useEffect(() => {
    let active = true;
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!active) return;
      setUserId(data.user?.id ?? null);
    })();
    return () => {
      active = false;
    };
  }, []);

  const loadData = useCallback(async (uid: string) => {
    setLoading(true);
    setError(null);
    try {
      const [linketsRes, profilesRes] = await Promise.all([
        fetch(`/api/linkets?userId=${encodeURIComponent(uid)}`),
        fetch(`/api/linket-profiles?userId=${encodeURIComponent(uid)}`, { cache: "no-store" }),
      ]);
      if (!linketsRes.ok) {
        const body = await linketsRes.json().catch(() => null);
        throw new Error((body?.error as string) || "Unable to load Linkets");
      }
      if (!profilesRes.ok) {
        const body = await profilesRes.json().catch(() => null);
        throw new Error((body?.error as string) || "Unable to load profiles");
      }
      const linketsJson = (await linketsRes.json()) as TagAssignmentDetail[];
      const profilesJson = (await profilesRes.json()) as ProfileWithLinks[];
      setLinkets(linketsJson);
      setProfiles(profilesJson);
      return linketsJson;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to load Linkets";
      setError(message);
      toast({ title: "Linkets unavailable", description: message, variant: "destructive" });
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (userId) {
      void loadData(userId);
    }
  }, [userId, loadData]);

  useEffect(() => {
    if (!claimCodeFromQuery) return;
    setClaimCode((current) => current || claimCodeFromQuery);
  }, [claimCodeFromQuery]);

  useEffect(() => {
    if (!transferTokenFromQuery || !userId) {
      setTransferPreview(null);
      setTransferPreviewError(null);
      setTransferPreviewLoading(false);
      return;
    }

    let active = true;
    setTransferPreviewLoading(true);
    setTransferPreviewError(null);

    void (async () => {
      try {
        const response = await fetch(
          `/api/linkets/transfers/${encodeURIComponent(transferTokenFromQuery)}`,
          {
            cache: "no-store",
          }
        );
        const payload = await response.json().catch(() => null);
        if (!response.ok) {
          throw new Error(
            payload && typeof payload.error === "string"
              ? payload.error
              : "Unable to load transfer invite."
          );
        }
        if (!active) return;
        setTransferPreview(payload as TransferPreview);
      } catch (error) {
        if (!active) return;
        setTransferPreview(null);
        setTransferPreviewError(
          error instanceof Error ? error.message : "Unable to load transfer invite."
        );
      } finally {
        if (active) {
          setTransferPreviewLoading(false);
        }
      }
    })();

    return () => {
      active = false;
    };
  }, [transferTokenFromQuery, userId]);

  const activeProfileOptions = useMemo(() => {
    return profiles.map((profile) => ({
      id: profile.id,
      label: profile.name,
      handle: profile.handle,
      isActive: profile.is_active,
    }));
  }, [profiles]);
  const activeDefaultProfile = useMemo(
    () => activeProfileOptions.find((profile) => profile.isActive) ?? null,
    [activeProfileOptions]
  );
  const openedClaimedLinket = useMemo(() => {
    if (!claimedAssignmentFromQuery) return null;
    return (
      linkets.find((item) => item.assignment.id === claimedAssignmentFromQuery) ??
      null
    );
  }, [claimedAssignmentFromQuery, linkets]);

  useEffect(() => {
    if (loading || !userId || trialDialogAssignment) return;
    const claimableLinket = linkets.find(
      (item) =>
        item.complimentaryTrial?.claimable &&
        !hasDismissedTrialOffer(userId, item.tag.id)
    );
    if (claimableLinket) {
      setTrialDialogAssignment(claimableLinket);
    }
  }, [linkets, loading, trialDialogAssignment, userId]);

  async function handleAssign(assignmentId: string, profileId: string | null) {
    if (!userId) return;
    try {
      const response = await fetch(`/api/linkets/${assignmentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profileId }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error((body?.error as string) || "Unable to update Linket");
      }
      toast({ title: "Linket updated", variant: "success" });
      await loadData(userId);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to update Linket";
      toast({ title: "Update failed", description: message, variant: "destructive" });
    }
  }

  async function handleRelease(assignmentId: string) {
    if (!userId) return;
    if (!confirm("Release this Linket? It will become claimable again.")) return;
    try {
      const response = await fetch(`/api/linkets/${assignmentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "release" }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error((body?.error as string) || "Unable to release Linket");
      }
      toast({ title: "Linket released", variant: "success" });
      await loadData(userId);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to release Linket";
      toast({ title: "Release failed", description: message, variant: "destructive" });
    }
  }

  function openTransferDialog(item: TagAssignmentDetail) {
    setTransferDialogAssignment(item);
    setTransferRecipientEmail("");
    setCreatedTransfer(null);
  }

  async function copyTransferInvite(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      toast({
        title: "Invite link copied",
        description: "Share the link with the recipient so they can accept the transfer.",
        variant: "success",
      });
    } catch {
      toast({
        title: "Copy failed",
        description: "Copy the invite link manually from the field.",
        variant: "destructive",
      });
    }
  }

  async function submitTransferInvite() {
    if (!transferDialogAssignment) return;
    setTransferSubmitting(true);

    try {
      const response = await fetch("/api/linkets/transfers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          assignmentId: transferDialogAssignment.assignment.id,
          recipientEmail: transferRecipientEmail,
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(
          payload && typeof payload.error === "string"
            ? payload.error
            : "Unable to create transfer invite."
        );
      }

      const nextTransfer = payload?.transfer as CreatedTransfer;
      setCreatedTransfer(nextTransfer);
      toast({
        title: "Transfer invite created",
        description: `Share the invite with ${nextTransfer.recipientEmail}.`,
        variant: "success",
      });
      await copyTransferInvite(nextTransfer.inviteUrl);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unable to create transfer invite.";
      toast({
        title: "Transfer invite failed",
        description: message,
        variant: "destructive",
      });
    } finally {
      setTransferSubmitting(false);
    }
  }

  async function acceptTransfer() {
    if (!transferTokenFromQuery || !userId) return;
    setAcceptingTransfer(true);

    try {
      const response = await fetch(
        `/api/linkets/transfers/${encodeURIComponent(
          transferTokenFromQuery
        )}/accept`,
        {
          method: "POST",
        }
      );
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(
          payload && typeof payload.error === "string"
            ? payload.error
            : "Unable to accept Linket transfer."
        );
      }

      toast({
        title: "Linket transferred",
        description: "The Linket now belongs to your account.",
        variant: "success",
      });

      const params = new URLSearchParams(searchParams.toString());
      params.delete("transfer");
      const nextQuery = params.toString();
      setTransferPreview(null);
      setTransferPreviewError(null);
      await loadData(userId);
      router.replace(
        nextQuery ? `/dashboard/linkets?${nextQuery}` : "/dashboard/linkets",
        { scroll: false }
      );
      router.refresh();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unable to accept Linket transfer.";
      toast({
        title: "Transfer accept failed",
        description: message,
        variant: "destructive",
      });
    } finally {
      setAcceptingTransfer(false);
    }
  }

  async function submitClaim() {
    if (!userId) {
      toast({ title: "Sign in required", variant: "destructive" });
      return;
    }
    const normalizedClaimCode = normalizeClaimCodeInput(claimCode);
    if (!normalizedClaimCode) {
      toast({ title: "Enter a claim code", variant: "destructive" });
      return;
    }
    setClaiming(true);
    try {
      const response = await fetch("/api/linkets/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ claimCode: normalizedClaimCode }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error((body?.error as string) || "Unable to claim Linket");
      }
      setClaimCode("");
      if (claimCodeFromQuery) {
        const params = new URLSearchParams(searchParams.toString());
        params.delete("claimCode");
        params.delete("claim");
        const nextQuery = params.toString();
        router.replace(nextQuery ? `/dashboard/linkets?${nextQuery}` : "/dashboard/linkets", {
          scroll: false,
        });
      }
      const payload = (await response.json().catch(() => null)) as
        | { assignmentId?: string | null }
        | null;
      toast({
        title: "Linket claimed",
        description: "Assign a profile below.",
        variant: "success",
      });
      const refreshedLinkets = await loadData(userId);
      const claimedLinket = payload?.assignmentId
        ? refreshedLinkets?.find(
            (item) => item.assignment.id === payload.assignmentId
          )
        : null;
      if (claimedLinket?.complimentaryTrial?.claimable) {
        setTrialDialogAssignment(claimedLinket);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to claim Linket";
      toast({ title: "Claim failed", description: message, variant: "destructive" });
    } finally {
      setClaiming(false);
    }
  }

  function closeTrialOffer() {
    if (trialDialogAssignment) {
      dismissTrialOffer(userId, trialDialogAssignment.tag.id);
    }
    setTrialDialogAssignment(null);
  }

  async function claimComplimentaryTrial(item: TagAssignmentDetail) {
    if (!userId) return;
    setClaimingTrialTagId(item.tag.id);
    try {
      const response = await fetch("/api/linkets/complimentary-trial", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tagId: item.tag.id,
          assignmentId: item.assignment.id,
        }),
      });
      const payload = (await response.json().catch(() => null)) as
        | {
            error?: string;
            status?: string;
            trial?: { endsAt?: string | null };
          }
        | null;
      if (!response.ok) {
        throw new Error(
          payload?.error || "Unable to claim complimentary trial."
        );
      }

      const endsAtLabel = formatLinketTimestamp(payload?.trial?.endsAt);
      toast({
        title: "Free trial claimed",
        description: endsAtLabel
          ? `Complimentary Pro is active through ${endsAtLabel}.`
          : "Complimentary Pro is active.",
        variant: "success",
      });
      setTrialDialogAssignment(null);
      await loadData(userId);
      router.refresh();
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Unable to claim complimentary trial.";
      toast({
        title: "Trial claim failed",
        description: message,
        variant: "destructive",
      });
    } finally {
      setClaimingTrialTagId(null);
    }
  }

  const emptyState = !loading && linkets.length === 0;

  return (
    <section
      className={cn("w-full min-w-0 space-y-6", isEmbedded && "space-y-4")}
      data-tour="linkets-root"
    >
      <Card
        className={cn(
          "w-full min-w-0 overflow-hidden border border-border/60 bg-card/80 shadow-sm",
          isEmbedded && "bg-card/70"
        )}
      >
        <CardHeader
          className={cn(
            "linkets-card-header flex min-w-0 flex-col gap-2 lg:flex-row lg:items-center lg:justify-between",
            isEmbedded && "gap-2.5"
          )}
        >
          <div className="min-w-0">
            <CardTitle
              className={cn(
                "flex min-w-0 flex-wrap items-center gap-2 text-2xl font-semibold text-foreground",
                isEmbedded && "text-lg"
              )}
            >
              <Tags className="h-5 w-5 shrink-0" /> Linkets
            </CardTitle>
            <CardDescription>Manage every physical Linket tag tied to your account.</CardDescription>
          </div>
          <div className="linkets-refresh flex gap-2">
            <Button variant="outline" onClick={() => userId && loadData(userId)} className="rounded-full" aria-label="Refresh Linkets">
              <RefreshCcw className="mr-2 h-4 w-4" /> Refresh
            </Button>
          </div>
        </CardHeader>
        <CardContent className="min-w-0 space-y-6">
          <form
            data-tour="linkets-claim"
            className="grid w-full min-w-0 gap-3 rounded-2xl border border-dashed border-primary/40 bg-primary/5 p-4 lg:grid-cols-[minmax(0,260px)_auto]"
            onSubmit={(event) => {
              event.preventDefault();
              void submitClaim();
            }}
          >
            <div className="min-w-0 space-y-2">
              <Label htmlFor="claim-code" className="text-sm font-medium text-primary">
                Claim with a code
              </Label>
              <Input
                id="claim-code"
                placeholder="e.g., ABCD-EFGH-IJKL"
                value={claimCode}
                onChange={(event) => {
                  const nextRawValue = event.target.value;
                  const normalizedValue = normalizeClaimCodeInput(nextRawValue);
                  const nextValue =
                    normalizedValue.length <= 12
                      ? formatClaimCodeDisplay(nextRawValue)
                      : normalizedValue;
                  setClaimCode(nextValue);
                }}
                disabled={claiming}
                autoComplete="off"
              />
              <p className="text-xs text-muted-foreground">
                Use this if you cannot tap the tag right now. Codes are printed with each Linket.
              </p>
              {hasClaimCodePrefill ? (
                <p className="rounded-xl border border-emerald-300 bg-emerald-50/60 px-2 py-1 text-xs text-emerald-900">
                  Tap detected. We prefilled the exact printed claim code from the mint sheet.
                </p>
              ) : null}
            </div>
            <div className="flex min-w-0 items-end justify-stretch md:justify-start">
              <Button
                type="submit"
                className="w-full rounded-full text-foreground md:w-auto"
                disabled={claiming}
              >
                {claiming ? (
                  <span className="inline-flex items-center gap-2 text-sm">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Claiming...
                  </span>
                ) : (
                  "Claim Linket"
                )}
              </Button>
            </div>
          </form>

          {claimedAssignmentFromQuery ? (
            <div className="min-w-0 overflow-hidden rounded-2xl border border-amber-300 bg-amber-50/70 p-4 text-amber-950">
              {loading ? (
                <p className="text-sm">Loading the Linket you just opened...</p>
              ) : openedClaimedLinket ? (
                <div className="flex min-w-0 flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div className="min-w-0 space-y-1.5">
                    <p className="text-sm font-semibold">
                      This Linket is already claimed to your account.
                    </p>
                    <p className="text-sm text-amber-900">
                      Assigned to{" "}
                      <span className="font-medium">
                        {openedClaimedLinket.profile?.name ??
                          activeDefaultProfile?.label ??
                          "your active profile"}
                      </span>
                      . The matching card is highlighted below.
                    </p>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-amber-900/80">
                      <span className="min-w-0 break-words">
                        Claim code:{" "}
                        <code className="break-all font-mono">
                          {formatClaimCodeDisplay(
                            openedClaimedLinket.tag.claim_code
                          ) || "Unavailable"}
                        </code>
                      </span>
                      <span className="min-w-0 break-words">
                        Claimed:{" "}
                        {formatLinketTimestamp(
                          openedClaimedLinket.tag.last_claimed_at
                        ) ?? "Unknown"}
                      </span>
                      <span className="min-w-0 break-words">
                        Last tap:{" "}
                        {formatLinketTimestamp(
                          openedClaimedLinket.assignment.last_redirected_at
                        ) ?? "No scans recorded yet"}
                      </span>
                    </div>
                  </div>
                  {(openedClaimedLinket.profile?.handle ??
                    activeDefaultProfile?.handle) ? (
                    <Button asChild variant="outline" className="w-full rounded-full lg:w-auto">
                      <Link
                        href={`/${
                          openedClaimedLinket.profile?.handle ??
                          activeDefaultProfile?.handle
                        }`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        <ExternalLink className="mr-2 h-4 w-4" />
                        Open public destination
                      </Link>
                    </Button>
                  ) : null}
                </div>
              ) : (
                <p className="text-sm">
                  This Linket is already claimed, but it is not available in the
                  current account view.
                </p>
              )}
            </div>
          ) : null}

          {transferTokenFromQuery ? (
            <div className="min-w-0 overflow-hidden rounded-2xl border border-sky-300 bg-sky-50/70 p-4 text-sky-950">
              {transferPreviewLoading ? (
                <p className="inline-flex items-center gap-2 text-sm">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading transfer invite...
                </p>
              ) : transferPreviewError ? (
                <p className="text-sm">{transferPreviewError}</p>
              ) : transferPreview ? (
                <div className="flex min-w-0 flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div className="min-w-0 space-y-1.5">
                    <p className="text-sm font-semibold">
                      {transferPreview.canAccept
                        ? "This Linket transfer is ready for you to accept."
                        : transferPreview.isSender
                          ? "This transfer invite is still waiting for the recipient."
                          : transferPreview.alreadyAcceptedByCurrentUser
                            ? "This Linket transfer was already accepted by your account."
                            : transferPreview.status === "expired"
                              ? "This transfer invite has expired."
                              : transferPreview.status === "canceled"
                                ? "This transfer invite was canceled."
                                : "This transfer invite cannot be accepted from the current account."}
                    </p>
                    <p className="text-sm text-sky-900">
                      {transferPreview.nickname || `Linket ${transferPreview.chipUid ?? ""}`}
                      {transferPreview.claimCode
                        ? ` • claim code ${formatClaimCodeDisplay(
                            transferPreview.claimCode
                          )}`
                        : ""}
                    </p>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-sky-900/80">
                      <span className="min-w-0 break-all">
                        Invited email {transferPreview.recipientEmail}
                      </span>
                      <span className="min-w-0 break-words">
                        Expires {formatLinketTimestamp(transferPreview.expiresAt) ?? "Unknown"}
                      </span>
                    </div>
                  </div>
                  {transferPreview.canAccept ? (
                    <Button
                      onClick={() => void acceptTransfer()}
                      className="w-full rounded-full lg:w-auto"
                      disabled={acceptingTransfer}
                    >
                      {acceptingTransfer ? (
                        <span className="inline-flex items-center gap-2 text-sm">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Accepting...
                        </span>
                      ) : (
                        <>
                          <ArrowRightLeft className="mr-2 h-4 w-4" />
                          Accept transfer
                        </>
                      )}
                    </Button>
                  ) : null}
                </div>
              ) : (
                <p className="text-sm">Transfer invite not found.</p>
              )}
            </div>
          ) : null}

          {error && (
            <div className="flex min-w-0 items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span className="min-w-0 break-words">{error}</span>
            </div>
          )}

          <div className="min-w-0" data-tour="linkets-list">
            {loading ? (
            <div className="flex items-center justify-center gap-2 rounded-xl border border-border/60 bg-muted/40 px-4 py-6 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading your Linkets...
            </div>
          ) : emptyState ? (
            <div className="rounded-2xl border border-dashed border-border/70 bg-muted/30 px-4 py-10 text-center text-sm text-muted-foreground">
              No Linkets claimed yet. Claim one above to get started.
            </div>
          ) : (
            <div className="grid gap-4">
              {linkets.map((item) => {
                const assignedProfileId = item.assignment.profile_id;
                const assignedProfile = assignedProfileId
                  ? activeProfileOptions.find((profile) => profile.id === assignedProfileId) ??
                    (item.profile
                      ? {
                          id: item.profile.id,
                          label: item.profile.name,
                          handle: item.profile.handle,
                          isActive: item.profile.is_active,
                        }
                      : null)
                  : activeDefaultProfile;
                const claimCodeDisplay = formatClaimCodeDisplay(item.tag.claim_code);
                const claimedAtLabel = formatLinketTimestamp(item.tag.last_claimed_at);
                const lastTapLabel = formatLinketTimestamp(
                  item.assignment.last_redirected_at
                );
                const isOpenedLinket =
                  claimedAssignmentFromQuery === item.assignment.id;
                return (
                  <div
                    key={item.assignment.id}
                    className={cn(
                      "min-w-0 overflow-hidden rounded-2xl border border-border/60 bg-card/90 p-4 shadow-sm transition-colors",
                      isOpenedLinket && "border-primary/70 ring-2 ring-primary/20"
                    )}
                  >
                    <div className="flex min-w-0 flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                      <div className="min-w-0 space-y-2">
                        <div className="break-words text-sm font-semibold text-foreground">
                          {item.assignment.nickname || `Linket ${item.tag.chip_uid}`}
                        </div>
                        <div className="min-w-0 break-words text-xs text-muted-foreground">
                          Chip ID:{" "}
                          <code className="break-all font-mono text-[11px]">
                            {item.tag.chip_uid}
                          </code>
                        </div>
                        <div className="text-xs text-muted-foreground">
                          Status: {item.tag.status === "claimed" ? "Active" : item.tag.status}
                        </div>
                        <div className="flex min-w-0 flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                          <span className="min-w-0 basis-full break-words lg:basis-auto">
                            Assigned to{" "}
                            <span className="font-medium text-foreground/80">
                              {assignedProfile?.label ?? "Active profile (default)"}
                            </span>
                          </span>
                          {claimCodeDisplay ? (
                            <span className="min-w-0 basis-full break-words lg:basis-auto">
                              Claim code{" "}
                              <code className="break-all font-mono text-[11px]">
                                {claimCodeDisplay}
                              </code>
                            </span>
                          ) : null}
                          <span className="min-w-0 basis-full break-words lg:basis-auto">
                            Claimed {claimedAtLabel ?? "Unknown"}
                          </span>
                          <span className="min-w-0 basis-full break-words lg:basis-auto">
                            Last tap {lastTapLabel ?? "No scans yet"}
                          </span>
                        </div>
                      </div>
                      <div className="flex min-w-0 flex-col gap-2 text-sm lg:items-end">
                        <div className="grid w-full min-w-0 grid-cols-1 items-center gap-2 sm:grid-cols-2 lg:w-auto lg:grid-cols-[minmax(220px,320px)_repeat(auto-fit,minmax(7.5rem,max-content))]">
                          <Select
                            value={assignedProfileId ?? "default"}
                            onValueChange={(value) =>
                              handleAssign(
                                item.assignment.id,
                                value === "default" ? null : value
                              )
                            }
                          >
                            <SelectTrigger className="w-full min-w-0 sm:col-span-2 lg:col-span-1">
                              <SelectValue placeholder="Assign a profile" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="default">Active profile (default)</SelectItem>
                              {activeProfileOptions.map((profile) => (
                                <SelectItem key={profile.id} value={profile.id}>
                                  {profile.label}
                                  {profile.isActive ? " (Active)" : ""}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          {assignedProfile?.handle ? (
                            <Link
                              href={`/${assignedProfile.handle}`}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex h-9 w-full min-w-0 items-center justify-center gap-1 rounded-full border px-3 text-xs text-muted-foreground hover:text-foreground lg:w-auto"
                            >
                              <ExternalLink className="h-3 w-3 shrink-0" />
                              <span className="truncate">View</span>
                            </Link>
                          ) : null}
                          {item.complimentaryTrial?.claimable ? (
                            <Button
                              type="button"
                              variant="outline"
                              className="w-full min-w-0 rounded-full border-primary/50 bg-primary/5 text-primary lg:w-auto"
                              onClick={() => setTrialDialogAssignment(item)}
                            >
                              <Gift className="mr-2 h-3.5 w-3.5 shrink-0" />
                              <span className="truncate">Claim 1 year free</span>
                            </Button>
                          ) : item.complimentaryTrial?.claimedByCurrentUser ? (
                            <span className="inline-flex h-9 w-full min-w-0 items-center justify-center rounded-full border border-emerald-300 bg-emerald-50 px-3 text-xs font-semibold text-emerald-800 lg:w-auto">
                              <span className="truncate">Trial claimed</span>
                            </span>
                          ) : item.complimentaryTrial?.claimed ? (
                            <span className="inline-flex h-9 w-full min-w-0 items-center justify-center rounded-full border border-border/60 px-3 text-xs font-semibold text-muted-foreground lg:w-auto">
                              <span className="truncate">Trial already used</span>
                            </span>
                          ) : null}
                          <Button
                            type="button"
                            variant="outline"
                            className="w-full min-w-0 rounded-full lg:w-auto"
                            onClick={() => openTransferDialog(item)}
                          >
                            <ArrowRightLeft className="mr-2 h-3.5 w-3.5 shrink-0" />
                            <span className="truncate">Transfer</span>
                          </Button>
                        </div>
                        <button
                          type="button"
                          className="inline-flex min-w-0 items-center gap-2 self-start text-xs text-rose-600 hover:underline lg:self-end"
                          onClick={() => handleRelease(item.assignment.id)}
                        >
                          <Trash2 className="h-3.5 w-3.5 shrink-0" />
                          <span className="truncate">Release</span>
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Dialog
        open={Boolean(trialDialogAssignment)}
        onOpenChange={(open) => {
          if (!open) closeTrialOffer();
        }}
      >
        <DialogContent className="w-[calc(100vw-1rem)] max-w-lg overflow-hidden rounded-[28px] border-border/60 bg-card/95 p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle className="text-xl font-semibold text-foreground sm:text-2xl">
              Congratulations
            </DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground">
              You connected your first Linket. This Linket includes a
              complimentary 1 year Pro trial. Claim it now, or close this and
              claim it later from your Linkets page.
            </DialogDescription>
          </DialogHeader>

          {trialDialogAssignment ? (
            <div className="space-y-4">
              <div className="rounded-2xl border border-primary/25 bg-primary/5 p-4 text-sm">
                <div className="font-semibold text-foreground">
                  {trialDialogAssignment.assignment.nickname ||
                    `Linket ${trialDialogAssignment.tag.chip_uid}`}
                </div>
                <p className="mt-1 text-muted-foreground">
                  One complimentary Pro year can be claimed for this physical
                  Linket.
                </p>
              </div>
              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end sm:gap-3">
                <Button
                  type="button"
                  variant="outline"
                  className="w-full rounded-full sm:w-auto"
                  onClick={closeTrialOffer}
                >
                  Not now
                </Button>
                <Button
                  type="button"
                  className="w-full rounded-full sm:w-auto"
                  disabled={claimingTrialTagId === trialDialogAssignment.tag.id}
                  onClick={() => void claimComplimentaryTrial(trialDialogAssignment)}
                >
                  {claimingTrialTagId === trialDialogAssignment.tag.id ? (
                    <span className="inline-flex items-center gap-2 text-sm">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Claiming...
                    </span>
                  ) : (
                    <>
                      <Gift className="mr-2 h-4 w-4" />
                      Claim free trial
                    </>
                  )}
                </Button>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(transferDialogAssignment)}
        onOpenChange={(open) => {
          if (!open) {
            setTransferDialogAssignment(null);
            setCreatedTransfer(null);
            setTransferRecipientEmail("");
          }
        }}
      >
        <DialogContent className="w-[calc(100vw-1rem)] max-w-lg overflow-hidden rounded-[28px] border-border/60 bg-card/95 p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle className="text-xl font-semibold text-foreground sm:text-2xl">
              Transfer Linket
            </DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground">
              Create a recipient-bound invite. Ownership stays with your account until the invited recipient accepts the transfer.
            </DialogDescription>
          </DialogHeader>

          {transferDialogAssignment ? (
            <div className="space-y-5">
              <div className="rounded-2xl border border-border/60 bg-background/60 p-4 text-sm">
                <div className="break-words font-semibold text-foreground">
                  {transferDialogAssignment.assignment.nickname ||
                    `Linket ${transferDialogAssignment.tag.chip_uid}`}
                </div>
                <div className="mt-1 min-w-0 break-words text-xs text-muted-foreground">
                  Claim code{" "}
                  <code className="break-all font-mono">
                    {formatClaimCodeDisplay(transferDialogAssignment.tag.claim_code) ||
                      "Unavailable"}
                  </code>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="transfer-recipient-email">Recipient email</Label>
                <Input
                  id="transfer-recipient-email"
                  type="email"
                  value={transferRecipientEmail}
                  onChange={(event) => setTransferRecipientEmail(event.target.value)}
                  placeholder="recipient@example.com"
                />
                <p className="text-xs text-muted-foreground">
                  The recipient must sign in with this email before the transfer can be accepted.
                </p>
              </div>

              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end sm:gap-3">
                <Button
                  type="button"
                  variant="outline"
                  className="w-full rounded-full sm:w-auto"
                  onClick={() => setTransferDialogAssignment(null)}
                >
                  Close
                </Button>
                <Button
                  type="button"
                  className="w-full rounded-full sm:w-auto"
                  disabled={transferSubmitting || !transferRecipientEmail.trim()}
                  onClick={() => void submitTransferInvite()}
                >
                  {transferSubmitting ? (
                    <span className="inline-flex items-center gap-2 text-sm">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Creating...
                    </span>
                  ) : (
                    <>
                      <ArrowRightLeft className="mr-2 h-4 w-4" />
                      Create invite
                    </>
                  )}
                </Button>
              </div>

              {createdTransfer ? (
                <div className="min-w-0 space-y-3 rounded-2xl border border-emerald-200 bg-emerald-50/70 p-4 text-sm text-emerald-950">
                  <div>
                    <div className="font-semibold">Invite ready</div>
                    <p className="mt-1 break-words text-xs text-emerald-900/80">
                      Share the invite link with {createdTransfer.recipientEmail}. It expires{" "}
                      {formatLinketTimestamp(createdTransfer.expiresAt) ?? "soon"}.
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="transfer-invite-link">Invite link</Label>
                    <div className="flex min-w-0 flex-col gap-2 sm:flex-row">
                      <Input
                        id="transfer-invite-link"
                        className="min-w-0 sm:flex-1"
                        value={createdTransfer.inviteUrl}
                        readOnly
                      />
                      <Button
                        type="button"
                        variant="outline"
                        className="w-full rounded-full sm:w-auto"
                        onClick={() => void copyTransferInvite(createdTransfer.inviteUrl)}
                      >
                        <Copy className="mr-2 h-4 w-4" />
                        Copy
                      </Button>
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      <p
        className={cn(
          "text-xs text-muted-foreground",
          isEmbedded && "text-[11px] text-muted-foreground/75"
        )}
      >
        Need to claim a Linket without NFC? Tap the tools above or enter the printed code. Once claimed, you can reassign it to any profile anytime.
      </p>
    </section>
  );
}
