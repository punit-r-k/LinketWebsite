"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/system/toaster";
import { emitAnalyticsEvent } from "@/lib/analytics";
import { cn } from "@/lib/utils";
import {
  shuffleFields,
  shuffleOptions,
  validateSubmission,
} from "@/lib/lead-form";
import type {
  LeadFormCheckboxGridField,
  LeadFormCheckboxesField,
  LeadFormConfig,
  LeadFormDropdownField,
  LeadFormField,
  LeadFormFileUploadField,
  LeadFormMultipleChoiceField,
  LeadFormMultipleChoiceGridField,
  LeadFormRatingField,
  LeadFormUploadedFile,
} from "@/types/lead-form";

type Appearance = {
  cardBackground: string;
  cardBorder: string;
  text: string;
  muted: string;
  buttonVariant: "default" | "secondary";
};

type Props = {
  ownerId?: string | null;
  handle: string;
  profileId?: string | null;
  initialForm?: LeadFormConfig | null;
  initialFormId?: string | null;
  appearance?: Appearance;
  variant?: "card" | "profile";
  showHeader?: boolean;
  className?: string;
};

type AnswerMap = Record<string, { value: unknown }>;
type PendingUploadMap = Record<string, File[]>;
type ErrorMap = Record<string, string>;
type SubmitPhase = "idle" | "uploading" | "submitting";

const OTHER_VALUE = "__other__";
const OTHER_PREFIX = "other:";

export default function PublicLeadForm({
  handle,
  profileId = null,
  initialForm = null,
  initialFormId = null,
  appearance,
  variant = "card",
  showHeader = true,
  className,
}: Props) {
  const hydratedFormId = initialFormId ?? initialForm?.id ?? null;
  const [form, setForm] = useState<LeadFormConfig | null>(initialForm);
  const [formId, setFormId] = useState<string | null>(hydratedFormId);
  const [answers, setAnswers] = useState<AnswerMap>({});
  const [pendingUploads, setPendingUploads] = useState<PendingUploadMap>({});
  const [errors, setErrors] = useState<ErrorMap>({});
  const [loading, setLoading] = useState(!initialForm);
  const [submitting, setSubmitting] = useState(false);
  const [submitPhase, setSubmitPhase] = useState<SubmitPhase>("idle");
  const [responseId, setResponseId] = useState<string | null>(null);
  const [responseToken, setResponseToken] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [editingResponse, setEditingResponse] = useState(false);
  const formRef = useRef<HTMLFormElement | null>(null);

  const disabled = !form || form.status !== "published";
  const hasFields = Boolean(form?.fields?.length);

  const cardStyle = appearance
    ? {
        background: appearance.cardBackground,
        borderColor: appearance.cardBorder,
        color: appearance.text,
      }
    : undefined;
  const mutedStyle = appearance ? { color: appearance.muted } : undefined;
  const fieldBaseClassName =
    variant === "profile"
      ? "border-border/70 bg-input text-foreground placeholder:text-muted-foreground shadow-sm"
      : "";
  const inputClassName =
    variant === "profile"
      ? cn("h-10 rounded-xl px-3 text-sm", fieldBaseClassName)
      : "";
  const textareaClassName =
    variant === "profile"
      ? cn("min-h-20 rounded-xl px-3 py-2 text-sm", fieldBaseClassName)
      : "";
  const buttonClassName = cn(
    variant === "profile"
      ? "w-full rounded-full px-5 py-3 text-sm shadow-[0_10px_24px_-18px_var(--ring)] sm:w-fit sm:py-1.5"
      : "rounded-2xl"
  );
  const submitButtonClassName = cn(
    buttonClassName,
    variant === "profile" ? "public-profile-form-submit" : null
  );
  const cardClassName = cn(
    "border border-border/60",
    showHeader ? null : "gap-0 py-4",
    variant === "profile" ? "py-4" : null,
    className
  );

  useEffect(() => {
    if (!handle && !profileId) return;
    const hasHydratedForm = Boolean(initialForm && hydratedFormId);
    if (!hasHydratedForm) {
      setLoading(true);
    }
    (async () => {
      try {
        const search = new URLSearchParams();
        if (handle) search.set("handle", handle);
        if (profileId) search.set("profileId", profileId);
        const response = await fetch(
          `/api/lead-forms/public?${search.toString()}`,
          { cache: "no-store" }
        );
        if (!response.ok) {
          const info = await response.json().catch(() => ({}));
          throw new Error(info?.error || "Unable to load form");
        }
        const payload = (await response.json()) as {
          form: LeadFormConfig | null;
          formId?: string;
        };
        const nextFormId = payload.formId ?? payload.form?.id ?? null;
        setForm(payload.form);
        setFormId(nextFormId);
      } catch (error) {
        if (hasHydratedForm) {
          return;
        }
        const message =
          error instanceof Error ? error.message : "Lead form unavailable";
        toast({
          title: "Lead form unavailable",
          description: message,
          variant: "destructive",
        });
        setForm(null);
        setFormId(null);
      } finally {
        setLoading(false);
      }
    })();
  }, [handle, hydratedFormId, initialForm, profileId]);

  useEffect(() => {
    if (!formId) return;
    setResponseId(null);
    setResponseToken(null);
    try {
      const savedResponseId = localStorage.getItem(`lead-form-response:${formId}`);
      if (savedResponseId) setResponseId(savedResponseId);
      const savedResponseToken = localStorage.getItem(
        `lead-form-response-token:${formId}`
      );
      if (savedResponseToken) setResponseToken(savedResponseToken);
    } catch {
      // Ignore storage failures (private browsing / restricted storage).
    }
  }, [formId]);

  useEffect(() => {
    if (!form) return;
    setAnswers((prev) => {
      if (Object.keys(prev).length > 0) return prev;
      const initial: AnswerMap = {};
      form.fields.forEach((field) => {
        if (field.defaultValue !== undefined) {
          initial[field.id] = { value: field.defaultValue };
        }
      });
      return initial;
    });
  }, [form]);

  useEffect(() => {
    if (!form) return;
    if (form.settings.limitOneResponse === "on" && responseId) {
      setSubmitted(true);
    }
  }, [form, responseId]);

  const orderedFields = useMemo(() => {
    if (!form) return [];
    return form.settings.shuffleQuestionOrder
      ? shuffleFields(form.fields)
      : form.fields;
  }, [form]);
  const emailField = useMemo(() => {
    if (!form) return null;
    return form.fields.find((field) => isEmailField(field)) ?? null;
  }, [form]);
  const emailAnswer = emailField ? answers[emailField.id]?.value : null;
  const emailValue =
    typeof emailAnswer === "string" ? emailAnswer.trim() : "";
  const shouldCaptureResponderEmail =
    Boolean(emailField) && form?.settings.collectEmail !== "off";

  const progress = useMemo(() => {
    if (!form || !form.settings.showProgressBar) return null;
    const fields = form.fields.filter((field) => field.type !== "section");
    if (!fields.length) return null;
    const answered = fields.filter((field) =>
      hasValue(answers[field.id]?.value)
    ).length;
    return Math.round((answered / fields.length) * 100);
  }, [answers, form]);
  const submitStatusMessage =
    submitPhase === "uploading"
      ? "Uploading selected files before sending your response."
      : submitPhase === "submitting"
      ? "Sending your response now."
      : null;
  const submitShellClassName = cn(
    "pt-2",
    variant === "profile" && "mobile-sticky-action public-lead-form-submit-shell"
  );

  if (!loading && (disabled || !hasFields)) {
    return null;
  }

  function setAnswer(fieldId: string, value: unknown) {
    setAnswers((prev) => ({ ...prev, [fieldId]: { value } }));
    setErrors((prev) => {
      if (!prev[fieldId]) return prev;
      const next = { ...prev };
      delete next[fieldId];
      return next;
    });
  }

  function focusFirstInvalidField(fieldId: string) {
    window.requestAnimationFrame(() => {
      const fieldContainer = formRef.current?.querySelector<HTMLElement>(
        `[data-lead-field-id="${fieldId}"]`
      );
      const target =
        document.getElementById(fieldId) ||
        fieldContainer?.querySelector<HTMLElement>(
          "input:not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not([disabled])"
        ) ||
        fieldContainer;

      target?.scrollIntoView({ behavior: "smooth", block: "center" });
      if (target && "focus" in target) {
        target.focus({ preventScroll: true });
      }
    });
  }

  function getAnswer(fieldId: string) {
    return answers[fieldId]?.value;
  }

  function setPendingUploadFiles(fieldId: string, files: File[]) {
    setPendingUploads((prev) => {
      if (!files.length) {
        if (!(fieldId in prev)) return prev;
        const next = { ...prev };
        delete next[fieldId];
        return next;
      }
      return { ...prev, [fieldId]: files };
    });
  }

  function clearSelectedFiles(fieldId: string) {
    setPendingUploadFiles(fieldId, []);
    setAnswer(fieldId, []);
  }

  async function uploadFilesForField(
    field: LeadFormFileUploadField,
    currentFormId: string
  ): Promise<LeadFormUploadedFile[] | null> {
    const files = pendingUploads[field.id];
    if (!files?.length) return null;

    const uploads = files.map(async (file) => {
      const data = new FormData();
      data.append("formId", currentFormId);
      data.append("fieldId", field.id);
      data.append("file", file);

      const response = await fetch("/api/lead-forms/upload", {
        method: "POST",
        body: data,
      });
      if (!response.ok) {
        const info = await response.json().catch(() => ({}));
        throw new Error(info?.error || `Unable to upload ${file.name}`);
      }

      const payload = (await response.json()) as { file?: LeadFormUploadedFile };
      if (!payload.file) {
        throw new Error(`Unable to upload ${file.name}`);
      }
      return payload.file;
    });

    return Promise.all(uploads);
  }

  async function prepareAnswersForSubmit(
    currentForm: LeadFormConfig,
    currentFormId: string
  ) {
    const nextAnswers: AnswerMap = { ...answers };
    const uploadedFieldIds: string[] = [];

    for (const field of currentForm.fields) {
      if (field.type !== "file_upload") continue;
      const uploaded = await uploadFilesForField(field, currentFormId);
      if (!uploaded) continue;
      nextAnswers[field.id] = { value: uploaded };
      uploadedFieldIds.push(field.id);
    }

    return { nextAnswers, uploadedFieldIds };
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!form || !formId) return;
    const canEditStoredResponse = Boolean(
      form.settings.allowEditAfterSubmit && responseId && responseToken
    );
    if (
      form.settings.limitOneResponse === "on" &&
      responseId &&
      !canEditStoredResponse
    ) {
      toast({
        title: "Already submitted",
        description: "Only one response is allowed.",
        variant: "destructive",
      });
      return;
    }
    if (editingResponse && !canEditStoredResponse) {
      toast({
        title: "Edit unavailable",
        description:
          "This response cannot be edited because no secure edit token was found.",
        variant: "destructive",
      });
      setEditingResponse(false);
      return;
    }
    if (form.settings.collectEmail === "verified" && emailField && !emailValue) {
      setErrors((prev) => ({
        ...prev,
        [emailField.id]: "Email is required.",
      }));
      focusFirstInvalidField(emailField.id);
      return;
    }

    const validationErrors = validateSubmission(form, answers);
    if (validationErrors.length) {
      const nextErrors: ErrorMap = {};
      validationErrors.forEach((err) => {
        nextErrors[err.fieldId] = err.message;
      });
      setErrors(nextErrors);
      focusFirstInvalidField(validationErrors[0].fieldId);
      toast({
        title: "Missing info",
        description: "Please fix the highlighted fields.",
        variant: "destructive",
      });
      return;
    }

    setSubmitting(true);
    setSubmitPhase(hasPendingUploads(pendingUploads) ? "uploading" : "submitting");
    setErrors({});
    try {
      const { nextAnswers, uploadedFieldIds } = await prepareAnswersForSubmit(
        form,
        formId
      );
      setSubmitPhase("submitting");
      if (uploadedFieldIds.length > 0) {
        setAnswers(nextAnswers);
        setPendingUploads((prev) => {
          const next = { ...prev };
          uploadedFieldIds.forEach((fieldId) => {
            delete next[fieldId];
          });
          return next;
        });
      }
      const shouldEdit =
        editingResponse &&
        canEditStoredResponse;
      const endpoint = shouldEdit
          ? "/api/lead-forms/response"
          : "/api/lead-forms/submit";
      const method = endpoint === "/api/lead-forms/response" ? "PUT" : "POST";
      const response = await fetch(endpoint, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          formId,
          responseId: shouldEdit ? responseId : undefined,
          responseToken: shouldEdit ? responseToken : undefined,
          answers: nextAnswers,
          responderEmail: shouldCaptureResponderEmail ? emailValue || null : null,
          pageUrl: typeof window !== "undefined" ? window.location.href : null,
        }),
      });
      if (!response.ok) {
        const info = await response.json().catch(() => ({}));
        const message = info?.error || "Unable to submit";
        if (info?.fields) {
          const nextErrors: ErrorMap = {};
          info.fields.forEach((err: { fieldId: string; message: string }) => {
            nextErrors[err.fieldId] = err.message;
          });
          setErrors(nextErrors);
        }
        throw new Error(message);
      }
      const payload = (await response.json()) as {
        responseId?: string;
        responseToken?: string;
      };
      const nextResponseId = payload.responseId ?? responseId;
      const nextResponseToken = payload.responseToken ?? responseToken;
      if (nextResponseId) {
        try {
          localStorage.setItem(`lead-form-response:${formId}`, nextResponseId);
          if (nextResponseToken) {
            localStorage.setItem(
              `lead-form-response-token:${formId}`,
              nextResponseToken
            );
          }
        } catch {
          // Ignore storage failures (private browsing / restricted storage).
        }
        setResponseId(nextResponseId);
      }
      setResponseToken(nextResponseToken ?? null);
      emitAnalyticsEvent({
        id: shouldEdit ? "lead_form_response_updated" : "lead_form_response_submitted",
        meta: {
          formId,
          handle,
          mode: shouldEdit ? "edit" : "create",
        },
      });
      setEditingResponse(false);
      setSubmitted(true);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to submit";
      toast({ title: "Submit failed", description: message, variant: "destructive" });
    } finally {
      setSubmitting(false);
      setSubmitPhase("idle");
    }
  }

  function renderOptions(
    field: LeadFormMultipleChoiceField | LeadFormCheckboxesField | LeadFormDropdownField,
    options?: { describedBy?: string; hasError?: boolean; required?: boolean }
  ) {
    const describedBy = options?.describedBy;
    const hasError = options?.hasError;
    const required = options?.required;
    const optionIds = field.options.map((option) => option.id);
    const orderedOptions = field.presentation?.shuffleOptions
      ? shuffleOptions(field.options)
      : field.options;
    const value = getAnswer(field.id);
    const hasOther =
      field.allowOther &&
      typeof value === "string" &&
      value.startsWith(OTHER_PREFIX);
    const otherValue =
      hasOther && typeof value === "string"
        ? value.slice(OTHER_PREFIX.length)
        : "";

    if (field.type === "dropdown") {
      return (
        <div className="space-y-2">
          <select
            id={field.id}
            className={cn(
              "min-h-11 w-full rounded-md border border-border bg-background px-3 text-sm",
              inputClassName
            )}
            aria-invalid={hasError || undefined}
            aria-describedby={describedBy}
            aria-required={required || undefined}
            value={
              typeof value === "string"
                ? optionIds.includes(value)
                  ? value
                  : field.allowOther && value.startsWith(OTHER_PREFIX)
                  ? OTHER_VALUE
                  : ""
                : ""
            }
            onChange={(event) => {
              const next = event.target.value;
              if (next === OTHER_VALUE) {
                setAnswer(field.id, `${OTHER_PREFIX}${otherValue}`);
              } else {
                setAnswer(field.id, next);
              }
            }}
            disabled={disabled || submitting}
          >
            <option value="">Select...</option>
            {orderedOptions.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
            {field.allowOther ? <option value={OTHER_VALUE}>Other</option> : null}
          </select>
          {field.allowOther && hasOther ? (
            <div>
              <Input
                value={otherValue}
                onChange={(event) =>
                  setAnswer(field.id, `${OTHER_PREFIX}${event.target.value}`)
                }
                placeholder={field.otherLabel || "Other"}
                className={inputClassName}
                enterKeyHint="next"
                disabled={disabled || submitting}
              />
            </div>
          ) : null}
        </div>
      );
    }

    if (field.type === "multiple_choice") {
      return (
        <div className="space-y-2">
          {orderedOptions.map((option) => (
            <label
              key={option.id}
              className="flex min-h-11 items-center gap-3 rounded-xl border border-border/60 bg-background/70 px-3 py-2 text-sm sm:min-h-0 sm:border-0 sm:bg-transparent sm:px-0 sm:py-0"
            >
              <input
                type="radio"
                name={field.id}
                value={option.id}
                checked={value === option.id}
                onChange={() => setAnswer(field.id, option.id)}
                disabled={disabled || submitting}
              />
              <span>{option.label}</span>
            </label>
          ))}
          {field.allowOther ? (
            <label className="flex min-h-11 items-center gap-3 rounded-xl border border-border/60 bg-background/70 px-3 py-2 text-sm sm:min-h-0 sm:border-0 sm:bg-transparent sm:px-0 sm:py-0">
              <input
                type="radio"
                name={field.id}
                value={OTHER_VALUE}
                checked={hasOther}
                onChange={() =>
                  setAnswer(field.id, `${OTHER_PREFIX}${otherValue}`)
                }
                disabled={disabled || submitting}
              />
              <span>{field.otherLabel || "Other"}</span>
              {hasOther ? (
                <Input
                  value={otherValue}
                  onChange={(event) =>
                    setAnswer(field.id, `${OTHER_PREFIX}${event.target.value}`)
                  }
                  className={cn("h-9", inputClassName)}
                  enterKeyHint="next"
                  disabled={disabled || submitting}
                />
              ) : null}
            </label>
          ) : null}
        </div>
      );
    }

    if (field.type === "checkboxes") {
      const selected = Array.isArray(value) ? value.slice() : [];
      const otherSelected = selected.find(
        (item) => typeof item === "string" && item.startsWith(OTHER_PREFIX)
      );
      const otherText =
        typeof otherSelected === "string"
          ? otherSelected.slice(OTHER_PREFIX.length)
          : "";
      return (
        <div className="space-y-2">
          {orderedOptions.map((option) => (
            <label
              key={option.id}
              className="flex min-h-11 items-center gap-3 rounded-xl border border-border/60 bg-background/70 px-3 py-2 text-sm sm:min-h-0 sm:border-0 sm:bg-transparent sm:px-0 sm:py-0"
            >
              <input
                type="checkbox"
                value={option.id}
                checked={selected.includes(option.id)}
                onChange={(event) => {
                  const next = event.target.checked
                    ? [...selected, option.id]
                    : selected.filter((item) => item !== option.id);
                  setAnswer(field.id, next);
                }}
                disabled={disabled || submitting}
              />
              <span>{option.label}</span>
            </label>
          ))}
          {field.allowOther ? (
            <label className="flex min-h-11 items-center gap-3 rounded-xl border border-border/60 bg-background/70 px-3 py-2 text-sm sm:min-h-0 sm:border-0 sm:bg-transparent sm:px-0 sm:py-0">
              <input
                type="checkbox"
                value={OTHER_VALUE}
                checked={Boolean(otherSelected)}
                onChange={(event) => {
                  const next = event.target.checked
                    ? [...selected, `${OTHER_PREFIX}${otherText}`]
                    : selected.filter((item) => item !== otherSelected);
                  setAnswer(field.id, next);
                }}
                disabled={disabled || submitting}
              />
              <span>{field.otherLabel || "Other"}</span>
              {otherSelected ? (
                <Input
                  value={otherText}
                  onChange={(event) => {
                    const next = event.target.value;
                    const withoutOther = selected.filter(
                      (item) => item !== otherSelected
                    );
                    setAnswer(field.id, [
                      ...withoutOther,
                      `${OTHER_PREFIX}${next}`,
                    ]);
                  }}
                  className={cn("h-9", inputClassName)}
                  enterKeyHint="next"
                  disabled={disabled || submitting}
                />
              ) : null}
            </label>
          ) : null}
        </div>
      );
    }

    return null;
  }

  function renderRating(field: LeadFormRatingField) {
    const value = Number(getAnswer(field.id) || 0);
    const icon = field.icon === "heart" ? "H" : field.icon === "thumbs" ? "T" : "*";
    return (
      <div className="flex flex-wrap gap-2">
        {Array.from({ length: field.scale }, (_, index) => {
          const score = index + 1;
          return (
            <label
              key={score}
              className="flex min-h-11 items-center gap-2 rounded-xl border border-border/60 bg-background/70 px-3 py-2 text-sm sm:min-h-0 sm:border-0 sm:bg-transparent sm:px-0 sm:py-0"
            >
              <input
                type="radio"
                name={field.id}
                value={score}
                checked={value === score}
                onChange={() => setAnswer(field.id, score)}
                disabled={disabled || submitting}
              />
              <span aria-hidden="true">{icon}</span>
              <span>{score}</span>
            </label>
          );
        })}
      </div>
    );
  }

  function renderLinearScale(field: LeadFormField) {
    if (field.type !== "linear_scale") return null;
    const value = Number(getAnswer(field.id) || 0);
    const items = [];
    for (let i = field.min; i <= field.max; i += 1) items.push(i);
    return (
      <div className="space-y-2">
        <div className="flex flex-wrap gap-2">
          {items.map((score) => (
            <label
              key={score}
              className="flex min-h-11 items-center gap-2 rounded-xl border border-border/60 bg-background/70 px-3 py-2 text-sm sm:min-h-0 sm:border-0 sm:bg-transparent sm:px-0 sm:py-0"
            >
              <input
                type="radio"
                name={field.id}
                value={score}
                checked={value === score}
                onChange={() => setAnswer(field.id, score)}
                disabled={disabled || submitting}
              />
              <span>{score}</span>
            </label>
          ))}
        </div>
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{field.minLabel}</span>
          <span>{field.maxLabel}</span>
        </div>
      </div>
    );
  }

  function renderGrid(field: LeadFormMultipleChoiceGridField | LeadFormCheckboxGridField) {
    const value = (getAnswer(field.id) as Record<string, unknown>) || {};
    const rows = field.rows;
    const columns = field.columns;
    const updateGridCell = (
      rowId: string,
      columnId: string,
      checked: boolean
    ) => {
      const rowValue = value?.[rowId];
      if (field.type === "multiple_choice_grid") {
        setAnswer(field.id, { ...value, [rowId]: columnId });
        return;
      }
      const nextRow = Array.isArray(rowValue) ? rowValue.slice() : [];
      const next = checked
        ? [...nextRow, columnId]
        : nextRow.filter((item) => item !== columnId);
      setAnswer(field.id, { ...value, [rowId]: next });
    };

    return (
      <div className="space-y-3">
        <div className="space-y-3 sm:hidden">
          {rows.map((row) => (
            <fieldset
              key={row.id}
              className="rounded-2xl border border-border/60 bg-background/70 p-3"
            >
              <legend className="px-1 text-sm font-semibold">
                {row.label}
              </legend>
              <div className="mt-2 grid gap-2">
                {columns.map((column) => {
                  const rowValue = value?.[row.id];
                  const checked =
                    field.type === "multiple_choice_grid"
                      ? rowValue === column.id
                      : Array.isArray(rowValue) && rowValue.includes(column.id);
                  return (
                    <label
                      key={column.id}
                      className="flex min-h-11 items-center gap-3 rounded-xl border border-border/60 bg-card/80 px-3 py-2 text-sm"
                    >
                      <input
                        type={field.type === "multiple_choice_grid" ? "radio" : "checkbox"}
                        name={`${field.id}-${row.id}`}
                        value={column.id}
                        checked={checked}
                        onChange={(event) =>
                          updateGridCell(row.id, column.id, event.target.checked)
                        }
                        disabled={disabled || submitting}
                      />
                      <span>{column.label}</span>
                    </label>
                  );
                })}
              </div>
            </fieldset>
          ))}
        </div>
        <div className="hidden overflow-x-auto sm:block">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr>
                <th
                  className="border-b border-border/60 p-2 text-left"
                  scope="col"
                  aria-hidden="true"
                />
                {columns.map((column) => (
                  <th
                    key={column.id}
                    className="border-b border-border/60 p-2 text-left font-medium"
                    scope="col"
                  >
                    {column.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <th
                    className="border-b border-border/60 p-2 text-left font-medium"
                    scope="row"
                  >
                    {row.label}
                  </th>
                  {columns.map((column) => {
                    const rowValue = value?.[row.id];
                    const checked =
                      field.type === "multiple_choice_grid"
                        ? rowValue === column.id
                        : Array.isArray(rowValue) && rowValue.includes(column.id);
                    return (
                      <td key={column.id} className="border-b border-border/60 p-2 text-center">
                        <input
                          type={field.type === "multiple_choice_grid" ? "radio" : "checkbox"}
                          name={`${field.id}-${row.id}`}
                          value={column.id}
                          checked={checked}
                          onChange={(event) =>
                            updateGridCell(row.id, column.id, event.target.checked)
                          }
                          disabled={disabled || submitting}
                        />
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  function renderField(field: LeadFormField) {
    if (field.type === "section") {
      return (
        <div className="space-y-1">
          <h3 className="text-base font-semibold">{field.title}</h3>
          {field.description ? (
            <p className="text-sm text-muted-foreground">{field.description}</p>
          ) : null}
        </div>
      );
    }

    const error = errors[field.id];
    const hasError = Boolean(error);
    const helpText = field.helpText?.trim();
    const helpId = helpText ? `${field.id}-help` : undefined;
    const isGroupField = [
      "multiple_choice",
      "checkboxes",
      "linear_scale",
      "rating",
      "multiple_choice_grid",
      "checkbox_grid",
    ].includes(field.type);
    const showErrorText = Boolean(error);
    const errorId = showErrorText ? `${field.id}-error` : undefined;
    const describedBy =
      [helpId, errorId].filter(Boolean).join(" ") || undefined;
    const labelId = `${field.id}-label`;
    const label = isGroupField ? (
      <Label id={labelId} className="text-sm font-medium">
        {field.label}
        {field.required ? <span className="ml-1 text-destructive">*</span> : null}
      </Label>
    ) : (
      <Label htmlFor={field.id} className="text-sm font-medium">
        {field.label}
        {field.required ? <span className="ml-1 text-destructive">*</span> : null}
      </Label>
    );
    const errorText = showErrorText ? (
      <p id={errorId} className="text-xs text-destructive" role="alert">
        {error}
      </p>
    ) : null;
    const groupProps = isGroupField
      ? {
          role: "group",
          "aria-labelledby": labelId,
          "aria-describedby": describedBy,
          "aria-invalid": hasError || undefined,
          "aria-required": field.required || undefined,
        }
      : {};

    return (
      <div className="space-y-2" data-lead-field-id={field.id} {...groupProps}>
        {label}
        {helpText ? (
          <p id={helpId} className="sr-only">
            {helpText}
          </p>
        ) : null}
        {field.type === "short_text" ? (
          <Input
            id={field.id}
            value={(getAnswer(field.id) as string) || ""}
            onChange={(event) => {
              const nextValue = event.target.value;
              setAnswer(
                field.id,
                isPhoneField(field) ? formatPhoneNumber(nextValue) : nextValue
              );
            }}
            type={getShortTextInputType(field)}
            inputMode={getShortTextInputMode(field)}
            autoComplete={getShortTextAutoComplete(field)}
            enterKeyHint="next"
            placeholder={field.helpText || undefined}
            className={inputClassName}
            aria-invalid={hasError || undefined}
            aria-describedby={describedBy}
            aria-required={field.required || undefined}
            disabled={disabled || submitting}
          />
        ) : null}
        {field.type === "long_text" ? (
          <Textarea
            id={field.id}
            value={(getAnswer(field.id) as string) || ""}
            onChange={(event) => setAnswer(field.id, event.target.value)}
            placeholder={field.helpText || undefined}
            className={textareaClassName}
            enterKeyHint="done"
            aria-invalid={hasError || undefined}
            aria-describedby={describedBy}
            aria-required={field.required || undefined}
            disabled={disabled || submitting}
          />
        ) : null}
        {field.type === "multiple_choice" ||
        field.type === "checkboxes" ||
        field.type === "dropdown"
          ? renderOptions(field, {
              describedBy,
              hasError,
              required: field.required,
            })
          : null}
        {field.type === "linear_scale" ? renderLinearScale(field) : null}
        {field.type === "rating" ? renderRating(field) : null}
        {field.type === "date" ? (
          <Input
            id={field.id}
            type={field.includeTime ? "datetime-local" : "date"}
            value={(getAnswer(field.id) as string) || ""}
            onChange={(event) => setAnswer(field.id, event.target.value)}
            placeholder={field.helpText || undefined}
            className={inputClassName}
            enterKeyHint="next"
            aria-invalid={hasError || undefined}
            aria-describedby={describedBy}
            aria-required={field.required || undefined}
            disabled={disabled || submitting}
          />
        ) : null}
        {field.type === "time" ? (
          <Input
            id={field.id}
            type={field.mode === "time_of_day" ? "time" : "number"}
            value={(getAnswer(field.id) as string) || ""}
            onChange={(event) => setAnswer(field.id, event.target.value)}
            className={inputClassName}
            min={field.mode === "duration" ? 0 : undefined}
            step={field.mode === "time_of_day" ? field.stepMinutes * 60 : field.stepMinutes}
            inputMode={field.mode === "duration" ? "numeric" : undefined}
            enterKeyHint="next"
            placeholder={
              field.helpText ||
              (field.mode === "duration" ? "Minutes" : undefined)
            }
            aria-invalid={hasError || undefined}
            aria-describedby={describedBy}
            aria-required={field.required || undefined}
            disabled={disabled || submitting}
          />
        ) : null}
        {field.type === "file_upload" ? (
          <div className="space-y-2">
            <Input
              id={field.id}
              type="file"
              multiple={field.maxFiles > 1}
              accept={toAcceptAttribute(field.acceptedTypes)}
              onChange={(event) => {
                const files = Array.from(event.target.files ?? []);
                if (files.length > field.maxFiles) {
                  setPendingUploadFiles(field.id, []);
                  setAnswer(field.id, []);
                  setErrors((prev) => ({
                    ...prev,
                    [field.id]: `Max ${field.maxFiles} files.`,
                  }));
                  return;
                }
                const maxBytes = field.maxSizeMB * 1024 * 1024;
                const invalid = files.find((file) => file.size > maxBytes);
                if (invalid) {
                  setPendingUploadFiles(field.id, []);
                  setAnswer(field.id, []);
                  setErrors((prev) => ({
                    ...prev,
                    [field.id]: `File too large. Max ${field.maxSizeMB} MB.`,
                  }));
                  return;
                }
                const invalidType = files.find(
                  (file) => !matchesAcceptedType(file, field.acceptedTypes)
                );
                if (invalidType) {
                  setPendingUploadFiles(field.id, []);
                  setAnswer(field.id, []);
                  setErrors((prev) => ({
                    ...prev,
                    [field.id]: "File type not allowed.",
                  }));
                  return;
                }
                setPendingUploadFiles(field.id, files);
                setAnswer(
                  field.id,
                  files.map((file) => file.name)
                );
              }}
              className={inputClassName}
              aria-invalid={hasError || undefined}
              aria-describedby={describedBy}
              aria-required={field.required || undefined}
              disabled={disabled || submitting}
            />
            {getFileAnswerNames(getAnswer(field.id)).length > 0 ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => clearSelectedFiles(field.id)}
                disabled={disabled || submitting}
              >
                Clear
              </Button>
            ) : null}
            {getFileAnswerNames(getAnswer(field.id)).length > 0 ? (
              <p className="text-xs text-muted-foreground">
                {getFileAnswerNames(getAnswer(field.id)).join(", ")}
              </p>
            ) : null}
          </div>
        ) : null}
        {field.type === "multiple_choice_grid" ||
        field.type === "checkbox_grid"
          ? renderGrid(field)
          : null}
        {errorText}
      </div>
    );
  }

  if (loading || disabled) return null;

  if (submitted && form) {
    return (
      <Card
        className={cn("border border-border/60", className)}
        style={cardStyle}
      >
        <CardHeader>
          <CardTitle>Response sent</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground" style={mutedStyle}>
            {form.settings.confirmationMessage}
          </p>
          {form.settings.allowEditAfterSubmit && responseId && responseToken ? (
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setEditingResponse(true);
                setSubmitted(false);
              }}
              className={buttonClassName}
            >
              Edit response
            </Button>
          ) : null}
          <p className="text-xs text-muted-foreground" style={mutedStyle}>
            You can continue browsing this profile.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={cardClassName} style={cardStyle}>
      {showHeader ? (
        <CardHeader className="space-y-2">
          <CardTitle>{form?.title || "Lead capture"}</CardTitle>
          {form?.description ? (
            <p className="text-sm text-muted-foreground" style={mutedStyle}>
              {form.description}
            </p>
          ) : null}
          {typeof progress === "number" ? (
            <div>
              <div
                className="h-2 w-full rounded-full bg-muted"
                role="progressbar"
                aria-label="Form completion"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={progress}
              >
                <div
                  className="h-2 rounded-full bg-primary transition-all"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <div className="mt-1 text-xs text-muted-foreground">
                {progress}% complete
              </div>
            </div>
          ) : null}
        </CardHeader>
      ) : null}
      <CardContent>
        {!showHeader && typeof progress === "number" ? (
          <div className="mb-4">
            <div
              className="h-2 w-full rounded-full bg-muted"
              role="progressbar"
              aria-label="Form completion"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={progress}
            >
              <div
                className="h-2 rounded-full bg-primary transition-all"
                style={{ width: `${progress}%` }}
              />
            </div>
            <div className="mt-1 text-xs text-muted-foreground">
              {progress}% complete
            </div>
          </div>
        ) : null}
        <form
          ref={formRef}
          className="space-y-5"
          onSubmit={handleSubmit}
          aria-busy={submitting || undefined}
        >
          {orderedFields.map((field) => (
            <div key={field.id}>{renderField(field)}</div>
          ))}

          <div className={submitShellClassName}>
            <Button
              type="submit"
              disabled={disabled || submitting}
              variant={appearance?.buttonVariant ?? "default"}
              className={submitButtonClassName}
            >
              {submitPhase === "uploading"
                ? "Uploading files..."
                : submitPhase === "submitting"
                ? "Submitting..."
                : "Submit"}
            </Button>
            {submitStatusMessage ? (
              <p
                className="mt-2 text-xs text-muted-foreground"
                role="status"
                aria-live="polite"
              >
                {submitStatusMessage}
              </p>
            ) : null}
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function getFileAnswerNames(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => {
      if (typeof entry === "string") return entry.trim();
      if (!entry || typeof entry !== "object") return "";
      const maybeFile = entry as { name?: unknown };
      return typeof maybeFile.name === "string" ? maybeFile.name.trim() : "";
    })
    .filter(Boolean);
}

function hasPendingUploads(pendingUploads: PendingUploadMap) {
  return Object.values(pendingUploads).some((files) => files.length > 0);
}

function toAcceptAttribute(acceptedTypes: string[]) {
  const values = acceptedTypes
    .map((entry) => String(entry ?? "").trim().toLowerCase())
    .filter(Boolean)
    .map((entry) => {
      if (entry.includes("/") || entry.startsWith(".")) return entry;
      return `.${entry}`;
    });
  return values.join(",");
}

function matchesAcceptedType(file: File, acceptedTypes: string[]) {
  const normalized = normalizeAcceptedTypes(acceptedTypes);
  if (!normalized.extensions.length && !normalized.mimes.length) return true;

  const fileType = (file.type || "").toLowerCase();
  const extension = extractFileExtension(file.name);

  const mimeMatch = normalized.mimes.some((mime) => {
    if (mime.endsWith("/*")) {
      const prefix = mime.slice(0, mime.length - 1);
      return fileType.startsWith(prefix);
    }
    return fileType === mime;
  });
  if (mimeMatch) return true;

  if (!extension) return false;
  return normalized.extensions.includes(extension);
}

function normalizeAcceptedTypes(values: string[]) {
  const extensions = new Set<string>();
  const mimes = new Set<string>();

  values.forEach((value) => {
    const normalized = String(value ?? "").trim().toLowerCase();
    if (!normalized) return;
    if (normalized.includes("/")) {
      mimes.add(normalized);
      return;
    }
    extensions.add(normalized.replace(/^\./, ""));
  });

  return {
    extensions: Array.from(extensions),
    mimes: Array.from(mimes),
  };
}

function extractFileExtension(fileName: string) {
  const normalized = String(fileName ?? "").trim().toLowerCase();
  const lastDot = normalized.lastIndexOf(".");
  if (lastDot <= 0 || lastDot === normalized.length - 1) return "";
  return normalized.slice(lastDot + 1);
}

function hasValue(value: unknown) {
  if (value == null) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "object") {
    return Object.values(value).some((entry) => {
      if (Array.isArray(entry)) return entry.length > 0;
      return entry != null && String(entry).trim().length > 0;
    });
  }
  return true;
}

function isPhoneField(field: LeadFormField) {
  if (field.type !== "short_text") return false;
  return field.label.toLowerCase().includes("phone");
}

function isEmailField(field: LeadFormField) {
  if (field.type !== "short_text") return false;
  if (field.validation?.rule === "email") return true;
  return field.label.toLowerCase().includes("email");
}

function isUrlField(field: LeadFormField) {
  if (field.type !== "short_text") return false;
  const label = field.label.toLowerCase();
  return label.includes("website") || label.includes("url") || label.includes("link");
}

function getShortTextInputType(field: LeadFormField) {
  if (isPhoneField(field)) return "tel";
  if (isEmailField(field)) return "email";
  if (isUrlField(field)) return "url";
  return "text";
}

function getShortTextInputMode(field: LeadFormField) {
  if (isPhoneField(field)) return "tel";
  if (isEmailField(field)) return "email";
  if (isUrlField(field)) return "url";
  return undefined;
}

function getShortTextAutoComplete(field: LeadFormField) {
  if (field.type !== "short_text") return undefined;
  const label = field.label.toLowerCase();
  if (isEmailField(field)) return "email";
  if (isPhoneField(field)) return "tel";
  if (label.includes("first") && label.includes("name")) return "given-name";
  if (label.includes("last") && label.includes("name")) return "family-name";
  if (label.includes("full name") || label === "name") return "name";
  if (label.includes("company") || label.includes("organization")) {
    return "organization";
  }
  if (label.includes("title") || label.includes("role")) return "organization-title";
  if (isUrlField(field)) return "url";
  return undefined;
}

function formatPhoneNumber(input: string) {
  const digits = input.replace(/\D/g, "").slice(0, 10);
  if (!digits) return "";
  if (digits.length <= 3) return `(${digits}`;
  if (digits.length <= 6) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  }
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)} - ${digits.slice(6)}`;
}
