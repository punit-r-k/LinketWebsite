"use client";

import {
  type ComponentPropsWithoutRef,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FocusEvent,
  type KeyboardEvent,
} from "react";
import {
  DndContext,
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
import {
  Eye,
  EyeOff,
  FileText,
  Globe,
  GripVertical,
  Instagram,
  Link2,
  Pencil,
  Star,
  Trash2,
  Upload,
  X,
} from "lucide-react";

import AvatarUploader from "@/components/dashboard/AvatarUploader";
import ProfileHeaderUploader from "@/components/dashboard/ProfileHeaderUploader";
import ProfileLogoUploader from "@/components/dashboard/ProfileLogoUploader";
import LeadFormBuilder from "@/components/dashboard/LeadFormBuilder";
import LinkFavicon from "@/components/LinkFavicon";
import VCardContent from "@/components/dashboard/vcard/VCardContent";
import { useDashboardUser } from "@/components/dashboard/DashboardSessionContext";
import { useThemeOptional } from "@/components/theme/theme-provider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getSignedAvatarUrl } from "@/lib/avatar-client";
import { getSignedProfileHeaderUrl } from "@/lib/profile-header-client";
import { getSignedProfileLogoUrl } from "@/lib/profile-logo-client";
import { cn } from "@/lib/utils";
import { shuffleFields } from "@/lib/lead-form";
import { readLocalStorage, writeLocalStorage } from "@/lib/browser-storage";
import { toast } from "@/components/system/toaster";
import {
  getDefaultProfileLinkUrl,
  getSiteHost,
  getSiteOrigin,
} from "@/lib/site-url";
import {
  normalizePublicLinkUrlInput,
  shouldAddDefaultWwwHostname,
} from "@/lib/public-link-url";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { isDarkTheme, normalizeThemeName, type ThemeName } from "@/lib/themes";
import type { ProfileWithLinks } from "@/lib/profile-service";
import type { LeadFormConfig, LeadFormField } from "@/types/lead-form";

type SectionId = "profile" | "contact" | "links" | "lead" | "preview";

type LinkIconKey = "instagram" | "globe" | "twitter" | "link" | "file";

type LinkItem = {
  id: string;
  label: string;
  url: string;
  linkType: "link" | "resume";
  icon: LinkIconKey;
  color: string;
  visible: boolean;
  isOverride: boolean;
  clicks?: number;
};

type ProfileDraft = {
  id: string;
  name: string;
  handle: string;
  headline: string;
  headerImageUrl: string | null;
  headerImageUpdatedAt: string | null;
  headerImageOriginalFileName: string | null;
  logoUrl: string | null;
  logoUpdatedAt: string | null;
  logoOriginalFileName: string | null;
  logoShape: "circle" | "rect";
  logoBackgroundWhite: boolean;
  links: LinkItem[];
  theme: ThemeName;
  active: boolean;
  updatedAt: string;
};

type VCardSnapshot = {
  email: string;
  phone: string;
  hasPhoto: boolean;
  status: "idle" | "saving" | "saved" | "error";
  isDirty: boolean;
  error: string | null;
};


const ICON_OPTIONS: Array<{
  value: LinkIconKey;
  label: string;
  icon: typeof Instagram;
  color: string;
}> = [
  { value: "instagram", label: "Instagram", icon: Instagram, color: "#9B7CF5" },
  { value: "globe", label: "My Website", icon: Globe, color: "#55D88A" },
  { value: "twitter", label: "Twitter", icon: X, color: "#F1B16C" },
  { value: "link", label: "Link", icon: Link2, color: "#CBD5F5" },
  { value: "file", label: "File", icon: FileText, color: "#6AB7FF" },
];

const LINK_COLORS = [
  "#9B7CF5",
  "#55D88A",
  "#F1B16C",
  "#6AB7FF",
  "#F28AA0",
];

const MOBILE_PROFILE_SECTIONS: Array<{ id: SectionId; label: string }> = [
  { id: "profile", label: "Profile" },
  { id: "contact", label: "Contact Card" },
  { id: "links", label: "Links" },
  { id: "lead", label: "Lead Form" },
  { id: "preview", label: "Preview" },
];
const ACTIVE_PROFILE_SECTION_STORAGE_KEY = "linket:profile-editor:active-section";
const DEFAULT_PROFILE_LINK_URL = getDefaultProfileLinkUrl();

export default function PublicProfileEditorPage() {
  const dashboardUser = useDashboardUser();
  const { theme } = useThemeOptional();
  const [userId, setUserId] = useState<string | null>(dashboardUser?.id ?? null);
  const [activeSection, setActiveSection] = useState<SectionId>(() => {
    const saved = readLocalStorage(ACTIVE_PROFILE_SECTION_STORAGE_KEY);
    if (
      saved &&
      MOBILE_PROFILE_SECTIONS.some((section) => section.id === saved)
    ) {
      return saved as SectionId;
    }
    return "profile";
  });
  const [draft, setDraft] = useState<ProfileDraft | null>(null);
  const [savedProfile, setSavedProfile] = useState<ProfileDraft | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [handleError, setHandleError] = useState<string | null>(null);
  const [accountHandle, setAccountHandle] = useState<string | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [avatarOriginalFileName, setAvatarOriginalFileName] = useState<string | null>(null);
  const [headerImageUrl, setHeaderImageUrl] = useState<string | null>(null);
  const [logoPreviewUrl, setLogoPreviewUrl] = useState<string | null>(null);
  const [linkModalOpen, setLinkModalOpen] = useState(false);
  const [linkModalMode, setLinkModalMode] = useState<"add" | "edit">("add");
  const [editingLinkId, setEditingLinkId] = useState<string | null>(null);
  const [linkForm, setLinkForm] = useState<LinkItem | null>(null);
  const [draggingLinkId, setDraggingLinkId] = useState<string | null>(null);
  const [sidebarSavePulse, setSidebarSavePulse] = useState(false);
  const [leadFormPreview, setLeadFormPreview] = useState<LeadFormConfig | null>(
    null
  );
  const [vcardSnapshot, setVcardSnapshot] = useState<VCardSnapshot>({
    email: "",
    phone: "",
    hasPhoto: false,
    status: "idle",
    isDirty: false,
    error: null,
  });
  const [vcardLoaded, setVcardLoaded] = useState(false);
  const handleVCardFieldsChange = useCallback(
    (fields: { email: string; phone: string; photoData: string | null }) => {
      setVcardSnapshot((prev) => {
        const next = {
          ...prev,
          email: fields.email ?? "",
          phone: fields.phone ?? "",
          hasPhoto: Boolean(fields.photoData),
        };
        if (
          prev.email === next.email &&
          prev.phone === next.phone &&
          prev.hasPhoto === next.hasPhoto
        ) {
          return prev;
        }
        return next;
      });
    },
    []
  );
  const handleVCardStatusChange = useCallback(
    (payload: {
      status: "idle" | "saving" | "saved" | "error";
      isDirty: boolean;
      error: string | null;
    }) => {
      setVcardSnapshot((prev) => {
        const next = {
          ...prev,
          status: payload.status,
          isDirty: payload.isDirty,
          error: payload.error,
        };
        if (
          prev.status === next.status &&
          prev.isDirty === next.isDirty &&
          prev.error === next.error
        ) {
          return prev;
        }
        return next;
      });
    },
    []
  );

  const autosavePending = useRef(false);
  const leadFormLoadRef = useRef(0);
  const draftRef = useRef<ProfileDraft | null>(null);
  const autosaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reorderSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const leadFormReorderSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );
  const themeSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastThemeRef = useRef<ThemeName | null>(null);
  const logoShapeSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastLogoShapeRef = useRef<ProfileDraft["logoShape"] | null>(null);
  const logoBackgroundSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastLogoBackgroundRef = useRef<ProfileDraft["logoBackgroundWhite"] | null>(null);
  const linkModalSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastLinkModalSnapshotRef = useRef<string | null>(null);
  const leadFormReorderRef = useRef<
    ((sourceId: string, targetId: string) => void) | null
  >(null);

  useEffect(() => {
    if (!userId || vcardLoaded) return;
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch(
          `/api/vcard/profile?userId=${encodeURIComponent(userId)}`,
          { cache: "no-store" }
        );
        if (!response.ok) return;
        const payload = (await response.json()) as {
          fields?: { email?: string; phone?: string };
        };
        if (cancelled) return;
        setVcardSnapshot((prev) => {
          if (prev.email || prev.phone) return prev;
          return {
            ...prev,
            email: payload.fields?.email ?? "",
            phone: payload.fields?.phone ?? "",
          };
        });
        setVcardLoaded(true);
      } catch {
        if (!cancelled) setVcardLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, vcardLoaded]);

  useEffect(() => {
    const root = document.documentElement;
    if (!draggingLinkId) {
      root.classList.remove("dashboard-link-dragging");
      return;
    }

    root.classList.add("dashboard-link-dragging");
    return () => {
      root.classList.remove("dashboard-link-dragging");
    };
  }, [draggingLinkId]);

  useEffect(() => {
    if (dashboardUser?.id) {
      setUserId(dashboardUser.id);
    }
  }, [dashboardUser]);
  useEffect(() => {
    if (!userId) return;
    let active = true;
    (async () => {
      try {
        const response = await fetch(
          `/api/account/handle?userId=${encodeURIComponent(userId)}`,
          { cache: "no-store" }
        );
        if (!response.ok) throw new Error("Unable to load account");
        const payload = (await response.json()) as {
          handle?: string | null;
          avatarPath?: string | null;
          avatarUpdatedAt?: string | null;
          avatarOriginalFileName?: string | null;
        };
        if (!active) return;
        setAccountHandle(payload.handle ?? null);
        setAvatarOriginalFileName(payload.avatarOriginalFileName ?? null);
        const signed = await getSignedAvatarUrl(
          payload.avatarPath ?? null,
          payload.avatarUpdatedAt ?? null
        );
        setAvatarUrl(signed);
      } catch {
        if (active) {
          setAccountHandle(null);
          setAvatarOriginalFileName(null);
        }
      }
    })();
    return () => {
      active = false;
    };
  }, [userId]);

  useEffect(() => {
    if (!draft?.headerImageUrl) {
      setHeaderImageUrl(null);
      return;
    }
    let active = true;
    (async () => {
      const signed = await getSignedProfileHeaderUrl(
        draft.headerImageUrl,
        draft.headerImageUpdatedAt
      );
      if (!active) return;
      setHeaderImageUrl(signed);
    })();
    return () => {
      active = false;
    };
  }, [draft?.headerImageUrl, draft?.headerImageUpdatedAt]);

  useEffect(() => {
    if (!draft?.logoUrl) {
      setLogoPreviewUrl(null);
      return;
    }
    let active = true;
    (async () => {
      const signed = await getSignedProfileLogoUrl(
        draft.logoUrl,
        draft.logoUpdatedAt
      );
      if (!active) return;
      setLogoPreviewUrl(signed);
    })();
    return () => {
      active = false;
    };
  }, [draft?.logoUrl, draft?.logoUpdatedAt]);

  const loadProfile = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const res = await fetch(
        `/api/linket-profiles?userId=${encodeURIComponent(userId)}`,
        { cache: "no-store" }
      );
      if (!res.ok) {
        const info = await res.json().catch(() => ({}));
        throw new Error(info?.error || "Unable to load profile");
      }
      const data = (await res.json()) as ProfileWithLinks[];
      if (!data.length) {
        const handle = accountHandle ?? `user-${userId.slice(0, 8)}`;
        const payload = {
          name: "Linket Public Profile",
          handle,
          headline: "",
          links: [{ title: "Website", url: DEFAULT_PROFILE_LINK_URL }],
          theme,
          active: true,
        };
        const createRes = await fetch("/api/linket-profiles", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId, profile: payload }),
        });
        if (!createRes.ok) {
          const info = await createRes.json().catch(() => ({}));
          throw new Error(info?.error || "Unable to create profile");
        }
        const created = mapProfile((await createRes.json()) as ProfileWithLinks);
        setDraft(created);
        setSavedProfile(created);
        setLastSavedAt(new Date().toISOString());
        setLoading(false);
        return;
      }
      const active = data.find((profile) => profile.is_active) ?? data[0];
      const mapped = mapProfile(active);
      setDraft(mapped);
      setSavedProfile(mapped);
      setLastSavedAt(mapped.updatedAt);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Unable to load profile";
      toast({
        title: "Profile unavailable",
        description: message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [userId, accountHandle, theme]);

  useEffect(() => {
    if (!userId) return;
    void loadProfile();
  }, [userId, loadProfile]);

  useEffect(() => {
    if (!draft) return;
    if (draft.theme === theme) return;
    setDraft((prev) =>
      prev ? { ...prev, theme, updatedAt: new Date().toISOString() } : prev
    );
  }, [theme, draft]);

  useEffect(() => {
    return () => {
      if (autosaveTimer.current) {
        clearTimeout(autosaveTimer.current);
      }
      if (retryTimer.current) {
        clearTimeout(retryTimer.current);
      }
      if (themeSaveTimer.current) {
        clearTimeout(themeSaveTimer.current);
      }
      if (logoShapeSaveTimer.current) {
        clearTimeout(logoShapeSaveTimer.current);
      }
      if (logoBackgroundSaveTimer.current) {
        clearTimeout(logoBackgroundSaveTimer.current);
      }
      if (linkModalSaveTimer.current) {
        clearTimeout(linkModalSaveTimer.current);
      }
    };
  }, []);

  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);

  const isDirty = useMemo(() => {
    if (!draft || !savedProfile) return false;
    return (
      JSON.stringify(normalizeDraftForCompare(draft)) !==
      JSON.stringify(normalizeDraftForCompare(savedProfile))
    );
  }, [draft, savedProfile]);

  const handleSave = useCallback(async (overrideDraft?: ProfileDraft) => {
    const draftSnapshot = overrideDraft ?? draft;
    if (!draftSnapshot || !userId) return;
    if (saving) {
      autosavePending.current = true;
      return;
    }
    const snapshotUpdatedAt = draftSnapshot.updatedAt;
    autosavePending.current = false;
    setSaving(true);
    setSaveError(null);
    try {
      const payload = {
        id: draftSnapshot.id?.trim() ? draftSnapshot.id : undefined,
        name: draftSnapshot.name,
        handle: draftSnapshot.handle,
        headline: draftSnapshot.headline,
        headerImageUrl: draftSnapshot.headerImageUrl,
        headerImageUpdatedAt: draftSnapshot.headerImageUpdatedAt,
        headerImageOriginalFileName: draftSnapshot.headerImageOriginalFileName,
        logoUrl: draftSnapshot.logoUrl,
        logoUpdatedAt: draftSnapshot.logoUpdatedAt,
        logoOriginalFileName: draftSnapshot.logoOriginalFileName,
        logoShape: draftSnapshot.logoShape,
        logoBackgroundWhite: draftSnapshot.logoBackgroundWhite,
        theme: draftSnapshot.theme,
        links: draftSnapshot.links.map((link) => ({
          id: link.id,
          title: link.label,
          url: link.url,
          linkType: link.linkType,
          isActive: link.visible,
          isOverride: link.isOverride,
        })),
        active: true,
      };
      const res = await fetch("/api/linket-profiles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, profile: payload }),
      });
      if (!res.ok) {
        const info = await res.json().catch(() => ({}));
        const suggestions = Array.isArray(info?.suggestions) ? info.suggestions : [];
        const hint = suggestions.length ? `Try: ${suggestions.join(", ")}` : "";
        const message = info?.error || "Unable to save profile";
        if (res.status === 409 && info?.error) {
          setHandleError(hint ? `${info.error} ${hint}` : info.error);
        }
        throw new Error(hint ? `${message} ${hint}` : message);
      }
      const saved = mergeProfileUi(
        mapProfile((await res.json()) as ProfileWithLinks),
        draftSnapshot
      );
      setAccountHandle(saved.handle);
      if (typeof window !== "undefined") {
        window.dispatchEvent(
          new CustomEvent("linket:handle-updated", {
            detail: { handle: saved.handle },
          })
        );
      }
      setHandleError(null);
      setSavedProfile(saved);
      setLastSavedAt(new Date().toISOString());
      const currentDraft = draftRef.current;
      if (currentDraft?.updatedAt === snapshotUpdatedAt) {
        setDraft(saved);
      }
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Unable to save profile";
      setSaveError(message);
      if (
        !message.toLowerCase().includes("handle already taken") &&
        saveError !== message
      ) {
        toast({
          title: "Save failed",
          description: message,
          variant: "destructive",
        });
      }
    } finally {
      setSaving(false);
    }
  }, [draft, saveError, userId, saving]);

  useEffect(() => {
    if (!draft || !userId) return;
    if (lastThemeRef.current === null) {
      lastThemeRef.current = draft.theme;
      return;
    }
    if (draft.theme === lastThemeRef.current) return;
    lastThemeRef.current = draft.theme;
    if (themeSaveTimer.current) {
      clearTimeout(themeSaveTimer.current);
    }
    themeSaveTimer.current = setTimeout(() => {
      themeSaveTimer.current = null;
      if (!isDirty) return;
      void handleSave();
    }, 1000);
  }, [draft, handleSave, isDirty, userId]);

  useEffect(() => {
    if (!draft || !userId) return;
    if (lastLogoShapeRef.current === null) {
      lastLogoShapeRef.current = draft.logoShape;
      return;
    }
    if (draft.logoShape === lastLogoShapeRef.current) return;
    lastLogoShapeRef.current = draft.logoShape;
    if (logoShapeSaveTimer.current) {
      clearTimeout(logoShapeSaveTimer.current);
    }
    logoShapeSaveTimer.current = setTimeout(() => {
      logoShapeSaveTimer.current = null;
      if (!isDirty) return;
      void handleSave();
    }, 400);
  }, [draft, handleSave, isDirty, userId]);

  useEffect(() => {
    if (!draft || !userId) return;
    if (lastLogoBackgroundRef.current === null) {
      lastLogoBackgroundRef.current = draft.logoBackgroundWhite;
      return;
    }
    if (draft.logoBackgroundWhite === lastLogoBackgroundRef.current) return;
    lastLogoBackgroundRef.current = draft.logoBackgroundWhite;
    if (logoBackgroundSaveTimer.current) {
      clearTimeout(logoBackgroundSaveTimer.current);
    }
    logoBackgroundSaveTimer.current = setTimeout(() => {
      logoBackgroundSaveTimer.current = null;
      if (!isDirty) return;
      void handleSave();
    }, 400);
  }, [draft, handleSave, isDirty, userId]);

  useEffect(() => {
    if (!saving && autosavePending.current && draft && isDirty && userId) {
      autosavePending.current = false;
      void handleSave();
    }
  }, [saving, draft, isDirty, userId, handleSave]);

  useEffect(() => {
    if (!draft || !userId || !isDirty) {
      if (autosaveTimer.current) {
        clearTimeout(autosaveTimer.current);
        autosaveTimer.current = null;
      }
      return;
    }
    if (saving) {
      autosavePending.current = true;
      if (autosaveTimer.current) {
        clearTimeout(autosaveTimer.current);
        autosaveTimer.current = null;
      }
      return;
    }
    if (autosaveTimer.current) {
      clearTimeout(autosaveTimer.current);
    }
    autosaveTimer.current = setTimeout(() => {
      autosaveTimer.current = null;
      void handleSave();
    }, 1200);
    return () => {
      if (autosaveTimer.current) {
        clearTimeout(autosaveTimer.current);
        autosaveTimer.current = null;
      }
    };
  }, [draft, isDirty, saving, userId, handleSave]);

  useEffect(() => {
    if (!draft || !userId || !isDirty || !saveError || saving) {
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
      void handleSave();
    }, 4000);
    return () => {
      if (retryTimer.current) {
        clearTimeout(retryTimer.current);
        retryTimer.current = null;
      }
    };
  }, [draft, isDirty, saveError, saving, userId, handleSave]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const handleSaveRequest = () => {
      setSidebarSavePulse(true);
      window.setTimeout(() => setSidebarSavePulse(false), 1200);
      if (!draft || !userId || saving || !isDirty) return;
      void handleSave();
    };
    window.addEventListener("linket:save-request", handleSaveRequest);
    return () => window.removeEventListener("linket:save-request", handleSaveRequest);
  }, [draft, handleSave, isDirty, saving, userId]);

  const scheduleReorderSave = useCallback(() => {
    if (!userId) return;
    if (reorderSaveTimer.current) {
      clearTimeout(reorderSaveTimer.current);
    }
    reorderSaveTimer.current = setTimeout(() => {
      if (saving) {
        autosavePending.current = true;
        return;
      }
      if (!isDirty) return;
      void handleSave();
    }, 3000);
  }, [handleSave, isDirty, saving, userId]);

  const scheduleLeadFormReorderSave = useCallback(
    (nextForm: LeadFormConfig) => {
      const handle = draft?.handle || accountHandle;
      if (!userId || !handle) return;
      if (leadFormReorderSaveTimer.current) {
        clearTimeout(leadFormReorderSaveTimer.current);
      }
      leadFormReorderSaveTimer.current = setTimeout(() => {
        leadFormReorderSaveTimer.current = null;
        void (async () => {
          try {
            const response = await fetch("/api/lead-forms", {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                userId,
                handle,
                profileId: draft?.id ?? null,
                config: nextForm,
              }),
            });
            if (!response.ok) {
              const info = await response.json().catch(() => ({}));
              throw new Error(info?.error || "Unable to save form");
            }
          } catch (error) {
            const message =
              error instanceof Error ? error.message : "Unable to save form";
            toast({
              title: "Lead form save failed",
              description: message,
              variant: "destructive",
            });
          }
        })();
      }, 500);
    },
    [accountHandle, draft?.handle, draft?.id, userId]
  );

  useEffect(() => {
    return () => {
      if (reorderSaveTimer.current) {
        clearTimeout(reorderSaveTimer.current);
      }
      if (leadFormReorderSaveTimer.current) {
        clearTimeout(leadFormReorderSaveTimer.current);
      }
    };
  }, []);

  const handleBlurCapture = useCallback(
    (event: FocusEvent<HTMLDivElement>) => {
      const target = event.target as HTMLElement | null;
      if (!target) return;
      if (!isTextInput(target)) return;
      if (!isDirty || !userId) return;
      if (saving) return;
      void handleSave();
    },
    [handleSave, isDirty, saving, userId]
  );

  useEffect(() => {
    if (!userId) return;
    const handle = draft?.handle || accountHandle;
    if (!handle) {
      setLeadFormPreview(null);
      return;
    }
    const currentLoad = (leadFormLoadRef.current += 1);
    let active = true;
    (async () => {
      try {
        const response = await fetch(
          `/api/lead-forms?userId=${encodeURIComponent(
            userId
          )}&handle=${encodeURIComponent(handle)}`,
          { cache: "no-store" }
        );
        if (!response.ok) throw new Error("Unable to load lead form");
        const payload = (await response.json()) as { form: LeadFormConfig };
        if (!active || currentLoad !== leadFormLoadRef.current) return;
        setLeadFormPreview(payload.form ?? null);
      } catch {
        if (active && currentLoad === leadFormLoadRef.current) {
          setLeadFormPreview(null);
        }
      }
    })();
    return () => {
      active = false;
    };
  }, [accountHandle, draft?.handle, userId]);

  const handleProfileChange = useCallback(
    (patch: Partial<ProfileDraft>) => {
      setSaveError(null);
      setDraft((prev) => {
        if (prev) {
          return { ...prev, ...patch, updatedAt: new Date().toISOString() };
        }
        const base = buildFallbackDraft(userId, accountHandle, theme);
        if (!base) return prev;
        setSavedProfile(base);
        return { ...base, ...patch, updatedAt: new Date().toISOString() };
      });
    },
    [userId, accountHandle, theme]
  );

  const updateLink = useCallback(
    (linkId: string, patch: Partial<LinkItem>) => {
      setDraft((prev) =>
        prev
          ? {
              ...prev,
              links: prev.links.map((link) =>
                link.id === linkId ? { ...link, ...patch } : link
              ),
              updatedAt: new Date().toISOString(),
            }
          : prev
      );
    },
    []
  );

  const setOverrideLink = useCallback(
    (linkId: string, enabled: boolean) => {
      let nextDraft: ProfileDraft | null = null;
      setDraft((prev) => {
        if (!prev) return prev;
        const nextLinks = prev.links.map((link) => {
          if (link.id === linkId) {
            return {
              ...link,
              isOverride: enabled,
              // Override links must stay visible on the public profile.
              visible: enabled ? true : link.visible,
            };
          }
          if (!enabled) return link;
          return {
            ...link,
            isOverride: false,
          };
        });
        nextDraft = {
          ...prev,
          links: nextLinks,
          updatedAt: new Date().toISOString(),
        };
        return nextDraft;
      });
      if (nextDraft) {
        void handleSave(nextDraft);
      }
    },
    [handleSave]
  );

  const addLink = useCallback(() => {
    const newLink = createLink();
    lastLinkModalSnapshotRef.current = null;
    setLinkForm(newLink);
    setEditingLinkId(null);
    setLinkModalMode("add");
    setLinkModalOpen(true);
  }, []);

  const addResumeLink = useCallback(() => {
    const newLink = createResumeLink();
    lastLinkModalSnapshotRef.current = null;
    setLinkForm(newLink);
    setEditingLinkId(null);
    setLinkModalMode("add");
    setLinkModalOpen(true);
  }, []);

  const uploadResumePdf = useCallback(
    async (file: File) => {
      if (!userId) {
        throw new Error("Sign in to upload a resume.");
      }
      const formData = new FormData();
      formData.append("userId", userId);
      if (draft?.id) {
        formData.append("profileId", draft.id);
      }
      formData.append("file", file);
      const response = await fetch("/api/profile-links/resume-upload", {
        method: "POST",
        body: formData,
      });
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
        file?: { name?: string; url?: string };
      };
      if (!response.ok || !payload.file?.url) {
        throw new Error(payload.error || "Unable to upload resume.");
      }
      return {
        name: payload.file.name || file.name,
        url: payload.file.url,
      };
    },
    [draft?.id, userId]
  );

  const removeLink = useCallback((linkId: string) => {
    let removedLink: LinkItem | undefined;
    let removedIndex = -1;
    setDraft((prev) => {
      if (!prev) return prev;
      const index = prev.links.findIndex((link) => link.id === linkId);
      if (index === -1) return prev;
      removedLink = prev.links[index];
      removedIndex = index;
      const nextLinks = prev.links.filter((link) => link.id !== linkId);
      return {
        ...prev,
        links: nextLinks,
        updatedAt: new Date().toISOString(),
      };
    });
    if (!removedLink || removedIndex === -1) return;
    toast({
      title: "Link removed",
      description: "Undo within a few seconds if this was accidental.",
      actionLabel: "Undo",
      onAction: () => {
        const link = removedLink;
        if (!link || removedIndex === -1) return;
        setDraft((current) => {
          if (!current) return current;
          return {
            ...current,
            links: insertAt(current.links, link, removedIndex),
            updatedAt: new Date().toISOString(),
          };
        });
      },
    });
  }, []);

  const reorderLinks = useCallback(
    (sourceId: string, targetId: string, fromPreview = false) => {
      if (sourceId === targetId) return;
      let nextDraft: ProfileDraft | null = null;
      setDraft((prev) => {
        if (!prev) return prev;
        const links = [...prev.links];
        const sourceIndex = links.findIndex((link) => link.id === sourceId);
        const targetIndex = links.findIndex((link) => link.id === targetId);
        if (sourceIndex === -1 || targetIndex === -1) return prev;
        const [moved] = links.splice(sourceIndex, 1);
        links.splice(targetIndex, 0, moved);
        nextDraft = { ...prev, links, updatedAt: new Date().toISOString() };
        return nextDraft;
      });
      if (fromPreview && nextDraft) {
        void handleSave(nextDraft);
        return;
      }
      scheduleReorderSave();
    },
    [handleSave, scheduleReorderSave]
  );

  const reorderLeadFormFields = useCallback(
    (sourceId: string, targetId: string) => {
      if (sourceId === targetId) return;
      let nextForm: LeadFormConfig | null = null;
      setLeadFormPreview((prev) => {
        if (!prev) return prev;
        const fields = [...prev.fields];
        const sourceIndex = fields.findIndex((field) => field.id === sourceId);
        const targetIndex = fields.findIndex((field) => field.id === targetId);
        if (sourceIndex === -1 || targetIndex === -1) return prev;
        const [moved] = fields.splice(sourceIndex, 1);
        fields.splice(targetIndex, 0, moved);
        nextForm = {
          ...prev,
          fields,
          meta: {
            ...prev.meta,
            updatedAt: new Date().toISOString(),
            version: (prev.meta?.version ?? 0) + 1,
          },
        };
        return nextForm;
      });
      if (!nextForm) return;
      if (activeSection === "lead") {
        leadFormReorderRef.current?.(sourceId, targetId);
        return;
      }
      scheduleLeadFormReorderSave(nextForm);
    },
    [activeSection, scheduleLeadFormReorderSave]
  );

  const openEditLink = useCallback(
    (linkId: string) => {
      const link = draft?.links.find((item) => item.id === linkId);
      if (!link) return;
      lastLinkModalSnapshotRef.current = JSON.stringify(link);
      setLinkForm(link);
      setEditingLinkId(linkId);
      setLinkModalMode("edit");
      setLinkModalOpen(true);
    },
    [draft?.links]
  );

  const saveLinkModal = useCallback((options?: { close?: boolean }) => {
    if (!linkForm) return;
    let nextDraft: ProfileDraft | null = null;
    setDraft((prev) => {
      if (!prev) return prev;
      const resolvedId = linkModalMode === "edit" && editingLinkId ? editingLinkId : linkForm.id;
      const incomingLink = {
        ...linkForm,
        id: resolvedId,
        visible: linkForm.isOverride ? true : linkForm.visible,
      };
      const baseLinks =
        linkModalMode === "add"
          ? prev.links.some((link) => link.id === incomingLink.id)
            ? prev.links.map((link) =>
                link.id === incomingLink.id ? incomingLink : link
              )
            : [...prev.links, incomingLink]
          : prev.links.map((link) =>
              link.id === resolvedId ? incomingLink : link
            );
      const normalizedLinks = incomingLink.isOverride
        ? baseLinks.map((link) => ({
            ...link,
            isOverride: link.id === incomingLink.id,
            visible: link.id === incomingLink.id ? true : link.visible,
          }))
        : baseLinks;
      nextDraft = {
        ...prev,
        links: normalizedLinks,
        updatedAt: new Date().toISOString(),
      };
      return nextDraft;
    });
    if (nextDraft) {
      void handleSave(nextDraft);
    }
    if (options?.close !== false) {
      setLinkModalOpen(false);
    }
  }, [editingLinkId, handleSave, linkForm, linkModalMode]);

  useEffect(() => {
    if (
      !linkModalOpen ||
      linkModalMode !== "edit" ||
      !editingLinkId ||
      !linkForm
    ) {
      if (linkModalSaveTimer.current) {
        clearTimeout(linkModalSaveTimer.current);
        linkModalSaveTimer.current = null;
      }
      return;
    }
    const snapshot = JSON.stringify(linkForm);
    if (snapshot === lastLinkModalSnapshotRef.current) {
      return;
    }
    if (linkModalSaveTimer.current) {
      clearTimeout(linkModalSaveTimer.current);
    }
    linkModalSaveTimer.current = setTimeout(() => {
      linkModalSaveTimer.current = null;
      lastLinkModalSnapshotRef.current = snapshot;
      saveLinkModal({ close: false });
    }, 700);
    return () => {
      if (linkModalSaveTimer.current) {
        clearTimeout(linkModalSaveTimer.current);
        linkModalSaveTimer.current = null;
      }
    };
  }, [editingLinkId, linkForm, linkModalMode, linkModalOpen, saveLinkModal]);

  const handleModalOverrideToggle = useCallback(
    (enabled: boolean) => {
      setLinkForm((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          isOverride: enabled,
          visible: enabled ? true : prev.visible,
        };
      });
      if (linkModalMode === "edit" && editingLinkId) {
        setOverrideLink(editingLinkId, enabled);
      }
    },
    [editingLinkId, linkModalMode, setOverrideLink]
  );

  const hasContactDetails = Boolean(
    vcardSnapshot.email?.trim() || vcardSnapshot.phone?.trim()
  );

  const hasUnsavedChanges = Boolean(isDirty || vcardSnapshot.isDirty);
  const saveState = saveError || vcardSnapshot.status === "error"
    ? "failed"
    : saving || vcardSnapshot.status === "saving"
    ? "saving"
    : "saved";
  const saveStatusMeta = useMemo(() => {
    if (saveState === "failed") {
      return {
        label: "Save failed. Retrying...",
        className:
          "border-destructive/40 bg-destructive/10 text-destructive",
      };
    }
    if (saveState === "saving" || sidebarSavePulse) {
      return {
        label: "Saving changes",
        className:
          "border-foreground/20 bg-foreground/10 text-foreground dashboard-saving-indicator",
      };
    }
    if (hasUnsavedChanges) {
      return {
        label: "Unsaved changes",
        className: "border-amber-500/40 bg-amber-500/10 text-amber-700",
      };
    }
    return {
      label: "All changes saved",
      className:
        "border-emerald-500/55 bg-emerald-500/20 text-emerald-900 shadow-sm shadow-emerald-900/10 dark:border-emerald-400/45 dark:bg-emerald-400/18 dark:text-emerald-100",
    };
  }, [hasUnsavedChanges, saveState, sidebarSavePulse]);
  const liveStatusLabel = draft?.active ? "Live profile" : "Draft profile";
  const displayedLastSavedAt = lastSavedAt ?? savedProfile?.updatedAt ?? null;
  const saveDetail = saveError || vcardSnapshot.error || null;

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!hasUnsavedChanges || saveState === "saving" || saveState === "failed") {
      return;
    }
    window.dispatchEvent(new Event("linket:save-request"));
  }, [hasUnsavedChanges, saveState]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    (window as Window & {
      __linketProfileEditorState?: { hasUnsavedChanges: boolean; saveFailed: boolean };
    }).__linketProfileEditorState = {
      hasUnsavedChanges,
      saveFailed: Boolean(saveError || vcardSnapshot.status === "error"),
    };
    return () => {
      delete (window as Window & {
        __linketProfileEditorState?: { hasUnsavedChanges: boolean; saveFailed: boolean };
      }).__linketProfileEditorState;
    };
  }, [hasUnsavedChanges, saveError, vcardSnapshot.status]);

  useEffect(() => {
    writeLocalStorage(ACTIVE_PROFILE_SECTION_STORAGE_KEY, activeSection);
  }, [activeSection]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.dispatchEvent(
      new CustomEvent("linket:profile-section-updated", {
        detail: { section: activeSection },
      })
    );
  }, [activeSection]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const handleSection = (event: Event) => {
      const detail = (event as CustomEvent<{ section?: SectionId }>).detail;
      if (!detail?.section) return;
      setActiveSection(detail.section);
    };
    window.addEventListener("linket:profile-section-nav", handleSection);
    return () => {
      window.removeEventListener("linket:profile-section-nav", handleSection);
    };
  }, []);

  const handleContactCta = useCallback(() => {
    if (!hasContactDetails) {
      setActiveSection("contact");
      const focusTarget = vcardSnapshot.email?.trim()
        ? "profile-contact-phone"
        : "profile-contact-email";
      requestFocus(focusTarget);
      return;
    }
    toast({
      title: "Save contact",
      description: "This will download your contact card on the live profile.",
    });
  }, [hasContactDetails, vcardSnapshot.email]);

  const profileDisplayName = draft?.name || "John Doe";
  const profileTagline =
    draft?.headline || "I do things | other things & more";

  return (
    <div className="space-y-6" onBlurCapture={handleBlurCapture}>
      <div className="dashboard-mobile-section-switcher md:hidden">
        <Select
          value={activeSection}
          onValueChange={(value) => setActiveSection(value as SectionId)}
        >
          <SelectTrigger
            data-tour="profile-section-select"
            className="relative mx-auto h-11 w-full max-w-[260px] justify-center rounded-full border-border/70 bg-card px-12 text-center text-sm font-semibold text-foreground shadow-[var(--shadow-grounded)] ring-1 ring-border/30 *:data-[slot=select-value]:justify-center [&_svg]:absolute [&_svg]:right-5"
          >
            <SelectValue placeholder="Section" />
          </SelectTrigger>
          <SelectContent className="rounded-2xl border-border/70 bg-card p-1 shadow-[var(--shadow-grounded)]">
            {MOBILE_PROFILE_SECTIONS.map((section) => (
              <SelectItem
                key={section.id}
                value={section.id}
                className="rounded-xl text-sm font-medium focus:bg-muted/60 data-[state=checked]:bg-[color:color-mix(in_srgb,var(--accent)_14%,transparent)] data-[state=checked]:text-[color:var(--accent)] data-[state=checked]:focus:bg-[color:color-mix(in_srgb,var(--accent)_18%,transparent)]"
              >
                {section.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div
        className="dashboard-mobile-status-strip flex flex-col gap-2 rounded-2xl border border-border/70 bg-card px-4 py-3 text-sm shadow-[var(--shadow-grounded)] sm:flex-row sm:items-center sm:justify-between"
        aria-live="polite"
      >
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-semibold text-foreground">
            {liveStatusLabel}
          </span>
          <span
            className={cn(
              "rounded-full border px-2.5 py-1 text-[11px] font-semibold",
              saveStatusMeta.className
            )}
          >
            {saveStatusMeta.label}
          </span>
          <span className="text-xs text-muted-foreground">
            Last saved: {displayedLastSavedAt ? formatShortDate(displayedLastSavedAt) : "Not yet"}
          </span>
        </div>
        {saveDetail ? (
          <p className="text-xs text-destructive sm:max-w-md sm:text-right">
            {saveDetail}
          </p>
        ) : (
          <p className="text-xs text-muted-foreground sm:text-right">
            Preview and public page use this same saved profile data.
          </p>
        )}
      </div>
        {/*
          On phones, the preview lives in its own "Preview" section.
          Keep the live preview column on desktop/tablet.
        */}
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="min-w-0 space-y-4" data-tour="profile-editor-panel">
            {/*
              Keep a single preview instance for reuse.
            */}
            <EditorPanel
              activeSection={activeSection}
              draft={draft}
              loading={loading}
              userId={userId}
              userEmail={dashboardUser?.email ?? null}
              avatarUrl={avatarUrl}
              avatarOriginalFileName={avatarOriginalFileName}
              accountHandle={accountHandle}
              headerImageUrl={headerImageUrl}
              previewNode={
                <PhonePreviewCard
                  profile={{ name: profileDisplayName, tagline: profileTagline }}
                  avatarUrl={avatarUrl}
                  headerImageUrl={headerImageUrl}
                  logoUrl={logoPreviewUrl}
                  logoShape={draft?.logoShape ?? "circle"}
                  logoBackgroundWhite={draft?.logoBackgroundWhite ?? false}
                  themeName={draft?.theme ?? theme}
                  contactEnabled={hasContactDetails}
                  contactDisabledText="Add email or phone to enable Save contact"
                  onContactClick={handleContactCta}
                  links={draft?.links ?? []}
                  leadFormPreview={leadFormPreview}
                  onReorderLeadField={reorderLeadFormFields}
                  onReorderLink={reorderLinks}
                />
              }
              onLeadFormPreview={setLeadFormPreview}
              onRegisterLeadFormReorder={(reorder) => {
                leadFormReorderRef.current = reorder;
              }}
              onAvatarUpdate={(url, originalFileName) => {
                setAvatarUrl(url);
                setAvatarOriginalFileName(originalFileName ?? null);
              }}
              onHeaderImageUpdate={(payload) => {
              const nextPath = payload.path || null;
              const nextUpdatedAt = payload.path ? payload.version : null;
              const nextOriginalFileName = payload.originalFileName ?? null;
              setHeaderImageUrl(payload.publicUrl || null);
              setLastSavedAt(payload.version);
              setDraft((prev) =>
                prev
                  ? {
                      ...prev,
                      headerImageUrl: nextPath,
                      headerImageUpdatedAt: nextUpdatedAt,
                      headerImageOriginalFileName: nextOriginalFileName,
                      updatedAt: payload.version,
                    }
                  : prev
              );
              setSavedProfile((prev) =>
                prev
                  ? {
                      ...prev,
                      headerImageUrl: nextPath,
                      headerImageUpdatedAt: nextUpdatedAt,
                      headerImageOriginalFileName: nextOriginalFileName,
                      updatedAt: payload.version,
                    }
                  : prev
              );
              }}
              onLogoUpdate={(payload) => {
              const nextPath = payload.path || null;
              const nextUpdatedAt = payload.path ? payload.version : null;
              const nextOriginalFileName = payload.originalFileName ?? null;
              setLogoPreviewUrl(payload.publicUrl || null);
              setLastSavedAt(payload.version);
              setDraft((prev) =>
                prev
                  ? {
                      ...prev,
                      logoUrl: nextPath,
                      logoUpdatedAt: nextUpdatedAt,
                      logoOriginalFileName: nextOriginalFileName,
                      updatedAt: payload.version,
                    }
                  : prev
              );
              setSavedProfile((prev) =>
                prev
                  ? {
                      ...prev,
                      logoUrl: nextPath,
                      logoUpdatedAt: nextUpdatedAt,
                      logoOriginalFileName: nextOriginalFileName,
                      updatedAt: payload.version,
                    }
                  : prev
              );
              }}
              onProfileChange={handleProfileChange}
              onAddLink={addLink}
              onAddResumeLink={addResumeLink}
              onUpdateLink={updateLink}
              onSetOverrideLink={setOverrideLink}
              onEditLink={openEditLink}
              onRemoveLink={removeLink}
              logoPreviewUrl={logoPreviewUrl}
              onToggleLink={(linkId) =>
                (() => {
                  const current = draft?.links.find((link) => link.id === linkId);
                  if (!current) return;
                  if (current.isOverride && current.visible) {
                    let nextDraft: ProfileDraft | null = null;
                    setDraft((prev) => {
                      if (!prev) return prev;
                      const nextLinks = prev.links.map((link) =>
                        link.id === linkId
                          ? { ...link, isOverride: false, visible: false }
                          : link
                      );
                      nextDraft = {
                        ...prev,
                        links: nextLinks,
                        updatedAt: new Date().toISOString(),
                      };
                      return nextDraft;
                    });
                    if (nextDraft) {
                      void handleSave(nextDraft);
                    }
                    return;
                  }
                  updateLink(linkId, { visible: !current.visible });
                })()
              }
              onReorderLink={reorderLinks}
              draggingLinkId={draggingLinkId}
              setDraggingLinkId={setDraggingLinkId}
              onVCardFields={handleVCardFieldsChange}
              onVCardStatus={handleVCardStatusChange}
              handleError={handleError}
              setHandleError={setHandleError}
            />
          </div>
          {activeSection !== "preview" ? (
          <div className="hidden justify-end self-start pt-0 lg:flex">
            <div className="flex w-full max-w-[340px] flex-col items-center gap-3">
              <div className="w-full max-w-[340px] origin-top-left scale-[1]">
              <PhonePreviewCard
                profile={{ name: profileDisplayName, tagline: profileTagline }}
                avatarUrl={avatarUrl}
                headerImageUrl={headerImageUrl}
                logoUrl={logoPreviewUrl}
                logoShape={draft?.logoShape ?? "circle"}
                logoBackgroundWhite={draft?.logoBackgroundWhite ?? false}
                themeName={draft?.theme ?? theme}
                contactEnabled={hasContactDetails}
                contactDisabledText="Add email or phone to enable Save contact"
                onContactClick={handleContactCta}
                links={draft?.links ?? []}
                leadFormPreview={leadFormPreview}
                onReorderLeadField={reorderLeadFormFields}
                onReorderLink={reorderLinks}
              />
              </div>
            </div>
          </div>
          ) : null}
      </div>

      <LinkModal
        open={linkModalOpen}
        onOpenChange={setLinkModalOpen}
        mode={linkModalMode}
        link={linkForm}
        hasOverrideLink={Boolean(draft?.links.some((item) => item.isOverride))}
        onOverrideToggle={handleModalOverrideToggle}
        onChange={setLinkForm}
        onUploadResume={uploadResumePdf}
        onSave={saveLinkModal}
      />
    </div>
  );
}

function EditorPanel({
  activeSection,
  draft,
  loading,
  userId,
  userEmail,
  avatarUrl,
  avatarOriginalFileName,
  accountHandle,
  headerImageUrl,
  previewNode,
  onAvatarUpdate,
  onHeaderImageUpdate,
  onLogoUpdate,
  onLeadFormPreview,
  onRegisterLeadFormReorder,
  onProfileChange,
  onAddLink,
  onAddResumeLink,
  onUpdateLink,
  onSetOverrideLink,
  onEditLink,
  onRemoveLink,
  logoPreviewUrl,
  onToggleLink,
  onReorderLink,
  draggingLinkId,
  setDraggingLinkId,
  onVCardFields,
  onVCardStatus,
  handleError,
  setHandleError,
}: {
  activeSection: SectionId;
  draft: ProfileDraft | null;
  loading: boolean;
  userId: string | null;
  userEmail: string | null;
  avatarUrl: string | null;
  avatarOriginalFileName: string | null;
  accountHandle: string | null;
    headerImageUrl: string | null;
    previewNode: React.ReactNode;
    onAvatarUpdate: (url: string, originalFileName?: string | null) => void;
  onHeaderImageUpdate: (payload: {
    path: string;
    version: string;
    publicUrl: string;
    originalFileName?: string | null;
  }) => void;
  onLogoUpdate: (payload: {
    path: string;
    version: string;
    publicUrl: string;
    originalFileName?: string | null;
  }) => void;
  onLeadFormPreview: (preview: LeadFormConfig | null) => void;
  onRegisterLeadFormReorder: (
    reorder: ((sourceId: string, targetId: string) => void) | null
  ) => void;
  onProfileChange: (patch: Partial<ProfileDraft>) => void;
  onAddLink: () => void;
  onAddResumeLink: () => void;
  onUpdateLink: (linkId: string, patch: Partial<LinkItem>) => void;
  onSetOverrideLink: (linkId: string, enabled: boolean) => void;
  onEditLink: (linkId: string) => void;
  onRemoveLink: (linkId: string) => void;
  logoPreviewUrl: string | null;
  onToggleLink: (linkId: string) => void;
  onReorderLink: (
    sourceId: string,
    targetId: string,
    fromPreview?: boolean
  ) => void;
  draggingLinkId: string | null;
  setDraggingLinkId: (id: string | null) => void;
  onVCardFields: (fields: {
    email: string;
    phone: string;
    photoData: string | null;
  }) => void;
  onVCardStatus: (payload: {
    status: "idle" | "saving" | "saved" | "error";
    isDirty: boolean;
    error: string | null;
  }) => void;
  handleError: string | null;
  setHandleError: (value: string | null) => void;
}) {
  const { theme } = useThemeOptional();
  const handleFieldsChange = useCallback(
    (fields: { email: string; phone: string; photoData: string | null }) => {
      onVCardFields({
        email: fields.email,
        phone: fields.phone,
        photoData: fields.photoData,
      });
    },
    [onVCardFields]
  );
  const handleStatusChange = useCallback(
    (payload: { status: "idle" | "saving" | "saved" | "error"; isDirty: boolean; error: string | null }) => {
      onVCardStatus({
        status: payload.status,
        isDirty: payload.isDirty,
        error: payload.error,
      });
    },
    [onVCardStatus]
  );
  const [linkSearchQuery, setLinkSearchQuery] = useState("");
  const [linkSortMode, setLinkSortMode] = useState<"manual" | "label" | "clicks">(
    "manual"
  );
  const sortedFilteredLinks = useMemo(() => {
    const base = draft?.links ?? [];
    const query = linkSearchQuery.trim().toLowerCase();
    const filtered = query
      ? base.filter(
          (link) =>
            link.label.toLowerCase().includes(query) ||
            link.url.toLowerCase().includes(query)
        )
      : base;
    if (linkSortMode === "manual") return filtered;
    if (linkSortMode === "label") {
      return [...filtered].sort((a, b) => a.label.localeCompare(b.label));
    }
    return [...filtered].sort((a, b) => (b.clicks ?? 0) - (a.clicks ?? 0));
  }, [draft?.links, linkSearchQuery, linkSortMode]);
  const canReorderLinks =
    linkSortMode === "manual" && linkSearchQuery.trim().length === 0;
  const hasLinkMatches = sortedFilteredLinks.length > 0;
  const editorLinkIds = useMemo(
    () => sortedFilteredLinks.map((link) => link.id),
    [sortedFilteredLinks]
  );
  const editorLinkSensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );
  const handleEditorLinkDragStart = useCallback(
    (event: DragStartEvent) => {
      if (!canReorderLinks) return;
      setDraggingLinkId(String(event.active.id));
    },
    [canReorderLinks, setDraggingLinkId]
  );
  const handleEditorLinkDragEnd = useCallback(
    (event: DragEndEvent) => {
      setDraggingLinkId(null);
      if (!canReorderLinks) return;
      const { active, over } = event;
      if (!over || active.id === over.id) return;
      onReorderLink(String(active.id), String(over.id));
    },
    [canReorderLinks, onReorderLink, setDraggingLinkId]
  );
  const handleEditorLinkDragCancel = useCallback(
    (_event: DragCancelEvent) => {
      setDraggingLinkId(null);
    },
    [setDraggingLinkId]
  );

  if (loading && activeSection !== "preview") {
    return (
      <Card className="dashboard-skeleton rounded-2xl border border-border/60 bg-card/80 shadow-sm">
        <CardHeader>
          <CardTitle className="text-sm font-semibold">
            Loading editor...
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="h-10 w-3/4 rounded-xl bg-muted/60" data-skeleton />
          <div className="h-10 w-full rounded-xl bg-muted/60" data-skeleton />
          <div className="h-20 w-full rounded-xl bg-muted/60" data-skeleton />
          <div className="h-12 w-1/2 rounded-full bg-muted/60" data-skeleton />
        </CardContent>
      </Card>
    );
  }
  if (activeSection === "preview") {
    return (
      <div className="dashboard-mobile-preview-shell flex justify-center">
        {previewNode}
      </div>
    );
  }
  if (activeSection === "profile") {
    return (
      <Card className="rounded-2xl border border-border/60 bg-card/80 shadow-sm">
        <CardHeader>
          <CardTitle className="text-sm font-semibold">Profile details</CardTitle>
        </CardHeader>
        <CardContent className="profile-details-panel space-y-4">
          {userId ? (
            <AvatarUploader
              userId={userId}
              userEmail={userEmail}
              avatarUrl={avatarUrl}
              avatarOriginalFileName={avatarOriginalFileName}
              onUploaded={({ publicUrl, originalFileName }) =>
                onAvatarUpdate(publicUrl, originalFileName ?? null)
              }
              variant="compact"
              inputId="profile-avatar-upload"
            />
          ) : (
            <div className="h-20 rounded-2xl border border-dashed border-border/60 bg-muted/30" />
          )}
          <div className="h-px bg-border/60" aria-hidden="true" />
          {userId && draft?.id ? (
            <ProfileHeaderUploader
              userId={userId}
              profileId={draft.id}
              headerUrl={headerImageUrl}
              headerOriginalFileName={draft?.headerImageOriginalFileName ?? null}
              onUploaded={onHeaderImageUpdate}
              variant="compact"
              inputId="profile-header-upload"
            />
          ) : (
            <div className="h-24 rounded-2xl border border-dashed border-border/60 bg-muted/30" />
          )}
          <div className="h-px bg-border/60" aria-hidden="true" />
          {userId && draft?.id ? (
            <ProfileLogoUploader
              userId={userId}
              profileId={draft.id}
              logoUrl={logoPreviewUrl}
              logoOriginalFileName={draft?.logoOriginalFileName ?? null}
              logoShape={draft?.logoShape ?? "circle"}
              logoBackgroundWhite={draft?.logoBackgroundWhite ?? false}
              onUploaded={onLogoUpdate}
              variant="compact"
              inputId="profile-logo-upload"
              controls={
                <div className="flex flex-col gap-2">
                  <Label className="text-[11px] text-muted-foreground sm:text-xs">Logo shape</Label>
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant={draft?.logoShape === "rect" ? "outline" : "default"}
                      onClick={() => onProfileChange({ logoShape: "circle" })}
                      disabled={loading || !userId}
                      className={cn(
                        "h-9 w-full px-3 sm:h-8",
                        draft?.logoShape !== "rect"
                          ? `bg-[#cfe4ff] ${theme === "honey" ? "text-[#8a3f0a]" : "text-foreground"} border-2 border-[#5aa0ff] shadow-[0_6px_16px_-10px_rgba(90,160,255,0.6)]`
                          : "text-muted-foreground border border-border/60 hover:bg-muted/40"
                      )}
                    >
                      Circle
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant={draft?.logoShape === "rect" ? "default" : "outline"}
                      onClick={() => onProfileChange({ logoShape: "rect" })}
                      disabled={loading || !userId}
                      className={cn(
                        "h-9 w-full px-3 sm:h-8",
                        draft?.logoShape === "rect"
                          ? `bg-[#cfe4ff] ${theme === "honey" ? "text-[#8a3f0a]" : "text-foreground"} border-2 border-[#5aa0ff] shadow-[0_6px_16px_-10px_rgba(90,160,255,0.6)]`
                          : "text-muted-foreground border border-border/60 hover:bg-muted/40"
                      )}
                    >
                      Rectangle
                    </Button>
                  </div>
                  <label className="mt-1 flex w-full items-center justify-start gap-3 rounded-full">
                    <Switch
                      checked={draft?.logoBackgroundWhite ?? false}
                      onCheckedChange={(value) =>
                        onProfileChange({ logoBackgroundWhite: Boolean(value) })
                      }
                      disabled={loading || !userId}
                    />
                    White logo background
                  </label>
                </div>
              }
            />
          ) : (
            <div className="h-24 rounded-2xl border border-dashed border-border/60 bg-muted/30" />
          )}
          <div className="h-px bg-border/60" aria-hidden="true" />

          <div className="space-y-2">
            <Label htmlFor="profile-name" className="text-[11px] text-muted-foreground sm:text-xs">
              Display name
            </Label>
            <Input
              id="profile-name"
              value={draft?.name ?? ""}
              onChange={(event) => onProfileChange({ name: event.target.value })}
              disabled={loading || !userId}
              autoComplete="name"
              enterKeyHint="next"
              className="h-10 text-sm sm:h-9"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="profile-headline" className="text-[11px] text-muted-foreground sm:text-xs">
              Headline
            </Label>
            <Textarea
              id="profile-headline"
              rows={2}
              value={draft?.headline ?? ""}
              onChange={(event) =>
                onProfileChange({ headline: event.target.value })
              }
              disabled={loading || !userId}
              placeholder="I do things | other things & more things..."
              enterKeyHint="next"
              className="min-h-20 text-sm sm:min-h-16"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="profile-handle" className="text-[11px] text-muted-foreground sm:text-xs">
              Public handle
            </Label>
            <div className="relative">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 pr-3 text-[10px] text-muted-foreground sm:text-xs">
                {getSiteHost(getSiteOrigin())}/
              </span>
              <Input
                id="profile-handle"
                value={draft?.handle ?? accountHandle ?? ""}
                onChange={(event) => {
                  setHandleError(null);
                  onProfileChange({
                    handle: event.target.value.replace(/\s+/g, "").toLowerCase(),
                  });
                }}
                className={`h-10 pl-40 text-sm sm:h-9 sm:pl-44${handleError ? " border-destructive focus-visible:ring-destructive" : ""}`}
                disabled={loading || !userId}
                autoComplete="username"
                inputMode="url"
                enterKeyHint="done"
              />
            </div>
            {handleError ? (
              <p className="text-xs text-destructive">{handleError}</p>
            ) : null}
          </div>
        </CardContent>
      </Card>
    );
  }

    if (activeSection === "contact") {
      return (
        <VCardContent
          variant="embedded"
          idPrefix="profile-contact"
          onFieldsChange={handleFieldsChange}
          onStatusChange={handleStatusChange}
        />
      );
    }

  if (activeSection === "links") {
    return (
        <Card className="rounded-2xl border border-border/60 bg-card/80 shadow-sm">
          <CardHeader className="flex flex-col items-start gap-2 text-left sm:flex-row sm:items-center sm:justify-between">
            <CardTitle className="text-sm font-semibold">Links</CardTitle>
            <div className="flex w-full flex-wrap justify-center gap-2 sm:w-auto sm:justify-end">
                <Button
                  variant="outline"
                  size="sm"
                  className="justify-center rounded-full px-4"
                  onClick={onAddResumeLink}
                >
                  <FileText className="mr-2 h-4 w-4" />
                  Add resume
                </Button>
                <Button
                  variant="default"
                  size="sm"
                  className="justify-center rounded-full px-6"
                  onClick={onAddLink}
                >
                  <Link2 className="mr-2 h-4 w-4" />
                  Add link
                </Button>
            </div>
          </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_160px]">
            <Input
              value={linkSearchQuery}
              onChange={(event) => setLinkSearchQuery(event.target.value)}
              placeholder="Search by label or URL"
              enterKeyHint="search"
              className="h-9 text-sm"
            />
            <select
              className="min-h-11 rounded-md border border-border/60 bg-background px-3 text-sm sm:min-h-9"
              value={linkSortMode}
              onChange={(event) =>
                setLinkSortMode(event.target.value as "manual" | "label" | "clicks")
              }
            >
              <option value="manual">Manual order</option>
              <option value="label">Sort by label</option>
              <option value="clicks">Sort by clicks</option>
            </select>
          </div>
          {!canReorderLinks && hasLinkMatches ? (
            <p className="text-xs text-muted-foreground">
              Reordering is available in manual mode with an empty search.
            </p>
          ) : null}
          <DndContext
            sensors={editorLinkSensors}
            collisionDetection={closestCenter}
            onDragStart={handleEditorLinkDragStart}
            onDragEnd={handleEditorLinkDragEnd}
            onDragCancel={handleEditorLinkDragCancel}
            modifiers={[restrictToVerticalAxis, restrictToParentElement]}
          >
            <SortableContext
              items={editorLinkIds}
              strategy={verticalListSortingStrategy}
            >
              <div className="space-y-3">
                {sortedFilteredLinks.map((link, index) => (
                  <EditorLinkItem
                    key={link.id}
                    link={link}
                    canReorderLinks={canReorderLinks}
                    draggingLinkId={draggingLinkId}
                    showOverrideTourTarget={index === 0}
                    onUpdateLink={onUpdateLink}
                    onSetOverrideLink={onSetOverrideLink}
                    onEditLink={onEditLink}
                    onToggleLink={onToggleLink}
                    onRemoveLink={onRemoveLink}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
          {!draft?.links.length ? (
            <div className="rounded-xl border border-dashed border-border/60 px-3 py-5 text-center text-xs text-muted-foreground">
              <p>No links yet. Add one to make your profile actionable.</p>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="mt-3 rounded-full"
                onClick={onAddLink}
              >
                Add your first link
              </Button>
            </div>
          ) : null}
          {draft?.links.length && !hasLinkMatches ? (
            <div className="rounded-xl border border-dashed border-border/60 px-3 py-5 text-center text-xs text-muted-foreground">
              <p>No links match that search.</p>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="mt-2 rounded-full"
                onClick={() => setLinkSearchQuery("")}
              >
                Clear search
              </Button>
            </div>
          ) : null}
        </CardContent>
      </Card>
    );
  }

  if (activeSection === "lead") {
      return (
        <div data-tour="profile-lead-form-builder">
          {userId ? (
            <LeadFormBuilder
              userId={userId}
              handle={accountHandle || draft?.handle || null}
              profileId={draft?.id ?? null}
              onPreviewChange={onLeadFormPreview}
              showPreview={false}
              layout="side"
              columns={2}
              onRegisterReorder={(reorder) => {
                onRegisterLeadFormReorder(reorder);
              }}
            />
          ) : (
            <Card className="rounded-2xl border border-border/60 bg-card/80 shadow-sm">
              <CardContent className="py-6 text-sm text-muted-foreground">
                Sign in to edit the lead form.
              </CardContent>
            </Card>
          )}
        </div>
      );
  }

  return (
    <Card className="rounded-2xl border border-border/60 bg-card/80 shadow-sm">
      <CardHeader>
        <CardTitle className="text-sm font-semibold">Style</CardTitle>
      </CardHeader>
      <CardContent className="text-sm text-muted-foreground">
        The public profile uses your dashboard theme automatically.
      </CardContent>
    </Card>
  );
}

function EditorLinkItem({
  link,
  canReorderLinks,
  draggingLinkId,
  showOverrideTourTarget,
  onUpdateLink,
  onSetOverrideLink,
  onEditLink,
  onToggleLink,
  onRemoveLink,
}: {
  link: LinkItem;
  canReorderLinks: boolean;
  draggingLinkId: string | null;
  showOverrideTourTarget?: boolean;
  onUpdateLink: (linkId: string, patch: Partial<LinkItem>) => void;
  onSetOverrideLink: (linkId: string, enabled: boolean) => void;
  onEditLink: (linkId: string) => void;
  onToggleLink: (linkId: string) => void;
  onRemoveLink: (linkId: string) => void;
}) {
  const handleCommitOnEnter = useCallback((event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== "Enter" || event.nativeEvent.isComposing) return;
    event.preventDefault();
    event.currentTarget.blur();
  }, []);
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: link.id, disabled: !canReorderLinks });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 40 : undefined,
  };
  const handleCursor = isDragging ? "grabbing" : "grab";

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "dashboard-drag-item group rounded-xl border border-border/60 bg-background/70 p-3 focus-within:ring-2 focus-within:ring-ring/35",
        "cursor-default",
        (isDragging || draggingLinkId === link.id) && "is-dragging opacity-70"
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex-1 space-y-2">
          <Input
            id={`link-label-${link.id}`}
            value={link.label}
            placeholder="Label"
            onChange={(event) =>
              onUpdateLink(link.id, { label: event.target.value })
            }
            onKeyDown={handleCommitOnEnter}
            autoComplete="off"
            enterKeyHint="next"
            className="h-9 text-left text-sm"
          />
          <LinkUrlInput
            value={link.url}
            placeholder="www.website.com"
            className="h-9 text-sm"
            enterKeyHint="done"
            onValueChange={(url) => onUpdateLink(link.id, { url })}
            onKeyDown={handleCommitOnEnter}
          />
          <div
            data-tour={showOverrideTourTarget ? "profile-override-link" : undefined}
            className="mt-1 flex items-start gap-2 rounded-md border border-border/50 bg-muted/20 px-2 py-2"
          >
            <DirectLinkStarToggle
              checked={link.isOverride}
              onPressedChange={(value) => onSetOverrideLink(link.id, value)}
              aria-label={`Use ${link.label || "this link"} for Direct-to-link mode`}
              className="mt-0.5"
            />
            <span className="space-y-0.5 text-left">
              <span className="block text-xs font-medium text-foreground">
                Use Direct-to-link mode
              </span>
              <span className="block text-[11px] text-muted-foreground">
                Linket scans skip your public page and open this link directly.
              </span>
            </span>
          </div>
        </div>
        <div className="flex flex-col gap-2">
          {canReorderLinks ? (
            <button
              type="button"
              {...attributes}
              {...listeners}
              className={cn(
                "inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition hover:bg-muted/60",
                isDragging
                  ? "cursor-grabbing"
                  : "cursor-grab hover:cursor-grab active:cursor-grabbing"
              )}
              style={{ cursor: handleCursor }}
              aria-label={`Reorder ${link.label || "link"}`}
              title="Drag to reorder"
            >
              <GripVertical
                className="pointer-events-none h-4 w-4"
                style={{ cursor: handleCursor }}
              />
            </button>
          ) : null}
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => onEditLink(link.id)}
            aria-label="Edit link"
          >
            <Pencil className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => onToggleLink(link.id)}
            aria-label={link.visible ? "Hide link" : "Show link"}
          >
            {link.visible ? (
              <Eye className="h-4 w-4" />
            ) : (
              <EyeOff className="h-4 w-4" />
            )}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-destructive"
            onClick={() => onRemoveLink(link.id)}
            aria-label="Delete link"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

function PhonePreviewCard({
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
  leadFormPreview,
  onReorderLeadField,
  onReorderLink,
}: {
  profile: { name: string; tagline: string };
  avatarUrl: string | null;
  headerImageUrl: string | null;
  logoUrl: string | null;
  logoShape: "circle" | "rect";
  logoBackgroundWhite: boolean;
  themeName?: ThemeName;
  contactEnabled: boolean;
  contactDisabledText: string;
  onContactClick: () => void;
  links: LinkItem[];
  leadFormPreview: LeadFormConfig | null;
  onReorderLeadField?: (sourceId: string, targetId: string) => void;
  onReorderLink: (
    sourceId: string,
    targetId: string,
    fromPreview?: boolean
  ) => void;
}) {
  const visibleLinks = useMemo(
    () => links.filter((link) => link.visible),
    [links]
  );
  const logoBadgeClass = logoBackgroundWhite ? "bg-white" : "bg-background";
  const previewFields = useMemo(() => {
    if (!leadFormPreview) return [];
    return leadFormPreview.settings.shuffleQuestionOrder
      ? shuffleFields(leadFormPreview.fields)
      : leadFormPreview.fields;
  }, [leadFormPreview]);
  const previewLinkIds = useMemo(() => visibleLinks.map((link) => link.id), [visibleLinks]);
  const previewLeadFieldIds = useMemo(
    () =>
      previewFields
        .filter((field) => field.type !== "section")
        .map((field) => field.id),
    [previewFields]
  );
  const previewSensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );
  const handlePreviewLinkDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;
      onReorderLink(String(active.id), String(over.id), true);
    },
    [onReorderLink]
  );
  const handlePreviewLeadFieldDragEnd = useCallback(
    (event: DragEndEvent) => {
      if (!onReorderLeadField) return;
      const { active, over } = event;
      if (!over || active.id === over.id) return;
      onReorderLeadField(String(active.id), String(over.id));
    },
    [onReorderLeadField]
  );
  const submitLabel = "Submit";
  const resolvedTheme = themeName;
  const useDarkThemeIcons = resolvedTheme ? isDarkTheme(resolvedTheme) : false;

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
        {avatarUrl ? (
          <div className="-mt-16 flex flex-col items-center">
            <div className="relative flex flex-col items-center">
              <div
                className={cn(
                  "public-profile-avatar-frame relative h-28 w-28 rounded-3xl bg-background shadow-sm z-10 overflow-visible",
                  logoUrl && logoShape === "rect" && "public-profile-avatar-frame--rect-logo"
                )}
              >
                <div className="h-full w-full overflow-hidden rounded-3xl ring-4 ring-[var(--avatar-border)]">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={avatarUrl}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                </div>
                {logoUrl && logoShape === "circle" ? (
                  <span className={cn("absolute -bottom-2 -right-2 h-12 w-12 overflow-hidden rounded-full border-2 border-[var(--avatar-border)] shadow-md", logoBadgeClass)}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={logoUrl} alt="" className="h-full w-full object-cover" />
                  </span>
                ) : null}
              {logoUrl && logoShape === "rect" ? (
                <span className={cn("public-profile-logo-badge public-profile-logo-badge--rect", logoBadgeClass)}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={logoUrl} alt="" className="h-full w-full object-cover" />
                </span>
              ) : null}
              </div>
            </div>
          </div>
        ) : null}
        <div className={avatarUrl ? "public-profile-preview-header mt-3 text-center" : "public-profile-preview-header mt-2 text-center"}>
          <div className="mx-auto max-w-[240px] text-base font-semibold text-foreground leading-snug whitespace-normal break-words">
            {profile.name}
          </div>
          <div className="mx-auto mt-1 max-w-[240px] text-xs text-muted-foreground leading-snug whitespace-normal break-words">
            {profile.tagline}
          </div>
        </div>
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

        <div className="mt-4 w-full text-left">
          <div
            className={cn(
              "public-profile-preview-section-label public-profile-links-label text-xs font-semibold text-muted-foreground",
            )}
          >
            Links
          </div>
          <div className="mt-3">
            <DndContext
              sensors={previewSensors}
              collisionDetection={closestCenter}
              onDragEnd={handlePreviewLinkDragEnd}
              modifiers={[restrictToVerticalAxis, restrictToParentElement]}
            >
              <SortableContext
                items={previewLinkIds}
                strategy={verticalListSortingStrategy}
              >
                <div className="space-y-3">
                  {visibleLinks.map((link) => (
                    <LinkListItem
                      key={link.id}
                      link={link}
                      useDarkThemeIcons={useDarkThemeIcons}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          </div>
        </div>

        <div
          className="public-profile-preview-section-label mt-4 w-full text-xs text-muted-foreground"
        >
          {leadFormPreview?.title || "Get in Touch"}
        </div>
        <div className="mt-3 w-full">
          <DndContext
            sensors={previewSensors}
            collisionDetection={closestCenter}
            onDragEnd={handlePreviewLeadFieldDragEnd}
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
                        <div className="text-[11px] font-semibold">{field.title}</div>
                        {field.description ? (
                          <div className="mt-1 text-[10px]">{field.description}</div>
                        ) : null}
                      </div>
                    ) : (
                      <SortableLeadFieldItem
                        key={field.id}
                        field={field}
                        disabled={!onReorderLeadField}
                      />
                    )
                  )
                ) : (
                  <div className="rounded-2xl border border-dashed border-border/60 px-3 py-3 text-center text-[11px] text-muted-foreground">
                    Add lead form fields to see them here.
                  </div>
                )}
                <button
                  type="button"
                  className="public-profile-preview-submit w-full rounded-full px-4 py-2 text-xs font-semibold transition"
                >
                  {submitLabel}
                </button>
              </div>
            </SortableContext>
          </DndContext>
        </div>
      </div>
    </div>
  );
}

function PreviewLeadField({ field }: { field: LeadFormField }) {
  switch (field.type) {
    case "short_text":
      return (
        <div className="mt-2 flex h-8 items-center rounded-xl border border-border/60 bg-muted/50 px-2 text-[11px] text-muted-foreground">
          {field.helpText || "Short answer"}
        </div>
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
    case "short_text":
    case "file_upload":
    default:
      return (
        <div className="mt-2 h-8 rounded-xl border border-border/60 bg-muted/50" />
      );
  }
}

function LinkListItem({
  link,
  useDarkThemeIcons,
}: {
  link: LinkItem;
  useDarkThemeIcons: boolean;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: link.id });
  const clicks = link.clicks ?? 0;
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : undefined,
    cursor: isDragging ? "grabbing" : "grab",
  };
  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={cn(
        "dashboard-drag-item relative flex items-center justify-between gap-3 rounded-2xl border border-border/60 bg-card/80 px-4 py-3 text-xs font-medium shadow-[0_12px_24px_-18px_rgba(15,23,42,0.2)] active:cursor-grabbing",
        isDragging && "is-dragging"
      )}
    >
      <div className="flex min-w-0 items-center gap-3">
        <span
          aria-hidden
          className="rounded-full p-1 text-muted-foreground transition hover:bg-muted/60"
        >
          <GripVertical className="h-4 w-4" />
        </span>
        {link.linkType === "resume" ? (
          <span className="flex h-10 w-10 items-center justify-center rounded-md border border-border/60 bg-background/70 text-muted-foreground">
            <FileText className="h-5 w-5" aria-hidden />
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
            {link.linkType === "resume" ? "Download PDF" : link.url}
          </div>
          <div className="public-link-clicks text-[10px] text-muted-foreground">
            {clicks.toLocaleString()} clicks
          </div>
        </div>
      </div>
    </div>
  );
}

function LinkUrlInput({
  value,
  onValueChange,
  className,
  onBlur,
  onFocus,
  ...inputProps
}: {
  value: string;
  onValueChange: (value: string) => void;
} & Omit<ComponentPropsWithoutRef<typeof Input>, "value" | "onChange">) {
  const [draftValue, setDraftValue] = useState(() => getEditableLinkValue(value));
  const [isFocused, setIsFocused] = useState(false);
  const inputValue = isFocused ? draftValue : getEditableLinkValue(value);

  return (
    <div className="relative">
      <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-xs text-muted-foreground">
        https://
      </span>
      <Input
        {...inputProps}
        value={inputValue}
        type="url"
        inputMode="url"
        autoComplete="url"
        className={cn("pl-20 text-left", className)}
        onFocus={(event) => {
          setIsFocused(true);
          setDraftValue(getEditableLinkValue(value));
          onFocus?.(event);
        }}
        onChange={(event) => {
          const nextValue = event.target.value;
          setDraftValue(nextValue);
          onValueChange(normalizeEditableLinkUrl(nextValue));
        }}
        onBlur={(event) => {
          setIsFocused(false);
          const nextValue = getEditableLinkValue(event.target.value);
          setDraftValue(nextValue);
          onValueChange(normalizeEditableLinkUrl(nextValue));
          onBlur?.(event);
        }}
      />
    </div>
  );
}

function DirectLinkStarToggle({
  checked,
  onPressedChange,
  className,
  ...buttonProps
}: Omit<ComponentPropsWithoutRef<"button">, "onClick"> & {
  checked: boolean;
  onPressedChange: (checked: boolean) => void;
}) {
  const buttonRef = useRef<HTMLButtonElement | null>(null);

  const handleClick = () => {
    const button = buttonRef.current;
    const prefersReducedMotion =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (button && typeof button.animate === "function" && !prefersReducedMotion) {
      button.getAnimations().forEach((animation) => animation.cancel());
      button.animate(
        [
          { opacity: 1, transform: "scale(1)" },
          { opacity: 0.15, transform: "scale(0.92)", offset: 0.32 },
          { opacity: 1, transform: "scale(1.08)", offset: 0.68 },
          { opacity: 1, transform: "scale(1)" },
        ],
        { duration: 260, easing: "ease-out" }
      );
    }

    onPressedChange(!checked);
  };

  return (
    <button
      ref={buttonRef}
      type="button"
      aria-pressed={checked}
      onClick={handleClick}
      className={cn(
        "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--ring)]",
        checked
          ? "border-amber-400/70 bg-amber-400/15 text-amber-500 shadow-[0_10px_20px_-16px_rgba(245,158,11,0.75)]"
          : "border-border/60 bg-background text-muted-foreground hover:bg-muted/60",
        className
      )}
      {...buttonProps}
    >
      <Star className={cn("h-4 w-4", checked && "fill-current")} aria-hidden />
    </button>
  );
}

function SortableLeadFieldItem({
  field,
  disabled,
}: {
  field: LeadFormField;
  disabled?: boolean;
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
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : undefined,
    cursor: disabled ? "not-allowed" : isDragging ? "grabbing" : "grab",
  };
  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={cn(
        "preview-lead-item dashboard-drag-item rounded-2xl border border-border/60 bg-background/70 px-3 py-2 text-xs text-muted-foreground",
        disabled && "cursor-not-allowed",
        !disabled && "active:cursor-grabbing",
        isDragging && "is-dragging"
      )}
    >
      <div className="flex items-center gap-2">
        <span
          aria-hidden
          className={cn(
            "rounded-full p-0.5 text-muted-foreground transition hover:bg-muted/60",
            disabled && "opacity-60"
          )}
        >
          <GripVertical className="h-3 w-3" />
        </span>
        <div className="text-[10px] uppercase tracking-[0.2em]">
          {field.label}
          {field.required ? " *" : ""}
        </div>
      </div>
      <PreviewLeadField field={field} />
    </div>
  );
}

function LinkModal({
  open,
  onOpenChange,
  mode,
  link,
  hasOverrideLink,
  onOverrideToggle,
  onChange,
  onUploadResume,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "add" | "edit";
  link: LinkItem | null;
  hasOverrideLink: boolean;
  onOverrideToggle: (enabled: boolean) => void;
  onChange: (link: LinkItem | null) => void;
  onUploadResume: (file: File) => Promise<{ name: string; url: string }>;
  onSave: () => void;
}) {
  const [uploadingResume, setUploadingResume] = useState(false);
  const [resumeUploadError, setResumeUploadError] = useState<string | null>(null);
  const isResumeLink = link?.linkType === "resume";
  const canSave = Boolean(link) && (!isResumeLink || Boolean(link.url.trim())) && !uploadingResume;

  const handleResumeUpload = useCallback(
    async (file: File | null) => {
      if (!file || !link) return;
      setResumeUploadError(null);
      if (file.size > 5 * 1024 * 1024) {
        setResumeUploadError("Resume PDF must be 5 MB or smaller.");
        return;
      }
      if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
        setResumeUploadError("Upload a PDF resume.");
        return;
      }
      setUploadingResume(true);
      try {
        const uploaded = await onUploadResume(file);
        const nextLabel =
          link.label.trim() && link.label.trim() !== "Resume"
            ? link.label
            : "Resume";
        onChange({
          ...link,
          label: nextLabel,
          url: uploaded.url,
          linkType: "resume",
          icon: "file",
          visible: true,
        });
      } catch (error) {
        setResumeUploadError(
          error instanceof Error ? error.message : "Unable to upload resume."
        );
      } finally {
        setUploadingResume(false);
      }
    },
    [link, onChange, onUploadResume]
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {mode === "add"
              ? isResumeLink
                ? "Add resume"
                : "Add link"
              : isResumeLink
                ? "Edit resume"
                : "Edit link"}
          </DialogTitle>
          <DialogDescription>
            {isResumeLink
              ? "Upload a PDF resume up to 5 MB."
              : mode === "add"
              ? "Add the link details."
              : "Changes autosave while you edit."}
          </DialogDescription>
        </DialogHeader>
        {link ? (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="link-label">Label</Label>
              <Input
                id="link-label"
                value={link.label}
                placeholder="New Link"
                className="text-left"
                autoComplete="off"
                enterKeyHint="next"
                onChange={(event) =>
                  onChange({ ...link, label: event.target.value })
                }
              />
            </div>
            {isResumeLink ? (
              <div className="space-y-2">
                <Label htmlFor="resume-pdf">Resume PDF</Label>
                <label className="flex min-h-24 cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border/70 bg-muted/20 px-4 py-4 text-center text-sm transition hover:bg-muted/35">
                  <Upload className="h-5 w-5 text-muted-foreground" />
                  <span className="font-medium text-foreground">
                    {uploadingResume ? "Uploading..." : link.url ? "Replace PDF" : "Upload PDF"}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    PDF only, 5 MB max
                  </span>
                  <input
                    id="resume-pdf"
                    type="file"
                    accept="application/pdf,.pdf"
                    className="sr-only"
                    disabled={uploadingResume}
                    onChange={(event) => {
                      const file = event.target.files?.[0] ?? null;
                      void handleResumeUpload(file);
                      event.target.value = "";
                    }}
                  />
                </label>
                {link.url ? (
                  <p className="truncate text-xs text-muted-foreground">
                    Uploaded: {link.url}
                  </p>
                ) : null}
                {resumeUploadError ? (
                  <p className="text-xs text-destructive">{resumeUploadError}</p>
                ) : null}
              </div>
            ) : (
              <div className="space-y-2">
                <Label htmlFor="link-url">URL</Label>
                <LinkUrlInput
                  id="link-url"
                  value={link.url}
                  placeholder="www.website.com"
                  enterKeyHint={mode === "add" ? "done" : "next"}
                  onValueChange={(url) => onChange({ ...link, url })}
                  onKeyDown={(event) => {
                    if (mode !== "add" || event.key !== "Enter" || event.nativeEvent.isComposing) {
                      return;
                    }
                    if (!getEditableLinkValue(link.url).trim()) return;
                    event.preventDefault();
                    onSave();
                  }}
                />
              </div>
            )}
            <div className="space-y-3 rounded-xl border border-border/60 px-3 py-3">
              <label className="flex items-center justify-between gap-3">
                <span className="space-y-0.5">
                  <span className="block text-sm font-medium text-foreground">
                    Visible on public profile
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    Hides this link from your public page when turned off.
                  </span>
                </span>
                <Switch
                  id="link-visible"
                  checked={link.visible}
                  onCheckedChange={(value) =>
                    onChange({
                      ...link,
                      visible: Boolean(value),
                      isOverride: value ? link.isOverride : false,
                    })
                  }
                />
              </label>
              <div className="flex items-center justify-between gap-3">
                <span className="space-y-0.5">
                  <span className="block text-sm font-medium text-foreground">
                    Direct-to-link mode
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    Linket scans open this URL directly instead of your public profile.
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    Consequence: this bypasses your profile page for Linket scans.
                  </span>
                  {hasOverrideLink && !link.isOverride ? (
                    <span className="block text-xs text-muted-foreground">
                      Turning this on replaces your current Direct-to-link selection.
                    </span>
                  ) : null}
                </span>
                <DirectLinkStarToggle
                  id="link-override"
                  checked={link.isOverride}
                  onPressedChange={onOverrideToggle}
                  aria-label={
                    link.isOverride
                      ? "Disable Direct-to-link mode"
                      : "Enable Direct-to-link mode"
                  }
                />
              </div>
            </div>
          </div>
        ) : null}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={onSave} disabled={!canSave}>
            {mode === "add" ? (isResumeLink ? "Add resume" : "Add link") : "Done"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function formatShortDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Just now";
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function buildFallbackDraft(
  userId: string | null,
  accountHandle: string | null,
  theme: ThemeName
): ProfileDraft | null {
  if (!userId) return null;
  const now = new Date().toISOString();
  const fallbackHandle = accountHandle ?? `user-${userId.slice(0, 8)}`;
  return {
    id: "",
    name: "",
    handle: fallbackHandle,
    headline: "",
    headerImageUrl: null,
    headerImageUpdatedAt: null,
    headerImageOriginalFileName: null,
    logoUrl: null,
    logoUpdatedAt: null,
    logoOriginalFileName: null,
    logoShape: "circle",
    logoBackgroundWhite: false,
    links: [createLink()],
    theme,
    active: true,
    updatedAt: now,
  };
}

function createLink(): LinkItem {
  const base = ICON_OPTIONS[0];
  return {
    id: `link-${cryptoRandom()}`,
    label: "",
    url: "",
    linkType: "link",
    icon: base.value,
    color: base.color,
    visible: true,
    isOverride: false,
    clicks: 0,
  };
}

function createResumeLink(): LinkItem {
  const base = ICON_OPTIONS.find((option) => option.value === "file") ?? ICON_OPTIONS[0];
  return {
    id: `link-${cryptoRandom()}`,
    label: "Resume",
    url: "",
    linkType: "resume",
    icon: base.value,
    color: base.color,
    visible: true,
    isOverride: false,
    clicks: 0,
  };
}

function guessIcon(title: string, url: string): LinkIconKey {
  const raw = `${title} ${url}`.toLowerCase();
  if (raw.includes("resume") || raw.endsWith(".pdf")) return "file";
  if (raw.includes("instagram")) return "instagram";
  if (raw.includes("twitter") || raw.includes("x.com")) return "twitter";
  if (raw.includes("website") || raw.includes("http")) return "globe";
  return "link";
}

function mapProfile(record: ProfileWithLinks): ProfileDraft {
  const links: LinkItem[] = (record.links ?? []).map((link, index) => {
    const linkType: LinkItem["linkType"] =
      link.link_type === "resume" ? "resume" : "link";
    const icon = linkType === "resume" ? "file" : guessIcon(link.title, link.url);
    const fallbackColor =
      ICON_OPTIONS.find((option) => option.value === icon)?.color ??
      LINK_COLORS[index % LINK_COLORS.length];
    return {
      id: link.id ?? `link-${index}`,
      label: link.title,
      url: link.url,
      linkType,
      icon,
      color: fallbackColor,
      visible: link.is_active ?? true,
      isOverride: link.is_override ?? false,
      clicks: link.click_count ?? 0,
    };
  });
  return {
    id: record.id,
    name: record.name,
    handle: record.handle,
    headline: record.headline ?? "",
    headerImageUrl: record.header_image_url ?? null,
    headerImageUpdatedAt: record.header_image_updated_at ?? null,
    headerImageOriginalFileName: record.header_image_original_file_name ?? null,
    logoUrl: record.logo_url ?? null,
    logoUpdatedAt: record.logo_updated_at ?? null,
    logoOriginalFileName: record.logo_original_file_name ?? null,
    logoShape: record.logo_shape === "rect" ? "rect" : "circle",
    logoBackgroundWhite: record.logo_bg_white ?? false,
    links,
    theme: normalizeThemeName(record.theme, "autumn"),
    active: record.is_active,
    updatedAt: record.updated_at,
  };
}

function mergeProfileUi(next: ProfileDraft, previous: ProfileDraft | null) {
  if (!previous) return next;
  const uiById = new Map(
    previous.links.map((link) => [
      link.id,
      { icon: link.icon, color: link.color },
    ])
  );
  return {
    ...next,
    links: next.links.map((link) => ({
      ...link,
      ...(uiById.get(link.id) ?? {}),
    })),
  };
}

function normalizeDraftForCompare(draft: ProfileDraft) {
  return {
    id: draft.id,
    name: draft.name,
    handle: draft.handle,
    headline: draft.headline,
    headerImageUrl: draft.headerImageUrl,
    headerImageUpdatedAt: draft.headerImageUpdatedAt,
    headerImageOriginalFileName: draft.headerImageOriginalFileName,
    logoUrl: draft.logoUrl,
    logoUpdatedAt: draft.logoUpdatedAt,
    logoOriginalFileName: draft.logoOriginalFileName,
    logoShape: draft.logoShape,
    logoBackgroundWhite: draft.logoBackgroundWhite,
    theme: draft.theme,
    active: draft.active,
    links: draft.links.map((link) => ({
      id: link.id,
      label: link.label,
      url: link.url,
      linkType: link.linkType,
      icon: link.icon,
      color: link.color,
      visible: link.visible,
      isOverride: link.isOverride,
      clicks: link.clicks ?? 0,
    })),
  };
}

function cryptoRandom() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return (
      (crypto as Crypto & { randomUUID?: () => string }).randomUUID?.() ??
      Math.random().toString(36).slice(2, 10)
    );
  }
  return Math.random().toString(36).slice(2, 10);
}

function normalizeLinkUrl(value: string) {
  return normalizePublicLinkUrlInput(value);
}

function getEditableLinkValue(value: string) {
  const stripped = stripLinkScheme(value).trim();
  if (!stripped) return "";
  const match = stripped.match(/^([^/?#]+)(.*)$/);
  if (!match) return stripped;
  const [, host, suffix] = match;
  if (!shouldAddDefaultWwwHostname(host)) {
    return stripped;
  }
  return `www.${host}${suffix}`;
}

function normalizeEditableLinkUrl(value: string) {
  return normalizeLinkUrl(getEditableLinkValue(value));
}

function stripLinkScheme(value: string) {
  return value.replace(/^https?:\/\//i, "");
}

function insertAt<T>(items: T[], item: T, index: number) {
  const next = items.slice();
  next.splice(index, 0, item);
  return next;
}

function requestFocus(id: string) {
  if (!id) return;
  requestAnimationFrame(() => {
    const element = document.getElementById(id);
    if (element && "focus" in element) {
      (element as HTMLElement).focus();
    }
  });
}

function isTextInput(target: HTMLElement) {
  if (target.tagName === "TEXTAREA") return true;
  if (target.tagName !== "INPUT") return false;
  const input = target as HTMLInputElement;
  const type = input.type?.toLowerCase();
  return (
    type !== "checkbox" &&
    type !== "radio" &&
    type !== "button" &&
    type !== "submit"
  );
}
