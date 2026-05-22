"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Building2,
  Copy,
  CalendarClock,
  Download,
  ExternalLink,
  FileText,
  Filter,
  Mail,
  Paperclip,
  Phone,
  RefreshCw,
  StickyNote,
  Trash2,
  UserRound,
  Star,
} from "lucide-react";

import { toast } from "@/components/system/toaster";
import { useDashboardPlanAccess } from "@/components/dashboard/DashboardSessionContext";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  compareLeadsByPriority,
  getLeadFlagBadgeClassName,
  getLeadFlagLabel,
  getLeadRatingLabel,
  getDefaultLeadRating,
  getDefaultFollowUpAt,
  normalizeLeadFlag,
  normalizeLeadRating,
  type LeadFlag,
} from "@/lib/lead-workflow";
import { normalizeLeadFormConfig } from "@/lib/lead-form";
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabase";
import type { Lead } from "@/types/db";
import type { LeadFormConfig, LeadFormFieldType } from "@/types/lead-form";
import type {
  RealtimeChannel,
  RealtimePostgresChangesPayload,
} from "@supabase/supabase-js";

type LeadWorkflowStatus = LeadFlag;
type LeadSortOption = "newest" | "oldest" | "name-asc" | "name-desc" | "priority";
type LeadFieldEntry = {
  key: string;
  label: string;
  value: string;
  type?: LeadFormFieldType;
  fileLinks?: Array<{ name: string; url: string }>;
};
type LeadView = {
  lead: Lead;
  status: LeadWorkflowStatus;
  statusMeta: { label: string; className: string };
  attachments: Array<{ name: string; url: string }>;
  preview: string;
  detailFields: LeadFieldEntry[];
  submittedLabel: string;
  submittedShortLabel: string;
  submittedSortValue: number;
};

type FieldLabelMap = Record<
  string,
  Record<string, { label: string; type: LeadFormFieldType }>
>;

type LeadListFilters = {
  hasAttachment: boolean;
  missingPhone: boolean;
  newOnly: boolean;
};

type LeadFollowUpDraft = {
  note: string;
  next_follow_up_at: string;
  lead_flag: LeadFlag;
  lead_rating: number;
};

const DEFAULT_FILTERS: LeadListFilters = {
  hasAttachment: false,
  missingPhone: false,
  newOnly: false,
};
const CORE_FIELD_KEYS = new Set(["name", "email", "phone", "company", "message"]);
const STATUS_META: Record<
  LeadWorkflowStatus,
  { label: string; className: string }
> = {
  follow_up: {
    label: getLeadFlagLabel("follow_up"),
    className: getLeadFlagBadgeClassName("follow_up"),
  },
  done: {
    label: getLeadFlagLabel("done"),
    className: getLeadFlagBadgeClassName("done"),
  },
};
const LEAD_RATING_OPTIONS = [1, 2, 3, 4, 5] as const;
const relativeTimeFormatter = new Intl.RelativeTimeFormat("en-US", {
  numeric: "auto",
});

function pruneSelectedIds(selectedIds: Set<string>, loadedIds: Set<string>) {
  if (selectedIds.size === 0) return selectedIds;
  const next = new Set<string>();
  selectedIds.forEach((id) => {
    if (loadedIds.has(id)) next.add(id);
  });
  return next.size === selectedIds.size ? selectedIds : next;
}

function formatDatetimeLocalValue(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (input: number) => String(input).padStart(2, "0");
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
  ].join("-") + `T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function parseDatetimeLocalValue(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const date = new Date(trimmed);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function formatRelativeTime(date: string) {
  const target = new Date(date).getTime();
  if (Number.isNaN(target)) return "recently";

  const diffMs = target - Date.now();
  const diffMinutes = Math.round(diffMs / 60_000);

  if (Math.abs(diffMinutes) < 60) {
    return relativeTimeFormatter.format(diffMinutes, "minute");
  }

  const diffHours = Math.round(diffMinutes / 60);
  if (Math.abs(diffHours) < 24) {
    return relativeTimeFormatter.format(diffHours, "hour");
  }

  const diffDays = Math.round(diffHours / 24);
  if (Math.abs(diffDays) < 30) {
    return relativeTimeFormatter.format(diffDays, "day");
  }

  const diffMonths = Math.round(diffDays / 30);
  if (Math.abs(diffMonths) < 12) {
    return relativeTimeFormatter.format(diffMonths, "month");
  }

  const diffYears = Math.round(diffDays / 365);
  return relativeTimeFormatter.format(diffYears, "year");
}

export default function LeadsList({ userId }: { userId: string }) {
  const planAccess = useDashboardPlanAccess();
  const canLabelLeads = planAccess.canLabelLeads;
  const [leads, setLeads] = useState<Lead[]>([]);
  const [fieldLabels, setFieldLabels] = useState<FieldLabelMap>({});
  const [loading, setLoading] = useState(true);
  const [fetching, setFetching] = useState(false);
  const [q, setQ] = useState("");
  const [hasMore, setHasMore] = useState(false);
  const [selectedIdState, setSelectedIdState] = useState<Set<string>>(new Set());
  const [sortBy, setSortBy] = useState<LeadSortOption>("priority");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filters, setFilters] = useState<LeadListFilters>(DEFAULT_FILTERS);
  const [activeLeadId, setActiveLeadId] = useState<string | null>(null);
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const [leadDrafts, setLeadDrafts] = useState<Record<string, LeadFollowUpDraft>>({});
  const [savingLeadId, setSavingLeadId] = useState<string | null>(null);

  const pageSize = 20;
  const offsetRef = useRef(0);
  const selectAllRef = useRef<HTMLInputElement | null>(null);
  const exportMenuRef = useRef<HTMLDivElement | null>(null);
  const pendingDeleteTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(
    new Map()
  );

  const searchQuery = q.trim();
  const leadStatuses = useMemo<Record<string, LeadFlag>>(() => {
    const next: Record<string, LeadFlag> = {};
    leads.forEach((lead) => {
      next[lead.id] = lead.lead_flag;
    });
    return next;
  }, [leads]);
  const loadedLeadIds = useMemo(
    () => new Set(leads.map((lead) => lead.id)),
    [leads]
  );
  const selectedIds = useMemo(
    () => pruneSelectedIds(selectedIdState, loadedLeadIds),
    [loadedLeadIds, selectedIdState]
  );

  async function load({ reset = false }: { reset?: boolean } = {}) {
    if (!userId) return;
    if (reset) {
      setLoading(true);
      offsetRef.current = 0;
    } else {
      setFetching(true);
    }

    const query = supabase
      .from("leads")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .range(offsetRef.current, offsetRef.current + pageSize - 1);

    if (searchQuery) {
      const pattern = `%${searchQuery}%`;
      query.or(
        [
          `name.ilike.${pattern}`,
          `email.ilike.${pattern}`,
          `phone.ilike.${pattern}`,
          `company.ilike.${pattern}`,
          `message.ilike.${pattern}`,
          `note.ilike.${pattern}`,
          `lead_flag.ilike.${pattern}`,
        ].join(",")
      );
    }

    const { data, error } = await query;
    if (error) {
      if (reset) setLeads([]);
      toast({
        title: "Leads unavailable",
        description: error.message,
        variant: "destructive",
      });
    } else {
      const rows = Array.isArray(data)
        ? data.map((row) => sanitizeLeadRow(row, userId))
        : [];
      if (reset) setLeads(rows);
      else setLeads((prev) => dedupeById([...prev, ...rows]));
      setHasMore(rows.length === pageSize);
      offsetRef.current += rows.length;
    }

    if (reset) setLoading(false);
    else setFetching(false);
  }

  useEffect(() => {
    if (!userId) return;
    const timer = setTimeout(() => {
      void load({ reset: true });
    }, 0);
    return () => clearTimeout(timer);
  }, [userId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const timer = setTimeout(() => {
      load({ reset: true });
    }, 250);
    return () => clearTimeout(timer);
  }, [searchQuery]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const handles = Array.from(new Set(leads.map((lead) => lead.handle).filter(Boolean)));
    if (handles.length === 0) return;
    let cancelled = false;

    (async () => {
      const { data, error } = await supabase
        .from("lead_forms")
        .select("handle, config")
        .in("handle", handles)
        .eq("user_id", userId);
      if (error || !data || cancelled) return;

      const next: FieldLabelMap = {};
      (data as Array<{ handle: string | null; config: LeadFormConfig }>).forEach(
        (row) => {
          if (!row.handle) return;
          const handle = row.handle;
          const normalized = normalizeLeadFormConfig(row.config, handle);
          next[handle] = {};
          normalized.fields.forEach((field) => {
            next[handle][field.id] = {
              label: toTextValue(field.label),
              type: field.type,
            };
          });
        }
      );
      setFieldLabels((prev) => ({ ...prev, ...next }));
    })();

    return () => {
      cancelled = true;
    };
  }, [leads, userId]);

  useEffect(() => {
    if (!canUseRealtime() || !userId) return;
    let channel: RealtimeChannel | null = null;
    try {
      channel = supabase
        .channel(`leads-owner-${userId}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "leads",
            filter: `user_id=eq.${userId}`,
          },
          (payload: RealtimePostgresChangesPayload<Lead>) => {
            if (payload.eventType === "INSERT") {
              const row = sanitizeLeadRow(payload.new, userId);
              setLeads((prev) => dedupeById([row, ...prev]));
            } else if (payload.eventType === "UPDATE") {
              const row = sanitizeLeadRow(payload.new, userId);
              setLeads((prev) => prev.map((lead) => (lead.id === row.id ? row : lead)));
            } else if (payload.eventType === "DELETE") {
              const id = sanitizeLeadId(payload.old);
              if (!id) return;
              setLeads((prev) => prev.filter((lead) => lead.id !== id));
              setSelectedIdState((prev) => {
                if (!prev.has(id)) return prev;
                const next = new Set(prev);
                next.delete(id);
                return next;
              });
            }
          }
        )
        .subscribe();
    } catch (error) {
      console.warn(
        `Realtime disabled for leads inbox: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }

    return () => {
      if (channel) supabase.removeChannel(channel);
    };
  }, [userId]);

  useEffect(() => {
    const timers = pendingDeleteTimers.current;
    return () => {
      timers.forEach((timer) => clearTimeout(timer));
      timers.clear();
    };
  }, []);

  useEffect(() => {
    if (!exportMenuOpen) return;
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (exportMenuRef.current?.contains(target)) return;
      setExportMenuOpen(false);
    };
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [exportMenuOpen]);

  const leadViews = useMemo(() => {
    const rows = leads.map<LeadView>((lead) => {
      const detailFields = collectLeadFieldEntries(lead, fieldLabels);
      const attachments = dedupeFileLinks(
        detailFields.flatMap((field) => field.fileLinks ?? [])
      );
      const status = normalizeLeadFlag(leadStatuses[lead.id] ?? lead.lead_flag);
      const createdAt = new Date(lead.created_at);
      return {
        lead,
        status,
        statusMeta: STATUS_META[status],
        attachments,
        preview: buildLeadPreview(lead, detailFields),
        detailFields,
        submittedLabel: createdAt.toLocaleString(),
        submittedShortLabel: formatLeadSubmittedShort(createdAt),
        submittedSortValue: createdAt.getTime(),
      };
    });

    return rows
      .filter((row) => {
        if (filters.hasAttachment && row.attachments.length === 0) return false;
        if (filters.missingPhone && row.lead.phone) return false;
        if (filters.newOnly && row.status !== "follow_up") return false;
        return matchesLeadSearch(row, searchQuery);
      })
      .sort((a, b) => compareLeadViews(a, b, sortBy));
  }, [fieldLabels, filters, leadStatuses, leads, searchQuery, sortBy]);

  const visibleIds = useMemo(() => leadViews.map((row) => row.lead.id), [leadViews]);
  const allVisibleSelected =
    visibleIds.length > 0 && visibleIds.every((id) => selectedIds.has(id));
  const someVisibleSelected =
    visibleIds.some((id) => selectedIds.has(id)) && !allVisibleSelected;
  const selectedLeads = useMemo(
    () => leads.filter((lead) => selectedIds.has(lead.id)),
    [leads, selectedIds]
  );
  const effectiveActiveLeadId =
    activeLeadId && loadedLeadIds.has(activeLeadId) ? activeLeadId : null;
  const activeLeadView =
    leadViews.find((row) => row.lead.id === effectiveActiveLeadId) ??
    (effectiveActiveLeadId
      ? buildDetachedLeadView(
          leads.find((lead) => lead.id === effectiveActiveLeadId) ?? null,
          fieldLabels,
          leadStatuses
        )
      : null);
  const activeLeadDraft = activeLeadView
    ? leadDrafts[activeLeadView.lead.id] ?? {
        note: activeLeadView.lead.note ?? "",
        next_follow_up_at: formatDatetimeLocalValue(
          activeLeadView.lead.next_follow_up_at
        ),
        lead_flag: activeLeadView.lead.lead_flag,
        lead_rating: normalizeLeadRating(activeLeadView.lead.lead_rating),
      }
    : null;
  const activeLeadStatus = activeLeadDraft?.lead_flag ?? activeLeadView?.lead.lead_flag ?? "follow_up";
  const activeLeadRating = normalizeLeadRating(
    activeLeadDraft?.lead_rating ?? activeLeadView?.lead.lead_rating ?? getDefaultLeadRating(activeLeadStatus)
  );

  useEffect(() => {
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate = someVisibleSelected;
    }
  }, [someVisibleSelected]);

  useEffect(() => {
    if (!activeLeadId) return;
    const currentLead = leads.find((lead) => lead.id === activeLeadId);
    if (!currentLead) return;
    setLeadDrafts((prev) => {
      if (prev[currentLead.id]) return prev;
      return {
        ...prev,
        [currentLead.id]: {
          note: currentLead.note ?? "",
          next_follow_up_at: formatDatetimeLocalValue(
            currentLead.next_follow_up_at
          ),
          lead_flag: currentLead.lead_flag,
          lead_rating: normalizeLeadRating(currentLead.lead_rating),
        },
      };
    });
  }, [activeLeadId, leads]);

  function toggleLeadSelection(id: string) {
    setSelectedIdState((prev) => {
      const next = new Set(pruneSelectedIds(prev, loadedLeadIds));
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAllVisible() {
    if (visibleIds.length === 0) return;
    setSelectedIdState((prev) => {
      const next = new Set(pruneSelectedIds(prev, loadedLeadIds));
      if (allVisibleSelected) visibleIds.forEach((id) => next.delete(id));
      else visibleIds.forEach((id) => next.add(id));
      return next;
    });
  }

  function clearSelection() {
    setSelectedIdState(new Set());
  }

  async function updateLeadStatus(id: string, status: LeadWorkflowStatus) {
    if (!canLabelLeads || !userId) return;
    const nextStatus = normalizeLeadFlag(status);
    const previousLead = leads.find((lead) => lead.id === id);
    if (!previousLead) return;
    const nextFollowUpAt =
      nextStatus === "done"
        ? null
        : previousLead.next_follow_up_at ?? getDefaultFollowUpAt(previousLead.created_at);

    setLeads((prev) =>
      prev.map((lead) =>
        lead.id === id
          ? {
              ...lead,
              lead_flag: nextStatus,
              next_follow_up_at: nextFollowUpAt,
            }
          : lead
      )
    );
    setLeadDrafts((prev) => ({
      ...prev,
      [id]: {
        note: prev[id]?.note ?? previousLead.note ?? "",
        next_follow_up_at:
          nextFollowUpAt === null
            ? ""
            : nextFollowUpAt ??
              prev[id]?.next_follow_up_at ??
              previousLead.next_follow_up_at ??
              "",
        lead_flag: nextStatus,
        lead_rating: prev[id]?.lead_rating ?? normalizeLeadRating(previousLead.lead_rating),
      },
    }));

    const { error } = await supabase
      .from("leads")
      .update({
        lead_flag: nextStatus,
        next_follow_up_at: nextFollowUpAt,
      })
      .eq("id", id)
      .eq("user_id", userId);

    if (error) {
      setLeads((prev) =>
        prev.map((lead) =>
          lead.id === id
            ? {
                ...lead,
                lead_flag: previousLead.lead_flag,
                next_follow_up_at: previousLead.next_follow_up_at,
              }
            : lead
        )
      );
      setLeadDrafts((prev) => ({
        ...prev,
        [id]: {
          note: prev[id]?.note ?? previousLead.note ?? "",
          next_follow_up_at:
            prev[id]?.next_follow_up_at ?? previousLead.next_follow_up_at ?? "",
          lead_flag: previousLead.lead_flag,
          lead_rating: prev[id]?.lead_rating ?? normalizeLeadRating(previousLead.lead_rating),
        },
      }));
      toast({
        title: "Unable to update status",
        description: error.message,
        variant: "destructive",
      });
    }
  }

  async function saveLeadFollowUp(id: string) {
    if (!userId) return;
    const draft = leadDrafts[id];
    const currentLead = leads.find((lead) => lead.id === id);
    if (!draft || !currentLead) return;

    setSavingLeadId(id);
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
        .eq("user_id", userId)
        .select("id, note, next_follow_up_at, lead_flag, lead_rating")
        .maybeSingle();

      if (error) throw new Error(error.message);
      if (!data) throw new Error("Lead not found");

      const nextRow = data as {
        id: string;
        note: string | null;
        next_follow_up_at: string | null;
        lead_flag: LeadFlag | null;
        lead_rating: number | null;
      };

      const nextDraft: LeadFollowUpDraft = {
        note: nextRow.note ?? "",
        next_follow_up_at: formatDatetimeLocalValue(
          nextRow.next_follow_up_at
        ),
        lead_flag: normalizeLeadFlag(nextRow.lead_flag),
        lead_rating: normalizeLeadRating(nextRow.lead_rating),
      };

      setLeads((prev) =>
        prev.map((lead) =>
          lead.id === id
            ? {
                ...lead,
                note: nextDraft.note,
                next_follow_up_at: nextRow.next_follow_up_at ?? null,
                lead_flag: nextDraft.lead_flag,
                lead_rating: nextDraft.lead_rating,
              }
            : lead
        )
      );
      setLeadDrafts((prev) => ({ ...prev, [id]: nextDraft }));
      toast({
        title: "Follow-up saved",
        variant: "success",
      });
    } catch (error) {
      toast({
        title: "Unable to save follow-up",
        description:
          error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setSavingLeadId(null);
    }
  }

  function deleteLead(id: string) {
    const index = leads.findIndex((lead) => lead.id === id);
    if (index === -1) return;
    if (!window.confirm("Delete this lead? This cannot be undone.")) return;
    scheduleLeadDelete([{ lead: leads[index], index }]);
  }

  function deleteSelected() {
    if (selectedIds.size === 0) return;
    if (!window.confirm(`Delete ${selectedIds.size} lead(s)? This cannot be undone.`)) {
      return;
    }
    const selected = new Set(selectedIds);
    const entries = leads
      .map((lead, index) => ({ lead, index }))
      .filter(({ lead }) => selected.has(lead.id));
    scheduleLeadDelete(entries);
  }

  function exportCsv(targetLeads: Lead[] = leads) {
    if (targetLeads.length === 0) {
      toast({ title: "No leads to export" });
      return;
    }

    const customKeySet = new Set<string>();
    const labelByKey: Record<string, string> = {};
    targetLeads.forEach((lead) => {
      Object.entries(lead.custom_fields ?? {}).forEach(([key, value]) => {
        if (!key || isCoreFieldKey(key) || value == null) return;
        if (value === "" || (typeof value === "string" && !value.trim())) return;
        const parsed = parseCustomFieldKey(key);
        customKeySet.add(key);
        labelByKey[key] =
          labelByKey[key] ||
          parsed.label ||
          fieldLabels[lead.handle]?.[parsed.id]?.label ||
          toReadableLabel(parsed.id);
      });
    });

    const customKeys = Array.from(customKeySet);
    const header = [
      "created_at",
      "lead_status",
      "lead_rating",
      "name",
      "email",
      "phone",
      "company",
      "message",
      "note",
      "next_follow_up_at",
      "handle",
      ...customKeys.map((key) => labelByKey[key] || toReadableLabel(key)),
    ];
    const rows = targetLeads.map((lead) => [
      safeCsv(lead.created_at),
      safeCsv(leadStatuses[lead.id] ?? lead.lead_flag),
      safeCsv(String(normalizeLeadRating(lead.lead_rating))),
      safeCsv(lead.name),
      safeCsv(lead.email),
      safeCsv(lead.phone || ""),
      safeCsv(lead.company || ""),
      safeCsv(lead.message || ""),
      safeCsv(lead.note || ""),
      safeCsv(lead.next_follow_up_at || ""),
      safeCsv(lead.handle),
      ...customKeys.map((key) =>
        safeCsv(formatLeadValue(lead.custom_fields?.[key] ?? null))
      ),
    ]);

    const csv = [header.join(","), ...rows.map((row) => row.join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const anchor = document.createElement("a");
    anchor.href = URL.createObjectURL(blob);
    anchor.download = `leads-${new Date()
      .toISOString()
      .slice(0, 19)
      .replace(/[:T]/g, "-")}.csv`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  }

  function restoreRemovedLeads(entries: Array<{ lead: Lead; index: number }>) {
    if (!entries.length) return;
    const sorted = entries.slice().sort((a, b) => a.index - b.index);
    setLeads((prev) => {
      const next = [...prev];
      sorted.forEach(({ lead, index }) => {
        if (next.some((item) => item.id === lead.id)) return;
        next.splice(Math.min(Math.max(index, 0), next.length), 0, lead);
      });
      return dedupeById(next);
    });
  }

  function scheduleLeadDelete(entries: Array<{ lead: Lead; index: number }>) {
    if (!entries.length) return;
    const ids = entries.map((entry) => entry.lead.id);
    const idSet = new Set(ids);
    setLeads((prev) => prev.filter((lead) => !idSet.has(lead.id)));
    setSelectedIdState((prev) => {
      const next = new Set(pruneSelectedIds(prev, loadedLeadIds));
      ids.forEach((id) => next.delete(id));
      return next;
    });
    if (activeLeadId && idSet.has(activeLeadId)) setActiveLeadId(null);

    const transactionId = `lead-delete-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 8)}`;
    const timer = setTimeout(async () => {
      pendingDeleteTimers.current.delete(transactionId);
      const { error } = await supabase
        .from("leads")
        .delete()
        .in("id", ids)
        .eq("user_id", userId);
      if (error) {
        restoreRemovedLeads(entries);
        toast({
          title: "Delete failed",
          description: error.message,
          variant: "destructive",
        });
        return;
      }
      toast({
        title: ids.length === 1 ? "Lead deleted" : "Leads deleted",
        variant: "success",
      });
    }, 5000);

    pendingDeleteTimers.current.set(transactionId, timer);
    toast({
      title: ids.length === 1 ? "Lead removed" : "Leads removed",
      description: "Undo within 5 seconds.",
      actionLabel: "Undo",
      durationMs: 5000,
      onAction: () => {
        const activeTimer = pendingDeleteTimers.current.get(transactionId);
        if (!activeTimer) return;
        clearTimeout(activeTimer);
        pendingDeleteTimers.current.delete(transactionId);
        restoreRemovedLeads(entries);
      },
    });
  }

  return (
    <>
      <div className="dashboard-leads-list space-y-3 sm:space-y-4">
        {!canLabelLeads ? (
          <div className="rounded-[1.6rem] border border-primary/20 bg-primary/5 px-4 py-4 shadow-sm">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="space-y-1">
                <div className="text-sm font-semibold text-foreground">
                  Paid unlocks lead labeling
                </div>
                <p className="text-sm text-muted-foreground">
                  Upgrade to mark leads as Follow up or Done and keep a simple 1-5 star rating on every contact.
                </p>
              </div>
              <Button asChild size="sm" className="w-full sm:w-auto">
                <Link href={planAccess.upgradeHref}>Unlock paid features</Link>
              </Button>
            </div>
          </div>
        ) : null}
        <div className="dashboard-leads-toolbar sticky top-2 z-20 rounded-[1.25rem] border border-border/60 bg-card/95 p-2 shadow-[0_18px_42px_-34px_rgba(15,23,42,0.4)] backdrop-blur sm:top-4 sm:rounded-[1.75rem] sm:p-4">
          <div className="flex flex-col gap-2 xl:flex-row xl:items-center">
            <div className="min-w-0 flex-1">
              <Input
                value={q}
                onChange={(event) => setQ(event.target.value)}
                placeholder="Search name, email, phone, company, note, status"
                aria-label="Search leads"
                className="h-10 rounded-xl text-sm sm:h-11 sm:rounded-2xl"
              />
            </div>
            <div className="grid grid-cols-2 gap-1.5 sm:flex sm:flex-wrap sm:items-center sm:gap-2">
              <Button
                type="button"
                variant={filtersOpen || hasActiveFilters(filters) ? "secondary" : "outline"}
                size="sm"
                onClick={() => setFiltersOpen((value) => !value)}
                className="h-9 rounded-xl"
              >
                <Filter className="h-4 w-4" aria-hidden />
                Filters
              </Button>
              <Select
                value={sortBy}
                onValueChange={(value) => setSortBy(value as LeadSortOption)}
              >
                <SelectTrigger className="h-9 w-full min-w-0 rounded-xl bg-background/80 sm:min-w-[170px] sm:rounded-2xl">
                  <SelectValue placeholder="Sort" />
                </SelectTrigger>
                <SelectContent className="rounded-2xl border-border/60 bg-popover/95">
                  <SelectItem value="priority">Priority first</SelectItem>
                  <SelectItem value="newest">Newest first</SelectItem>
                  <SelectItem value="oldest">Oldest first</SelectItem>
                  <SelectItem value="name-asc">Name A-Z</SelectItem>
                  <SelectItem value="name-desc">Name Z-A</SelectItem>
                </SelectContent>
              </Select>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => load({ reset: true })}
                className="h-9 rounded-xl"
              >
                <RefreshCw className={cn("h-4 w-4", fetching && "animate-spin")} aria-hidden />
                Refresh
              </Button>
              <div className="relative" ref={exportMenuRef}>
                <Button
                  type="button"
                  size="sm"
                  onClick={() => setExportMenuOpen((value) => !value)}
                  className="h-9 w-full rounded-xl sm:w-auto sm:rounded-2xl"
                >
                  <Download className="h-4 w-4" aria-hidden />
                  Export
                </Button>
                {exportMenuOpen ? (
                  <div className="absolute right-0 top-[calc(100%+0.5rem)] z-30 min-w-[220px] rounded-2xl border border-border/60 bg-popover/95 p-2 shadow-[0_22px_50px_-28px_rgba(15,23,42,0.48)] backdrop-blur">
                    <button
                      type="button"
                      className="flex w-full rounded-xl px-3 py-2 text-left text-sm hover:bg-muted/60"
                      onClick={() => {
                        exportCsv(leads);
                        setExportMenuOpen(false);
                      }}
                    >
                      Export all loaded leads
                    </button>
                    <button
                      type="button"
                      className="flex w-full rounded-xl px-3 py-2 text-left text-sm hover:bg-muted/60"
                      onClick={() => {
                        exportCsv(leadViews.map((row) => row.lead));
                        setExportMenuOpen(false);
                      }}
                    >
                      Export visible results
                    </button>
                    <button
                      type="button"
                      className="flex w-full rounded-xl px-3 py-2 text-left text-sm hover:bg-muted/60 disabled:opacity-50"
                      disabled={selectedLeads.length === 0}
                      onClick={() => {
                        exportCsv(selectedLeads);
                        setExportMenuOpen(false);
                      }}
                    >
                      Export selected leads
                    </button>
                  </div>
                ) : null}
              </div>
            </div>
          </div>

          {(filtersOpen || hasActiveFilters(filters)) && (
            <div className="mt-2 flex flex-wrap items-center gap-1.5 sm:mt-3 sm:gap-2">
              <FilterChip
                active={filters.hasAttachment}
                onClick={() =>
                  setFilters((prev) => ({ ...prev, hasAttachment: !prev.hasAttachment }))
                }
              >
                Has attachment
              </FilterChip>
              <FilterChip
                active={filters.missingPhone}
                onClick={() =>
                  setFilters((prev) => ({ ...prev, missingPhone: !prev.missingPhone }))
                }
              >
                Missing phone
              </FilterChip>
              <FilterChip
                active={filters.newOnly}
                onClick={() => setFilters((prev) => ({ ...prev, newOnly: !prev.newOnly }))}
              >
                Follow-up only
              </FilterChip>
              {hasActiveFilters(filters) ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setFilters(DEFAULT_FILTERS)}
                >
                  Clear filters
                </Button>
              ) : null}
            </div>
          )}

          {selectedIds.size > 0 ? (
            <div className="mt-2 flex flex-col items-start gap-2 rounded-xl border border-border/50 bg-background/80 px-3 py-2 sm:mt-3 sm:flex-row sm:flex-wrap sm:items-center sm:rounded-2xl">
              <span className="text-sm font-medium">{selectedIds.size} selected</span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-full sm:w-auto"
                onClick={() => exportCsv(selectedLeads)}
              >
                Export selected
              </Button>
              <Button
                type="button"
                variant="destructive"
                size="sm"
                className="w-full sm:w-auto"
                onClick={deleteSelected}
              >
                Delete selected
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="w-full sm:w-auto"
                onClick={clearSelection}
              >
                Clear selection
              </Button>
            </div>
          ) : null}
        </div>

        <div className="dashboard-leads-results overflow-hidden rounded-[1.2rem] border border-border/60 bg-card/90 shadow-[0_20px_48px_-38px_rgba(15,23,42,0.35)] sm:rounded-[1.8rem]">
          {loading ? (
            <div className="space-y-3 p-4">
              {[...Array(6)].map((_, index) => (
                <div key={index} className="h-16 animate-pulse rounded-2xl bg-muted/50" />
              ))}
            </div>
          ) : leadViews.length === 0 ? (
            <div className="px-6 py-14 text-center">
              <h2 className="text-lg font-semibold text-foreground">No leads match this view</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Adjust your search or filters, or refresh after new submissions arrive.
              </p>
            </div>
          ) : (
            <>
              <div className="border-b border-border/40 px-3 py-2 md:hidden">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-foreground">
                      {leadViews.length} visible {leadViews.length === 1 ? "lead" : "leads"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {selectedIds.size > 0
                        ? `${selectedIds.size} selected for export or deletion`
                        : "Tap a lead for full details."}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="shrink-0 rounded-xl"
                    onClick={toggleSelectAllVisible}
                  >
                    {allVisibleSelected ? "Clear all" : "Select all"}
                  </Button>
                </div>
              </div>

              <div className="space-y-2 p-2 md:hidden">
                {leadViews.map((row) => (
                  <article
                    key={row.lead.id}
                    className="dashboard-lead-card overflow-hidden rounded-[1.05rem] border border-border/55 bg-background/75 shadow-[0_14px_34px_-30px_rgba(15,23,42,0.45)]"
                  >
                    <div className="flex items-start gap-2.5 p-3">
                      <div className="pt-0.5">
                        <input
                          type="checkbox"
                          checked={selectedIds.has(row.lead.id)}
                          onChange={() => toggleLeadSelection(row.lead.id)}
                          aria-label={`Select ${row.lead.name || row.lead.email || "lead"}`}
                          className="dashboard-leads-checkbox h-4 w-4 rounded border-border"
                        />
                      </div>
                      <button
                        type="button"
                        className="min-w-0 flex-1 text-left"
                        onClick={() => setActiveLeadId(row.lead.id)}
                      >
                        <div className="flex min-w-0 items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="truncate text-sm font-semibold leading-5 text-foreground">
                              {row.lead.name || "Unnamed lead"}
                            </div>
                            <div className="mt-0.5 flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
                              <Mail className="h-3.5 w-3.5 shrink-0" aria-hidden />
                              <span className="truncate">
                                {row.lead.email || "No email provided"}
                              </span>
                            </div>
                          </div>
                          <span className="shrink-0 text-[11px] leading-5 text-muted-foreground">
                            {row.submittedShortLabel}
                          </span>
                        </div>

                        <div className="mt-2 flex flex-wrap items-center gap-1.5">
                          <StatusBadge status={row.status} compact />
                          <RatingBadge rating={row.lead.lead_rating} compact />
                          {row.attachments.length > 0 ? (
                            <span className="inline-flex items-center gap-1 rounded-full border border-border/50 bg-card/90 px-2 py-0.5 text-[11px] font-medium text-foreground">
                              <Paperclip className="h-3 w-3" aria-hidden />
                              {row.attachments.length}
                            </span>
                          ) : null}
                          {row.lead.note.trim() ? (
                            <span className="inline-flex items-center gap-1 rounded-full border border-border/50 bg-card/90 px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                              <StickyNote className="h-3 w-3" aria-hidden />
                              Note
                            </span>
                          ) : null}
                          {row.lead.next_follow_up_at ? (
                            <span className="inline-flex items-center gap-1 rounded-full border border-border/50 bg-card/90 px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                              <CalendarClock className="h-3 w-3" aria-hidden />
                              {formatRelativeTime(row.lead.next_follow_up_at)}
                            </span>
                          ) : null}
                        </div>

                        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                          {row.lead.phone ? (
                            <span className="inline-flex min-w-0 items-center gap-1.5">
                              <Phone className="h-3.5 w-3.5 shrink-0" aria-hidden />
                              <span className="truncate">{row.lead.phone}</span>
                            </span>
                          ) : null}
                          {row.lead.company ? (
                            <span className="inline-flex min-w-0 items-center gap-1.5">
                              <Building2 className="h-3.5 w-3.5 shrink-0" aria-hidden />
                              <span className="truncate">{row.lead.company}</span>
                            </span>
                          ) : null}
                          <span className="truncate">{row.lead.handle || "Unknown form"}</span>
                        </div>
                        {row.preview ? (
                          <p className="mt-2 line-clamp-1 text-xs leading-5 text-foreground/90">
                            {row.preview}
                          </p>
                        ) : null}
                      </button>
                    </div>
                    <div className="grid grid-cols-[1fr_1fr_auto] gap-1.5 border-t border-border/40 px-3 py-2">
                      <Button
                        type="button"
                        size="sm"
                        className="h-8 rounded-lg text-xs"
                        onClick={() => setActiveLeadId(row.lead.id)}
                      >
                        Open
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-8 rounded-lg text-xs"
                        disabled={!row.lead.email}
                        onClick={() => copyToClipboard(row.lead.email, "Email copied")}
                      >
                        <Copy className="h-3.5 w-3.5" aria-hidden />
                        Email
                      </Button>
                      <Button
                        type="button"
                        variant="custom"
                        size="icon"
                        className="h-8 w-8 rounded-lg border border-rose-200 bg-rose-50 text-rose-600 hover:bg-rose-100 hover:text-rose-700"
                        onClick={() => deleteLead(row.lead.id)}
                        aria-label={`Delete ${row.lead.name || row.lead.email || "lead"}`}
                      >
                        <Trash2 className="h-4 w-4" aria-hidden />
                      </Button>
                    </div>
                  </article>
                ))}
              </div>

              <div className="hidden md:block">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[640px] text-left text-sm">
                  <thead className="bg-muted/50 text-xs uppercase tracking-[0.18em] text-muted-foreground">
                    <tr>
                      <th className="px-4 py-3">
                        <input
                          ref={selectAllRef}
                          type="checkbox"
                          checked={allVisibleSelected}
                          onChange={toggleSelectAllVisible}
                          aria-label="Select all visible leads"
                          className="dashboard-leads-checkbox h-4 w-4 rounded border-border"
                        />
                      </th>
                      <th className="px-4 py-3">Name</th>
                      <th className="px-4 py-3">Email</th>
                      <th className="px-4 py-3">Phone</th>
                      <th className="px-4 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {leadViews.map((row) => (
                      <tr
                        key={row.lead.id}
                        className="cursor-pointer border-t border-border/40 bg-background/40 transition hover:bg-muted/40"
                        onClick={() => setActiveLeadId(row.lead.id)}
                      >
                        <td className="px-4 py-3" onClick={(event) => event.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={selectedIds.has(row.lead.id)}
                            onChange={() => toggleLeadSelection(row.lead.id)}
                            aria-label={`Select ${row.lead.name || row.lead.email || "lead"}`}
                            className="dashboard-leads-checkbox h-4 w-4 rounded border-border"
                          />
                        </td>
                        <td className="px-4 py-3">
                          <div className="min-w-0">
                            <div className="truncate font-semibold text-foreground">
                              {row.lead.name || "Unnamed lead"}
                            </div>
                            <div className="mt-1 flex items-center gap-2">
                              <StatusBadge status={row.status} />
                              <RatingBadge rating={row.lead.lead_rating} />
                              {row.lead.company ? (
                                <span className="truncate text-xs text-muted-foreground">
                                  {row.lead.company}
                                </span>
                              ) : null}
                            </div>
                            {row.lead.note.trim() || row.lead.next_follow_up_at ? (
                              <div className="mt-1 flex flex-wrap gap-2">
                                {row.lead.note.trim() ? (
                                  <span className="inline-flex items-center gap-1.5 rounded-full border border-border/50 bg-background/80 px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
                                    <StickyNote className="h-3.5 w-3.5" aria-hidden />
                                    Note
                                  </span>
                                ) : null}
                                {row.lead.next_follow_up_at ? (
                                  <span className="inline-flex items-center gap-1.5 rounded-full border border-border/50 bg-background/80 px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
                                    <CalendarClock className="h-3.5 w-3.5" aria-hidden />
                                    {formatRelativeTime(row.lead.next_follow_up_at)}
                                  </span>
                                ) : null}
                              </div>
                            ) : null}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">
                          <span className="block max-w-[220px] truncate">{row.lead.email || "—"}</span>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {row.lead.phone || "—"}
                        </td>
                        <td
                          className="px-4 py-3"
                          onClick={(event) => event.stopPropagation()}
                        >
                          <div className="flex justify-end gap-2">
                            <Button
                              type="button"
                              variant="custom"
                              size="icon"
                              className="h-9 w-9 rounded-xl border border-rose-200 bg-rose-50 text-rose-600 hover:bg-rose-100 hover:text-rose-700"
                              onClick={() => deleteLead(row.lead.id)}
                              aria-label={`Delete ${row.lead.name || row.lead.email || "lead"}`}
                            >
                              <Trash2 className="h-4 w-4" aria-hidden />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  </table>
                </div>
              </div>

              {hasMore ? (
                <div className="border-t border-border/40 px-4 py-4">
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full sm:w-auto"
                    onClick={() => load()}
                    disabled={fetching}
                  >
                    {fetching ? "Loading..." : "Load more leads"}
                  </Button>
                </div>
              ) : null}
            </>
          )}
        </div>
      </div>

      <Dialog open={Boolean(activeLeadView)} onOpenChange={(open) => !open && setActiveLeadId(null)}>
        <DialogContent
          className="left-auto right-0 top-0 h-dvh max-h-dvh w-full max-w-full translate-x-0 translate-y-0 overflow-hidden gap-0 rounded-none border-l border-border/60 bg-background/95 p-0 shadow-[0_30px_80px_-40px_rgba(15,23,42,0.45)] sm:max-w-2xl lg:max-w-[44rem]"
          showCloseButton
        >
          {activeLeadView ? (
            <div className="flex h-full min-h-0 flex-col">
              <DialogHeader className="shrink-0 border-b border-border/50 px-5 py-4 text-left lg:px-6">
                <div className="space-y-2">
                  <DialogTitle className="pr-10 text-2xl font-semibold leading-tight sm:text-[1.9rem]">
                    {activeLeadView.lead.name || "Unnamed lead"}
                  </DialogTitle>
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge status={activeLeadView.status} />
                    <RatingBadge rating={activeLeadView.lead.lead_rating} />
                    <Badge variant="outline" className="rounded-full px-3 py-1 text-xs">
                      Submitted {activeLeadView.submittedLabel}
                    </Badge>
                  </div>
                </div>
                <DialogDescription className="max-w-2xl text-sm text-muted-foreground">
                  {canLabelLeads
                    ? "Review the full submission, update its status and rating, and handle follow-up actions here."
                    : "Review the full submission and follow up. Paid unlocks status changes, notes, reminders, and ratings."}
                </DialogDescription>
              </DialogHeader>
              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4 lg:px-6">
                <div className="space-y-5">
                  <div className="grid gap-5 xl:grid-cols-[minmax(0,0.78fr)_minmax(0,1.22fr)]">
                    <div className="space-y-5">
                      <section className="space-y-3">
                        <SectionLabel>Status</SectionLabel>
                        <div className="rounded-2xl border border-border/50 bg-card/70 p-4">
                          {canLabelLeads ? (
                            <div className="space-y-4">
                              <div className="flex flex-wrap gap-2">
                                {(Object.keys(STATUS_META) as LeadWorkflowStatus[]).map((status) => (
                                  <button
                                    key={status}
                                    type="button"
                                    onClick={() => void updateLeadStatus(activeLeadView.lead.id, status)}
                                    className={cn(
                                      "rounded-full border px-3 py-1.5 text-sm font-medium transition",
                                      activeLeadStatus === status
                                        ? STATUS_META[status].className
                                        : "border-border/60 bg-background/70 text-foreground hover:bg-muted/50"
                                    )}
                                  >
                                    {STATUS_META[status].label}
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
                                <div className="flex flex-wrap gap-2">
                                  {LEAD_RATING_OPTIONS.map((rating) => (
                                    <button
                                      key={rating}
                                      type="button"
                                      onClick={() =>
                                        setLeadDrafts((prev) => ({
                                          ...prev,
                                          [activeLeadView.lead.id]: {
                                            note:
                                              prev[activeLeadView.lead.id]?.note ??
                                              activeLeadView.lead.note ??
                                              "",
                                            next_follow_up_at:
                                              activeLeadStatus === "done"
                                                ? ""
                                                : prev[activeLeadView.lead.id]?.next_follow_up_at ||
                                                  formatDatetimeLocalValue(
                                                    activeLeadView.lead.next_follow_up_at
                                                  ) ||
                                                  formatDatetimeLocalValue(
                                                    getDefaultFollowUpAt(activeLeadView.lead.created_at)
                                                  ),
                                            lead_flag: activeLeadStatus,
                                            lead_rating: rating,
                                          },
                                        }))
                                      }
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
                          ) : (
                            <div className="space-y-3">
                              <StatusBadge status={activeLeadStatus} />
                              <p className="text-sm text-muted-foreground">
                                Paid unlocks status changes and star ratings.
                              </p>
                              <Button asChild size="sm" variant="outline">
                                <Link href={planAccess.upgradeHref}>Upgrade to Paid</Link>
                              </Button>
                            </div>
                          )}
                        </div>
                      </section>

                      <section className="space-y-3">
                        <SectionLabel>Follow-up</SectionLabel>
                        <div className="rounded-2xl border border-border/50 bg-card/70 p-4">
                          {canLabelLeads ? (
                            <div className="space-y-4">
                              <div className="space-y-2">
                                <Label
                                  htmlFor={`lead-note-${activeLeadView.lead.id}`}
                                  className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground"
                                >
                                  Note
                                </Label>
                                <Textarea
                                  id={`lead-note-${activeLeadView.lead.id}`}
                                  value={activeLeadDraft?.note ?? ""}
                                  onChange={(event) =>
                                    setLeadDrafts((prev) => ({
                                      ...prev,
                                      [activeLeadView.lead.id]: {
                                        note: event.target.value,
                                        next_follow_up_at:
                                          activeLeadStatus === "done"
                                            ? ""
                                            : prev[activeLeadView.lead.id]?.next_follow_up_at ||
                                              formatDatetimeLocalValue(
                                                activeLeadView.lead.next_follow_up_at
                                              ) ||
                                              formatDatetimeLocalValue(
                                                getDefaultFollowUpAt(activeLeadView.lead.created_at)
                                              ),
                                        lead_flag:
                                          prev[activeLeadView.lead.id]?.lead_flag ??
                                          activeLeadStatus,
                                        lead_rating:
                                          prev[activeLeadView.lead.id]?.lead_rating ??
                                          activeLeadRating,
                                      },
                                    }))
                                  }
                                  placeholder="Capture the context you want before you follow up."
                                  className="min-h-28 rounded-2xl"
                                />
                              </div>

                              <div className="space-y-2">
                                <Label
                                  htmlFor={`lead-follow-up-${activeLeadView.lead.id}`}
                                  className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground"
                                >
                                  Reminder
                                </Label>
                                <Input
                                  id={`lead-follow-up-${activeLeadView.lead.id}`}
                                  type="datetime-local"
                                  value={
                                    activeLeadStatus === "done"
                                      ? ""
                                      : activeLeadDraft?.next_follow_up_at ?? ""
                                  }
                                  onChange={(event) =>
                                    setLeadDrafts((prev) => ({
                                      ...prev,
                                      [activeLeadView.lead.id]: {
                                        note:
                                          prev[activeLeadView.lead.id]?.note ??
                                          activeLeadView.lead.note ??
                                          "",
                                        next_follow_up_at: event.target.value,
                                        lead_flag:
                                          prev[activeLeadView.lead.id]?.lead_flag ??
                                          activeLeadStatus,
                                        lead_rating:
                                          prev[activeLeadView.lead.id]?.lead_rating ??
                                          activeLeadRating,
                                      },
                                    }))
                                  }
                                  disabled={activeLeadStatus === "done"}
                                />
                                <p className="text-xs text-muted-foreground">
                                  Follow-up reminders default to tomorrow. Mark done to clear the reminder.
                                </p>
                              </div>

                              <div className="flex flex-wrap gap-2">
                                <Button
                                  type="button"
                                  size="sm"
                                  className="w-full justify-center sm:w-auto"
                                  onClick={() =>
                                    void saveLeadFollowUp(activeLeadView.lead.id)
                                  }
                                  disabled={savingLeadId === activeLeadView.lead.id}
                                >
                                  {savingLeadId === activeLeadView.lead.id
                                    ? "Saving..."
                                    : "Save follow-up"}
                                </Button>
                              </div>
                            </div>
                          ) : (
                            <div className="space-y-3">
                              <p className="text-sm text-muted-foreground">
                                Paid unlocks notes, reminders, status changes, and star ratings.
                              </p>
                              <Button asChild size="sm" variant="outline">
                                <Link href={planAccess.upgradeHref}>Unlock follow-up tools</Link>
                              </Button>
                            </div>
                          )}
                        </div>
                      </section>

                      <section className="space-y-3">
                        <SectionLabel>Submission context</SectionLabel>
                        <div className="rounded-2xl border border-border/50 bg-card/70 p-4 text-sm">
                          <div className="flex items-center justify-between gap-4">
                            <span className="text-muted-foreground">Profile</span>
                            <span className="truncate font-medium text-foreground">
                              {activeLeadView.lead.handle}
                            </span>
                          </div>
                          <div className="mt-3 space-y-1">
                            <div className="text-muted-foreground">Source URL</div>
                            {activeLeadView.lead.source_url ? (
                              <a
                                href={activeLeadView.lead.source_url}
                                target="_blank"
                                rel="noreferrer"
                                className="block break-all font-medium text-foreground underline underline-offset-4"
                              >
                                {activeLeadView.lead.source_url}
                              </a>
                            ) : (
                              <div className="font-medium text-foreground">Not captured</div>
                            )}
                          </div>
                        </div>
                      </section>
                    </div>

                    <section className="space-y-3">
                      <SectionLabel>Contact details</SectionLabel>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <DetailItem icon={Mail} label="Email" value={activeLeadView.lead.email || "Not provided"} />
                        <DetailItem icon={Phone} label="Phone" value={activeLeadView.lead.phone || "Not provided"} />
                        <DetailItem icon={Building2} label="Company" value={activeLeadView.lead.company || "Not provided"} />
                        <DetailItem icon={UserRound} label="Form used" value={activeLeadView.lead.handle || "Unknown"} />
                      </div>
                    </section>
                  </div>

                  <section className="space-y-3">
                    <div className="flex items-center justify-between gap-3">
                      <SectionLabel>Submission details</SectionLabel>
                      {activeLeadView.detailFields.length > 1 ? (
                        <Badge variant="outline" className="rounded-full px-3 py-1 text-[11px]">
                          {activeLeadView.detailFields.length} items
                        </Badge>
                      ) : null}
                    </div>
                    <div
                      className={cn(
                        "grid gap-3",
                        activeLeadView.detailFields.length > 1 && "md:grid-cols-2"
                      )}
                    >
                      {activeLeadView.detailFields.length > 0 ? (
                        activeLeadView.detailFields.map((field) => (
                          <div key={field.key} className="rounded-2xl border border-border/50 bg-card/70 p-4">
                            <div className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                              {field.label}
                            </div>
                            {field.fileLinks && field.fileLinks.length > 0 ? (
                              <div className="mt-3 flex flex-wrap gap-2">
                                {field.fileLinks.map((file) => (
                                <a
                                  key={`${field.key}-${file.url}`}
                                  href={file.url}
                                  download={getDisplayFileName(file)}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-background/80 px-3 py-2 text-sm hover:bg-muted/50"
                                >
                                  <Paperclip className="h-4 w-4" aria-hidden />
                                  <span className="max-w-[220px] truncate">
                                    {getDisplayFileName(file)}
                                  </span>
                                  <ExternalLink className="h-4 w-4" aria-hidden />
                                </a>
                                ))}
                              </div>
                            ) : (
                              <p className="mt-2 whitespace-pre-wrap text-sm text-foreground">
                                {field.value}
                              </p>
                            )}
                          </div>
                        ))
                      ) : (
                        <div className="rounded-2xl border border-dashed border-border/60 px-4 py-5 text-sm text-muted-foreground">
                          No additional submission fields were provided.
                        </div>
                      )}
                    </div>
                  </section>
                </div>
              </div>
              <div className="shrink-0 border-t border-border/50 px-5 py-3 lg:px-6">
                <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="w-full justify-center sm:w-auto"
                    disabled={!activeLeadView.lead.email}
                    onClick={() =>
                      copyToClipboard(activeLeadView.lead.email, "Email copied")
                    }
                  >
                    <Copy className="h-4 w-4" aria-hidden />
                    Copy email
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="w-full justify-center sm:w-auto"
                    onClick={() => downloadVCard(activeLeadView.lead)}
                  >
                    <FileText className="h-4 w-4" aria-hidden />
                    Download vCard
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="w-full justify-center sm:w-auto"
                    disabled={activeLeadView.attachments.length === 0}
                    onClick={() => {
                      activeLeadView.attachments.forEach((file) =>
                        window.open(file.url, "_blank", "noopener,noreferrer")
                      );
                    }}
                  >
                    <Paperclip className="h-4 w-4" aria-hidden />
                    Download attachments
                  </Button>
                  {canLabelLeads ? (
                    <Button
                      type="button"
                      size="sm"
                      className="w-full justify-center sm:w-auto"
                      onClick={() => void updateLeadStatus(activeLeadView.lead.id, "done")}
                    >
                      Mark done
                    </Button>
                  ) : null}
                  <Button
                    type="button"
                    variant="custom"
                    size="icon"
                    className="h-9 w-9 rounded-xl border border-rose-200 bg-rose-50 text-rose-600 hover:bg-rose-100 hover:text-rose-700"
                    onClick={() => deleteLead(activeLeadView.lead.id)}
                    aria-label={`Delete ${activeLeadView.lead.name || activeLeadView.lead.email || "lead"}`}
                  >
                    <Trash2 className="h-4 w-4" aria-hidden />
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

function buildDetachedLeadView(
  lead: Lead | null,
  fieldLabels: FieldLabelMap,
  leadStatuses: Record<string, LeadFlag>
) {
  if (!lead) return null;
  const detailFields = collectLeadFieldEntries(lead, fieldLabels);
  const attachments = dedupeFileLinks(detailFields.flatMap((field) => field.fileLinks ?? []));
  const status = normalizeLeadFlag(leadStatuses[lead.id] ?? lead.lead_flag);
  const createdAt = new Date(lead.created_at);
  return {
    lead,
    status,
    statusMeta: STATUS_META[status],
    attachments,
    preview: buildLeadPreview(lead, detailFields),
    detailFields,
    submittedLabel: createdAt.toLocaleString(),
    submittedShortLabel: formatLeadSubmittedShort(createdAt),
    submittedSortValue: createdAt.getTime(),
  } satisfies LeadView;
}

function formatLeadSubmittedShort(createdAt: Date) {
  if (Number.isNaN(createdAt.getTime())) return "Unknown date";
  return createdAt.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
      {children}
    </div>
  );
}

function DetailItem({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Mail;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl border border-border/50 bg-card/70 p-3.5">
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        <Icon className="h-4 w-4" aria-hidden />
        {label}
      </div>
      <div className="mt-1.5 text-sm text-foreground">{value}</div>
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full border px-3 py-1.5 text-sm font-medium transition",
        active
          ? "border-primary/35 bg-primary/10 text-primary shadow-[0_8px_22px_-18px_rgba(15,23,42,0.35)]"
          : "border-border/60 bg-background/70 text-foreground hover:bg-muted/50"
      )}
    >
      {children}
    </button>
  );
}

function StatusBadge({
  status,
  compact = false,
}: {
  status: LeadWorkflowStatus;
  compact?: boolean;
}) {
  return (
    <Badge
      variant="outline"
      className={cn(
        "rounded-full text-[11px]",
        compact ? "px-2 py-0.5" : "px-2.5 py-1",
        STATUS_META[status].className
      )}
    >
      {STATUS_META[status].label}
    </Badge>
  );
}

function RatingBadge({
  rating,
  compact = false,
}: {
  rating: number;
  compact?: boolean;
}) {
  const normalized = normalizeLeadRating(rating);
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border border-amber-300/60 bg-amber-50 text-[11px] font-semibold text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/15 dark:text-amber-100",
        compact ? "px-2 py-0.5" : "px-2.5 py-1"
      )}
    >
      <span className="inline-flex items-center gap-0.5" aria-label={getLeadRatingLabel(normalized)}>
        {Array.from({ length: 5 }).map((_, index) => (
          <Star
            key={index}
            className={cn(
              compact ? "h-3 w-3" : "h-3.5 w-3.5",
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

function hasActiveFilters(filters: LeadListFilters) {
  return Object.values(filters).some(Boolean);
}

function matchesLeadSearch(row: LeadView, searchQuery: string) {
  if (!searchQuery) return true;
  const haystack = [
    row.lead.name,
    row.lead.email,
    row.lead.phone,
    row.lead.company,
    row.lead.message,
    row.lead.note,
    row.lead.next_follow_up_at,
    row.lead.lead_flag,
    String(row.lead.lead_rating),
    row.preview,
    row.statusMeta.label,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return haystack.includes(searchQuery.toLowerCase());
}

function compareLeadViews(a: LeadView, b: LeadView, sortBy: LeadSortOption) {
  if (sortBy === "priority") return compareLeadsByPriority(a.lead, b.lead);
  if (sortBy === "oldest") return a.submittedSortValue - b.submittedSortValue;
  if (sortBy === "name-asc") return a.lead.name.localeCompare(b.lead.name);
  if (sortBy === "name-desc") return b.lead.name.localeCompare(a.lead.name);
  return b.submittedSortValue - a.submittedSortValue;
}

function collectLeadFieldEntries(
  lead: Lead,
  labelsByHandle: FieldLabelMap
): LeadFieldEntry[] {
  const entries: LeadFieldEntry[] = [];
  if (lead.message) {
    entries.push({ key: "message", label: "Message", value: lead.message });
  }

  const metaMap = labelsByHandle[lead.handle] ?? {};
  Object.entries(lead.custom_fields ?? {}).forEach(([key, value]) => {
    if (!key || isCoreFieldKey(key) || value == null) return;
    if (value === "" || (typeof value === "string" && !value.trim())) return;
    const parsed = parseCustomFieldKey(key);
    const meta = metaMap[parsed.id];
    const type = meta?.type;
    const renderedValue = formatLeadValue(value);
    const fileLinks = extractFileLinks(renderedValue);
    entries.push({
      key,
      label: meta?.label || parsed.label || toReadableLabel(parsed.id),
      value: renderedValue,
      type,
      fileLinks: type === "file_upload" || fileLinks.length > 0 ? fileLinks : undefined,
    });
  });
  return entries;
}

function buildLeadPreview(lead: Lead, detailFields: LeadFieldEntry[]) {
  void detailFields;
  return lead.message?.trim() || lead.note?.trim() || "";
}

function dedupeById(list: Lead[]) {
  const seen = new Set<string>();
  return list.filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}

function safeCsv(value: string) {
  if (value == null) return "";
  const needsQuotes = /[",\n]/.test(value);
  const next = String(value).replace(/"/g, '""');
  return needsQuotes ? `"${next}"` : next;
}

function escapeVCardValue(value: string) {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,");
}

function buildVCard(lead: Lead) {
  const name = (lead.name || "").trim();
  const parts = name.split(/\s+/).filter(Boolean);
  const firstName = parts[0] || "";
  const lastName = parts.length > 1 ? parts[parts.length - 1] : "";
  const middleName = parts.length > 2 ? parts.slice(1, -1).join(" ") : "";
  const lines = [
    "BEGIN:VCARD",
    "VERSION:3.0",
    `FN:${escapeVCardValue(name || "Linket Contact")}`,
    `N:${escapeVCardValue(lastName)};${escapeVCardValue(firstName)};${escapeVCardValue(middleName)};;`,
  ];
  if (lead.email) lines.push(`EMAIL;TYPE=INTERNET:${escapeVCardValue(lead.email)}`);
  if (lead.phone) lines.push(`TEL;TYPE=CELL:${escapeVCardValue(lead.phone)}`);
  if (lead.company) lines.push(`ORG:${escapeVCardValue(lead.company)}`);
  if (lead.message) lines.push(`NOTE:${escapeVCardValue(lead.message)}`);
  lines.push("END:VCARD");
  return lines.join("\n");
}

function downloadVCard(lead: Lead) {
  const blob = new Blob([buildVCard(lead)], { type: "text/vcard;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${(lead.name || "linket-contact").trim().replace(/\s+/g, "-") || "linket-contact"}.vcf`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function copyToClipboard(value: string, successTitle: string) {
  if (!value) return;
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    navigator.clipboard
      .writeText(value)
      .then(() => toast({ title: successTitle }))
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

function formatLeadValue(value: string | boolean | null) {
  if (value === true) return "Yes";
  if (value === false) return "No";
  if (value == null) return "";
  return String(value);
}

function extractFileLinks(value: string) {
  const text = String(value ?? "").trim();
  if (!text) return [] as Array<{ name: string; url: string }>;

  const found: Array<{ name: string; url: string }> = [];
  const wrappedUrlRegex = /\((https?:\/\/[^)\s]+)\)/g;
  let match: RegExpExecArray | null = null;
  let cursor = 0;

  while ((match = wrappedUrlRegex.exec(text)) !== null) {
    const url = normalizeHttpUrl(match[1]);
    const rawName = text.slice(cursor, match.index).replace(/^[,\s]+|[,\s]+$/g, "");
    cursor = wrappedUrlRegex.lastIndex;
    if (!url) continue;
    found.push({ name: rawName || inferOriginalUploadFileName(url) || fileNameFromUrl(url) || "File", url });
  }
  if (found.length > 0) return dedupeFileLinks(found);

  const plainUrlRegex = /(https?:\/\/[^\s,)]+)/g;
  while ((match = plainUrlRegex.exec(text)) !== null) {
    const url = normalizeHttpUrl(match[1]);
    if (!url) continue;
    found.push({ name: inferOriginalUploadFileName(url) || fileNameFromUrl(url) || "File", url });
  }
  return dedupeFileLinks(found);
}

function getDisplayFileName(file: { name: string; url: string }) {
  return file.name || inferOriginalUploadFileName(file.url) || fileNameFromUrl(file.url) || "File";
}

function inferOriginalUploadFileName(url: string) {
  const encodedName = fileNameFromUrl(url);
  if (!encodedName) return "";
  const match = encodedName.match(/-\d{10,}-[a-z0-9]{6,}-(.+)$/i);
  if (!match) return encodedName;
  return match[1] || encodedName;
}

function dedupeFileLinks(items: Array<{ name: string; url: string }>) {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (!item.url || seen.has(item.url)) return false;
    seen.add(item.url);
    return true;
  });
}

function normalizeHttpUrl(value: string) {
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

function fileNameFromUrl(url: string) {
  try {
    const parsed = new URL(url);
    const segment = parsed.pathname.split("/").filter(Boolean).pop();
    return segment ? decodeURIComponent(segment) : "";
  } catch {
    return "";
  }
}

function isCoreFieldKey(key: string) {
  const parsed = parseCustomFieldKey(key);
  const candidate = (parsed.label || parsed.id).toLowerCase();
  return CORE_FIELD_KEYS.has(candidate);
}

function parseCustomFieldKey(key: string) {
  const parts = key.split("::");
  if (parts.length < 2) return { id: key, label: null as string | null };
  const id = parts[parts.length - 1]?.trim() || key;
  const label = parts.slice(0, -1).join("::").trim() || null;
  return { id, label };
}

function toReadableLabel(value: string) {
  return value
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function sanitizeLeadRow(row: unknown, fallbackUserId: string): Lead {
  const source = isRecord(row) ? row : {};
  return {
    id: toNonEmptyText(source.id, `lead_${randomId()}`),
    user_id: toNonEmptyText(source.user_id, fallbackUserId),
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

function sanitizeLeadId(row: unknown) {
  if (!isRecord(row)) return null;
  const id = toNonEmptyText(row.id, "");
  return id || null;
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
