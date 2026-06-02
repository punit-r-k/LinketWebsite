
"use client";

/**
 * Lead Capture Form Builder
 * - Schema types live in `src/types/lead-form.ts`.
 * - API routes live under `src/app/api/lead-forms`.
 * - Submissions are stored in `public.lead_form_responses` (and mirrored into `public.leads` when possible).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowDown, ArrowUp, GripVertical, Plus, Trash2 } from "lucide-react";

import { useDashboardPlanAccess } from "@/components/dashboard/DashboardSessionContext";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/system/toaster";
import { confirmRemove } from "@/lib/confirm-remove";
import { cn } from "@/lib/utils";
import {
  applyFreeLeadFormLimits,
  createFreeLeadFormConfig,
  createDefaultLeadFormConfig,
  createField,
  normalizeLeadFormConfig,
  shuffleFields,
  shuffleOptions,
} from "@/lib/lead-form";
import type {
  LeadFormConfig,
  LeadFormField,
  LeadFormFieldType,
  LeadFormMultipleChoiceField,
  LeadFormOption,
  LeadFormRatingField,
  LeadFormTimeField,
  LeadFormValidation,
} from "@/types/lead-form";

const SAVE_DEBOUNCE_MS = 900;

const FIELD_PRESETS: Array<{
  id: string;
  label: string;
  type: LeadFormFieldType;
  helpText?: string;
  validation?: LeadFormValidation;
  fieldOverrides?: Partial<LeadFormField>;
}> = [
  {
    id: "name",
    label: "Name",
    type: "short_text",
    helpText: "Ex. John Doe",
  },
  {
    id: "email",
    label: "Email",
    type: "short_text",
    helpText: "JDoe@LinketConnect.com",
    validation: { rule: "email" },
  },
  {
    id: "phone",
    label: "Phone Number",
    type: "short_text",
    helpText: "(###) ### - ####",
  },
  {
    id: "date",
    label: "Date",
    type: "date",
    helpText: "MM/DD/YYYY",
  },
  {
    id: "time",
    label: "Time",
    type: "time",
    helpText: "##:## AM/PM",
  },
  {
    id: "note",
    label: "Note",
    type: "long_text",
  },
  {
    id: "short_text",
    label: "Short Text",
    type: "short_text",
  },
  {
    id: "long_text",
    label: "Long Text",
    type: "long_text",
  },
  {
    id: "document_upload",
    label: "Document/File Upload",
    type: "file_upload",
    helpText: "Upload a resume, document, or image",
    fieldOverrides: {
      acceptedTypes: [
        "pdf",
        "doc",
        "docx",
        "txt",
        "rtf",
        "png",
        "jpg",
        "jpeg",
        "webp",
      ],
      maxFiles: 3,
      maxSizeMB: 20,
    },
  },
];

const ALLOWED_TYPES: Array<{ type: LeadFormFieldType; label: string }> = [
  { type: "short_text", label: "Short text" },
  { type: "long_text", label: "Long text" },
  { type: "date", label: "Date" },
  { type: "time", label: "Time" },
  { type: "file_upload", label: "File upload" },
];

const FIELD_TYPES_WITH_ADVANCED_OPTIONS = new Set<LeadFormFieldType>([
  "multiple_choice",
  "checkboxes",
  "dropdown",
  "linear_scale",
  "rating",
  "date",
  "time",
  "file_upload",
  "multiple_choice_grid",
  "checkbox_grid",
]);

type Props = {
  userId: string;
  handle: string | null;
  profileId?: string | null;
  onPreviewChange?: (form: LeadFormConfig) => void;
  showPreview?: boolean;
  layout?: "side" | "stacked";
  columns?: 2 | 3;
  onRegisterReorder?: (reorder: (sourceId: string, targetId: string) => void) => void;
};

type ResponsesStats = {
  count: number;
  lastSubmittedAt: string | null;
};

export default function LeadFormBuilder({
  userId,
  handle,
  profileId,
  onPreviewChange,
  showPreview = true,
  layout = "side",
  columns = 2,
  onRegisterReorder,
}: Props) {
  const planAccess = useDashboardPlanAccess();
  const canCustomizeLeadForm = planAccess.canCustomizeLeadForm;
  const [form, setForm] = useState<LeadFormConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [stats, setStats] = useState<ResponsesStats>({
    count: 0,
    lastSubmittedAt: null,
  });
  const [selectedFieldId, setSelectedFieldId] = useState<string | null>(null);
  const [fieldPickerOpen, setFieldPickerOpen] = useState(false);
  const [draggingFieldId, setDraggingFieldId] = useState<string | null>(null);

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSnapshot = useRef<string | null>(null);

  const activeField = useMemo(() => {
    if (!form || !selectedFieldId) return null;
    return form.fields.find((field) => field.id === selectedFieldId) ?? null;
  }, [form, selectedFieldId]);

  const snapshot = useMemo(() => {
    if (!form) return null;
    return JSON.stringify(form);
  }, [form]);

  const isDirty = useMemo(() => {
    if (!snapshot) return false;
    return snapshot !== lastSnapshot.current;
  }, [snapshot]);
  const saveState = saveError
    ? "failed"
    : saving
    ? "saving"
    : isDirty
    ? "unsaved"
    : "saved";

  const previewFields = useMemo(() => {
    if (!form) return [];
    const fields = form.settings.shuffleQuestionOrder
      ? shuffleFields(form.fields)
      : form.fields.slice();
    return fields;
  }, [form]);
  const isExternalPreviewLayout =
    layout === "side" && columns === 2 && !showPreview;
  const hasAdvancedFieldOptions = Boolean(
    activeField && FIELD_TYPES_WITH_ADVANCED_OPTIONS.has(activeField.type)
  );

  useEffect(() => {
    if (!userId || !handle) return;
    setLoading(true);
    setSaveError(null);
    (async () => {
      try {
        const response = await fetch(
          `/api/lead-forms?userId=${encodeURIComponent(
            userId
          )}&handle=${encodeURIComponent(handle)}${
            profileId ? `&profileId=${encodeURIComponent(profileId)}` : ""
          }`,
          { cache: "no-store" }
        );
        if (!response.ok) {
          const info = await response.json().catch(() => ({}));
          throw new Error(info?.error || "Unable to load form");
        }
        const payload = (await response.json()) as {
          form: LeadFormConfig;
          meta: { formId: string; stats: ResponsesStats };
        };
        const normalized = normalizeLeadFormConfig(
          payload.form,
          payload.form?.id || `form-${userId}`
        );
        const resolvedForm =
          canCustomizeLeadForm
            ? normalized
            : applyFreeLeadFormLimits(normalized, normalized.id);
        setForm(resolvedForm);
        setSelectedFieldId(resolvedForm.fields[0]?.id ?? null);
        setStats(payload.meta?.stats ?? { count: 0, lastSubmittedAt: null });
        lastSnapshot.current = JSON.stringify(resolvedForm);
        setLastSavedAt(resolvedForm.meta.updatedAt || null);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Unable to load form";
        setSaveError(message);
        setForm(
          canCustomizeLeadForm
            ? createDefaultLeadFormConfig(`form-${userId}`)
            : createFreeLeadFormConfig(`form-${userId}`)
        );
        toast({
          title: "Lead form unavailable",
          description: message,
          variant: "destructive",
        });
      } finally {
        setLoading(false);
      }
    })();
  }, [canCustomizeLeadForm, handle, profileId, userId]);

  useEffect(() => {
    if (!form || !onPreviewChange) return;
    onPreviewChange(form);
  }, [form, onPreviewChange]);

  const persist = useCallback(async () => {
    if (!form || !userId || !handle) return;
    setSaving(true);
    setSaveError(null);
    try {
      const response = await fetch("/api/lead-forms", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, handle, profileId, config: form }),
      });
      if (!response.ok) {
        const info = await response.json().catch(() => ({}));
        throw new Error(info?.error || "Unable to save form");
      }
      const payload = (await response.json()) as { form: LeadFormConfig };
      const normalized = normalizeLeadFormConfig(payload.form, form.id);
      const resolvedForm =
        canCustomizeLeadForm
          ? normalized
          : applyFreeLeadFormLimits(normalized, normalized.id);
      setForm(resolvedForm);
      lastSnapshot.current = JSON.stringify(resolvedForm);
      setLastSavedAt(resolvedForm.meta.updatedAt);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unable to save form";
      setSaveError(message);
      if (saveError !== message) {
        toast({ title: "Save failed", description: message, variant: "destructive" });
      }
    } finally {
      setSaving(false);
    }
  }, [canCustomizeLeadForm, form, handle, profileId, saveError, userId]);

  useEffect(() => {
    if (!form || !isDirty || loading) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      saveTimer.current = null;
      void persist();
    }, SAVE_DEBOUNCE_MS);
    return () => {
      if (saveTimer.current) {
        clearTimeout(saveTimer.current);
        saveTimer.current = null;
      }
    };
  }, [form, isDirty, loading, persist]);

  useEffect(() => {
    if (!form || !saveError || !isDirty || loading || saving) {
      if (retryTimer.current) {
        clearTimeout(retryTimer.current);
        retryTimer.current = null;
      }
      return;
    }
    if (retryTimer.current) {
      clearTimeout(retryTimer.current);
    }
    retryTimer.current = setTimeout(() => {
      retryTimer.current = null;
      void persist();
    }, 4000);
    return () => {
      if (retryTimer.current) {
        clearTimeout(retryTimer.current);
        retryTimer.current = null;
      }
    };
  }, [form, isDirty, loading, persist, saveError, saving]);

  useEffect(() => {
    return () => {
      if (saveTimer.current) {
        clearTimeout(saveTimer.current);
      }
      if (retryTimer.current) {
        clearTimeout(retryTimer.current);
      }
    };
  }, []);

  const updateForm = useCallback((patch: Partial<LeadFormConfig>) => {
    setForm((current) => {
      if (!current) return current;
      return {
        ...current,
        ...patch,
        meta: {
          ...current.meta,
          updatedAt: new Date().toISOString(),
          version: current.meta.version + 1,
        },
      };
    });
  }, []);

  const updateField = (fieldId: string, patch: Partial<LeadFormField>) => {
    if (!form) return;
    const nextFields = form.fields.map((field) =>
      field.id === fieldId
        ? normalizeFieldPatch({ ...field, ...patch } as LeadFormField)
        : field
    );
    updateForm({ fields: nextFields });
  };

  const focusFieldSettingsOnPhone = useCallback(() => {
    if (
      layout !== "side" ||
      columns !== 2 ||
      showPreview ||
      typeof window === "undefined" ||
      window.matchMedia("(min-width: 768px)").matches
    ) {
      return;
    }
    window.requestAnimationFrame(() => {
      document
        .getElementById("lead-form-field-settings-panel")
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }, [columns, layout, showPreview]);

  const addPresetField = (presetId: string) => {
    if (!form) return;
    const preset = FIELD_PRESETS.find((item) => item.id === presetId);
    if (!preset) return;
    const newField = createField(preset.type, preset.label, {
      helpText: preset.helpText ?? "",
      validation: preset.validation ?? { rule: "none" },
      ...(preset.fieldOverrides ?? {}),
    });
    updateForm({ fields: [...form.fields, newField] });
    setSelectedFieldId(newField.id);
    focusFieldSettingsOnPhone();
  };

  const deleteField = (fieldId: string) => {
    let removedField: LeadFormField | null = null;
    let removedIndex = -1;
    setForm((current) => {
      if (!current) return current;
      const index = current.fields.findIndex((field) => field.id === fieldId);
      if (index === -1) return current;
      removedField = current.fields[index];
      removedIndex = index;
      const nextFields = current.fields.filter((field) => field.id !== fieldId);
      return {
        ...current,
        fields: nextFields,
        meta: {
          ...current.meta,
          updatedAt: new Date().toISOString(),
          version: current.meta.version + 1,
        },
      };
    });

    setSelectedFieldId((current) => (current === fieldId ? null : current));
    if (!removedField || removedIndex < 0) return;
    const fieldToRestore = removedField as LeadFormField;
    toast({
      title: "Field removed",
      description: "Undo within a few seconds if this was accidental.",
      actionLabel: "Undo",
      onAction: () => {
        setForm((current) => {
          if (!current) return current;
          if (
            current.fields.some(
              (field: LeadFormField) => field.id === fieldToRestore.id
            )
          ) {
            return current;
          }
          const nextFields = [...current.fields];
          const index = Math.min(Math.max(removedIndex, 0), nextFields.length);
          nextFields.splice(index, 0, fieldToRestore);
          return {
            ...current,
            fields: nextFields,
            meta: {
              ...current.meta,
              updatedAt: new Date().toISOString(),
              version: current.meta.version + 1,
            },
          };
        });
        setSelectedFieldId(fieldToRestore.id);
      },
    });
  };

  const reorderFields = useCallback((sourceId: string, targetId: string) => {
    if (!form || sourceId === targetId) return;
    const next = [...form.fields];
    const sourceIndex = next.findIndex((field) => field.id === sourceId);
    const targetIndex = next.findIndex((field) => field.id === targetId);
    if (sourceIndex === -1 || targetIndex === -1) return;
    const [moved] = next.splice(sourceIndex, 1);
    next.splice(targetIndex, 0, moved);
    updateForm({ fields: next });
  }, [form, updateForm]);

  const moveField = useCallback(
    (fieldId: string, direction: "up" | "down") => {
      if (!form) return;
      const currentIndex = form.fields.findIndex((field) => field.id === fieldId);
      if (currentIndex === -1) return;
      const nextIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;
      if (nextIndex < 0 || nextIndex >= form.fields.length) return;
      const nextFields = [...form.fields];
      const [moved] = nextFields.splice(currentIndex, 1);
      nextFields.splice(nextIndex, 0, moved);
      updateForm({ fields: nextFields });
      setSelectedFieldId(fieldId);
    },
    [form, updateForm]
  );

  useEffect(() => {
    onRegisterReorder?.(reorderFields);
  }, [onRegisterReorder, reorderFields]);

  const handleFieldTypeChange = (
    fieldId: string,
    type: LeadFormFieldType
  ) => {
    if (!form) return;
    const field = form.fields.find((item) => item.id === fieldId);
    if (!field) return;
    const migrated = migrateFieldType(field, type);
    updateField(fieldId, migrated);
  };

  if (!handle) {
    return (
      <Card className="rounded-2xl border border-border/60 bg-card/80 shadow-sm">
        <CardContent className="py-6 text-sm text-muted-foreground">
          Select a profile handle to edit the lead form.
        </CardContent>
      </Card>
    );
  }

  if (loading || !form) {
    return (
      <Card className="rounded-2xl border border-border/60 bg-card/80 shadow-sm">
        <CardContent className="py-6 text-sm text-muted-foreground">
          Loading lead form...
        </CardContent>
      </Card>
    );
  }
  return (
    <div className="space-y-6">
      {!canCustomizeLeadForm ? (
        <Card className="rounded-2xl border border-primary/20 bg-primary/5 shadow-sm">
          <CardContent className="flex flex-col gap-4 py-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1">
              <div className="text-sm font-semibold text-foreground">
                Paid unlocks custom lead forms
              </div>
              <p className="text-sm text-muted-foreground">
                Free profiles use the default Name, Email, and Note form. Upgrade to add fields, change copy, and customize the submission experience.
              </p>
            </div>
            <Button asChild size="sm" className="w-full sm:w-auto">
              <Link href={planAccess.upgradeHref}>Unlock paid features</Link>
            </Button>
          </CardContent>
        </Card>
      ) : null}
      <div className="space-y-6" data-layout={layout}>
        <div className="rounded-[1.8rem] border border-border/60 bg-card/85 px-5 py-5 shadow-[0_20px_52px_-38px_rgba(15,23,42,0.38)]">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full border border-border/60 bg-background/80 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  Form Builder
                </span>
                <span
                  className={cn(
                    "rounded-full px-3 py-1 text-xs font-medium",
                    form.status === "published"
                      ? "border border-emerald-300/60 bg-emerald-50 text-emerald-800"
                      : "border border-border/60 bg-background/80 text-foreground"
                  )}
                >
                  {form.status === "published" ? "Published" : "Draft"}
                </span>
                <span
                  className={cn(
                    "text-xs",
                    saveState === "failed"
                      ? "text-destructive"
                      : saveState === "saving"
                      ? "dashboard-saving-indicator text-foreground"
                      : "text-muted-foreground"
                  )}
                >
                  {saveState === "failed"
                    ? "Save failed. Retrying..."
                    : saveState === "saving"
                    ? "Saving changes..."
                    : saveState === "unsaved"
                    ? "Unsaved changes"
                    : "All changes saved"}
                  {lastSavedAt ? ` - Updated ${formatShortDate(lastSavedAt)}` : ""}
                </span>
              </div>
              <div>
                <h2 className="text-2xl font-semibold tracking-tight text-foreground">
                  {form.title || "Untitled lead form"}
                </h2>
                <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
                  Edit the active question in the top workspace, reorder the question rail below, and keep the live preview isolated on the right.
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className="rounded-full px-3 py-1 text-xs">
                {stats.count} submissions
              </Badge>
              <Badge variant="outline" className="rounded-full px-3 py-1 text-xs">
                {stats.lastSubmittedAt
                  ? `Last response ${formatShortDate(stats.lastSubmittedAt)}`
                  : "No responses yet"}
              </Badge>
            </div>
          </div>
        </div>
        <div className="relative">
          <Card
            className={cn(
              "rounded-2xl border border-border/60 bg-card/80 shadow-sm",
              !canCustomizeLeadForm && "pointer-events-none select-none opacity-65"
            )}
          >
          <CardHeader className="space-y-3">
            <CardTitle className="text-sm font-semibold whitespace-nowrap">
              Form setup
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              Use these sections for form-wide copy, submission behavior, and display rules.
            </p>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-3 rounded-2xl border border-border/50 bg-background/55 p-3">
              <Accordion type="multiple" defaultValue={["form-content"]} className="space-y-3">
                <AccordionItem
                  value="form-content"
                  className="rounded-2xl border border-border/50 bg-background/60 px-4 last:border-b"
                >
                  <AccordionTrigger className="py-3 hover:no-underline">
                    <div className="space-y-1 pr-4 text-left">
                      <div className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                        Form content
                      </div>
                      <p className="text-xs font-normal text-muted-foreground">
                        Set the title, intro text, and success message shown after submit.
                      </p>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="pb-4">
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <Label htmlFor="lead-form-title">Title</Label>
                        <Input
                          id="lead-form-title"
                          value={form.title}
                          onChange={(event) => updateForm({ title: event.target.value })}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="lead-form-description">Subtitle</Label>
                        <Textarea
                          id="lead-form-description"
                          value={form.description}
                          onChange={(event) => updateForm({ description: event.target.value })}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="lead-form-confirm">Success message</Label>
                        <Textarea
                          id="lead-form-confirm"
                          value={form.settings.confirmationMessage}
                          onChange={(event) =>
                            updateForm({
                              settings: {
                                ...form.settings,
                                confirmationMessage: event.target.value,
                              },
                            })
                          }
                        />
                      </div>
                    </div>
                  </AccordionContent>
                </AccordionItem>

                <AccordionItem
                  value="submission-rules"
                  className="rounded-2xl border border-border/50 bg-background/60 px-4 last:border-b"
                >
                  <AccordionTrigger className="py-3 hover:no-underline">
                    <div className="space-y-1 pr-4 text-left">
                      <div className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                        Submission rules
                      </div>
                      <p className="text-xs font-normal text-muted-foreground">
                        Control how many responses a visitor can send and whether they can edit later.
                      </p>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="pb-4">
                    <div className="space-y-4">
                      <label className="flex items-center justify-between gap-3 text-sm text-foreground">
                        <span>Allow edit after submit</span>
                        <Switch
                          checked={form.settings.allowEditAfterSubmit}
                          onCheckedChange={(value) =>
                            updateForm({
                              settings: {
                                ...form.settings,
                                allowEditAfterSubmit: Boolean(value),
                              },
                            })
                          }
                        />
                      </label>
                      <label className="flex items-center justify-between gap-3 text-sm text-foreground">
                        <span>Limit one response</span>
                        <Switch
                          checked={form.settings.limitOneResponse === "on"}
                          onCheckedChange={(value) =>
                            updateForm({
                              settings: {
                                ...form.settings,
                                limitOneResponse: value ? "on" : "off",
                              },
                            })
                          }
                        />
                      </label>
                      <label className="flex items-center justify-between gap-3 text-sm text-foreground">
                        <span>Verify email on email fields</span>
                        <Switch
                          checked={form.settings.collectEmail === "verified"}
                          onCheckedChange={(value) =>
                            updateForm({
                              settings: {
                                ...form.settings,
                                collectEmail: value ? "verified" : "user_input",
                              },
                            })
                          }
                        />
                      </label>
                    </div>
                  </AccordionContent>
                </AccordionItem>

                <AccordionItem
                  value="display-options"
                  className="rounded-2xl border border-border/50 bg-background/60 px-4 last:border-b"
                >
                  <AccordionTrigger className="py-3 hover:no-underline">
                    <div className="space-y-1 pr-4 text-left">
                      <div className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                        Display options
                      </div>
                      <p className="text-xs font-normal text-muted-foreground">
                        Decide how structured or dynamic the public form should feel.
                      </p>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="pb-4">
                    <div className="space-y-4">
                      <label className="flex items-center justify-between gap-3 text-sm text-foreground">
                        <span>Show progress bar</span>
                        <Switch
                          checked={form.settings.showProgressBar}
                          onCheckedChange={(value) =>
                            updateForm({
                              settings: {
                                ...form.settings,
                                showProgressBar: Boolean(value),
                              },
                            })
                          }
                        />
                      </label>
                      <label className="flex items-center justify-between gap-3 text-sm text-foreground">
                        <span>Shuffle question order</span>
                        <Switch
                          checked={form.settings.shuffleQuestionOrder}
                          onCheckedChange={(value) =>
                            updateForm({
                              settings: {
                                ...form.settings,
                                shuffleQuestionOrder: Boolean(value),
                              },
                            })
                          }
                        />
                      </label>
                    </div>
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            </div>
          </CardContent>
          </Card>
          {!canCustomizeLeadForm ? (
            <LockedFeatureOverlay upgradeHref={planAccess.upgradeHref} />
          ) : null}
        </div>
        <div
          className={cn(
            "grid gap-6 items-start",
            layout === "side" &&
              (columns === 3
                ? "lg:grid-cols-[0.92fr_1.06fr_0.98fr]"
                : isExternalPreviewLayout
                ? "md:grid-cols-2 lg:grid-cols-[minmax(260px,0.82fr)_minmax(0,1.18fr)]"
                : "md:grid-cols-2")
          )}
        >
          <div className="relative">
            <Card
              className={cn(
                "rounded-2xl border border-border/60 bg-card/80 shadow-sm",
                isExternalPreviewLayout &&
                  "xl:sticky xl:top-4 xl:flex xl:min-h-[34rem] xl:max-h-[calc(100vh-8rem)] xl:flex-col",
                !canCustomizeLeadForm && "pointer-events-none select-none opacity-65"
              )}
            >
            <CardHeader className="space-y-3">
              <div className="flex flex-row items-center justify-between gap-4">
                <CardTitle className="text-sm font-semibold whitespace-nowrap">
                  Questions
                </CardTitle>
                <Button
                  size="sm"
                  onClick={() => setFieldPickerOpen(true)}
                  className="hidden sm:inline-flex lead-form-add-field"
                >
                  <Plus className="mr-2 h-4 w-4" /> Add field
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Reorder questions here, then open one to edit it in the panel to the right.
              </p>
            </CardHeader>
            <CardContent
              className={cn(
                "space-y-3",
                isExternalPreviewLayout &&
                  "xl:flex xl:min-h-0 xl:flex-1 xl:flex-col xl:overflow-y-auto xl:pr-1"
              )}
            >
              <Button
                size="sm"
                onClick={() => setFieldPickerOpen(true)}
                className="w-full justify-center sm:hidden lead-form-add-field"
              >
                <Plus className="mr-2 h-4 w-4" /> Add field
              </Button>
              {layout === "side" && columns === 2 && !showPreview ? (
                <p className="text-xs text-muted-foreground md:hidden">
                  Tap a question to open its editor below.
                </p>
              ) : null}
              {form.fields.length ? (
                form.fields.map((field, index) => (
                  <div
                    key={field.id}
                    className={cn(
                      "dashboard-drag-item lead-form-drag-item grid grid-cols-[auto_minmax(0,1fr)] items-start gap-3 rounded-xl border border-border/60 bg-background/80 p-3",
                      selectedFieldId === field.id && "ring-2 ring-primary/20",
                      draggingFieldId === field.id && "is-dragging"
                    )}
                    draggable
                    onDragStart={() => setDraggingFieldId(field.id)}
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={() => {
                      if (draggingFieldId)
                        reorderFields(draggingFieldId, field.id);
                    }}
                    onDragEnd={() => setDraggingFieldId(null)}
                    onClick={() => {
                      setSelectedFieldId(field.id);
                      focusFieldSettingsOnPhone();
                    }}
                  >
                    <GripVertical className="mt-1 h-4 w-4 text-muted-foreground" />
                    <div className="min-w-0 space-y-3">
                      <div className="min-w-0 space-y-1">
                        <div className="break-words text-sm font-semibold leading-snug">
                          {field.label}
                        </div>
                        <div className="text-xs leading-snug text-muted-foreground">
                          {fieldTypeLabel(field.type)}
                          {field.required ? " - required" : ""}
                        </div>
                      </div>
                      <div
                        className="lead-form-question-actions"
                        onClick={(event) => event.stopPropagation()}
                      >
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="lead-form-question-action"
                          onClick={(event) => {
                            event.stopPropagation();
                            moveField(field.id, "up");
                          }}
                          disabled={index === 0}
                          aria-label={`Move ${field.label || "field"} up`}
                        >
                          <ArrowUp className="h-4 w-4" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="lead-form-question-action"
                          onClick={(event) => {
                            event.stopPropagation();
                            moveField(field.id, "down");
                          }}
                          disabled={index === form.fields.length - 1}
                          aria-label={`Move ${field.label || "field"} down`}
                        >
                          <ArrowDown className="h-4 w-4" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="lead-form-question-action lead-form-question-action-danger"
                          onClick={(event) => {
                            event.stopPropagation();
                            deleteField(field.id);
                          }}
                          aria-label="Delete field"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="rounded-xl border border-dashed border-border/60 px-3 py-6 text-center text-sm text-muted-foreground">
                  Add a field to start your form.
                </div>
              )}
              <div
                className={cn(
                  "rounded-xl border border-dashed border-border/50 bg-background/40 px-3 py-3 text-xs text-muted-foreground",
                  isExternalPreviewLayout && "xl:mt-auto"
                )}
              >
                Preview order follows this list. Use the arrow buttons or drag to reorder, then edit the active question in the panel.
              </div>
            </CardContent>
            </Card>
            {!canCustomizeLeadForm ? (
              <LockedFeatureOverlay upgradeHref={planAccess.upgradeHref} />
            ) : null}
          </div>
          <div className="relative">
            <Card
              id="lead-form-field-settings-panel"
              className={cn(
                "rounded-2xl border border-border/60 bg-card/80 shadow-sm",
                !canCustomizeLeadForm && "pointer-events-none select-none opacity-65"
              )}
            >
            <CardHeader className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <CardTitle className="text-sm font-semibold whitespace-nowrap">
                  Selected field
                </CardTitle>
                <Badge variant="outline" className="rounded-full px-2.5 py-0.5 text-[11px]">
                  {activeField ? `Editing ${activeField.label}` : "Choose a field"}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                Edit the active question here after selecting it from the rail.
              </p>
            </CardHeader>
            <CardContent className="space-y-5">
              {!activeField ? (
                <div className="rounded-xl border border-dashed border-border/60 px-3 py-5 text-sm text-muted-foreground">
                  Select a field from the question rail to edit it here.
                </div>
              ) : (
                <div
                  className={cn(
                    "grid gap-5",
                    hasAdvancedFieldOptions &&
                      "xl:grid-cols-[minmax(0,1fr)_minmax(260px,0.78fr)] xl:items-start"
                  )}
                >
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label>Label</Label>
                      <Input
                        value={activeField.label}
                        onChange={(event) =>
                          updateField(activeField.id, {
                            label: event.target.value,
                          })
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Help text</Label>
                      <Input
                        value={activeField.helpText}
                        onChange={(event) =>
                          updateField(activeField.id, {
                            helpText: event.target.value,
                          })
                        }
                      />
                    </div>
                    <label className="flex items-center justify-between gap-3 rounded-xl border border-border/40 bg-background/45 px-3 py-2 text-sm text-foreground">
                      <span>Required</span>
                      <Switch
                        checked={activeField.required}
                        onCheckedChange={(value) =>
                          updateField(activeField.id, {
                            required: Boolean(value),
                          })
                        }
                      />
                    </label>
                    <div className="space-y-2">
                      <Label>Field type</Label>
                      <select
                        className="h-10 w-full rounded-md border border-border/60 bg-background px-3 text-sm"
                        value={activeField.type}
                        onChange={(event) =>
                          handleFieldTypeChange(
                            activeField.id,
                            event.target.value as LeadFormFieldType
                          )
                        }
                      >
                        {ALLOWED_TYPES.map((option) => (
                          <option key={option.type} value={option.type}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <ValidationEditor
                      field={activeField}
                      onChange={(validation) =>
                        updateField(activeField.id, { validation })
                      }
                    />
                  </div>
                  {hasAdvancedFieldOptions ? (
                    <div className="space-y-4 rounded-2xl border border-border/40 bg-background/45 p-4">
                      <div className="space-y-1">
                        <div className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                          Field options
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Tune the interaction details for this question type.
                        </p>
                      </div>
                      <FieldTypeEditor
                        field={activeField}
                        onChange={(patch) => updateField(activeField.id, patch)}
                      />
                    </div>
                  ) : null}
                </div>
              )}

              {saveError ? (
                <div className="text-xs text-destructive">{saveError}</div>
              ) : null}
            </CardContent>
            </Card>
            {!canCustomizeLeadForm ? (
              <LockedFeatureOverlay upgradeHref={planAccess.upgradeHref} />
            ) : null}
          </div>

          {showPreview ? (
            <Card className="rounded-2xl border border-border/60 bg-card/80 shadow-sm">
              <CardHeader>
                <CardTitle className="text-sm font-semibold whitespace-nowrap">
                  Live preview
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <div className="text-sm font-semibold">{form.title}</div>
                  {form.description ? (
                    <div className="text-xs text-muted-foreground">
                      {form.description}
                    </div>
                  ) : null}
                </div>
                {form.settings.showProgressBar && (
                  <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                    <div className="h-full w-1/3 rounded-full bg-foreground/60" />
                  </div>
                )}
                <div className="space-y-4">
                  {previewFields.map((field) => (
                    <div key={field.id} className="space-y-2">
                      {field.type === "section" ? (
                        <div className="rounded-xl border border-border/60 bg-muted/30 px-3 py-2">
                          <div className="text-sm font-semibold">
                            {field.title}
                          </div>
                          {field.description ? (
                            <div className="text-xs text-muted-foreground">
                              {field.description}
                            </div>
                          ) : null}
                        </div>
                      ) : (
                        <>
                          <Label className="text-xs text-muted-foreground">
                            {field.label}
                            {field.required ? " *" : ""}
                          </Label>
                          <PreviewField field={field} />
                        </>
                      )}
                    </div>
                  ))}
                </div>
                <Button className="w-full" disabled>
                  Submit
                </Button>
              </CardContent>
            </Card>
          ) : null}
        </div>
      </div>

      <Dialog open={fieldPickerOpen} onOpenChange={setFieldPickerOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add a field</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <div className="grid gap-2 sm:grid-cols-2">
              {FIELD_PRESETS.map((item) => (
                <Button
                  key={item.id}
                  variant="secondary"
                  onClick={() => {
                    addPresetField(item.id);
                    setFieldPickerOpen(false);
                  }}
                >
                  {item.label}
                </Button>
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="secondary"
              onClick={() => setFieldPickerOpen(false)}
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function PreviewField({ field }: { field: LeadFormField }) {
  switch (field.type) {
    case "short_text":
      return <Input placeholder={field.helpText || "Short answer"} disabled />;
    case "long_text":
      return <Textarea placeholder={field.helpText || "Long answer"} disabled />;
    case "multiple_choice":
      return (
        <div className="space-y-2">
          {getOptions(field).map((option) => (
            <label key={option.id} className="flex items-center gap-2 text-sm">
              <input type="radio" disabled />
              {option.label}
            </label>
          ))}
        </div>
      );
    case "checkboxes":
      return (
        <div className="space-y-2">
          {getOptions(field).map((option) => (
            <label key={option.id} className="flex items-center gap-2 text-sm">
              <input type="checkbox" disabled />
              {option.label}
            </label>
          ))}
        </div>
      );
    case "dropdown":
      return (
        <select
          className="h-10 w-full rounded-md border border-border/60 bg-background px-3 text-sm"
          disabled
        >
          {getOptions(field).map((option) => (
            <option key={option.id}>{option.label}</option>
          ))}
        </select>
      );
    case "linear_scale":
      return (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>{field.minLabel}</span>
          <div className="flex flex-wrap gap-1">
            {Array.from({ length: field.max - field.min + 1 }).map(
              (_, index) => (
                <span
                  key={index}
                  className="rounded-full border border-border/60 px-2 py-1"
                >
                  {field.min + index}
                </span>
              )
            )}
          </div>
          <span>{field.maxLabel}</span>
        </div>
      );
    case "rating":
      return (
        <div className="flex items-center gap-1">
          {Array.from({ length: field.scale }).map((_, index) => (
            <span key={index} className="text-base text-muted-foreground">
              {ratingIcon(field.icon)}
            </span>
          ))}
        </div>
      );
    case "date":
      return <Input type={field.includeTime ? "datetime-local" : "date"} disabled />;
    case "time":
      return (
        <Input
          type={field.mode === "duration" ? "number" : "time"}
          disabled
          placeholder={field.mode === "duration" ? "Minutes" : undefined}
        />
      );
    case "file_upload":
      return <Input type="file" disabled />;
    case "multiple_choice_grid":
    case "checkbox_grid":
      return <GridPreview field={field} />;
    case "section":
      return null;
    default:
      return null;
  }
}

function GridPreview({ field }: { field: LeadFormField }) {
  if (field.type !== "multiple_choice_grid" && field.type !== "checkbox_grid")
    return null;
  const columns = getSafeOptionEntries(field.columns, "col");
  const rows = getSafeOptionEntries(field.rows, "row");
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr>
            <th className="p-2 text-left" />
            {columns.map((col) => (
              <th key={col.id} className="p-2 text-left font-medium">
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              <td className="p-2 font-medium">{row.label}</td>
              {columns.map((col) => (
                <td key={col.id} className="p-2">
                  <input
                    type={
                      field.type === "multiple_choice_grid" ? "radio" : "checkbox"
                    }
                    disabled
                  />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
function FieldTypeEditor({
  field,
  onChange,
}: {
  field: LeadFormField;
  onChange: (patch: Partial<LeadFormField>) => void;
}) {
  switch (field.type) {
    case "multiple_choice":
    case "checkboxes":
    case "dropdown":
      return <OptionsEditor field={field} onChange={onChange} />;
    case "linear_scale":
      return (
        <div className="space-y-3">
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Min</Label>
              <Input
                type="number"
                value={field.min}
                min={1}
                max={10}
                onChange={(event) =>
                  onChange({ min: Number(event.target.value || 1) })
                }
              />
            </div>
            <div className="space-y-2">
              <Label>Max</Label>
              <Input
                type="number"
                value={field.max}
                min={2}
                max={10}
                onChange={(event) =>
                  onChange({ max: Number(event.target.value || 2) })
                }
              />
            </div>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Min label</Label>
              <Input
                value={field.minLabel}
                onChange={(event) => onChange({ minLabel: event.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Max label</Label>
              <Input
                value={field.maxLabel}
                onChange={(event) => onChange({ maxLabel: event.target.value })}
              />
            </div>
          </div>
        </div>
      );
    case "rating":
      return (
        <div className="space-y-3">
          <div className="space-y-2">
            <Label>Icon</Label>
            <select
              className="h-10 w-full rounded-md border border-border/60 bg-background px-3 text-sm"
              value={field.icon}
              onChange={(event) =>
                onChange({
                  icon: event.target.value as LeadFormRatingField["icon"],
                })
              }
            >
              <option value="star">Star</option>
              <option value="heart">Heart</option>
              <option value="thumbs">Thumbs</option>
            </select>
          </div>
          <div className="space-y-2">
            <Label>Scale</Label>
            <Input
              type="number"
              min={3}
              max={10}
              value={field.scale}
              onChange={(event) =>
                onChange({ scale: Number(event.target.value || 3) })
              }
            />
          </div>
        </div>
      );
    case "date":
      return (
        <div className="space-y-2">
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <Switch
              checked={field.includeYear}
              onCheckedChange={(value) =>
                onChange({ includeYear: Boolean(value) })
              }
            />
            Include year
          </label>
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <Switch
              checked={field.includeTime}
              onCheckedChange={(value) =>
                onChange({ includeTime: Boolean(value) })
              }
            />
            Include time
          </label>
        </div>
      );
    case "time":
      return (
        <div className="space-y-3">
          <div className="space-y-2">
            <Label>Mode</Label>
            <select
              className="h-10 w-full rounded-md border border-border/60 bg-background px-3 text-sm"
              value={field.mode}
              onChange={(event) =>
                onChange({
                  mode: event.target.value as LeadFormTimeField["mode"],
                })
              }
            >
              <option value="time_of_day">Time of day</option>
              <option value="duration">Duration</option>
            </select>
          </div>
          <div className="space-y-2">
            <Label>Step minutes</Label>
            <Input
              type="number"
              value={field.stepMinutes}
              onChange={(event) =>
                onChange({ stepMinutes: Number(event.target.value || 5) })
              }
            />
          </div>
        </div>
      );
    case "file_upload": {
      const acceptedTypes = getSafeStringList(field.acceptedTypes);
      return (
        <div className="space-y-3">
          <div className="space-y-2">
            <Label>Accepted types</Label>
            <Input
              value={acceptedTypes.join(", ")}
              onChange={(event) =>
                onChange({
                  acceptedTypes: event.target.value
                    .split(",")
                    .map((item) => item.trim())
                    .filter(Boolean),
                })
              }
            />
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Max files</Label>
              <Input
                type="number"
                value={field.maxFiles}
                onChange={(event) =>
                  onChange({ maxFiles: Number(event.target.value || 1) })
                }
              />
            </div>
            <div className="space-y-2">
              <Label>Max size (MB)</Label>
              <Input
                type="number"
                value={field.maxSizeMB}
                onChange={(event) =>
                  onChange({ maxSizeMB: Number(event.target.value || 10) })
                }
              />
            </div>
          </div>
        </div>
      );
    }
    case "multiple_choice_grid":
    case "checkbox_grid":
      return <GridEditor field={field} onChange={onChange} />;
    case "section":
      return (
        <div className="space-y-2">
          <Label>Section title</Label>
          <Input
            value={field.title}
            onChange={(event) => onChange({ title: event.target.value })}
          />
          <Label>Description</Label>
          <Textarea
            value={field.description}
            onChange={(event) => onChange({ description: event.target.value })}
          />
        </div>
      );
    default:
      return null;
  }
}

function OptionsEditor({
  field,
  onChange,
}: {
  field: LeadFormField;
  onChange: (patch: Partial<LeadFormField>) => void;
}) {
  if (
    field.type !== "multiple_choice" &&
    field.type !== "checkboxes" &&
    field.type !== "dropdown"
  ) {
    return null;
  }
  const options = getOptions(field);
  const updateOptions = (next: LeadFormOption[]) => onChange({ options: next });
  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <Label>Options</Label>
        <div className="space-y-2">
          {options.map((option, index) => (
            <div key={option.id} className="flex items-center gap-2">
              <Input
                value={option.label}
                onChange={(event) => {
                  const next = [...options];
                  next[index] = { ...option, label: event.target.value };
                  updateOptions(next);
                }}
              />
              <Button
                variant="ghost"
                size="icon"
                onClick={async () => {
                  if (
                    !(await confirmRemove({
                      title: "Remove option?",
                      description:
                        "This answer choice will be removed from the selected question.",
                      confirmLabel: "Remove option",
                    }))
                  ) {
                    return;
                  }
                  updateOptions(options.filter((item) => item.id !== option.id));
                }}
                aria-label="Remove option"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
          <Button
            variant="secondary"
            size="sm"
            onClick={() =>
              updateOptions([
                ...options,
                { id: `opt_${randomId()}`, label: `Option ${options.length + 1}` },
              ])
            }
          >
            Add option
          </Button>
        </div>
      </div>
      <label className="flex items-center gap-2 text-sm text-muted-foreground">
        <Switch
          checked={field.allowOther}
          onCheckedChange={(value) =>
            onChange({ allowOther: Boolean(value) })
          }
        />
        Allow other
      </label>
      {field.allowOther && (
        <Input
          value={field.otherLabel}
          onChange={(event) => onChange({ otherLabel: event.target.value })}
          placeholder="Other"
        />
      )}
      <label className="flex items-center gap-2 text-sm text-muted-foreground">
        <Switch
          checked={Boolean(field.presentation?.shuffleOptions)}
          onCheckedChange={(value) =>
            onChange({
              presentation: {
                ...field.presentation,
                shuffleOptions: Boolean(value),
              },
            })
          }
        />
        Shuffle options
      </label>
    </div>
  );
}
function GridEditor({
  field,
  onChange,
}: {
  field: LeadFormField;
  onChange: (patch: Partial<LeadFormField>) => void;
}) {
  if (field.type !== "multiple_choice_grid" && field.type !== "checkbox_grid")
    return null;
  const rows = getSafeOptionEntries(field.rows, "row");
  const columns = getSafeOptionEntries(field.columns, "col");
  const gridRules = getSafeGridRules(field.gridRules);
  const updateRows = (rows: LeadFormOption[]) => onChange({ rows });
  const updateColumns = (columns: LeadFormOption[]) => onChange({ columns });
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>Rows</Label>
        {rows.map((row, index) => (
          <div key={row.id} className="flex items-center gap-2">
            <Input
              value={row.label}
              onChange={(event) => {
                const next = [...rows];
                next[index] = { ...row, label: event.target.value };
                updateRows(next);
              }}
            />
            <Button
              variant="ghost"
              size="icon"
              onClick={async () => {
                if (
                  !(await confirmRemove({
                    title: "Remove row?",
                    description:
                      "This grid row will be removed from the selected question.",
                    confirmLabel: "Remove row",
                  }))
                ) {
                  return;
                }
                updateRows(rows.filter((item) => item.id !== row.id));
              }}
              aria-label="Remove row"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ))}
        <Button
          variant="secondary"
          size="sm"
          onClick={() =>
            updateRows([
              ...rows,
              { id: `row_${randomId()}`, label: `Row ${rows.length + 1}` },
            ])
          }
        >
          Add row
        </Button>
      </div>
      <div className="space-y-2">
        <Label>Columns</Label>
        {columns.map((col, index) => (
          <div key={col.id} className="flex items-center gap-2">
            <Input
              value={col.label}
              onChange={(event) => {
                const next = [...columns];
                next[index] = { ...col, label: event.target.value };
                updateColumns(next);
              }}
            />
            <Button
              variant="ghost"
              size="icon"
              onClick={async () => {
                if (
                  !(await confirmRemove({
                    title: "Remove column?",
                    description:
                      "This grid column will be removed from the selected question.",
                    confirmLabel: "Remove column",
                  }))
                ) {
                  return;
                }
                updateColumns(columns.filter((item) => item.id !== col.id));
              }}
              aria-label="Remove column"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ))}
        <Button
          variant="secondary"
          size="sm"
          onClick={() =>
            updateColumns([
              ...columns,
              {
                id: `col_${randomId()}`,
                label: `Column ${columns.length + 1}`,
              },
            ])
          }
        >
          Add column
        </Button>
      </div>
      <label className="flex items-center gap-2 text-sm text-muted-foreground">
        <Switch
          checked={gridRules.requireResponsePerRow}
          onCheckedChange={(value) =>
            onChange({
              gridRules: {
                ...gridRules,
                requireResponsePerRow: Boolean(value),
              },
            })
          }
        />
        Require response per row
      </label>
      <label className="flex items-center gap-2 text-sm text-muted-foreground">
        <Switch
          checked={gridRules.limitOneResponsePerColumn}
          onCheckedChange={(value) =>
            onChange({
              gridRules: {
                ...gridRules,
                limitOneResponsePerColumn: Boolean(value),
              },
            })
          }
        />
        Limit one response per column
      </label>
    </div>
  );
}

function ValidationEditor({
  field,
  onChange,
}: {
  field: LeadFormField;
  onChange: (validation: LeadFormValidation) => void;
}) {
  const options = getValidationOptions(field.type);
  if (!options.length) return null;
  const rule = field.validation?.rule || "none";
  const value = field.validation?.value;
  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <Label>Validation</Label>
        <select
          className="h-10 w-full rounded-md border border-border/60 bg-background px-3 text-sm"
          value={rule}
          onChange={(event) => onChange({ rule: event.target.value })}
        >
          {options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>
      {needsValidationValue(rule) && (
        <ValidationValueInput
          rule={rule}
          value={value}
          onChange={(val) =>
            onChange({ ...field.validation, rule, value: val })
          }
        />
      )}
    </div>
  );
}

function ValidationValueInput({
  rule,
  value,
  onChange,
}: {
  rule: string;
  value: unknown;
  onChange: (value: unknown) => void;
}) {
  if (rule === "length_range" || rule === "selection_range") {
    const current = (value as { min?: number; max?: number }) || {};
    return (
      <div className="grid gap-3 md:grid-cols-2">
        <Input
          type="number"
          placeholder="Min"
          value={current.min ?? ""}
          onChange={(event) =>
            onChange({ ...current, min: Number(event.target.value || 0) })
          }
        />
        <Input
          type="number"
          placeholder="Max"
          value={current.max ?? ""}
          onChange={(event) =>
            onChange({ ...current, max: Number(event.target.value || 0) })
          }
        />
      </div>
    );
  }
  if (rule === "date_range" || rule === "time_range") {
    const current = (value as { min?: string; max?: string }) || {};
    const inputType = rule === "date_range" ? "date" : "time";
    return (
      <div className="grid gap-3 md:grid-cols-2">
        <Input
          type={inputType}
          value={current.min ?? ""}
          onChange={(event) => onChange({ ...current, min: event.target.value })}
        />
        <Input
          type={inputType}
          value={current.max ?? ""}
          onChange={(event) => onChange({ ...current, max: event.target.value })}
        />
      </div>
    );
  }
  if (rule === "regex") {
    return (
      <Input
        placeholder="Regex"
        value={String(value ?? "")}
        onChange={(event) => onChange(event.target.value)}
      />
    );
  }
  return (
    <Input
      type="number"
      value={value as number | string | undefined}
      onChange={(event) => onChange(Number(event.target.value || 0))}
    />
  );
}

function getValidationOptions(type: LeadFormFieldType) {
  switch (type) {
    case "short_text":
      return [
        { value: "none", label: "None" },
        { value: "email", label: "Email" },
        { value: "url", label: "URL" },
        { value: "regex", label: "Regex" },
        { value: "min_length", label: "Min length" },
        { value: "max_length", label: "Max length" },
        { value: "length_range", label: "Length range" },
      ];
    case "long_text":
      return [
        { value: "none", label: "None" },
        { value: "max_length", label: "Max length" },
        { value: "length_range", label: "Length range" },
        { value: "regex", label: "Regex" },
      ];
    case "checkboxes":
      return [
        { value: "none", label: "None" },
        { value: "min_selections", label: "Min selections" },
        { value: "max_selections", label: "Max selections" },
        { value: "selection_range", label: "Selection range" },
      ];
    case "date":
      return [
        { value: "none", label: "None" },
        { value: "min_date", label: "Min date" },
        { value: "max_date", label: "Max date" },
        { value: "date_range", label: "Date range" },
      ];
    case "time":
      return [
        { value: "none", label: "None" },
        { value: "min_time", label: "Min time" },
        { value: "max_time", label: "Max time" },
        { value: "time_range", label: "Time range" },
      ];
    default:
      return [{ value: "none", label: "None" }];
  }
}

function LockedFeatureOverlay({ upgradeHref }: { upgradeHref: string }) {
  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center rounded-2xl bg-background/95 p-4 text-center">
      <div className="max-w-sm space-y-3 rounded-2xl border border-primary/20 bg-card/95 p-4 shadow-lg">
        <div className="text-sm font-semibold text-foreground">
          Paid unlocks lead form customization
        </div>
        <p className="text-sm text-muted-foreground">
          Add custom questions, rewrite the form copy, and control the submission experience with Paid.
        </p>
        <Button asChild size="sm">
          <Link href={upgradeHref}>Upgrade to Paid</Link>
        </Button>
      </div>
    </div>
  );
}

function needsValidationValue(rule: string) {
  return rule !== "none" && rule !== "email" && rule !== "url";
}

function migrateFieldType(
  field: LeadFormField,
  nextType: LeadFormFieldType
): Partial<LeadFormField> {
  const base = createField(nextType, field.label, {
    id: field.id,
    helpText: field.helpText,
    required: field.required,
  });
  if ("options" in field && "options" in base) {
    base.options = field.options;
  }
  if (
    field.type === "multiple_choice" &&
    nextType === "dropdown" &&
    "allowOther" in base
  ) {
    const multiField = field as LeadFormMultipleChoiceField;
    base.allowOther = multiField.allowOther;
    base.otherLabel = multiField.otherLabel;
  }
  return base;
}

function normalizeFieldPatch(field: LeadFormField): LeadFormField {
  if (
    field.type === "multiple_choice" ||
    field.type === "checkboxes" ||
    field.type === "dropdown"
  ) {
    return {
      ...field,
      options: field.options?.length
        ? field.options
        : [{ id: `opt_${randomId()}`, label: "Option 1" }],
      otherLabel: field.otherLabel || "Other",
    } as LeadFormField;
  }
  return field;
}

function getOptions(field: LeadFormField): LeadFormOption[] {
  if (
    field.type !== "multiple_choice" &&
    field.type !== "checkboxes" &&
    field.type !== "dropdown"
  )
    return [];
  const options = getSafeOptionEntries(field.options, "opt");
  return field.presentation?.shuffleOptions ? shuffleOptions(options) : options;
}

function fieldTypeLabel(type: LeadFormFieldType) {
  return ALLOWED_TYPES.find((item) => item.type === type)?.label || type;
}

function ratingIcon(icon: "star" | "heart" | "thumbs") {
  if (icon === "heart") return "H";
  if (icon === "thumbs") return "T";
  return "*";
}

function formatShortDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Just now";
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function randomId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return (
      (crypto as Crypto & { randomUUID?: () => string }).randomUUID?.() ||
      Math.random().toString(36).slice(2, 10)
    );
  }
  return Math.random().toString(36).slice(2, 10);
}

function getSafeStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => String(entry ?? "").trim())
    .filter(Boolean);
}

function getSafeOptionEntries(value: unknown, prefix: string): LeadFormOption[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const out: LeadFormOption[] = [];
  value.forEach((entry) => {
    if (!entry || typeof entry !== "object") return;
    const option = entry as Partial<LeadFormOption>;
    const id = String(option.id ?? "").trim() || `${prefix}_${randomId()}`;
    if (seen.has(id)) return;
    seen.add(id);
    out.push({
      id,
      label: String(option.label ?? ""),
    });
  });
  return out;
}

function getSafeGridRules(value: unknown) {
  if (!value || typeof value !== "object") {
    return { requireResponsePerRow: false, limitOneResponsePerColumn: false };
  }
  const rules = value as {
    requireResponsePerRow?: unknown;
    limitOneResponsePerColumn?: unknown;
  };
  return {
    requireResponsePerRow: Boolean(rules.requireResponsePerRow),
    limitOneResponsePerColumn: Boolean(rules.limitOneResponsePerColumn),
  };
}
