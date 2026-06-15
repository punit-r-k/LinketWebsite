import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { UPLOADER_ACTION_BUTTON_CLASS } from "@/components/dashboard/uploaderActionButtonStyles";
import { uploadProfileLogoImage } from "@/lib/supabase-storage";
import { supabase } from "@/lib/supabase";
import { appendVersion } from "@/lib/avatar-utils";
import { confirmRemove } from "@/lib/confirm-remove";
import {
  forgetOriginalUploadFileName,
  readOriginalUploadFileName,
  rememberOriginalUploadFileName,
} from "@/lib/upload-filename-cache";
import { cn } from "@/lib/utils";

type Props = {
  userId: string;
  profileId: string;
  logoUrl: string | null;
  logoOriginalFileName?: string | null;
  logoShape: "circle" | "rect";
  logoBackgroundWhite?: boolean;
  onUploaded: (payload: {
    path: string;
    version: string;
    publicUrl: string;
    originalFileName?: string | null;
  }) => void;
  variant?: "default" | "compact";
  inputId?: string;
  controls?: ReactNode;
};

const OUTPUT_SIZE = 480;
const MIN_ZOOM = 0.1;
const MAX_ZOOM = 3;
const ZOOM_STEP = 0.01;
const RECT_GUIDE_RATIO = 2.5;

export default function ProfileLogoUploader({
  userId,
  profileId,
  logoUrl,
  logoOriginalFileName = null,
  logoShape,
  logoBackgroundWhite = false,
  onUploaded,
  variant = "compact",
  inputId,
  controls,
}: Props) {
  const isCompact = variant === "compact";
  const [isSmallScreen, setIsSmallScreen] = useState(false);
  const previewSize = isCompact
    ? isSmallScreen
      ? 150
      : 180
    : isSmallScreen
      ? 230
      : 280;
  const cropSize = Math.round(previewSize * 0.82);
  const cropHalf = cropSize / 2;
  const rectGuideHeight = cropSize / RECT_GUIDE_RATIO;
  const rectGuideWidth = Math.round(
    2 * Math.sqrt(cropHalf ** 2 - (rectGuideHeight / 2) ** 2)
  );
  const rectGuideCorner = Math.round(rectGuideHeight * 0.4);
  const rectGuideX = (previewSize - rectGuideWidth) / 2;
  const rectGuideOffset = (previewSize - rectGuideHeight) / 2;
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const pointerPosition = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  const [sourceFile, setSourceFile] = useState<File | null>(null);
  const [inputFileName, setInputFileName] = useState<string | null>(null);
  const [persistedFileName, setPersistedFileName] = useState<string | null>(
    logoOriginalFileName ?? null
  );
  const [sourceUrl, setSourceUrl] = useState<string | null>(null);
  const [imageMeta, setImageMeta] = useState<{ width: number; height: number } | null>(null);
  const [previewReady, setPreviewReady] = useState(false);
  const [latestLogoUrl, setLatestLogoUrl] = useState<string | null>(logoUrl ?? null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, setDraggingOver] = useState(false);

  const baseScale = useMemo(() => {
    if (!imageMeta) return 1;
    return Math.max(cropSize / imageMeta.width, cropSize / imageMeta.height);
  }, [imageMeta, cropSize]);

  useEffect(() => {
    setLatestLogoUrl(logoUrl ?? null);
  }, [logoUrl]);

  useEffect(() => {
    if (!latestLogoUrl) {
      setPersistedFileName(null);
      return;
    }
    const storedName = readOriginalUploadFileName(latestLogoUrl);
    if (storedName) {
      setPersistedFileName(storedName);
      return;
    }
    if (logoOriginalFileName?.trim()) {
      const originalName = logoOriginalFileName.trim();
      setPersistedFileName(originalName);
      rememberOriginalUploadFileName(latestLogoUrl, originalName);
    }
  }, [latestLogoUrl, logoOriginalFileName]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const onResize = () => setIsSmallScreen(window.innerWidth < 640);
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const resetEditor = useCallback(() => {
    setSourceUrl(null);
    setImageMeta(null);
    setPreviewReady(false);
    setZoom(1);
    setOffset({ x: 0, y: 0 });
    setIsDragging(false);
    setDraggingOver(false);
  }, []);

  const handleFile = useCallback(
    (file: File | null) => {
      resetEditor();
      if (!file) return;
      if (!file.type.startsWith("image/")) {
        setError("Please select an image file.");
        return;
      }
      setError(null);
      const selectedName = file.name || null;
      setInputFileName(selectedName);
      setPersistedFileName(selectedName);
      setSourceFile(file);
      setSourceUrl(URL.createObjectURL(file));
    },
    [resetEditor]
  );

  const handleReCrop = useCallback(async () => {
    if (!latestLogoUrl || loading) return;
    setError(null);
    try {
      const response = await fetch(latestLogoUrl);
      if (!response.ok) throw new Error("Unable to load logo");
      const blob = await response.blob();
      const originalName =
        inputFileName ??
        persistedFileName ??
        readOriginalUploadFileName(latestLogoUrl) ??
        "selected-image.webp";
      handleFile(
        new File([blob], originalName, {
          type: blob.type || "image/webp",
        })
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to load logo";
      setError(message);
    }
  }, [latestLogoUrl, loading, handleFile, inputFileName, persistedFileName]);

  const handleDrop = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      setDraggingOver(false);
      const file = event.dataTransfer.files?.[0] ?? null;
      handleFile(file);
    },
    [handleFile]
  );

  const handleDragOver = useCallback((event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDraggingOver(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setDraggingOver(false);
  }, []);

  const handlePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (!previewReady || loading) return;
      setIsDragging(true);
      pointerPosition.current = { x: event.clientX, y: event.clientY };
    },
    [loading, previewReady]
  );

  const handlePointerMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (!isDragging) return;
      const prev = pointerPosition.current;
      const next = { x: event.clientX, y: event.clientY };
      const delta = { x: next.x - prev.x, y: next.y - prev.y };
      pointerPosition.current = next;
      setOffset((current) => ({
        x: current.x + delta.x,
        y: current.y + delta.y,
      }));
    },
    [isDragging]
  );

  const handlePointerUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  const handleCropReady = useCallback(async () => {
    if (!sourceUrl) return;
    try {
      const img = await loadImage(sourceUrl);
      setImageMeta({ width: img.naturalWidth, height: img.naturalHeight });
      setPreviewReady(true);
    } catch {
      setError("Unable to load image.");
    }
  }, [sourceUrl]);

  useEffect(() => {
    if (sourceUrl) {
      void handleCropReady();
    }
    return () => {
      if (sourceUrl) URL.revokeObjectURL(sourceUrl);
    };
  }, [sourceUrl, handleCropReady]);

  const handleUpload = useCallback(async () => {
    if (!sourceFile || !imageMeta || !sourceUrl) return;
    setError(null);
    setLoading(true);
    try {
      const version = new Date().toISOString();
      const cropped = await cropToWebP(sourceFile, {
        outputSize: OUTPUT_SIZE,
        cropSize,
        baseScale,
        zoom,
        offset,
        srcUrl: sourceUrl,
      });
      const { path, publicUrl } = await uploadProfileLogoImage(
        cropped || sourceFile,
        userId,
        profileId
      );
      const originalFileName =
        inputFileName ??
        sourceFile.name ??
        persistedFileName ??
        logoOriginalFileName ??
        null;
      const { error: updErr } = await supabase
        .from("user_profiles")
        .update({
          logo_url: path,
          logo_updated_at: version,
          logo_original_file_name: originalFileName,
          updated_at: version,
        })
        .eq("id", profileId)
        .eq("user_id", userId);
      if (updErr) throw new Error(updErr.message ?? "Failed to save logo");
      const versionedUrl = appendVersion(publicUrl ?? null, version) ?? path;
      if (originalFileName) {
        rememberOriginalUploadFileName(path, originalFileName);
        rememberOriginalUploadFileName(versionedUrl, originalFileName);
        setPersistedFileName(originalFileName);
      }
      setLatestLogoUrl(versionedUrl);
      onUploaded({
        path,
        version,
        publicUrl: versionedUrl,
        originalFileName: originalFileName ?? null,
      });
      resetEditor();
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : typeof err === "object" && err !== null && "message" in err && typeof (err as { message?: unknown }).message === "string"
          ? String((err as { message?: unknown }).message)
          : "Upload failed";
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [
    sourceFile,
    sourceUrl,
    imageMeta,
    inputFileName,
    persistedFileName,
    cropSize,
    baseScale,
    zoom,
    offset,
    userId,
    profileId,
    logoOriginalFileName,
    onUploaded,
    resetEditor,
  ]);

  const handleReset = useCallback(() => {
    if (sourceUrl) {
      resetEditor();
      setSourceFile(null);
      setInputFileName(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
      const restoredName =
        latestLogoUrl
          ? readOriginalUploadFileName(latestLogoUrl) ??
            logoOriginalFileName?.trim() ??
            null
          : null;
      setPersistedFileName(restoredName);
      return;
    }
    if (latestLogoUrl) {
      void handleReCrop();
    }
  }, [
    sourceUrl,
    latestLogoUrl,
    handleReCrop,
    resetEditor,
    logoOriginalFileName,
  ]);

  const handleRemove = useCallback(async () => {
    if (loading) return;
    if (!latestLogoUrl && !sourceUrl) return;
    if (
      !(await confirmRemove({
        title: "Remove logo?",
        description:
          "The logo badge will disappear from this public profile preview and live page.",
        confirmLabel: "Remove logo",
      }))
    ) {
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const version = new Date().toISOString();
      const { error: updErr } = await supabase
        .from("user_profiles")
        .update({
          logo_url: null,
          logo_updated_at: null,
          logo_original_file_name: null,
          updated_at: version,
        })
        .eq("id", profileId)
        .eq("user_id", userId);
      if (updErr) throw new Error(updErr.message ?? "Failed to remove logo");
      forgetOriginalUploadFileName(latestLogoUrl);
      setLatestLogoUrl(null);
      resetEditor();
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
      setSourceFile(null);
      setInputFileName(null);
      setPersistedFileName(null);
      onUploaded({ path: "", version, publicUrl: "", originalFileName: null });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Unable to remove logo";
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [loading, latestLogoUrl, sourceUrl, profileId, userId, onUploaded, resetEditor]);

  const previewContainerClassName = cn(
    "relative flex items-center justify-center overflow-hidden border bg-muted/40",
    isCompact ? "rounded-2xl" : "rounded-3xl",
    !sourceUrl && "border-dashed"
  );
  const logoFrameClassName = logoShape === "circle" ? "rounded-full" : "rounded-xl";
  const logoFrameBgClassName = logoBackgroundWhite ? "bg-white" : "bg-background/80";

  const displayUrl = sourceUrl || latestLogoUrl;
  const visibleFileName = inputFileName ?? persistedFileName;
  const inputTargetId = inputId ?? "profile-logo-upload";

  if (variant === "compact") {
    const previewScale = baseScale * zoom;
    return (
      <section className="flex flex-col gap-3 p-3 sm:gap-4 sm:p-4">
        {!sourceUrl ? (
          <div className="flex w-full flex-col gap-4 sm:flex-row sm:items-center sm:gap-5">
            <div className="flex w-full justify-center sm:w-auto sm:justify-start">
              <div
                className={cn(
                  "h-32 w-32 overflow-hidden border-2 border-[var(--accent)] sm:h-28 sm:w-28",
                  logoFrameClassName,
                  logoFrameBgClassName
                )}
              >
                {displayUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={displayUrl} alt="Logo badge" className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-xs text-muted-foreground">
                    120x120
                  </div>
                )}
              </div>
            </div>
            <div className="min-w-0 flex-1 space-y-2 sm:max-w-sm">
              <Label htmlFor={inputTargetId}>Logo badge</Label>
              <input
                ref={fileInputRef}
                id={inputTargetId}
                type="file"
                accept="image/png,image/jpeg,image/jpg,image/webp"
                className="sr-only"
                onChange={(event) => handleFile(event.target.files?.[0] ?? null)}
                disabled={loading}
              />
              <div className="flex w-full min-w-0 flex-col items-stretch gap-2 overflow-hidden rounded-xl border border-input bg-background/70 px-3 py-2">
                <span
                  className="min-w-0 truncate whitespace-nowrap text-center text-sm text-muted-foreground"
                  title={visibleFileName ?? "No image selected"}
                >
                  {visibleFileName ?? "No image selected"}
                </span>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-10 w-full rounded-full"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={loading}
                >
                  Choose file
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Square logos work best. JPG/PNG/WebP.
              </p>
              <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center sm:gap-3">
                <Button
                  type="button"
                  variant="custom"
                  size="sm"
                  className={UPLOADER_ACTION_BUTTON_CLASS}
                  onClick={handleReCrop}
                  disabled={!latestLogoUrl || loading}
                >
                  Re-crop
                </Button>
                <Button
                  type="button"
                  variant="custom"
                  size="sm"
                  className={UPLOADER_ACTION_BUTTON_CLASS}
                  onClick={handleRemove}
                  disabled={!(latestLogoUrl || sourceUrl) || loading}
                >
                  Remove
                </Button>
              </div>
              {controls && (
                <div className="mt-2 border-t border-border/60 pt-2">
                  {controls}
                </div>
              )}
            </div>
          </div>
        ) : (
          controls ? (
            <div className="hidden rounded-xl border border-border/60 bg-background/30 p-3 sm:block">
              {controls}
            </div>
          ) : null
        )}

        {sourceUrl && (
          <div className="mx-auto w-full max-w-sm space-y-2">
            <div
              className="relative mx-auto flex items-center justify-center overflow-hidden rounded-2xl border bg-muted/40 cursor-grab touch-none active:cursor-grabbing"
              style={{ width: "100%", maxWidth: `${previewSize}px`, height: `${previewSize}px` }}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerLeave={handlePointerUp}
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              role="application"
              aria-label="Logo crop preview"
            >
              {!previewReady && (
                <div className="absolute inset-0 flex items-center justify-center rounded-xl bg-muted/60 text-sm text-muted-foreground">
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
                  src={sourceUrl}
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
                    {logoShape === "rect" ? (
                      <>
                        <circle
                          cx={previewSize / 2}
                          cy={previewSize / 2}
                          r={cropHalf}
                          fill="none"
                          stroke="rgba(255,255,255,0.55)"
                          strokeDasharray="4 6"
                          strokeWidth="2"
                        />
                        <rect
                          x={rectGuideX}
                          y={rectGuideOffset}
                          width={rectGuideWidth}
                          height={rectGuideHeight}
                          rx={rectGuideCorner}
                          ry={rectGuideCorner}
                          fill="none"
                          stroke="rgba(255,255,255,0.85)"
                          strokeWidth="2"
                        />
                      </>
                    ) : (
                      <circle
                        cx={previewSize / 2}
                        cy={previewSize / 2}
                        r={cropHalf}
                        fill="none"
                        stroke="rgba(255,255,255,0.85)"
                        strokeWidth="2"
                      />
                    )}
                  </svg>
                </div>
              </div>

            <div className="space-y-2">
              <label
                htmlFor="logo-zoom"
                className="flex items-center justify-center gap-1 text-xs uppercase tracking-[0.2em] text-muted-foreground"
              >
                Zoom:
                <span className="text-[11px] font-semibold text-foreground">
                  {Math.round(zoom * 100)}%
                </span>
              </label>
              <input
                id="logo-zoom"
                type="range"
                min={MIN_ZOOM}
                max={MAX_ZOOM}
                step={ZOOM_STEP}
                value={zoom}
                onChange={(event) => setZoom(Number(event.target.value))}
                disabled={loading}
                className="dashboard-zoom-slider w-full"
              />
            </div>

            <div className="flex flex-wrap items-center justify-center gap-3">
              <span
                className={cn(
                  "text-center text-xs",
                  loading
                    ? "dashboard-saving-indicator text-foreground"
                    : "text-muted-foreground"
                )}
              >
                {loading
                  ? "Uploading crop..."
                  : "Adjust the crop, then save it."}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-10 rounded-full px-4 sm:h-8"
                onClick={handleReset}
                disabled={!(sourceUrl || latestLogoUrl) || loading}
              >
                Cancel
              </Button>
              <Button
                type="button"
                size="sm"
                className="h-10 rounded-full px-4 sm:h-8"
                onClick={() => void handleUpload()}
                disabled={!sourceUrl || !previewReady || !imageMeta || loading || isDragging}
              >
                Save crop
              </Button>
            </div>
            {controls ? (
              <div className="rounded-xl border border-border/60 bg-background/30 p-3 sm:hidden">
                {controls}
              </div>
            ) : null}
          </div>
        )}
        {error && (
          <p className="rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm leading-5 text-destructive">
            <span className="font-semibold">Logo upload error: </span>
            {error} Try a different image or retry the upload. If it keeps happening, contact support@linketconnect.com.
          </p>
        )}
      </section>
    );
  }

  return (
    <Card className="rounded-2xl border border-border/70 bg-card/80 shadow-sm">
      <CardHeader className={cn(isCompact && "px-4")}>
        <CardTitle className={cn(isCompact && "text-sm")}>Logo badge</CardTitle>
      </CardHeader>
      <CardContent className={cn("flex flex-col gap-6 lg:flex-row lg:items-start", isCompact && "gap-4 px-4")}>
        <section className="flex-1 space-y-4">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            id={inputTargetId}
            className="hidden"
            onChange={(event) => handleFile(event.target.files?.[0] ?? null)}
          />
          <div
            className={previewContainerClassName}
            onDragOver={(event) => {
              event.preventDefault();
              setDraggingOver(true);
            }}
            onDragLeave={(event) => {
              event.preventDefault();
              setDraggingOver(false);
            }}
            onDrop={handleDrop}
          >
            {sourceUrl ? (
              <div
                className="relative cursor-grab touch-none active:cursor-grabbing"
                style={{ width: previewSize, height: previewSize }}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerLeave={handlePointerUp}
                role="application"
                aria-label="Logo crop preview"
              >
                {!previewReady && (
                  <div className="absolute inset-0 flex items-center justify-center rounded-xl bg-muted/60 text-sm text-muted-foreground">
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
                    src={sourceUrl}
                    alt="Crop preview"
                    className="absolute left-1/2 top-1/2 block select-none opacity-90"
                    style={{
                      width: imageMeta?.width ?? "auto",
                      height: imageMeta?.height ?? "auto",
                      maxWidth: "none",
                      maxHeight: "none",
                      transform: `translate(-50%, -50%) scale(${baseScale * zoom})`,
                      transformOrigin: "center",
                      zIndex: 1,
                    }}
                    draggable={false}
                  />
                </div>
              <div className="pointer-events-none absolute inset-0" aria-hidden>
                <svg className="h-full w-full" viewBox={`0 0 ${previewSize} ${previewSize}`}>
                  <rect width={previewSize} height={previewSize} fill="transparent" />
                  {logoShape === "rect" ? (
                    <>
                      <circle
                        cx={previewSize / 2}
                        cy={previewSize / 2}
                        r={cropHalf}
                        fill="none"
                        stroke="rgba(255,255,255,0.55)"
                        strokeDasharray="4 6"
                        strokeWidth="2"
                      />
                      <rect
                        x={rectGuideX}
                        y={rectGuideOffset}
                        width={rectGuideWidth}
                        height={rectGuideHeight}
                        rx={rectGuideCorner}
                        ry={rectGuideCorner}
                        fill="none"
                        stroke="rgba(255,255,255,0.85)"
                        strokeWidth="2"
                      />
                    </>
                  ) : (
                    <circle
                      cx={previewSize / 2}
                      cy={previewSize / 2}
                      r={cropHalf}
                      fill="none"
                      stroke="rgba(255,255,255,0.85)"
                      strokeWidth="2"
                    />
                  )}
                </svg>
              </div>
            </div>
            ) : latestLogoUrl ? (
              <button
                type="button"
                className="relative h-full w-full"
                onClick={handleReCrop}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={latestLogoUrl}
                  alt="Current logo badge"
                  className={cn("h-full w-full object-cover", logoFrameClassName)}
                />
                <span className="absolute bottom-3 right-3 rounded-full bg-background/90 px-3 py-1 text-[11px] font-semibold text-foreground shadow-sm">
                  Re-crop
                </span>
              </button>
            ) : (
              <button
                type="button"
                className="flex h-full w-full flex-col items-center justify-center gap-3 text-center rounded-3xl p-10"
                onClick={() => fileInputRef.current?.click()}
              >
                <div className="flex h-20 w-20 items-center justify-center rounded-2xl border-2 border-dashed border-border text-muted-foreground">
                  Upload
                </div>
                <div className="text-sm text-muted-foreground">
                  PNG/JPG/WebP  Up to 4MB  Saved as WebP
                </div>
              </button>
            )}
          </div>
          {sourceUrl ? (
            <div className="mx-auto w-full max-w-sm space-y-3">
              <div className="space-y-2">
                <label
                  htmlFor="logo-zoom-default"
                  className="flex items-center justify-center gap-1 text-xs uppercase tracking-[0.2em] text-muted-foreground"
                >
                  Zoom:
                  <span className="text-[11px] font-semibold text-foreground">
                    {Math.round(zoom * 100)}%
                  </span>
                </label>
                <input
                  id="logo-zoom-default"
                  type="range"
                  min={MIN_ZOOM}
                  max={MAX_ZOOM}
                  step={ZOOM_STEP}
                  value={zoom}
                  onChange={(event) => setZoom(Number(event.target.value))}
                  disabled={loading}
                  className="dashboard-zoom-slider w-full"
                />
              </div>
              <div className="flex flex-wrap items-center justify-center gap-3">
                <span
                  className={cn(
                    "text-center text-xs",
                    loading
                      ? "dashboard-saving-indicator text-foreground"
                      : "text-muted-foreground"
                  )}
                >
                  {loading ? "Uploading crop..." : "Adjust the crop, then save it."}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-10 rounded-full px-4 sm:h-8"
                  onClick={handleReset}
                  disabled={!(sourceUrl || latestLogoUrl) || loading}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  size="sm"
                  className="h-10 rounded-full px-4 sm:h-8"
                  onClick={() => void handleUpload()}
                  disabled={!sourceUrl || !previewReady || !imageMeta || loading || isDragging}
                >
                  Save crop
                </Button>
              </div>
            </div>
          ) : null}
          {error && (
            <p className="rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm leading-5 text-destructive">
              <span className="font-semibold">Logo upload error: </span>
              {error} Try a different image or retry the upload. If it keeps happening, contact support@linketconnect.com.
            </p>
          )}
        </section>
      </CardContent>
    </Card>
  );
}

async function cropToWebP(
  file: File,
  options: {
    outputSize: number;
    cropSize: number;
    baseScale: number;
    zoom: number;
    offset: { x: number; y: number };
    srcUrl: string | null;
  }
): Promise<File | null> {
  const { outputSize, cropSize, baseScale, zoom, offset, srcUrl } = options;
  try {
    const img = await loadImage(srcUrl || URL.createObjectURL(file));
    const canvas = document.createElement("canvas");
    canvas.width = outputSize;
    canvas.height = outputSize;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.clearRect(0, 0, outputSize, outputSize);

    const ratio = outputSize / cropSize;
    const combinedScale = baseScale * zoom * ratio;

    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, outputSize, outputSize);
    ctx.closePath();
    ctx.clip();

    ctx.translate(outputSize / 2 + offset.x * ratio, outputSize / 2 + offset.y * ratio);
    ctx.scale(combinedScale, combinedScale);
    ctx.translate(-img.naturalWidth / 2, -img.naturalHeight / 2);
    ctx.drawImage(img, 0, 0);
    ctx.restore();

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((result) => resolve(result), "image/webp", 0.9)
    );
    if (!blob) return null;
    return new File([blob], "profile_logo.webp", { type: "image/webp" });
  } catch (error) {
    console.error("cropToWebP failed", error);
    return null;
  }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}
