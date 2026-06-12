"use client";

import { useCallback, useMemo, useState } from "react";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragCancelEvent,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  restrictToParentElement,
  restrictToVerticalAxis,
} from "@dnd-kit/modifiers";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";

import LinkFavicon from "@/components/LinkFavicon";
import { shuffleFields } from "@/lib/lead-form";
import { isDarkTheme, type ThemeName } from "@/lib/themes";
import { cn } from "@/lib/utils";
import type { LeadFormConfig, LeadFormField } from "@/types/lead-form";

export type PhonePreviewLinkIconKey = "instagram" | "globe" | "twitter" | "link";

export type PhonePreviewLinkItem = {
  id: string;
  label: string;
  url: string;
  linkType?: "link" | "resume";
  icon?: PhonePreviewLinkIconKey;
  visible?: boolean;
  isOverride?: boolean;
  clicks?: number;
};

function buildPreviewInitials(value: string) {
  const parts = value
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2);
  if (!parts.length) return "LP";
  return parts.map((part) => part[0]?.toUpperCase() ?? "").join("");
}

function isResumePreviewLink(link: PhonePreviewLinkItem) {
  if (link.linkType === "resume") return true;

  const label = link.label.trim().toLowerCase();
  const url = link.url.trim().toLowerCase();
  const isResumeLabel =
    label === "resume" ||
    label === "cv" ||
    label.includes("resume") ||
    label.includes("curriculum vitae");

  return (
    isResumeLabel ||
    url.includes("/profile-resumes/") ||
    url.includes("/storage/v1/object/public/profile-resumes/") ||
    (isResumeLabel && url.includes(".pdf"))
  );
}

function getPreviewLinkSubtitle(link: PhonePreviewLinkItem) {
  return isResumePreviewLink(link) ? "Download PDF" : link.url;
}

type PhonePreviewCardProps = {
  profile: { name: string; tagline: string };
  avatarUrl: string | null;
  headerImageUrl: string | null;
  logoUrl: string | null;
  logoShape: "circle" | "rect";
  logoBackgroundWhite: boolean;
  themeName?: ThemeName;
  contactEnabled: boolean;
  contactDisabledText: string;
  onContactClick?: () => void;
  links: PhonePreviewLinkItem[];
  leadFormPreview?: LeadFormConfig | null;
  onReorderLeadField?: (sourceId: string, targetId: string) => void;
  onReorderLink?: (
    sourceId: string,
    targetId: string,
    fromPreview?: boolean
  ) => void;
  showLeadFormSection?: boolean;
  showClicks?: boolean;
};

export default function PhonePreviewCard({
  profile,
  avatarUrl,
  headerImageUrl,
  logoUrl,
  logoShape,
  logoBackgroundWhite,
  themeName,
  contactEnabled,
  contactDisabledText,
  onContactClick,
  links,
  leadFormPreview = null,
  onReorderLeadField,
  onReorderLink,
  showLeadFormSection = true,
  showClicks = true,
}: PhonePreviewCardProps) {
  const visibleLinks = useMemo(
    () => links.filter((link) => link.visible !== false),
    [links]
  );
  const logoBadgeClass = logoBackgroundWhite ? "bg-white" : "bg-background";
  const previewFields = useMemo(() => {
    if (!leadFormPreview) return [];
    return leadFormPreview.settings.shuffleQuestionOrder
      ? shuffleFields(leadFormPreview.fields)
      : leadFormPreview.fields;
  }, [leadFormPreview]);
  const previewLinkIds = useMemo(
    () => visibleLinks.map((link) => link.id),
    [visibleLinks]
  );
  const [activePreviewLinkId, setActivePreviewLinkId] = useState<string | null>(
    null
  );
  const [activePreviewLeadFieldId, setActivePreviewLeadFieldId] = useState<
    string | null
  >(null);
  const previewLeadFieldIds = useMemo(
    () =>
      previewFields
        .filter((field) => field.type !== "section")
        .map((field) => field.id),
    [previewFields]
  );
  const activePreviewLink = useMemo(
    () => visibleLinks.find((link) => link.id === activePreviewLinkId) ?? null,
    [activePreviewLinkId, visibleLinks]
  );
  const activePreviewLeadField = useMemo(
    () =>
      previewFields.find((field) => field.id === activePreviewLeadFieldId) ??
      null,
    [activePreviewLeadFieldId, previewFields]
  );
  const previewSensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 1,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );
  const allowLinkReorder = Boolean(onReorderLink);
  const allowLeadFieldReorder = Boolean(onReorderLeadField);
  const handlePreviewLinkDragEnd = useCallback(
    (event: DragEndEvent) => {
      setActivePreviewLinkId(null);
      if (!onReorderLink) return;
      const { active, over } = event;
      if (!over || active.id === over.id) return;
      onReorderLink(String(active.id), String(over.id), true);
    },
    [onReorderLink]
  );
  const handlePreviewLinkDragStart = useCallback((event: DragStartEvent) => {
    setActivePreviewLinkId(String(event.active.id));
  }, []);
  const handlePreviewLinkDragCancel = useCallback((_event: DragCancelEvent) => {
    setActivePreviewLinkId(null);
  }, []);
  const handlePreviewLeadFieldDragEnd = useCallback(
    (event: DragEndEvent) => {
      setActivePreviewLeadFieldId(null);
      if (!onReorderLeadField) return;
      const { active, over } = event;
      if (!over || active.id === over.id) return;
      onReorderLeadField(String(active.id), String(over.id));
    },
    [onReorderLeadField]
  );
  const handlePreviewLeadFieldDragStart = useCallback(
    (event: DragStartEvent) => {
      setActivePreviewLeadFieldId(String(event.active.id));
    },
    []
  );
  const handlePreviewLeadFieldDragCancel = useCallback(
    (_event: DragCancelEvent) => {
      setActivePreviewLeadFieldId(null);
    },
    []
  );
  const submitLabel = "Submit";
  const resolvedTheme = themeName;
  const showContactButton = contactEnabled || Boolean(contactDisabledText);
  const useDarkThemeIcons = resolvedTheme ? isDarkTheme(resolvedTheme) : false;
  const profileInitials = useMemo(
    () => buildPreviewInitials(profile.name),
    [profile.name]
  );

  return (
    <div
      className={cn(
        "public-profile-preview h-fit w-full max-w-[340px] overflow-hidden rounded-[36px] border border-border/60 bg-background shadow-[0_20px_40px_-30px_rgba(15,23,42,0.3)]",
        resolvedTheme ? `theme-${resolvedTheme}` : ""
      )}
    >
      <div
        className="relative h-28 rounded-t-[36px]"
        style={{
          backgroundImage:
            "linear-gradient(90deg, var(--primary), var(--accent), var(--ring))",
        }}
      >
        {headerImageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={headerImageUrl}
            alt=""
            className="h-full w-full object-cover"
          />
        ) : null}
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-background/20" />
      </div>
      <div className="flex flex-col items-center px-6 pb-6">
        <div className="-mt-16 flex flex-col items-center">
          <div className="relative flex flex-col items-center">
            <div
              className={cn(
                "public-profile-avatar-frame relative z-10 h-28 w-28 overflow-visible rounded-3xl bg-background shadow-sm",
                logoUrl && logoShape === "rect" && "public-profile-avatar-frame--rect-logo"
              )}
            >
              {avatarUrl ? (
                <div className="h-full w-full overflow-hidden rounded-3xl ring-4 ring-[var(--avatar-border)]">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
                </div>
              ) : (
                <span
                  className={cn(
                    "flex h-full w-full items-center justify-center rounded-3xl border-4 border-[var(--avatar-border)] bg-muted text-2xl font-semibold text-foreground"
                  )}
                >
                  {profileInitials}
                </span>
              )}
              {logoUrl && logoShape === "circle" ? (
                <span
                  className={cn(
                    "absolute -bottom-2 -right-2 h-12 w-12 overflow-hidden rounded-full border-2 border-[var(--avatar-border)] shadow-md",
                    logoBadgeClass
                  )}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={logoUrl} alt="" className="h-full w-full object-cover" />
                </span>
              ) : null}
            {logoUrl && logoShape === "rect" ? (
              <span
                className={cn(
                  "public-profile-logo-badge public-profile-logo-badge--rect",
                  logoBadgeClass
                )}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={logoUrl} alt="" className="h-full w-full object-cover" />
              </span>
            ) : null}
            </div>
          </div>
        </div>
        <div
          className={cn(
            "public-profile-preview-header text-center",
            "mt-3"
          )}
        >
          <div className="mx-auto max-w-[240px] break-words text-base font-semibold leading-snug text-foreground">
            {profile.name}
          </div>
          <div className="mx-auto mt-1 max-w-[240px] break-words text-xs leading-snug text-muted-foreground">
            {profile.tagline}
          </div>
        </div>

        {showContactButton ? (
          onContactClick ? (
            <button
              type="button"
              onClick={onContactClick}
              className={cn(
                "mt-4 w-full rounded-full px-4 py-2 text-xs font-semibold transition",
                contactEnabled
                  ? "public-profile-preview-contact-button"
                  : "bg-muted text-muted-foreground opacity-80"
              )}
            >
              <span className="block truncate">
                {contactEnabled ? "Save contact" : contactDisabledText}
              </span>
            </button>
          ) : (
            <div
              className={cn(
                "mt-4 w-full rounded-full px-4 py-2 text-center text-xs font-semibold",
                contactEnabled
                  ? "public-profile-preview-contact-button"
                  : "bg-muted text-muted-foreground opacity-80"
              )}
            >
              <span className="block truncate">
                {contactEnabled ? "Save contact" : contactDisabledText}
              </span>
            </div>
          )
        ) : null}

        <div className="mt-4 w-full text-left">
          <div className="public-profile-preview-section-label public-profile-links-label text-xs font-semibold text-muted-foreground">
            Links
          </div>
          <div className="mt-3">
            <DndContext
              sensors={previewSensors}
              collisionDetection={closestCenter}
              onDragStart={handlePreviewLinkDragStart}
              onDragEnd={handlePreviewLinkDragEnd}
              onDragCancel={handlePreviewLinkDragCancel}
              modifiers={[restrictToVerticalAxis, restrictToParentElement]}
            >
              <SortableContext
                items={previewLinkIds}
                strategy={verticalListSortingStrategy}
              >
                <div className="space-y-3">
                  {visibleLinks.length ? (
                    visibleLinks.map((link) => (
                      <LinkListItem
                        key={link.id}
                        link={link}
                        disabled={!allowLinkReorder}
                        showClicks={showClicks}
                        showHandle={allowLinkReorder}
                        useDarkThemeIcons={useDarkThemeIcons}
                      />
                    ))
                  ) : (
                    <div className="rounded-2xl border border-dashed border-border/60 px-3 py-3 text-center text-[11px] text-muted-foreground">
                      Add links to see them here.
                    </div>
                  )}
                </div>
              </SortableContext>
              <DragOverlay>
                {activePreviewLink ? (
                  <LinkListItem
                    link={activePreviewLink}
                    disabled
                    showClicks={showClicks}
                    showHandle={allowLinkReorder}
                    useDarkThemeIcons={useDarkThemeIcons}
                    isOverlay
                  />
                ) : null}
              </DragOverlay>
            </DndContext>
          </div>
        </div>

        {showLeadFormSection ? (
          <>
            <div className="public-profile-preview-section-label mt-4 w-full text-xs text-muted-foreground">
              {leadFormPreview?.title || "Get in Touch"}
            </div>
            <div className="mt-3 w-full">
              <DndContext
                sensors={previewSensors}
                collisionDetection={closestCenter}
                onDragStart={handlePreviewLeadFieldDragStart}
                onDragEnd={handlePreviewLeadFieldDragEnd}
                onDragCancel={handlePreviewLeadFieldDragCancel}
                modifiers={[restrictToVerticalAxis, restrictToParentElement]}
              >
                <SortableContext
                  items={previewLeadFieldIds}
                  strategy={verticalListSortingStrategy}
                >
                  <div className="space-y-2">
                    {previewFields.length ? (
                      previewFields.map((field) =>
                        field.type === "section" ? (
                          <div
                            key={field.id}
                            className="rounded-2xl border border-border/60 bg-muted/40 px-3 py-2 text-xs text-muted-foreground"
                          >
                            <div className="text-[11px] font-semibold">
                              {field.title}
                            </div>
                            {field.description ? (
                              <div className="mt-1 text-[10px]">
                                {field.description}
                              </div>
                            ) : null}
                          </div>
                        ) : (
                          <SortableLeadFieldItem
                            key={field.id}
                            field={field}
                            disabled={!allowLeadFieldReorder}
                            showHandle={allowLeadFieldReorder}
                          />
                        )
                      )
                    ) : (
                      <div className="rounded-2xl border border-dashed border-border/60 px-3 py-3 text-center text-[11px] text-muted-foreground">
                        Add lead form fields to see them here.
                      </div>
                    )}
                  </div>
                </SortableContext>
                <DragOverlay>
                  {activePreviewLeadField ? (
                    <SortableLeadFieldItem
                      field={activePreviewLeadField}
                      disabled
                      showHandle={allowLeadFieldReorder}
                      isOverlay
                    />
                  ) : null}
                </DragOverlay>
              </DndContext>
            </div>
            <button
              type="button"
              className="public-profile-preview-submit mt-4 w-full rounded-full px-4 py-2 text-xs font-semibold transition"
            >
              {submitLabel}
            </button>
          </>
        ) : null}
      </div>
    </div>
  );
}

function PreviewLeadField({ field }: { field: LeadFormField }) {
  switch (field.type) {
    case "short_text":
      return (
        <div className="mt-2 h-8 rounded-xl border border-border/60 bg-muted/50" />
      );
    case "long_text":
      return (
        <div className="mt-2 flex h-10 items-center rounded-xl border border-border/60 bg-muted/50 px-2 text-[11px] text-muted-foreground">
          {field.helpText || "Long answer"}
        </div>
      );
    case "dropdown":
      return (
        <div className="mt-2 flex h-8 items-center rounded-xl border border-border/60 bg-muted/50 px-2 text-[11px]">
          Select
        </div>
      );
    case "multiple_choice":
    case "checkboxes":
      return (
        <div className="mt-2 flex items-center gap-2 text-[11px]">
          <span className="h-3 w-3 rounded border border-border/60 bg-muted/50" />
          {field.options[0]?.label || "Option"}
        </div>
      );
    case "linear_scale":
      return (
        <div className="mt-2 flex items-center gap-2 text-[11px] text-muted-foreground">
          {field.min} - {field.max}
        </div>
      );
    case "rating":
      return (
        <div className="mt-2 flex items-center gap-1 text-[11px] text-muted-foreground">
          {Array.from({ length: field.scale }).map((_, index) => (
            <span key={index}>*</span>
          ))}
        </div>
      );
    case "date":
    case "time":
    case "file_upload":
    default:
      return (
        <div className="mt-2 h-8 rounded-xl border border-border/60 bg-muted/50" />
      );
  }
}

function LinkListItem({
  link,
  disabled,
  showClicks,
  showHandle,
  useDarkThemeIcons,
  isOverlay = false,
}: {
  link: PhonePreviewLinkItem;
  disabled: boolean;
  showClicks: boolean;
  showHandle: boolean;
  useDarkThemeIcons: boolean;
  isOverlay?: boolean;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: link.id, disabled });
  const clicks = link.clicks ?? 0;
  const resumeLink = isResumePreviewLink(link);
  const style = {
    transform: isOverlay ? undefined : CSS.Translate.toString(transform),
    transition: isDragging || isOverlay ? "none" : transition,
    zIndex: isDragging || isOverlay ? 50 : undefined,
    cursor: disabled ? "default" : isDragging ? "grabbing" : "grab",
    willChange: transform || isOverlay ? "transform" : undefined,
    touchAction: "none",
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={cn(
        "dashboard-drag-item relative flex items-center justify-between gap-3 rounded-2xl border border-border/60 bg-card/80 px-4 py-3 text-xs font-medium shadow-[0_12px_24px_-18px_rgba(15,23,42,0.2)]",
        !disabled && "active:cursor-grabbing",
        isDragging && !isOverlay && "is-dragging dashboard-drag-placeholder",
        isOverlay && "dashboard-drag-overlay"
      )}
    >
      <div className="flex min-w-0 items-center gap-3">
        {showHandle ? (
          <span
            aria-hidden
            className="rounded-full p-1 text-muted-foreground transition hover:bg-muted/60"
          >
            <GripVertical className="h-4 w-4" />
          </span>
        ) : null}
        {resumeLink ? (
          <span className="public-profile-resume-icon-shell flex h-10 w-10 shrink-0 items-center justify-center">
            <span className="public-profile-resume-icon h-10 w-10" aria-hidden />
          </span>
        ) : (
          <LinkFavicon
            title={link.label}
            url={link.url}
            useDarkThemeIcons={useDarkThemeIcons}
            className="h-10 w-10 rounded-md"
            fallbackClassName="flex items-center justify-center rounded-md border border-border/60 bg-background/70 text-[11px] font-semibold text-muted-foreground"
          />
        )}
        <div className="min-w-0">
          <div className="public-link-title truncate text-sm font-semibold text-foreground">
            {link.label}
          </div>
          <div className="public-link-url truncate text-[11px] text-muted-foreground">
            {getPreviewLinkSubtitle(link)}
          </div>
          {showClicks ? (
            <div className="public-link-clicks text-[10px] text-muted-foreground">
              {clicks.toLocaleString()} clicks
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function SortableLeadFieldItem({
  field,
  disabled,
  showHandle,
  isOverlay = false,
}: {
  field: LeadFormField;
  disabled: boolean;
  showHandle: boolean;
  isOverlay?: boolean;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: field.id, disabled });
  const style = {
    transform: isOverlay ? undefined : CSS.Translate.toString(transform),
    transition: isDragging || isOverlay ? "none" : transition,
    zIndex: isDragging || isOverlay ? 50 : undefined,
    cursor: disabled ? "default" : isDragging ? "grabbing" : "grab",
    willChange: transform || isOverlay ? "transform" : undefined,
    touchAction: "none",
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={cn(
        "preview-lead-item dashboard-drag-item rounded-2xl border border-border/60 bg-background/70 px-3 py-2 text-xs text-muted-foreground",
        !disabled && "active:cursor-grabbing",
        isDragging && !isOverlay && "is-dragging dashboard-drag-placeholder",
        isOverlay && "dashboard-drag-overlay"
      )}
    >
      <div className="flex items-center gap-2">
        {showHandle ? (
          <span
            aria-hidden
            className="rounded-full p-0.5 text-muted-foreground transition hover:bg-muted/60"
          >
            <GripVertical className="h-3 w-3" />
          </span>
        ) : null}
        <div className="text-[10px] uppercase tracking-[0.2em]">
          {field.label}
          {field.required ? " *" : ""}
        </div>
      </div>
      <PreviewLeadField field={field} />
    </div>
  );
}
