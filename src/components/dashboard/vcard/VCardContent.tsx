"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type FocusEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { UPLOADER_ACTION_BUTTON_CLASS } from "@/components/dashboard/uploaderActionButtonStyles";
import { supabase } from "@/lib/supabase";
import { confirmRemove } from "@/lib/confirm-remove";
import { isMockupPhotoValue, sanitizeVCardPhotoData } from "@/lib/vcard/photo";

const OUTPUT_SIZE = 256;
const MIN_ZOOM = 1;
const MAX_ZOOM = 3;
const ZOOM_STEP = 0.01;

type VCardFields = {
  fullName: string;
  title: string;
  email: string;
  phone: string;
  company: string;
  addressLine1: string;
  addressLine2: string;
  addressCity: string;
  addressRegion: string;
  addressPostal: string;
  addressCountry: string;
  note: string;
  photoData: string | null;
  photoName: string | null;
  photoRemoved: boolean;
};

type VCardStatusPayload = {
  status: "idle" | "saving" | "saved" | "error";
  isDirty: boolean;
  error: string | null;
  lastSavedAt: string | null;
};

type VCardDraftCache = {
  fields: VCardFields;
  lastSaved: VCardFields | null;
  updatedAt: string;
};

const VCARD_DRAFT_STORAGE_PREFIX = "linket:vcard:draft";

function hasVCardContent(fields: VCardFields) {
  return Boolean(
    fields.fullName ||
      fields.title ||
      fields.email ||
      fields.phone ||
      fields.company ||
      fields.addressLine1 ||
      fields.addressLine2 ||
      fields.addressCity ||
      fields.addressRegion ||
      fields.addressPostal ||
      fields.addressCountry ||
      fields.note ||
      fields.photoData ||
      fields.photoName
  );
}

function sanitizeVCardFields(fields: VCardFields): VCardFields {
  const photoData = sanitizeVCardPhotoData(fields.photoData);
  return {
    ...fields,
    photoData,
    photoName: photoData ? fields.photoName : null,
    photoRemoved: photoData ? false : Boolean(fields.photoRemoved),
  };
}

function hasUnsyncedVCardDraft(draft: VCardDraftCache | null) {
  if (!draft) return false;
  const fields = sanitizeVCardFields(draft.fields);
  const lastSaved = draft.lastSaved ? sanitizeVCardFields(draft.lastSaved) : null;
  return lastSaved
    ? !areVCardFieldsEqual(fields, lastSaved)
    : hasVCardContent(fields);
}

function getVCardDraftStorageKey(userId: string) {
  return `${VCARD_DRAFT_STORAGE_PREFIX}:${userId}`;
}

function readVCardDraftCache(userId: string): VCardDraftCache | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(getVCardDraftStorageKey(userId));
    if (!raw) return null;
    return JSON.parse(raw) as VCardDraftCache;
  } catch {
    return null;
  }
}

function writeVCardDraftCache(userId: string, cache: VCardDraftCache) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      getVCardDraftStorageKey(userId),
      JSON.stringify(cache)
    );
  } catch {
    // Ignore storage quota and private mode errors. Saving to the server is still attempted.
  }
}

function clearVCardDraftCache(userId: string) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(getVCardDraftStorageKey(userId));
  } catch {
    // Ignore storage errors.
  }
}

export default function VCardContent({
  variant = "card",
  onFieldsChange,
  onStatusChange,
  idPrefix,
  defaultPhotoUrl,
  defaultPhotoName,
}: {
  variant?: "card" | "embedded";
  onFieldsChange?: (fields: VCardFields) => void;
  onStatusChange?: (payload: VCardStatusPayload) => void;
  idPrefix?: string;
  defaultPhotoUrl?: string | null;
  defaultPhotoName?: string | null;
}) {
  const [fields, setFields] = useState<VCardFields>({
    fullName: "",
    title: "",
    email: "",
    phone: "",
    company: "",
    addressLine1: "",
    addressLine2: "",
    addressCity: "",
    addressRegion: "",
    addressPostal: "",
    addressCountry: "",
    note: "",
    photoData: null,
    photoName: null,
    photoRemoved: false,
  });
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [savedLocally, setSavedLocally] = useState(false);
  const [restoredLocalDraft, setRestoredLocalDraft] = useState(false);
  const [isOnline, setIsOnline] = useState(
    typeof navigator === "undefined" ? true : navigator.onLine
  );
  const lastSavedRef = useRef<VCardFields | null>(null);
  const initialisedRef = useRef(false);
  const latestFieldsRef = useRef(fields);
  const persistPromiseRef = useRef<Promise<VCardFields | null> | null>(null);
  const queuedPersistRef = useRef(false);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const photoFileInputRef = useRef<HTMLInputElement | null>(null);
  const pointerPosition = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const [photoSourceUrl, setPhotoSourceUrl] = useState<string | null>(null);
  const [photoSourceName, setPhotoSourceName] = useState<string | null>(null);
  const [photoRemoved, setPhotoRemoved] = useState(false);
  const [imageMeta, setImageMeta] = useState<{ width: number; height: number } | null>(null);
  const [previewReady, setPreviewReady] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const previewSize = 240;
  const cropSize = 200;
  const cropHalf = cropSize / 2;

  useEffect(() => {
    latestFieldsRef.current = fields;
  }, [fields]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  function updateField(key: keyof VCardFields, value: string) {
    setFields((prev) => ({ ...prev, [key]: value }));
  }

  const baseScale = useMemo(() => {
    if (!imageMeta) return 1;
    return Math.max(cropSize / imageMeta.width, cropSize / imageMeta.height);
  }, [imageMeta, cropSize]);

  const inheritedPhotoUrl = useMemo(
    () =>
      defaultPhotoUrl && !isMockupPhotoValue(defaultPhotoUrl)
        ? defaultPhotoUrl
        : null,
    [defaultPhotoUrl]
  );

  const previewScale = baseScale * zoom;

  const clampOffset = useCallback(
    (next: { x: number; y: number }, nextZoom = zoom, meta = imageMeta): { x: number; y: number } => {
      if (!meta) return next;
      const scale = baseScale * nextZoom;
      const halfWidth = (meta.width * scale) / 2;
      const halfHeight = (meta.height * scale) / 2;
      const limitX = Math.max(0, halfWidth - cropHalf);
      const limitY = Math.max(0, halfHeight - cropHalf);
      return {
        x: Math.max(-limitX, Math.min(limitX, next.x)),
        y: Math.max(-limitY, Math.min(limitY, next.y)),
      };
    },
    [baseScale, zoom, imageMeta, cropHalf]
  );

  const resetPhotoEditor = useCallback(() => {
    if (photoSourceUrl?.startsWith("blob:")) {
      URL.revokeObjectURL(photoSourceUrl);
    }
    if (photoFileInputRef.current) {
      photoFileInputRef.current.value = "";
    }
    setPhotoSourceUrl(null);
    setPhotoSourceName(null);
    setImageMeta(null);
    setPreviewReady(false);
    setZoom(1);
    setOffset({ x: 0, y: 0 });
    setIsDragging(false);
  }, [photoSourceUrl]);

  function handlePhotoChange(file: File | null) {
    resetPhotoEditor();
    if (!file) return;
    setPhotoSourceUrl(URL.createObjectURL(file));
    setPhotoSourceName(file.name);
  }

  const handlePointerDown = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (!previewReady || event.button !== 0) return;
    setIsDragging(true);
    pointerPosition.current = { x: event.clientX, y: event.clientY };
    event.currentTarget.setPointerCapture(event.pointerId);
  }, [previewReady]);

  const handlePointerMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (!isDragging) return;
      event.preventDefault();
      const deltaX = event.clientX - pointerPosition.current.x;
      const deltaY = event.clientY - pointerPosition.current.y;
      pointerPosition.current = { x: event.clientX, y: event.clientY };
      setOffset((prev) => clampOffset({ x: prev.x + deltaX, y: prev.y + deltaY }));
    },
    [isDragging, clampOffset]
  );

  const handlePointerUp = useCallback((event?: ReactPointerEvent<HTMLDivElement>) => {
    if (event && event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    setIsDragging(false);
  }, []);

  useEffect(() => {
    if (!photoSourceUrl) return;
    setPreviewReady(false);
    let cancelled = false;
    const img = new Image();
    img.onload = () => {
      if (cancelled) return;
      setImageMeta({ width: img.naturalWidth, height: img.naturalHeight });
      setPreviewReady(true);
      setOffset({ x: 0, y: 0 });
      setZoom(1);
    };
    img.onerror = () => {
      if (cancelled) return;
      resetPhotoEditor();
    };
    img.src = photoSourceUrl;
    return () => {
      cancelled = true;
    };
  }, [photoSourceUrl, resetPhotoEditor]);

  useEffect(() => {
    setOffset((current) => clampOffset(current));
  }, [zoom, clampOffset]);

  useEffect(() => {
    let active = true;
    supabase.auth
      .getUser()
      .then(({ data }) => {
        if (!active) return;
        const user = data.user;
        setUserId(user?.id ?? null);
        if (!user) {
          setLoading(false);
          setStatus("error");
          setError("Sign in to edit your vCard.");
        }
      })
      .catch(() => {
        if (!active) return;
        setUserId(null);
        setLoading(false);
        setStatus("error");
        setError("Unable to verify session.");
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setStatus("idle");

    (async () => {
      try {
        const response = await fetch(`/api/vcard/profile?userId=${encodeURIComponent(userId)}`, { cache: "no-store" });
        if (!response.ok) {
          const info = await response.json().catch(() => ({}));
          throw new Error(info?.error || `Unable to load vCard (${response.status})`);
        }
        const payload = (await response.json()) as { fields: VCardFields };
        if (cancelled) return;
        const localDraft = readVCardDraftCache(userId);
        const localHasUnsyncedChanges = hasUnsyncedVCardDraft(localDraft);
        const nextFields = sanitizeVCardFields(
          localHasUnsyncedChanges && localDraft ? localDraft.fields : payload.fields
        );
        const nextSaved =
          localHasUnsyncedChanges && localDraft
            ? sanitizeVCardFields(localDraft.lastSaved ?? payload.fields)
            : sanitizeVCardFields(payload.fields);

        setFields(nextFields);
        setPhotoPreview(nextFields.photoData);
        setPhotoRemoved(nextFields.photoRemoved);
        lastSavedRef.current = nextSaved;
        initialisedRef.current = true;
        setSavedLocally(localHasUnsyncedChanges);
        setRestoredLocalDraft(localHasUnsyncedChanges);
        setStatus(localHasUnsyncedChanges ? "idle" : "saved");
        setLastSavedAt(new Date().toISOString());
        if (!localHasUnsyncedChanges) {
          clearVCardDraftCache(userId);
        }
      } catch (err) {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : "Unable to load vCard";
        const localDraft = readVCardDraftCache(userId);
        const localHasUnsyncedChanges = hasUnsyncedVCardDraft(localDraft);

        if (localDraft) {
          const safeFields = sanitizeVCardFields(localDraft.fields);
          setFields(safeFields);
          setPhotoPreview(safeFields.photoData);
          setPhotoRemoved(safeFields.photoRemoved);
          lastSavedRef.current = localDraft.lastSaved
            ? sanitizeVCardFields(localDraft.lastSaved)
            : null;
          setSavedLocally(localHasUnsyncedChanges);
          setRestoredLocalDraft(localHasUnsyncedChanges);
        }

        setError(message);
        setStatus("error");
        initialisedRef.current = true;
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [userId]);

  const persist = useCallback(
    async (current: VCardFields) => {
      if (!userId) return null;
      if (persistPromiseRef.current) {
        queuedPersistRef.current = true;
        return persistPromiseRef.current;
      }

      const request = (async () => {
        try {
          setStatus("saving");
          setError(null);
          const safeCurrent = sanitizeVCardFields(current);
          const response = await fetch("/api/vcard/profile", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ userId, fields: safeCurrent }),
          });
          if (!response.ok) {
            const info = await response.json().catch(() => ({}));
            throw new Error(info?.error || `Unable to save vCard (${response.status})`);
          }
          const payload = (await response.json()) as { fields: VCardFields };
          const savedFields = sanitizeVCardFields(payload.fields);
          const latestFields = sanitizeVCardFields(latestFieldsRef.current);
          if (!areVCardFieldsEqual(latestFieldsRef.current, latestFields)) {
            latestFieldsRef.current = latestFields;
            setFields(latestFields);
            setPhotoPreview(latestFields.photoData);
            setPhotoRemoved(latestFields.photoRemoved);
          }

          lastSavedRef.current = savedFields;
          if (
            areVCardFieldsEqual(latestFields, safeCurrent) &&
            !areVCardFieldsEqual(savedFields, safeCurrent)
          ) {
            setFields(savedFields);
            setPhotoPreview(savedFields.photoData);
            setPhotoRemoved(savedFields.photoRemoved);
          }

          const stillDirty = !areVCardFieldsEqual(latestFields, savedFields);
          if (stillDirty) {
            queuedPersistRef.current = true;
            setSavedLocally(true);
            writeVCardDraftCache(userId, {
              fields: latestFields,
              lastSaved: savedFields,
              updatedAt: new Date().toISOString(),
            });
            setStatus("saving");
          } else {
            clearVCardDraftCache(userId);
            setSavedLocally(false);
            setRestoredLocalDraft(false);
            setStatus("saved");
            setLastSavedAt(new Date().toISOString());
          }

          return savedFields;
        } catch (err) {
          const message = err instanceof Error ? err.message : "Unable to save vCard";
          setStatus("error");
          setError(message);
          setSavedLocally(true);
          writeVCardDraftCache(userId, {
            fields: sanitizeVCardFields(latestFieldsRef.current),
            lastSaved: lastSavedRef.current
              ? sanitizeVCardFields(lastSavedRef.current)
              : null,
            updatedAt: new Date().toISOString(),
          });
          return null;
        }
      })();

      persistPromiseRef.current = request;
      try {
        return await request;
      } finally {
        persistPromiseRef.current = null;
        if (queuedPersistRef.current) {
          queuedPersistRef.current = false;
          void persist(latestFieldsRef.current);
        }
      }
    },
    [userId]
  );

  const handlePhotoRemove = useCallback(() => {
    if (!confirmRemove("Are you sure you want to remove this profile photo?")) {
      return;
    }
    resetPhotoEditor();
    const nextFields = {
      ...latestFieldsRef.current,
      photoData: null,
      photoName: null,
      photoRemoved: true,
    };
    setFields(nextFields);
    setPhotoPreview(null);
    setPhotoRemoved(true);
    if (userId && initialisedRef.current && !loading && status !== "saving") {
      void persist(nextFields);
    }
  }, [resetPhotoEditor, userId, loading, status, persist]);

  const handlePhotoReCrop = useCallback(() => {
    const sourceUrl = fields.photoData ?? inheritedPhotoUrl;
    if (!sourceUrl) return;
    resetPhotoEditor();
    setPhotoSourceUrl(sourceUrl);
    setPhotoSourceName(fields.photoName ?? defaultPhotoName ?? "profile-photo.jpg");
  }, [defaultPhotoName, fields.photoData, fields.photoName, inheritedPhotoUrl, resetPhotoEditor]);

  const handlePhotoApply = useCallback(async () => {
    if (!photoSourceUrl || !imageMeta || !previewReady) return;
    const cropped = await cropToDataUrl({
      srcUrl: photoSourceUrl,
      outputSize: OUTPUT_SIZE,
      cropSize,
      baseScale,
      zoom,
      offset,
    });
    if (!cropped) return;
    const name = photoSourceName ?? fields.photoName ?? "profile-photo.jpg";
    const nextFields = {
      ...latestFieldsRef.current,
      photoData: cropped,
      photoName: name,
      photoRemoved: false,
    };
    setFields(nextFields);
    setPhotoPreview(cropped);
    setPhotoRemoved(false);
    resetPhotoEditor();
    if (userId && initialisedRef.current && !loading && status !== "saving") {
      void persist(nextFields);
    }
  }, [
    photoSourceUrl,
    imageMeta,
    previewReady,
    cropSize,
    baseScale,
    zoom,
    offset,
    photoSourceName,
    fields.photoName,
    userId,
    loading,
    status,
    persist,
    resetPhotoEditor,
  ]);

  const isDirty = useMemo(() => {
    if (!lastSavedRef.current) {
      return hasVCardContent(fields);
    }
    return !areVCardFieldsEqual(lastSavedRef.current, fields);
  }, [fields]);

  useEffect(() => {
    if (!userId || !initialisedRef.current) return;
    const hasUnsyncedChanges = lastSavedRef.current
      ? !areVCardFieldsEqual(lastSavedRef.current, fields)
      : hasVCardContent(fields);

    if (!hasUnsyncedChanges) {
      clearVCardDraftCache(userId);
      setSavedLocally(false);
      setRestoredLocalDraft(false);
      return;
    }

    writeVCardDraftCache(userId, {
      fields: sanitizeVCardFields(fields),
      lastSaved: lastSavedRef.current
        ? sanitizeVCardFields(lastSavedRef.current)
        : null,
      updatedAt: new Date().toISOString(),
    });
    setSavedLocally(true);
  }, [fields, userId]);

  useEffect(() => {
    if (!isDirty || !persistPromiseRef.current) return;
    queuedPersistRef.current = true;
  }, [fields, isDirty]);

  useEffect(() => {
    if (
      !userId ||
      !initialisedRef.current ||
      loading ||
      status === "saving" ||
      !isDirty ||
      photoSourceUrl
    ) {
      if (autosaveTimerRef.current) {
        clearTimeout(autosaveTimerRef.current);
        autosaveTimerRef.current = null;
      }
      return;
    }
    if (autosaveTimerRef.current) {
      clearTimeout(autosaveTimerRef.current);
    }
    autosaveTimerRef.current = setTimeout(() => {
      autosaveTimerRef.current = null;
      void persist(latestFieldsRef.current);
    }, 1000);
    return () => {
      if (autosaveTimerRef.current) {
        clearTimeout(autosaveTimerRef.current);
        autosaveTimerRef.current = null;
      }
    };
  }, [fields, isDirty, loading, persist, photoSourceUrl, status, userId]);

  useEffect(() => {
    if (
      !userId ||
      !initialisedRef.current ||
      loading ||
      status === "saving" ||
      status !== "error" ||
      !isDirty
    ) {
      if (retryTimerRef.current) {
        clearTimeout(retryTimerRef.current);
        retryTimerRef.current = null;
      }
      return;
    }
    if (retryTimerRef.current) {
      clearTimeout(retryTimerRef.current);
    }
    retryTimerRef.current = setTimeout(() => {
      retryTimerRef.current = null;
      void persist(latestFieldsRef.current);
    }, 4000);
    return () => {
      if (retryTimerRef.current) {
        clearTimeout(retryTimerRef.current);
        retryTimerRef.current = null;
      }
    };
  }, [isDirty, loading, persist, status, userId]);

  const handleFieldBlur = useCallback(() => {
    if (!userId) return;
    if (!initialisedRef.current || loading) return;
    if (!isDirty) return;
    if (status === "saving") return;
    void persist(fields);
  }, [fields, isDirty, loading, persist, status, userId]);

  const handleContainerBlur = useCallback(
    (event: FocusEvent<HTMLDivElement>) => {
      const container = contentRef.current;
      if (!container) return;
      const nextTarget = event.relatedTarget as Node | null;
      if (nextTarget && container.contains(nextTarget)) return;
      if (!userId || loading || status === "saving" || !initialisedRef.current) return;
      if (!isDirty) return;
      void persist(latestFieldsRef.current);
    },
    [isDirty, loading, persist, status, userId]
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    const handleSaveRequest = () => {
      if (!userId || loading || status === "saving" || !initialisedRef.current) return;
      if (!isDirty) return;
      void persist(latestFieldsRef.current);
    };
    window.addEventListener("linket:save-request", handleSaveRequest);
    return () => window.removeEventListener("linket:save-request", handleSaveRequest);
  }, [isDirty, loading, persist, status, userId]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const handleOnlineSync = () => {
      if (!userId || loading || !initialisedRef.current || photoSourceUrl) return;
      const draft = readVCardDraftCache(userId);
      const hasUnsyncedChanges = hasUnsyncedVCardDraft(draft);
      if (!hasUnsyncedChanges) return;
      void persist(latestFieldsRef.current);
    };
    window.addEventListener("online", handleOnlineSync);
    return () => window.removeEventListener("online", handleOnlineSync);
  }, [loading, persist, photoSourceUrl, userId]);

  useEffect(() => {
    onFieldsChange?.(fields);
  }, [fields, onFieldsChange]);

  useEffect(() => {
    onStatusChange?.({ status, isDirty, error, lastSavedAt });
  }, [status, isDirty, error, lastSavedAt, onStatusChange]);

  const statusMessage = useMemo(() => {
    if (loading) return "Loading...";
    if (status === "saving") {
      return savedLocally
        ? "Saved on this phone. Syncing..."
        : "Saving changes...";
    }
    if (status === "error") {
      if (savedLocally) {
        return isOnline
          ? "Saved on this phone. Retrying sync automatically..."
          : "Saved on this phone. Waiting for connection...";
      }
      return `${error ?? "Save failed"} Retrying automatically...`;
    }
    if (savedLocally && isDirty) {
      return restoredLocalDraft
        ? "Local draft restored. Syncing..."
        : isOnline
          ? "Saved on this phone. Syncing..."
          : "Saved on this phone. Waiting for connection...";
    }
    if (isDirty) return "Changes pending";
    return "All changes saved";
  }, [error, isDirty, isOnline, loading, restoredLocalDraft, savedLocally, status]);

  const inheritedPhotoPreview =
    !photoRemoved && !fields.photoData && !photoSourceUrl ? inheritedPhotoUrl : null;
  const visiblePhotoPreview = photoPreview ?? inheritedPhotoPreview;
  const visiblePhotoName =
    photoSourceName ??
    fields.photoName ??
    (inheritedPhotoPreview ? defaultPhotoName ?? "Profile photo" : "No image selected");

  useEffect(() => {
    return () => {
      if (autosaveTimerRef.current) {
        clearTimeout(autosaveTimerRef.current);
      }
      if (retryTimerRef.current) {
        clearTimeout(retryTimerRef.current);
      }
    };
  }, []);

  const inputsDisabled = loading || !userId;

  if (loading) {
    return (
      <Card
        className={
          variant === "embedded"
            ? "dashboard-skeleton rounded-2xl border border-border/60 bg-background/70 shadow-sm"
            : "dashboard-skeleton rounded-3xl border bg-card/80 shadow-sm"
        }
      >
        <CardHeader>
          <CardTitle className="text-lg font-semibold">Contact Details</CardTitle>
          <p className="text-sm text-muted-foreground">Loading contact details...</p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-3">
            <div className="h-10 w-3/4 animate-pulse rounded-xl bg-muted/60" data-skeleton />
            <div className="h-10 w-2/3 animate-pulse rounded-xl bg-muted/60" data-skeleton />
            <div className="h-10 w-5/6 animate-pulse rounded-xl bg-muted/60" data-skeleton />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="h-10 animate-pulse rounded-xl bg-muted/60" data-skeleton />
            <div className="h-10 animate-pulse rounded-xl bg-muted/60" data-skeleton />
            <div className="h-10 animate-pulse rounded-xl bg-muted/60" data-skeleton />
            <div className="h-10 animate-pulse rounded-xl bg-muted/60" data-skeleton />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="h-20 animate-pulse rounded-xl bg-muted/60" data-skeleton />
            <div className="h-20 animate-pulse rounded-xl bg-muted/60" data-skeleton />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card
      className={
        variant === "embedded"
          ? "rounded-2xl border border-border/60 bg-background/70 shadow-sm"
          : "rounded-3xl border bg-card/80 shadow-sm"
      }
    >
      <CardHeader>
        <CardTitle className="text-lg font-semibold">Contact Details</CardTitle>
        <p className="text-sm text-muted-foreground">
          Fill in the contact fields that appear when someone taps your NFC tag.
        </p>
      </CardHeader>
      <CardContent
        className="space-y-4"
        ref={contentRef}
        onBlurCapture={handleContainerBlur}
      >
        <section className="flex flex-col gap-3 rounded-2xl border border-dashed border-muted/70 p-3 sm:gap-4 sm:p-4">
          {!photoSourceUrl ? (
            <div className="flex w-full flex-col items-center gap-3 sm:flex-row sm:items-center sm:gap-4">
              <div className="h-24 w-24 overflow-hidden rounded-full border bg-muted sm:h-20 sm:w-20">
                {visiblePhotoPreview ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={visiblePhotoPreview} alt="Selected profile" className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-xs text-muted-foreground">150x150</div>
                )}
              </div>
              <div className="min-w-0 w-full flex-1 space-y-2 text-center sm:text-left">
                <Label htmlFor="profile-photo" className="block text-center sm:text-left">Profile photo</Label>
                <input
                  ref={photoFileInputRef}
                  id="profile-photo"
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="sr-only"
                  onChange={(event) => handlePhotoChange(event.target.files?.[0] ?? null)}
                  disabled={inputsDisabled}
                />
                <div className="flex w-full min-w-0 flex-col items-stretch gap-2 overflow-hidden rounded-xl border border-input bg-background/70 px-3 py-2">
                  <span
                    className="min-w-0 truncate whitespace-nowrap text-center text-sm text-muted-foreground"
                    title={visiblePhotoName}
                  >
                    {visiblePhotoName}
                  </span>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-10 w-full rounded-full"
                    onClick={() => photoFileInputRef.current?.click()}
                    disabled={inputsDisabled}
                  >
                    Choose file
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground text-center sm:text-left">
                  Crop to fit the circle. JPG/PNG/WebP.
                </p>
                <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center sm:gap-3">
                  <Button
                    type="button"
                    variant="custom"
                    size="sm"
                    className={UPLOADER_ACTION_BUTTON_CLASS}
                    onClick={handlePhotoReCrop}
                    disabled={!fields.photoData && (!inheritedPhotoUrl || photoRemoved)}
                  >
                    Re-crop
                  </Button>
                  <Button
                    type="button"
                    variant="custom"
                    size="sm"
                    className={UPLOADER_ACTION_BUTTON_CLASS}
                    onClick={handlePhotoRemove}
                    disabled={!fields.photoData && !photoSourceUrl}
                  >
                    Remove
                  </Button>
                </div>
              </div>
            </div>
          ) : null}
          {photoSourceUrl && (
            <div className="mx-auto w-full max-w-sm space-y-3">
              <div
                className="relative mx-auto flex touch-none items-center justify-center overflow-hidden rounded-2xl border bg-muted/40 cursor-grab active:cursor-grabbing"
                style={{ width: "100%", maxWidth: `${previewSize}px`, height: `${previewSize}px` }}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerLeave={handlePointerUp}
                role="application"
                aria-label="Profile photo crop preview"
              >
                {!previewReady && (
                  <div className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">
                    Loading preview...
                  </div>
                )}
                <div
                  className="pointer-events-none absolute inset-0"
                  style={{
                    transform: `translate(${offset.x}px, ${offset.y}px)`,
                  }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={photoSourceUrl}
                    alt="Crop preview"
                    className="absolute left-1/2 top-1/2 block select-none opacity-90"
                    style={{
                      width: imageMeta?.width ?? "auto",
                      height: imageMeta?.height ?? "auto",
                      maxWidth: "none",
                      maxHeight: "none",
                      transform: `translate(-50%, -50%) scale(${previewScale})`,
                      transformOrigin: "center",
                      zIndex: 1,
                    }}
                    draggable={false}
                  />
                </div>
                <div className="pointer-events-none absolute inset-0" aria-hidden>
                  <svg className="h-full w-full" viewBox={`0 0 ${previewSize} ${previewSize}`}>
                    <rect width={previewSize} height={previewSize} fill="transparent" />
                    <circle
                      cx={previewSize / 2}
                      cy={previewSize / 2}
                      r={cropSize / 2}
                      fill="none"
                      stroke="rgba(255,255,255,0.9)"
                      strokeWidth="2"
                    />
                  </svg>
                </div>
              </div>
              <div className="space-y-2">
                <label htmlFor="vcard-photo-zoom" className="flex items-center justify-center gap-1 text-xs uppercase tracking-[0.2em] text-muted-foreground">
                  Zoom:
                  <span className="text-[11px] font-semibold text-foreground">
                    {Math.round(zoom * 100)}%
                  </span>
                </label>
                <input
                  id="vcard-photo-zoom"
                  type="range"
                  min={MIN_ZOOM}
                  max={MAX_ZOOM}
                  step={ZOOM_STEP}
                  value={zoom}
                  onChange={(event) => setZoom(Number(event.target.value))}
                  className="w-full accent-primary"
                />
              </div>
              <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center sm:justify-center sm:gap-3">
                <span className="col-span-2 text-center text-xs text-muted-foreground sm:col-span-1 sm:text-left">
                  Adjust the crop, then save it.
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-10 w-full rounded-full sm:h-8 sm:w-auto"
                  onClick={resetPhotoEditor}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  size="sm"
                  className="h-10 w-full rounded-full sm:h-8 sm:w-auto"
                  onClick={() => void handlePhotoApply()}
                  disabled={!previewReady || !imageMeta || isDragging || status === "saving"}
                >
                  Save crop
                </Button>
              </div>
            </div>
          )}
        </section>
        <p className="text-xs text-muted-foreground">
          Include a friendly headshot or company logo. It will be embedded when you export your vCard.
        </p>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Full name" id="fullName" value={fields.fullName} onChange={updateField} onBlur={handleFieldBlur} required disabled={inputsDisabled} idPrefix={idPrefix} />
          <Field label="Title" id="title" value={fields.title} onChange={updateField} onBlur={handleFieldBlur} disabled={inputsDisabled} idPrefix={idPrefix} />
          <Field label="Email" id="email" type="email" value={fields.email} onChange={updateField} onBlur={handleFieldBlur} disabled={inputsDisabled} idPrefix={idPrefix} />
          <Field label="Phone" id="phone" type="tel" value={fields.phone} onChange={updateField} onBlur={handleFieldBlur} disabled={inputsDisabled} idPrefix={idPrefix} />
          <Field label="Company" id="company" value={fields.company} onChange={updateField} onBlur={handleFieldBlur} disabled={inputsDisabled} idPrefix={idPrefix} />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Address line 1" id="addressLine1" value={fields.addressLine1} onChange={updateField} onBlur={handleFieldBlur} disabled={inputsDisabled} idPrefix={idPrefix} />
          <Field label="Address line 2" id="addressLine2" value={fields.addressLine2} onChange={updateField} onBlur={handleFieldBlur} disabled={inputsDisabled} idPrefix={idPrefix} />
          <div className="grid grid-cols-2 gap-3 sm:contents">
            <Field label="City" id="addressCity" value={fields.addressCity} onChange={updateField} onBlur={handleFieldBlur} disabled={inputsDisabled} idPrefix={idPrefix} />
            <Field label="State / Region" id="addressRegion" value={fields.addressRegion} onChange={updateField} onBlur={handleFieldBlur} disabled={inputsDisabled} idPrefix={idPrefix} />
          </div>
          <Field label="Postal code" id="addressPostal" value={fields.addressPostal} onChange={updateField} onBlur={handleFieldBlur} disabled={inputsDisabled} idPrefix={idPrefix} />
          <Field label="Country" id="addressCountry" value={fields.addressCountry} onChange={updateField} onBlur={handleFieldBlur} disabled={inputsDisabled} idPrefix={idPrefix} />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Notes" id="note" component="textarea" value={fields.note} onChange={updateField} onBlur={handleFieldBlur} disabled={inputsDisabled} idPrefix={idPrefix} />
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span
            className={`text-sm ${status === "error" ? "text-destructive" : "text-muted-foreground"}${status === "saving" ? " dashboard-saving-indicator" : ""}`}
          >
            {statusMessage}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

type FieldProps = {
  label: string;
  id: keyof VCardFields;
  value: string;
  onChange: (key: keyof VCardFields, value: string) => void;
  onBlur?: () => void;
  type?: string;
  component?: "input" | "textarea";
  required?: boolean;
  disabled?: boolean;
  idPrefix?: string;
};

function Field({
  label,
  id,
  value,
  onChange,
  onBlur,
  type = "text",
  component = "input",
  required = false,
  disabled = false,
  idPrefix,
}: FieldProps) {
  function handleChange(event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) {
    const nextValue =
      id === "phone" && event.target instanceof HTMLInputElement
        ? formatPhoneNumber(event.target.value)
        : event.target.value;
    onChange(id, nextValue);
  }
  const fieldId = idPrefix ? `${idPrefix}-${id}` : id;

  return (
    <div className="space-y-2">
      <Label htmlFor={fieldId}>{label}</Label>
      {component === "textarea" ? (
        <Textarea
          id={fieldId}
          value={value}
          rows={4}
          placeholder={required ? undefined : "Optional"}
          onChange={handleChange}
          onBlur={onBlur}
          required={required}
          disabled={disabled}
        />
      ) : (
        <Input
          id={fieldId}
          value={value}
          type={type}
          placeholder={required ? undefined : "Optional"}
          onChange={handleChange}
          onBlur={onBlur}
          required={required}
          disabled={disabled}
        />
      )}
    </div>
  );
}

function areVCardFieldsEqual(a: VCardFields, b: VCardFields) {
  return (
    a.fullName === b.fullName &&
    a.title === b.title &&
    a.email === b.email &&
    a.phone === b.phone &&
    a.company === b.company &&
    a.addressLine1 === b.addressLine1 &&
    a.addressLine2 === b.addressLine2 &&
    a.addressCity === b.addressCity &&
    a.addressRegion === b.addressRegion &&
    a.addressPostal === b.addressPostal &&
    a.addressCountry === b.addressCountry &&
    a.note === b.note &&
    a.photoData === b.photoData &&
    a.photoName === b.photoName &&
    a.photoRemoved === b.photoRemoved
  );
}

function formatPhoneNumber(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 10);
  if (!digits) return "";
  if (digits.length <= 3) {
    return `(${digits}`;
  }
  if (digits.length <= 6) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  }
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)} - ${digits.slice(6)}`;
}

async function cropToDataUrl(options: {
  srcUrl: string;
  outputSize: number;
  cropSize: number;
  baseScale: number;
  zoom: number;
  offset: { x: number; y: number };
}): Promise<string | null> {
  const { srcUrl, outputSize, cropSize, baseScale, zoom, offset } = options;
  try {
    const img = await loadImage(srcUrl);
    let size = outputSize;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext("2d");
      if (!ctx) return null;

      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.clearRect(0, 0, size, size);

      const ratio = size / cropSize;
      const combinedScale = baseScale * zoom * ratio;
      ctx.translate(size / 2 + offset.x * ratio, size / 2 + offset.y * ratio);
      ctx.scale(combinedScale, combinedScale);
      ctx.translate(-img.naturalWidth / 2, -img.naturalHeight / 2);
      ctx.drawImage(img, 0, 0);

      const blob = await toJpegBlobWithLimit(canvas, 150 * 1024);
      if (blob) return await blobToDataUrl(blob);
      size = Math.max(160, Math.round(size * 0.8));
    }
    return null;
  } catch (error) {
    console.error("cropToDataUrl failed", error);
    return null;
  }
}

async function toJpegBlobWithLimit(canvas: HTMLCanvasElement, maxBytes: number): Promise<Blob | null> {
  const qualities = [0.88, 0.8, 0.72, 0.6];
  for (const quality of qualities) {
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((result) => resolve(result), "image/jpeg", quality)
    );
    if (blob && blob.size <= maxBytes) return blob;
  }
  return null;
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") resolve(reader.result);
      else reject(new Error("Failed to read image"));
    };
    reader.onerror = () => reject(new Error("Failed to read image"));
    reader.readAsDataURL(blob);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    if (/^https?:\/\//i.test(src)) {
      img.crossOrigin = "anonymous";
    }
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}
