"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";

export type ToastOptions = {
  id?: string;
  title?: string;
  description?: string;
  variant?: "default" | "success" | "destructive";
  durationMs?: number;
  actionLabel?: string;
  onAction?: () => void;
};

type ToastInternal = Required<ToastOptions> & { id: string };

const TOAST_EVENT = "app:toast";
const DEFAULT_TOAST_DURATION_MS = 6000;
const DESTRUCTIVE_TOAST_DURATION_MS = 9000;
const DEFAULT_TOAST_MAX_DURATION_MS = 12000;
const DESTRUCTIVE_TOAST_MAX_DURATION_MS = 18000;

function getToastDuration(opts: ToastOptions) {
  if (typeof opts.durationMs === "number") return opts.durationMs;
  const base =
    opts.variant === "destructive"
      ? DESTRUCTIVE_TOAST_DURATION_MS
      : DEFAULT_TOAST_DURATION_MS;
  const max =
    opts.variant === "destructive"
      ? DESTRUCTIVE_TOAST_MAX_DURATION_MS
      : DEFAULT_TOAST_MAX_DURATION_MS;
  const readableText = `${opts.title ?? ""} ${opts.description ?? ""}`.trim();
  return Math.min(max, Math.max(base, 3000 + readableText.length * 55));
}

export function toast(opts: ToastOptions) {
  const detail: ToastInternal = {
    id: opts.id || Math.random().toString(36).slice(2),
    title: opts.title || "",
    description: opts.description || "",
    variant: opts.variant || "default",
    durationMs: getToastDuration(opts),
    actionLabel: opts.actionLabel || "",
    onAction: opts.onAction || (() => undefined),
  };
  window.dispatchEvent(new CustomEvent(TOAST_EVENT, { detail }));
  return detail.id;
}

export function Toaster() {
  const [toasts, setToasts] = useState<ToastInternal[]>([]);
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  );

  const dismiss = useCallback((id: string) => {
    setToasts((list) => list.filter((t) => t.id !== id));
  }, []);

  useEffect(() => {
    function onToast(e: Event) {
      const ce = e as CustomEvent<ToastInternal>;
      const t = ce.detail;
      setToasts((list) => [...list, t]);
      if (t.durationMs > 0) {
        setTimeout(() => dismiss(t.id), t.durationMs);
      }
    }
    window.addEventListener(TOAST_EVENT, onToast as EventListener);
    return () => window.removeEventListener(TOAST_EVENT, onToast as EventListener);
  }, [dismiss]);

  // Avoid SSR markup so extensions cannot mutate this subtree before hydration
  if (!mounted) return null;

  return (
    <div className="pointer-events-none fixed inset-0 z-[100] flex items-start justify-end p-4 sm:p-6">
      <div className="flex w-full max-w-sm flex-col gap-3" aria-live="polite" aria-atomic>
        <AnimatePresence initial={false}>
          {toasts.map((t) => (
            <motion.div
              key={t.id}
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.18 }}
            >
              <div
                role={t.variant === "destructive" ? "alert" : "status"}
                aria-label={t.title || t.description}
                className="pointer-events-auto rounded-xl border bg-card p-4 text-card-foreground shadow-[var(--shadow-ambient)] outline-none"
                style={{
                  borderColor:
                    t.variant === "success"
                      ? "color-mix(in oklab, var(--success), #fff 70%)"
                      : t.variant === "destructive"
                      ? "color-mix(in oklab, var(--danger), #fff 70%)"
                      : "var(--border)",
                }}
              >
                <div className="flex items-start gap-3">
                  <div
                    className="mt-0.5 h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{
                      background:
                        t.variant === "success"
                          ? "var(--success)"
                          : t.variant === "destructive"
                          ? "var(--danger)"
                          : "var(--brand-emphasis)",
                    }}
                    aria-hidden
                  />
                  <div className="min-w-0 flex-1">
                    {t.title && <div className="text-sm font-medium text-foreground">{t.title}</div>}
                    {t.description && (
                      <div className="mt-0.5 text-sm text-muted-foreground">{t.description}</div>
                    )}
                  </div>
                  {t.actionLabel ? (
                    <button
                      className="rounded-full px-2 py-1 text-sm font-medium text-foreground underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--ring)]"
                      onClick={() => {
                        t.onAction?.();
                        dismiss(t.id);
                      }}
                    >
                      {t.actionLabel}
                    </button>
                  ) : null}
                  <button
                    aria-label="Dismiss notification"
                    className="rounded-full p-1 text-muted-foreground hover:bg-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--ring)]"
                    onClick={() => dismiss(t.id)}
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}

export default Toaster;
