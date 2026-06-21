"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import {
  Building2,
  CalendarDays,
  Copy,
  ExternalLink,
  FileText,
  Mail,
  Phone,
  Star,
  UserRound,
  Users,
  type LucideIcon,
} from "lucide-react";
import type {
  RealtimeChannel,
  RealtimePostgresChangesPayload,
} from "@supabase/supabase-js";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/system/toaster";
import {
  downloadLeadVCard,
  saveLeadContactToPhone,
} from "@/lib/lead-contact-card";
import {
  getLeadFlagBadgeClassName,
  getLeadFlagLabel,
  getLeadRatingLabel,
  getDefaultLeadRating,
  getDefaultFollowUpAt,
  normalizeLeadFlag,
  normalizeLeadRating,
  type LeadFlag,
} from "@/lib/lead-workflow";
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabase";
import type { Lead } from "@/types/db";

type NetworkingDraft = {
  note: string;
  next_follow_up_at: string;
  lead_flag: LeadFlag;
  lead_rating: number;
};

const LIVE_LEADS_LIMIT = 3;
const AUTO_SAVE_DELAY_MS = 700;
const AUTO_SAVE_RETRY_DELAY_MS = 2000;
const LEAD_STATUS_OPTIONS: LeadFlag[] = ["follow_up", "done"];
const LEAD_RATING_OPTIONS = [1, 2, 3, 4, 5] as const;
const CORE_FIELD_KEYS = new Set(["name", "email", "phone", "company", "message"]);

export default function NetworkingModePanel({
  userId,
}: {
  userId: string | null;
}) {
  const canLabelLeads = true;
  const [loading, setLoading] = useState(true);
  const [savingLeadIds, setSavingLeadIds] = useState<Record<string, boolean>>({});
  const [saveErrorLeadIds, setSaveErrorLeadIds] = useState<Record<string, boolean>>({});
  const [activeLeadId, setActiveLeadId] = useState<string | null>(null);
  const [leadDetailOpen, setLeadDetailOpen] = useState(false);
  const [isPhoneLikeDevice, setIsPhoneLikeDevice] = useState(false);
  const [leadStream, setLeadStream] = useState<Lead[]>([]);
  const [drafts, setDrafts] = useState<Record<string, NetworkingDraft>>({});
  const autoSaveTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const inFlightSaveIdsRef = useRef<Record<string, boolean>>({});
  const draftsRef = useRef<Record<string, NetworkingDraft>>({});
  const leadStreamRef = useRef<Lead[]>([]);
  const reminderInputRef = useRef<HTMLInputElement | null>(null);
  const userIdRef = useRef<string | null>(userId);
  const canLabelLeadsRef = useRef(canLabelLeads);

  draftsRef.current = drafts;
  leadStreamRef.current = leadStream;
  userIdRef.current = userId;
  canLabelLeadsRef.current = canLabelLeads;

  useEffect(() => {
    return () => {
      Object.values(autoSaveTimersRef.current).forEach((timer) => clearTimeout(timer));
      autoSaveTimersRef.current = {};
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const coarsePointer = window.matchMedia("(pointer: coarse)");
    const narrowViewport = window.matchMedia("(max-width: 767px)");
    const mobileUserAgent =
      typeof navigator !== "undefined" &&
      /Android.+Mobile|iPhone|iPod|Windows Phone/i.test(navigator.userAgent);

    const updateDeviceState = () => {
      setIsPhoneLikeDevice(
        mobileUserAgent || (coarsePointer.matches && narrowViewport.matches)
      );
    };

    updateDeviceState();
    coarsePointer.addEventListener("change", updateDeviceState);
    narrowViewport.addEventListener("change", updateDeviceState);

    return () => {
      coarsePointer.removeEventListener("change", updateDeviceState);
      narrowViewport.removeEventListener("change", updateDeviceState);
    };
  }, []);

  useEffect(() => {
    const resolvedUserId = userId;
    if (!resolvedUserId) {
      Object.values(autoSaveTimersRef.current).forEach((timer) => clearTimeout(timer));
      autoSaveTimersRef.current = {};
      draftsRef.current = {};
      leadStreamRef.current = [];
      setLoading(false);
      setLeadStream([]);
      setActiveLeadId(null);
      setDrafts({});
      setSavingLeadIds({});
      setSaveErrorLeadIds({});
      return;
    }
    const userIdValue: string = resolvedUserId;

    let cancelled = false;
    setLoading(true);

    async function loadLeads() {
      const { data, error } = await supabase
        .from("leads")
        .select(
          "id,user_id,handle,name,email,phone,company,message,note,next_follow_up_at,lead_flag,lead_rating,custom_fields,source_url,created_at"
        )
        .eq("user_id", userIdValue)
        .order("created_at", { ascending: false })
        .limit(LIVE_LEADS_LIMIT);

      if (cancelled) return;

      if (error) {
        toast({
          title: "Lead stream unavailable",
          description: error.message,
          variant: "destructive",
        });
        setLeadStream([]);
        setLoading(false);
        return;
      }

      const rows = (data ?? []).map((row) => normalizeLeadRow(row, userIdValue));
      leadStreamRef.current = rows;
      setLeadStream(rows);
      setLoading(false);
    }

    void loadLeads();

    return () => {
      cancelled = true;
    };
  }, [userId]);

  useEffect(() => {
    const resolvedUserId = userId;
    if (!resolvedUserId || !canUseRealtime()) return;
    const userIdValue: string = resolvedUserId;

    let channel: RealtimeChannel | null = null;

    try {
      channel = supabase
        .channel(`networking-leads-${userIdValue}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "leads",
            filter: `user_id=eq.${userIdValue}`,
          },
          (payload: RealtimePostgresChangesPayload<Lead>) => {
            if (payload.eventType === "INSERT") {
              const row = normalizeLeadRow(payload.new, userIdValue);
              const nextLeadStream = dedupeById([row, ...leadStreamRef.current]).slice(
                0,
                LIVE_LEADS_LIMIT
              );
              leadStreamRef.current = nextLeadStream;
              setLeadStream(nextLeadStream);
              setActiveLeadId(row.id);
              const nextDrafts = {
                ...draftsRef.current,
                [row.id]: toDraft(row),
              };
              draftsRef.current = nextDrafts;
              setDrafts(nextDrafts);
            }

            if (payload.eventType === "UPDATE") {
              const row = normalizeLeadRow(payload.new, userIdValue);
              const previousLead =
                leadStreamRef.current.find((lead) => lead.id === row.id) ?? null;
              const nextLeadStream = dedupeById([row, ...leadStreamRef.current]).slice(
                0,
                LIVE_LEADS_LIMIT
              );
              leadStreamRef.current = nextLeadStream;
              setLeadStream(nextLeadStream);

              const currentDraft = draftsRef.current[row.id];
              if (currentDraft && previousLead && isLeadDraftDirty(previousLead, currentDraft)) {
                return;
              }

              const nextDrafts = {
                ...draftsRef.current,
                [row.id]: toDraft(row),
              };
              draftsRef.current = nextDrafts;
              setDrafts(nextDrafts);
            }

            if (payload.eventType === "DELETE") {
              const row = normalizeLeadRow(payload.old, userIdValue);
              const nextLeadStream = leadStreamRef.current.filter((lead) => lead.id !== row.id);
              leadStreamRef.current = nextLeadStream;
              setLeadStream(nextLeadStream);
              const nextDrafts = { ...draftsRef.current };
              delete nextDrafts[row.id];
              draftsRef.current = nextDrafts;
              setDrafts(nextDrafts);
              const timer = autoSaveTimersRef.current[row.id];
              if (timer) {
                clearTimeout(timer);
                delete autoSaveTimersRef.current[row.id];
              }
              setActiveLeadId((current) => (current === row.id ? null : current));
            }
          }
        )
        .subscribe();
    } catch (error) {
      console.warn(
        `Realtime disabled for networking overview: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }

    return () => {
      if (channel) supabase.removeChannel(channel);
    };
  }, [userId]);

  useEffect(() => {
    if (activeLeadId && leadStream.some((lead) => lead.id === activeLeadId)) return;
    setActiveLeadId(leadStream[0]?.id ?? null);
  }, [activeLeadId, leadStream]);

  useEffect(() => {
    if (!activeLeadId) return;
    const activeLead = leadStream.find((lead) => lead.id === activeLeadId);
    if (!activeLead) return;
    setDrafts((prev) => {
      if (prev[activeLead.id]) return prev;
      return {
        ...prev,
        [activeLead.id]: toDraft(activeLead),
      };
    });
  }, [activeLeadId, leadStream]);

  const activeLead = activeLeadId
    ? leadStream.find((lead) => lead.id === activeLeadId) ?? null
    : null;
  const activeDraft = activeLead
    ? drafts[activeLead.id] ?? toDraft(activeLead)
    : null;
  const activeLeadStatus = activeDraft?.lead_flag ?? activeLead?.lead_flag ?? "follow_up";
  const activeLeadRating = normalizeLeadRating(
    activeDraft?.lead_rating ?? activeLead?.lead_rating ?? getDefaultLeadRating(activeLeadStatus)
  );
  const activeLeadSubmittedLabel = activeLead
    ? formatSubmittedLabel(activeLead.created_at)
    : "";
  const activeLeadCustomFields = activeLead
    ? collectDisplayCustomFields(activeLead.custom_fields)
    : [];

  useEffect(() => {
    if (activeLead) return;
    setLeadDetailOpen(false);
  }, [activeLead]);

  function openReminderPicker() {
    const input = reminderInputRef.current;
    if (!input || input.disabled) return;
    if (typeof input.showPicker === "function") {
      input.showPicker();
      return;
    }
    input.focus();
    input.click();
  }

  function copyEmailToClipboard(lead: Lead) {
    if (!lead.email) return;
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      navigator.clipboard
        .writeText(lead.email)
        .then(() => toast({ title: "Email copied" }))
        .catch(() =>
          toast({
            title: "Copy failed",
            description: "Your browser blocked clipboard access.",
            variant: "destructive",
          })
        );
      return;
    }
    toast({
      title: "Copy unavailable",
      description: "Clipboard access is not available in this browser.",
      variant: "destructive",
    });
  }

  async function saveContactToPhone(lead: Lead) {
    try {
      const result = await saveLeadContactToPhone(lead);
      toast({
        title: result === "shared" ? "Contact ready to save" : "Contact card opened",
        description:
          result === "shared"
            ? "Choose Contacts or your preferred app from the share sheet."
            : "Your phone should offer to add or download the contact card.",
      });
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      toast({
        title: "Unable to save contact",
        description:
          error instanceof Error
            ? error.message
            : "Your browser could not prepare the contact card.",
        variant: "destructive",
      });
    }
  }

  function queueLeadAutosave(
    id: string,
    draft: NetworkingDraft,
    delay = AUTO_SAVE_DELAY_MS
  ) {
    if (!userIdRef.current || !canLabelLeadsRef.current) return;

    const existingTimer = autoSaveTimersRef.current[id];
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    autoSaveTimersRef.current[id] = setTimeout(() => {
      delete autoSaveTimersRef.current[id];
      void saveLeadDraft(id, draft);
    }, delay);
  }

  function writeLeadDraft(id: string, nextDraft: NetworkingDraft) {
    const currentDraft = draftsRef.current[id];
    if (currentDraft && areDraftsEquivalent(currentDraft, nextDraft)) {
      return;
    }

    const nextDrafts = {
      ...draftsRef.current,
      [id]: nextDraft,
    };
    draftsRef.current = nextDrafts;
    setDrafts(nextDrafts);

    setSaveErrorLeadIds((prev) => {
      if (!prev[id]) return prev;
      const next = { ...prev };
      delete next[id];
      return next;
    });

    queueLeadAutosave(id, nextDraft);
  }

  function updateActiveLeadDraft(overrides: Partial<NetworkingDraft>) {
    if (!activeLead) return;

    const currentDraft = draftsRef.current[activeLead.id];
    const nextLeadFlag =
      overrides.lead_flag ?? currentDraft?.lead_flag ?? activeLeadStatus;

    const nextDraft: NetworkingDraft = {
      note: overrides.note ?? currentDraft?.note ?? activeLead.note ?? "",
      next_follow_up_at:
        overrides.next_follow_up_at !== undefined
          ? overrides.next_follow_up_at
          : nextLeadFlag === "done"
            ? ""
            : currentDraft?.next_follow_up_at ||
              formatDatetimeLocalValue(activeLead.next_follow_up_at) ||
              formatDatetimeLocalValue(getDefaultFollowUpAt(activeLead.created_at)),
      lead_flag: nextLeadFlag,
      lead_rating:
        overrides.lead_rating ?? currentDraft?.lead_rating ?? activeLeadRating,
    };

    writeLeadDraft(activeLead.id, nextDraft);
  }

  async function saveLeadDraft(id: string, draftOverride?: NetworkingDraft) {
    const currentUserId = userIdRef.current;
    if (!currentUserId || !canLabelLeadsRef.current) return;

    const draft = draftOverride ?? draftsRef.current[id];
    const lead = leadStreamRef.current.find((item) => item.id === id);
    if (!draft || !lead || !isLeadDraftDirty(lead, draft)) return;
    let nextAutoSaveDelay = AUTO_SAVE_DELAY_MS;

    if (inFlightSaveIdsRef.current[id]) {
      queueLeadAutosave(id, draft);
      return;
    }

    inFlightSaveIdsRef.current[id] = true;
    setSavingLeadIds((prev) => ({ ...prev, [id]: true }));
    try {
      const payload = {
        note: draft.note.trim(),
        next_follow_up_at:
          draft.lead_flag === "done" ? null : parseDatetimeLocalValue(draft.next_follow_up_at),
        lead_flag: draft.lead_flag,
        lead_rating: normalizeLeadRating(draft.lead_rating),
      };
      const { data, error } = await supabase
        .from("leads")
        .update(payload)
        .eq("id", id)
        .eq("user_id", currentUserId)
        .select("id,note,next_follow_up_at,lead_flag,lead_rating")
        .maybeSingle();

      if (error) throw new Error(error.message);
      if (!data) throw new Error("Lead not found");

      const nextLead = normalizeLeadRow(
        {
          ...lead,
          ...data,
          lead_flag: data.lead_flag ?? draft.lead_flag,
          lead_rating: data.lead_rating ?? draft.lead_rating,
        },
        currentUserId
      );

      leadStreamRef.current = leadStreamRef.current.map((item) =>
        item.id === id ? nextLead : item
      );
      setLeadStream((prev) =>
        prev.map((item) => (item.id === id ? nextLead : item))
      );

      const latestDraft = draftsRef.current[id];
      if (latestDraft && areDraftsEquivalent(latestDraft, draft)) {
        const nextDrafts = {
          ...draftsRef.current,
          [id]: toDraft(nextLead),
        };
        draftsRef.current = nextDrafts;
        setDrafts(nextDrafts);
      }

      setSaveErrorLeadIds((prev) => {
        if (!prev[id]) return prev;
        const next = { ...prev };
        delete next[id];
        return next;
      });
    } catch {
      setSaveErrorLeadIds((prev) => ({ ...prev, [id]: true }));
      nextAutoSaveDelay = AUTO_SAVE_RETRY_DELAY_MS;
    } finally {
      inFlightSaveIdsRef.current[id] = false;
      setSavingLeadIds((prev) => {
        if (!prev[id]) return prev;
        const next = { ...prev };
        delete next[id];
        return next;
      });

      const latestLead = leadStreamRef.current.find((item) => item.id === id);
      const latestDraft = draftsRef.current[id];
      if (latestLead && latestDraft && isLeadDraftDirty(latestLead, latestDraft)) {
        queueLeadAutosave(id, latestDraft, nextAutoSaveDelay);
      }
    }
  }

  if (!userId) {
    return null;
  }

  return (
    <>
    <Card className="min-w-0 w-full overflow-hidden rounded-[2rem] border border-border/70 bg-gradient-to-br from-primary/5 via-card to-background text-foreground shadow-[0_18px_45px_rgba(15,23,42,0.08)]">
      <CardContent className="grid min-w-0 gap-4 px-5 sm:px-7">
          <section className="order-2 min-w-0 space-y-3 rounded-[1.25rem] border border-border/70 bg-background p-4 text-center sm:text-left">
            <div className="flex flex-col items-center gap-3 text-center sm:flex-row sm:items-center sm:justify-between sm:text-left">
              <div className="space-y-1">
                <div className="text-sm font-semibold text-foreground">Live lead stream</div>
                <p className="text-xs text-muted-foreground">
                  New leads appear live.
                </p>
              </div>
              <Badge
                variant="outline"
                className="rounded-full border-border/60 bg-card/80 px-3 py-1 text-[11px] text-muted-foreground"
              >
                <Users className="mr-2 h-3.5 w-3.5" aria-hidden />
                {loading ? "Loading" : `${leadStream.length} live`}
              </Badge>
            </div>

            {loading ? (
              <div className="space-y-3">
                {Array.from({ length: 3 }).map((_, index) => (
                  <div key={index} className="h-20 animate-pulse rounded-2xl bg-muted/40" />
                ))}
              </div>
            ) : leadStream.length > 0 ? (
              <div className="space-y-2">
                {leadStream.map((lead) => (
                  <button
                    key={lead.id}
                    type="button"
                    onClick={() => setActiveLeadId(lead.id)}
                    className={cn(
                      "w-full min-w-0 rounded-2xl border px-4 py-3 text-center transition sm:text-left",
                      activeLeadId === lead.id
                        ? "border-primary/30 bg-primary/5 shadow-[0_16px_30px_-24px_rgba(15,23,42,0.35)]"
                        : "border-border/60 bg-card/80 hover:border-border/80 hover:bg-muted/40"
                    )}
                  >
                    <div className="flex flex-col items-center gap-3 text-center sm:flex-row sm:items-start sm:justify-between sm:text-left">
                      <div className="min-w-0 space-y-1">
                        <div className="flex flex-wrap items-center justify-center gap-2 sm:justify-start">
                          <span className="truncate text-sm font-semibold text-foreground">
                            {lead.name || "Unnamed lead"}
                          </span>
                          <FlagBadge flag={lead.lead_flag} />
                          <RatingBadge rating={lead.lead_rating} />
                        </div>
                        <div className="break-all text-xs text-muted-foreground sm:break-normal">
                          {lead.email || "No email"}
                          {lead.company ? ` - ${lead.company}` : ""}
                        </div>
                      </div>
                    </div>
                    {lead.note ? (
                      <p className="mt-2 line-clamp-2 text-center text-xs text-muted-foreground sm:text-left">
                        {lead.note}
                      </p>
                    ) : lead.message ? (
                      <p className="mt-2 line-clamp-2 text-center text-xs text-muted-foreground sm:text-left">
                        {lead.message}
                      </p>
                    ) : null}
                  </button>
                ))}
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-border/60 bg-background/60 px-4 py-6 text-sm text-muted-foreground">
                No leads yet. New contacts will show up here automatically.
              </div>
            )}
            <div className="flex flex-wrap justify-center gap-2 pt-1 sm:justify-start">
              <Button
                asChild
                size="sm"
                className="w-full rounded-full sm:w-auto"
              >
                <Link href="/dashboard/leads">Open leads inbox</Link>
              </Button>
            </div>
          </section>

          <section className="order-1 min-w-0 space-y-3 rounded-[1.75rem] border border-border/60 bg-card/95 p-3 text-center text-foreground shadow-[0_18px_45px_rgba(15,23,42,0.08)] sm:text-left">
            <div>
              <div className="text-sm font-semibold text-foreground">Quick capture</div>
            </div>

            {activeLead ? (
                <div className="space-y-3">
                  <div className="space-y-0.5 text-center sm:text-left">
                    <button
                      type="button"
                      className="text-base font-semibold leading-tight text-foreground underline-offset-4 transition hover:text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                      onClick={() => setLeadDetailOpen(true)}
                    >
                      {activeLead.name || "Unnamed lead"}
                    </button>
                    <div className="break-all text-sm leading-tight text-muted-foreground sm:break-normal">
                      {activeLead.email || "No email"}
                      {activeLead.company ? ` - ${activeLead.company}` : ""}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center justify-center gap-2 sm:justify-start">
                    <div
                      className="flex flex-wrap justify-center gap-2 sm:justify-start"
                      role="group"
                      aria-label="Lead status"
                    >
                      {LEAD_STATUS_OPTIONS.map((status) => (
                        <button
                          key={status}
                          type="button"
                          onClick={() => updateActiveLeadDraft({ lead_flag: status })}
                          className={cn(
                            "rounded-full border px-3 py-1 text-sm font-medium transition",
                            activeLeadStatus === status
                              ? getLeadFlagBadgeClassName(status)
                              : "border-border/60 bg-background/80 text-foreground hover:bg-muted/50"
                          )}
                        >
                          {getLeadFlagLabel(status)}
                        </button>
                      ))}
                    </div>
                    <div
                      className="flex flex-wrap justify-center gap-1.5 sm:justify-start"
                      role="group"
                      aria-label="Lead rating"
                    >
                      {LEAD_RATING_OPTIONS.map((rating) => (
                        <button
                          key={rating}
                          type="button"
                          onClick={() => updateActiveLeadDraft({ lead_rating: rating })}
                          className={cn(
                            "inline-flex h-8 w-8 items-center justify-center rounded-full border text-sm font-medium transition",
                            rating <= activeLeadRating
                              ? "border-primary/20 bg-primary/10 text-primary"
                              : "border-border/60 bg-background/80 text-foreground hover:bg-muted/50"
                          )}
                          aria-label={`Set rating to ${rating}`}
                        >
                          <Star
                            className={cn(
                              "h-4 w-4",
                              rating <= activeLeadRating ? "fill-current" : ""
                            )}
                            aria-hidden
                          />
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label
                      htmlFor={`networking-note-${activeLead.id}`}
                      className="sr-only"
                    >
                      Note
                    </Label>
                    <Textarea
                      id={`networking-note-${activeLead.id}`}
                      value={activeDraft?.note ?? ""}
                      onChange={(event) => updateActiveLeadDraft({ note: event.target.value })}
                      placeholder="A few words about the conversation."
                      className="min-h-20 rounded-2xl"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label
                      htmlFor={`networking-follow-up-${activeLead.id}`}
                      className="sr-only"
                    >
                      Reminder
                    </Label>
                    <div className="relative w-full min-w-0">
                      <Input
                        ref={reminderInputRef}
                        id={`networking-follow-up-${activeLead.id}`}
                        type="datetime-local"
                        value={activeLeadStatus === "done" ? "" : activeDraft?.next_follow_up_at ?? ""}
                        onChange={(event) =>
                          updateActiveLeadDraft({ next_follow_up_at: event.target.value })
                        }
                        disabled={activeLeadStatus === "done"}
                        className="dashboard-datetime-input min-w-0 max-w-full pr-14 text-[0.92rem] sm:text-sm"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="absolute right-1 top-1/2 h-8 w-8 -translate-y-1/2 rounded-md border border-border/50 bg-card/80 text-[color:var(--button-subtle-foreground)] shadow-sm hover:bg-muted/60"
                        onClick={openReminderPicker}
                        disabled={activeLeadStatus === "done"}
                        aria-label="Open reminder date picker"
                      >
                        <CalendarDays className="h-4 w-4" aria-hidden />
                      </Button>
                    </div>
                  </div>

                  {savingLeadIds[activeLead.id] ? (
                    <p className="text-xs text-muted-foreground">Saving changes...</p>
                  ) : saveErrorLeadIds[activeLead.id] ? (
                    <p className="text-xs text-destructive">
                      Couldn&apos;t save. Retrying automatically.
                    </p>
                  ) : null}

                  <div className="flex flex-wrap justify-center gap-2 sm:justify-start">
                    {isPhoneLikeDevice ? (
                      <Button
                        type="button"
                        className="w-full justify-center gap-1.5 sm:w-auto"
                        onClick={() => void saveContactToPhone(activeLead)}
                      >
                        <FileText className="h-4 w-4" aria-hidden />
                        Save to phone
                      </Button>
                    ) : null}
                    <Button
                      type="button"
                      variant="outline"
                      className="w-full justify-center !border-[color:color-mix(in_srgb,var(--foreground)_28%,var(--border)_72%)] sm:w-auto"
                      onClick={() =>
                        setActiveLeadId(
                          leadStream.find((lead) => lead.id !== activeLeadId)?.id ??
                            leadStream[0]?.id ??
                            null
                        )
                      }
                    >
                      Previous lead
                    </Button>
                  </div>
                </div>
          ) : (
              <div className="rounded-2xl border border-dashed border-border/60 px-4 py-6 text-sm text-muted-foreground">
                Click a lead to add the note, reminder, status, and rating.
              </div>
            )}
          </section>
      </CardContent>
    </Card>
    <Dialog
      open={Boolean(activeLead && leadDetailOpen)}
      onOpenChange={(open) => setLeadDetailOpen(open)}
    >
      <DialogContent
        className="left-auto right-0 top-0 h-dvh max-h-dvh w-full max-w-full translate-x-0 translate-y-0 overflow-hidden gap-0 rounded-none border-l border-border/60 bg-background/95 p-0 shadow-[0_30px_80px_-40px_rgba(15,23,42,0.45)] sm:max-w-2xl lg:max-w-[44rem]"
        showCloseButton
      >
        {activeLead ? (
          <div className="flex h-full min-h-0 flex-col">
            <DialogHeader className="shrink-0 border-b border-border/50 px-5 py-4 text-left lg:px-6">
              <div className="space-y-2">
                <DialogTitle className="text-fluid-2xl-3xl pr-10 font-semibold leading-tight">
                  {activeLead.name || "Unnamed lead"}
                </DialogTitle>
                <div className="flex flex-wrap items-center gap-2">
                  <FlagBadge flag={activeLeadStatus} />
                  <RatingBadge rating={activeLeadRating} />
                  <Badge variant="outline" className="rounded-full px-3 py-1 text-xs">
                    Submitted {activeLeadSubmittedLabel}
                  </Badge>
                </div>
              </div>
              <DialogDescription className="max-w-2xl text-sm text-muted-foreground">
                Review the full lead, update follow-up details, and save their contact card from here.
              </DialogDescription>
            </DialogHeader>

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4 lg:px-6">
              <div className="space-y-5">
                <section className="space-y-3">
                  <SectionLabel>Contact details</SectionLabel>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <LeadDetailItem
                      icon={Mail}
                      label="Email"
                      value={activeLead.email || "Not provided"}
                    />
                    <LeadDetailItem
                      icon={Phone}
                      label="Phone"
                      value={activeLead.phone || "Not provided"}
                    />
                    <LeadDetailItem
                      icon={Building2}
                      label="Company"
                      value={activeLead.company || "Not provided"}
                    />
                    <LeadDetailItem
                      icon={UserRound}
                      label="Form used"
                      value={activeLead.handle || "Unknown"}
                    />
                  </div>
                </section>

                <section className="grid gap-5 xl:grid-cols-[minmax(0,0.82fr)_minmax(0,1.18fr)]">
                  <div className="space-y-5">
                    <section className="space-y-3">
                      <SectionLabel>Status</SectionLabel>
                      <div className="rounded-2xl border border-border/50 bg-card/70 p-4">
                        <div className="space-y-4">
                          <div
                            className="flex flex-wrap gap-2"
                            role="group"
                            aria-label="Lead status"
                          >
                            {LEAD_STATUS_OPTIONS.map((status) => (
                              <button
                                key={status}
                                type="button"
                                onClick={() => updateActiveLeadDraft({ lead_flag: status })}
                                className={cn(
                                  "rounded-full border px-3 py-1.5 text-sm font-medium transition",
                                  activeLeadStatus === status
                                    ? getLeadFlagBadgeClassName(status)
                                    : "border-border/60 bg-background/70 text-foreground hover:bg-muted/50"
                                )}
                              >
                                {getLeadFlagLabel(status)}
                              </button>
                            ))}
                          </div>

                          <div className="space-y-2">
                            <div className="flex items-center justify-between gap-3">
                              <Label className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                                Rating
                              </Label>
                              <span className="text-xs text-muted-foreground">
                                {getLeadRatingLabel(activeLeadRating)}
                              </span>
                            </div>
                            <div
                              className="flex flex-wrap gap-2"
                              role="group"
                              aria-label="Lead rating"
                            >
                              {LEAD_RATING_OPTIONS.map((rating) => (
                                <button
                                  key={rating}
                                  type="button"
                                  onClick={() => updateActiveLeadDraft({ lead_rating: rating })}
                                  className={cn(
                                    "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition",
                                    rating <= activeLeadRating
                                      ? "border-amber-300/70 bg-amber-50 text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/15 dark:text-amber-100"
                                      : "border-border/60 bg-background/70 text-foreground hover:bg-muted/50"
                                  )}
                                >
                                  <Star
                                    className={cn(
                                      "h-4 w-4",
                                      rating <= activeLeadRating ? "fill-current" : ""
                                    )}
                                    aria-hidden
                                  />
                                  {rating}
                                </button>
                              ))}
                            </div>
                          </div>
                        </div>
                      </div>
                    </section>

                    <section className="space-y-3">
                      <SectionLabel>Submission context</SectionLabel>
                      <div className="space-y-3 rounded-2xl border border-border/50 bg-card/70 p-4 text-sm">
                        {activeLead.source_url ? (
                          <div>
                            <div className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                              Source URL
                            </div>
                            <a
                              href={activeLead.source_url}
                              target="_blank"
                              rel="noreferrer"
                              className="mt-1 inline-flex max-w-full items-center gap-2 break-all font-medium text-foreground underline underline-offset-4"
                            >
                              <span>{activeLead.source_url}</span>
                              <ExternalLink className="h-4 w-4 shrink-0" aria-hidden />
                            </a>
                          </div>
                        ) : null}
                        {activeLead.message ? (
                          <div>
                            <div className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                              Message
                            </div>
                            <p className="mt-1 whitespace-pre-wrap text-foreground">
                              {activeLead.message}
                            </p>
                          </div>
                        ) : null}
                        {!activeLead.source_url && !activeLead.message ? (
                          <p className="text-muted-foreground">
                            No source URL or message was captured.
                          </p>
                        ) : null}
                      </div>
                    </section>
                  </div>

                  <section className="space-y-3">
                    <SectionLabel>Follow-up</SectionLabel>
                    <div className="space-y-4 rounded-2xl border border-border/50 bg-card/70 p-4">
                      <div className="space-y-2">
                        <Label
                          htmlFor={`networking-detail-note-${activeLead.id}`}
                          className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground"
                        >
                          Note
                        </Label>
                        <Textarea
                          id={`networking-detail-note-${activeLead.id}`}
                          value={activeDraft?.note ?? ""}
                          onChange={(event) =>
                            updateActiveLeadDraft({ note: event.target.value })
                          }
                          placeholder="Capture the context you want before you follow up."
                          className="min-h-28 rounded-2xl"
                        />
                      </div>

                      <div className="space-y-2">
                        <Label
                          htmlFor={`networking-detail-follow-up-${activeLead.id}`}
                          className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground"
                        >
                          Reminder
                        </Label>
                        <Input
                          id={`networking-detail-follow-up-${activeLead.id}`}
                          type="datetime-local"
                          value={
                            activeLeadStatus === "done"
                              ? ""
                              : activeDraft?.next_follow_up_at ?? ""
                          }
                          onChange={(event) =>
                            updateActiveLeadDraft({
                              next_follow_up_at: event.target.value,
                            })
                          }
                          disabled={activeLeadStatus === "done"}
                        />
                        <p className="text-xs text-muted-foreground">
                          Mark done to clear the reminder.
                        </p>
                      </div>
                    </div>
                  </section>
                </section>

                {activeLeadCustomFields.length > 0 ? (
                  <section className="space-y-3">
                    <SectionLabel>Submission details</SectionLabel>
                    <div className="grid gap-3 md:grid-cols-2">
                      {activeLeadCustomFields.map((field) => (
                        <div
                          key={field.key}
                          className="rounded-2xl border border-border/50 bg-card/70 p-4"
                        >
                          <div className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                            {field.label}
                          </div>
                          <p className="mt-2 whitespace-pre-wrap text-sm text-foreground">
                            {field.value}
                          </p>
                        </div>
                      ))}
                    </div>
                  </section>
                ) : null}
              </div>
            </div>

            <div className="shrink-0 border-t border-border/50 px-5 py-3 lg:px-6">
              <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                {isPhoneLikeDevice ? (
                  <Button
                    type="button"
                    size="sm"
                    className="w-full justify-center gap-1.5 sm:w-auto"
                    onClick={() => void saveContactToPhone(activeLead)}
                  >
                    <FileText className="h-4 w-4" aria-hidden />
                    Save to phone
                  </Button>
                ) : null}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="w-full justify-center gap-1.5 sm:w-auto"
                  disabled={!activeLead.email}
                  onClick={() => copyEmailToClipboard(activeLead)}
                >
                  <Copy className="h-4 w-4" aria-hidden />
                  Copy email
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="w-full justify-center gap-1.5 sm:w-auto"
                  onClick={() => downloadLeadVCard(activeLead)}
                >
                  <FileText className="h-4 w-4" aria-hidden />
                  Download vCard
                </Button>
                <Button
                  type="button"
                  size="sm"
                  className="w-full justify-center sm:w-auto"
                  onClick={() => updateActiveLeadDraft({ lead_flag: "done" })}
                >
                  Mark done
                </Button>
                <Button asChild variant="outline" size="sm">
                  <Link href="/dashboard/leads">Open leads inbox</Link>
                </Button>
              </div>
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
    </>
  );
}

function FlagBadge({ flag }: { flag: LeadFlag }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold",
        getLeadFlagBadgeClassName(flag)
      )}
    >
      {getLeadFlagLabel(flag)}
    </span>
  );
}

function RatingBadge({ rating }: { rating: number }) {
  const normalized = normalizeLeadRating(rating);
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-amber-300/60 bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/15 dark:text-amber-100">
      <span className="inline-flex items-center gap-0.5" aria-label={getLeadRatingLabel(normalized)}>
        {Array.from({ length: 5 }).map((_, index) => (
          <Star
            key={index}
            className={cn(
              "h-3.5 w-3.5",
              index < normalized ? "fill-current" : "opacity-30"
            )}
            aria-hidden
          />
        ))}
      </span>
      <span>{normalized}</span>
    </span>
  );
}

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <div className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
      {children}
    </div>
  );
}

function LeadDetailItem({
  icon: Icon,
  label,
  value,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl border border-border/50 bg-card/70 p-3.5">
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        <Icon className="h-4 w-4" aria-hidden />
        {label}
      </div>
      <div className="mt-1.5 break-words text-sm text-foreground">{value}</div>
    </div>
  );
}

function normalizeLeadRow(row: unknown, fallbackUserId: string): Lead {
  const source = isRecord(row) ? row : {};
  return {
    id: toTextValue(source.id) || `lead_${randomId()}`,
    user_id: toTextValue(source.user_id) || fallbackUserId,
    handle: toTextValue(source.handle),
    name: toTextValue(source.name),
    email: toTextValue(source.email),
    phone: toNullableTextValue(source.phone),
    company: toNullableTextValue(source.company),
    message: toNullableTextValue(source.message),
    note: toTextValue(source.note),
    next_follow_up_at: toNullableTextValue(source.next_follow_up_at),
    lead_flag: normalizeLeadFlag(source.lead_flag),
    lead_rating: normalizeLeadRating(source.lead_rating, getDefaultLeadRating(source.lead_flag)),
    custom_fields: sanitizeCustomFields(source.custom_fields),
    source_url: toNullableTextValue(source.source_url),
    created_at: toNonEmptyText(source.created_at, new Date().toISOString()),
  };
}

function toDraft(lead: Lead): NetworkingDraft {
  return {
    note: lead.note ?? "",
    next_follow_up_at: formatDatetimeLocalValue(lead.next_follow_up_at),
    lead_flag: lead.lead_flag,
    lead_rating: normalizeLeadRating(lead.lead_rating),
  };
}

function areDraftsEquivalent(a: NetworkingDraft, b: NetworkingDraft) {
  return (
    a.note === b.note &&
    a.next_follow_up_at === b.next_follow_up_at &&
    a.lead_flag === b.lead_flag &&
    normalizeLeadRating(a.lead_rating) === normalizeLeadRating(b.lead_rating)
  );
}

function isLeadDraftDirty(lead: Lead, draft: NetworkingDraft) {
  return !areDraftsEquivalent(toDraft(lead), draft);
}

function formatDatetimeLocalValue(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (input: number) => String(input).padStart(2, "0");
  return (
    [
      date.getFullYear(),
      pad(date.getMonth() + 1),
      pad(date.getDate()),
    ].join("-") + `T${pad(date.getHours())}:${pad(date.getMinutes())}`
  );
}

function parseDatetimeLocalValue(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const date = new Date(trimmed);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function formatSubmittedLabel(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "recently";
  return date.toLocaleString();
}

function collectDisplayCustomFields(
  fields: Lead["custom_fields"]
): Array<{ key: string; label: string; value: string }> {
  return Object.entries(fields ?? {}).flatMap(([key, rawValue]) => {
    if (!key || rawValue == null) return [];
    const parsed = parseCustomFieldKey(key);
    const label = parsed.label || toReadableLabel(parsed.id);
    if (CORE_FIELD_KEYS.has(label.toLowerCase()) || CORE_FIELD_KEYS.has(parsed.id.toLowerCase())) {
      return [];
    }
    const value = formatLeadValue(rawValue);
    if (!value.trim()) return [];
    return [{ key, label, value }];
  });
}

function parseCustomFieldKey(key: string) {
  const parts = key.split("::");
  if (parts.length < 2) return { id: key, label: null as string | null };
  const id = parts[parts.length - 1]?.trim() || key;
  const label = parts.slice(0, -1).join("::").trim() || null;
  return { id, label };
}

function formatLeadValue(value: string | boolean | null) {
  if (value === true) return "Yes";
  if (value === false) return "No";
  if (value == null) return "";
  return String(value);
}

function toReadableLabel(value: string) {
  return value
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function sanitizeCustomFields(value: unknown): Record<string, string | boolean | null> | null {
  if (!isRecord(value)) return null;
  const next: Record<string, string | boolean | null> = {};
  Object.entries(value).forEach(([rawKey, rawValue]) => {
    const key = toNonEmptyText(rawKey, "");
    if (!key) return;
    if (rawValue == null) next[key] = null;
    else if (typeof rawValue === "boolean") next[key] = rawValue;
    else if (typeof rawValue === "string") next[key] = rawValue;
    else if (typeof rawValue === "number" && Number.isFinite(rawValue)) {
      next[key] = String(rawValue);
    }
  });
  return Object.keys(next).length > 0 ? next : null;
}

function canUseRealtime() {
  if (typeof window === "undefined") return false;
  if (typeof window.WebSocket !== "function") return false;
  if (window.isSecureContext) return true;
  const hostname = window.location.hostname.toLowerCase();
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "[::1]" ||
    hostname.endsWith(".local")
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function toTextValue(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value === "boolean") return value ? "true" : "false";
  return "";
}

function toNullableTextValue(value: unknown) {
  if (value == null) return null;
  const text = toTextValue(value);
  return text.length > 0 ? text : null;
}

function toNonEmptyText(value: unknown, fallback: string) {
  const text = toTextValue(value).trim();
  return text || fallback;
}

function randomId() {
  return Math.random().toString(36).slice(2, 10);
}

function dedupeById(list: Lead[]) {
  const seen = new Set<string>();
  return list.filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}
