"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, ArrowRight, Flag, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useDashboardUser } from "@/components/dashboard/DashboardSessionContext";
import {
  getDashboardTourAutoOpenStorageKey,
  getDashboardTourStorageKey,
  readDashboardTourAutoOpenSeen,
  readDashboardTourStatus,
  writeDashboardTourAutoOpenSeen,
  writeDashboardTourStatus,
  type DashboardTourStatus,
} from "@/lib/dashboard-onboarding-tour";
import { trackEvent } from "@/lib/analytics";
import { scrollElementIntoView } from "@/lib/scroll";

type TourStep = {
  id: string;
  path: string;
  title: string;
  description: string;
  selectors: string[];
  scrollBlock?: ScrollLogicalPosition;
};

type FocusRect = {
  top: number;
  left: number;
  width: number;
  height: number;
};

type BoxRect = FocusRect & {
  right: number;
  bottom: number;
};

const TOUR_QUERY_PARAM = "tour";
const TOUR_START_VALUE = "welcome";
const TOUR_START_EVENT = "linket:onboarding-tour:start";

const TOUR_STEPS: TourStep[] = [
  {
    id: "welcome",
    path: "/dashboard/linkets",
    title: "Welcome to Linket",
    description:
      "This walkthrough shows you the full setup path: claim a Linket, build your profile, capture leads, and track performance.",
    selectors: [],
  },
  {
    id: "navigation",
    path: "/dashboard/linkets",
    title: "Navigate confidently",
    description:
      "Use dashboard navigation to move between setup, profile editing, leads, analytics, and settings.",
    selectors: ['[data-tour="dashboard-sidebar"]', ".dashboard-mobile-toggle"],
  },
  {
    id: "claim-linket",
    path: "/dashboard/linkets",
    title: "Claim your first Linket",
    description:
      "Use a printed claim code here if you do not have NFC tap access right now.",
    selectors: ['[data-tour="linkets-claim"]'],
  },
  {
    id: "assign-linket",
    path: "/dashboard/linkets",
    title: "Assign Linkets to profiles",
    description:
      "Each claimed Linket can be mapped to a profile so taps route to the right page.",
    selectors: ['[data-tour="linkets-list"]'],
  },
  {
    id: "profile-setup",
    path: "/dashboard/profiles",
    title: "Customize your public profile",
    description:
      "Edit your handle, avatar, headline, branding, and links so every tap leads to a complete profile.",
    selectors: ['[data-tour="profile-editor-panel"]'],
  },
  {
    id: "profile-override-link",
    path: "/dashboard/profiles",
    title: "Control Direct-to-link mode",
    description:
      "Turn on Direct-to-link mode for one link when you want scans to open that destination instead of your public profile.",
    selectors: ['[data-tour="profile-override-link"]'],
  },
  {
    id: "profile-lead-form",
    path: "/dashboard/profiles",
    title: "Build your lead form in Public Profile",
    description:
      "The Linket Public Profile editor includes a built-in lead form builder. Configure fields right here.",
    selectors: ['[data-tour="profile-lead-form-builder"]'],
    scrollBlock: "start",
  },
  {
    id: "lead-inbox",
    path: "/dashboard/leads",
    title: "Manage captured leads",
    description:
      "Review, search, export, and follow up with contacts collected from profile visits.",
    selectors: ['[data-tour="leads-inbox"]'],
  },
  {
    id: "analytics",
    path: "/dashboard/analytics",
    title: "Track conversions in analytics",
    description:
      "Monitor scans, leads, conversion trends, and top-performing Linkets by date range.",
    selectors: ['[data-tour="analytics-overview"]'],
  },
  {
    id: "overview",
    path: "/dashboard/overview",
    title: "Use the launch checklist",
    description:
      "This checklist keeps your onboarding progress visible and highlights what to finish next.",
    selectors: ['[data-tour="overview-checklist"]'],
  },
  {
    id: "settings",
    path: "/dashboard/settings",
    title: "Finish account setup",
    description:
      "Keep your phone and account details current so shared contacts stay accurate.",
    selectors: ['[data-tour="settings-account"]'],
  },
  {
    id: "complete",
    path: "/dashboard/overview",
    title: "You are ready to launch",
    description:
      "Your core setup path is complete. Use the Overview checklist to track anything still left before launch.",
    selectors: [],
  },
];

const TOUR_PATH_LABELS: Record<string, string> = {
  "/dashboard/linkets": "Linkets",
  "/dashboard/profiles": "Public Profile",
  "/dashboard/leads": "Leads",
  "/dashboard/analytics": "Analytics",
  "/dashboard/overview": "Overview",
  "/dashboard/settings": "Settings",
};

function isVisibleElement(element: HTMLElement) {
  const styles = window.getComputedStyle(element);
  if (styles.display === "none" || styles.visibility === "hidden") return false;
  const rect = element.getBoundingClientRect();
  if (rect.width < 8 || rect.height < 8) return false;
  return rect.bottom > 0 && rect.right > 0 && rect.top < window.innerHeight && rect.left < window.innerWidth;
}

function findVisibleTarget(selectors: string[]) {
  for (const selector of selectors) {
    const candidates = Array.from(document.querySelectorAll<HTMLElement>(selector));
    const match = candidates.find((element) => isVisibleElement(element));
    if (match) return match;
  }
  return null;
}

function inflateRect(rect: DOMRect, padding = 10): FocusRect {
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const left = clamp(rect.left - padding, 8, viewportWidth - 8);
  const top = clamp(rect.top - padding, 8, viewportHeight - 8);
  const right = clamp(rect.right + padding, left + 8, viewportWidth - 8);
  const bottom = clamp(rect.bottom + padding, top + 8, viewportHeight - 8);
  return {
    top,
    left,
    width: Math.max(0, right - left),
    height: Math.max(0, bottom - top),
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function toBoxRect(rect: FocusRect): BoxRect {
  return {
    ...rect,
    right: rect.left + rect.width,
    bottom: rect.top + rect.height,
  };
}

function overlapArea(a: BoxRect, b: BoxRect) {
  const xOverlap = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left));
  const yOverlap = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
  return xOverlap * yOverlap;
}

export default function DashboardOnboardingTour({
  initialSeen = false,
}: {
  initialSeen?: boolean;
}) {
  const user = useDashboardUser();
  const userId = user?.id ?? null;
  const pathname = usePathname() ?? "";
  const router = useRouter();
  const searchParams = useSearchParams();
  const autoStartHandled = useRef(false);
  const lastTrackedStepRef = useRef<string | null>(null);
  const pendingPathRef = useRef<string | null>(null);
  const focusTargetRef = useRef<HTMLElement | null>(null);
  const panelRef = useRef<HTMLElement | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [focusRect, setFocusRect] = useState<FocusRect | null>(null);
  const [viewport, setViewport] = useState({ width: 0, height: 0 });
  const [panelSize, setPanelSize] = useState<{ width: number; height: number } | null>(null);

  const storageKey = useMemo(
    () => (userId ? getDashboardTourStorageKey(userId) : null),
    [userId]
  );
  const autoOpenStorageKey = useMemo(
    () => (userId ? getDashboardTourAutoOpenStorageKey(userId) : null),
    [userId]
  );

  const currentStep = TOUR_STEPS[stepIndex] ?? TOUR_STEPS[0];
  const isNavigating = isOpen && pathname !== currentStep.path;
  const isLastStep = stepIndex >= TOUR_STEPS.length - 1;
  const progressPercent = ((stepIndex + 1) / TOUR_STEPS.length) * 100;
  const pathLabel = TOUR_PATH_LABELS[currentStep.path] ?? "Dashboard";

  const closeTour = useCallback(
    (status: DashboardTourStatus) => {
      setIsOpen(false);
      setFocusRect(null);
      focusTargetRef.current = null;
      pendingPathRef.current = null;
      writeDashboardTourStatus(storageKey, status);
      if (status === "completed") {
        void trackEvent("onboarding_walkthrough_completed", {
          totalSteps: TOUR_STEPS.length,
        });
      } else {
        void trackEvent("onboarding_walkthrough_dismissed", {
          stepId: currentStep.id,
          stepIndex,
        });
      }
    },
    [currentStep.id, stepIndex, storageKey]
  );

  const startTour = useCallback(
    (source: "auto" | "manual") => {
      writeDashboardTourStatus(storageKey, "started");
      setStepIndex(0);
      setFocusRect(null);
      focusTargetRef.current = null;
      setIsOpen(true);
      pendingPathRef.current = null;
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("linket:dashboard-sidebar-close"));
      }
      void trackEvent("onboarding_walkthrough_started", { source });
    },
    [storageKey]
  );

  const handleNext = useCallback(() => {
    if (isLastStep) {
      closeTour("completed");
      return;
    }
    setStepIndex((previous) => Math.min(previous + 1, TOUR_STEPS.length - 1));
  }, [closeTour, isLastStep]);

  const handleBack = useCallback(() => {
    setStepIndex((previous) => Math.max(previous - 1, 0));
  }, []);

  const jumpToStep = useCallback((nextIndex: number) => {
    setStepIndex(clamp(Math.round(nextIndex), 0, TOUR_STEPS.length - 1));
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const syncViewport = () => {
      setViewport({ width: window.innerWidth, height: window.innerHeight });
    };
    syncViewport();
    window.addEventListener("resize", syncViewport);
    return () => {
      window.removeEventListener("resize", syncViewport);
    };
  }, []);

  useEffect(() => {
    if (!isOpen || typeof window === "undefined") return;
    const panel = panelRef.current;
    if (!panel) return;

    let frame: number | null = null;
    const publishSize = () => {
      const next = {
        width: Math.round(panel.getBoundingClientRect().width),
        height: Math.round(panel.getBoundingClientRect().height),
      };
      setPanelSize((previous) => {
        if (
          previous &&
          previous.width === next.width &&
          previous.height === next.height
        ) {
          return previous;
        }
        return next;
      });
    };

    const observer = new ResizeObserver(() => {
      if (frame !== null) {
        window.cancelAnimationFrame(frame);
      }
      frame = window.requestAnimationFrame(() => {
        frame = null;
        publishSize();
      });
    });

    observer.observe(panel);
    frame = window.requestAnimationFrame(() => {
      frame = null;
      publishSize();
    });

    return () => {
      observer.disconnect();
      if (frame !== null) {
        window.cancelAnimationFrame(frame);
      }
    };
  }, [isOpen, stepIndex, viewport.width]);

  useEffect(() => {
    if (!initialSeen || !storageKey) return;
    if (!readDashboardTourStatus(storageKey)) {
      writeDashboardTourStatus(storageKey, "dismissed");
    }
    writeDashboardTourAutoOpenSeen(autoOpenStorageKey);
  }, [autoOpenStorageKey, initialSeen, storageKey]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const handleStart = () => startTour("manual");
    window.addEventListener(TOUR_START_EVENT, handleStart);
    return () => {
      window.removeEventListener(TOUR_START_EVENT, handleStart);
    };
  }, [startTour]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeTour("dismissed");
      }
      if (event.key === "ArrowRight") {
        event.preventDefault();
        handleNext();
      }
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        handleBack();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [closeTour, handleBack, handleNext, isOpen]);

  useEffect(() => {
    autoStartHandled.current = false;
  }, [autoOpenStorageKey]);

  useEffect(() => {
    if (!storageKey || autoStartHandled.current) return;
    if (pathname !== "/dashboard/overview") return;

    const hasTourQueryParam =
      searchParams.get(TOUR_QUERY_PARAM) === TOUR_START_VALUE;
    const hasAutoOpened = readDashboardTourAutoOpenSeen(autoOpenStorageKey);
    const status = readDashboardTourStatus(storageKey);
    let startTimer: ReturnType<typeof setTimeout> | null = null;
    if (!hasAutoOpened && (status || initialSeen)) {
      autoStartHandled.current = true;
      writeDashboardTourAutoOpenSeen(autoOpenStorageKey);
    } else if (!hasAutoOpened && !hasTourQueryParam) {
      autoStartHandled.current = true;
      writeDashboardTourAutoOpenSeen(autoOpenStorageKey);
      startTimer = setTimeout(() => {
        startTour("auto");
      }, 0);
    }

    if (hasTourQueryParam) {
      autoStartHandled.current = true;
      if (!status) {
        startTimer = setTimeout(() => {
          startTour("manual");
        }, 0);
      }
      const nextParams = new URLSearchParams(searchParams.toString());
      nextParams.delete(TOUR_QUERY_PARAM);
      const nextPath = nextParams.size
        ? `${pathname}?${nextParams.toString()}`
        : pathname;
      router.replace(nextPath);
    }

    return () => {
      if (startTimer) clearTimeout(startTimer);
    };
  }, [
    autoOpenStorageKey,
    initialSeen,
    pathname,
    router,
    searchParams,
    startTour,
    storageKey,
  ]);

  useEffect(() => {
    if (!isOpen || isNavigating) return;
    const viewedKey = `${stepIndex}:${currentStep.id}`;
    if (lastTrackedStepRef.current === viewedKey) return;
    lastTrackedStepRef.current = viewedKey;
    void trackEvent("onboarding_walkthrough_step_viewed", {
      stepId: currentStep.id,
      stepIndex,
      path: currentStep.path,
    });
  }, [currentStep.id, currentStep.path, isNavigating, isOpen, stepIndex]);

  useEffect(() => {
    if (!isOpen) {
      lastTrackedStepRef.current = null;
      focusTargetRef.current = null;
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || isNavigating || currentStep.path !== "/dashboard/profiles") return;
    if (currentStep.id !== "profile-setup" && currentStep.id !== "profile-lead-form") {
      return;
    }
    const section = currentStep.id === "profile-lead-form" ? "lead" : "profile";
    const switchSection = () => {
      window.dispatchEvent(
        new CustomEvent("linket:profile-section-nav", {
          detail: { section },
        })
      );
    };
    switchSection();
    const timer = window.setTimeout(switchSection, 140);
    return () => window.clearTimeout(timer);
  }, [currentStep.id, currentStep.path, isNavigating, isOpen]);

  useEffect(() => {
    if (!isOpen) {
      pendingPathRef.current = null;
      return;
    }
    if (pathname === currentStep.path) {
      pendingPathRef.current = null;
      return;
    }
    if (pendingPathRef.current === currentStep.path) return;
    pendingPathRef.current = currentStep.path;
    router.push(currentStep.path);
  }, [currentStep.path, isOpen, pathname, router]);

  useEffect(() => {
    if (!isOpen || isNavigating) return;
    if (currentStep.selectors.length === 0) {
      focusTargetRef.current = null;
      return;
    }

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let clearFrame: number | null = null;
    let attempts = 0;

    clearFrame = window.requestAnimationFrame(() => {
      setFocusRect(null);
    });

    const locate = () => {
      if (cancelled) return;
      const target = findVisibleTarget(currentStep.selectors);
      if (!target) {
        attempts += 1;
        if (attempts < 24) {
          timer = setTimeout(locate, 120);
          return;
        }
        focusTargetRef.current = null;
        setFocusRect(null);
        return;
      }

      focusTargetRef.current = target;
      scrollElementIntoView(target, {
        block: currentStep.scrollBlock ?? "center",
        inline: "nearest",
        behavior: "smooth",
      });
      requestAnimationFrame(() => {
        if (cancelled) return;
        setFocusRect(inflateRect(target.getBoundingClientRect()));
      });
    };

    locate();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      if (clearFrame !== null) {
        window.cancelAnimationFrame(clearFrame);
      }
    };
  }, [currentStep.id, currentStep.scrollBlock, currentStep.selectors, isNavigating, isOpen, pathname]);

  useEffect(() => {
    if (!isOpen || isNavigating || currentStep.selectors.length === 0) return;
    let resizeObserver: ResizeObserver | null = null;

    const updateFocus = () => {
      const currentTarget = focusTargetRef.current;
      const target =
        currentTarget && isVisibleElement(currentTarget)
          ? currentTarget
          : findVisibleTarget(currentStep.selectors);
      if (!target) {
        focusTargetRef.current = null;
        setFocusRect(null);
        return;
      }
      focusTargetRef.current = target;
      if (resizeObserver) {
        resizeObserver.disconnect();
      }
      resizeObserver = new ResizeObserver(() => {
        if (!focusTargetRef.current) return;
        setFocusRect(inflateRect(focusTargetRef.current.getBoundingClientRect()));
      });
      resizeObserver.observe(target);
      setFocusRect(inflateRect(target.getBoundingClientRect()));
    };
    updateFocus();
    window.addEventListener("resize", updateFocus);
    window.addEventListener("scroll", updateFocus, true);
    return () => {
      if (resizeObserver) {
        resizeObserver.disconnect();
      }
      window.removeEventListener("resize", updateFocus);
      window.removeEventListener("scroll", updateFocus, true);
    };
  }, [currentStep.id, currentStep.selectors, isNavigating, isOpen]);

  const activeFocusRect =
    !isNavigating && currentStep.selectors.length > 0 ? focusRect : null;

  const panelStyle = useMemo<CSSProperties>(() => {
    const viewportWidth = Math.max(viewport.width, 320);
    const viewportHeight = Math.max(viewport.height, 320);
    const margin = 12;
    const targetWidth = viewportWidth < 960
      ? clamp(Math.round(viewportWidth * 0.94), 280, 416)
      : clamp(Math.round(viewportWidth * 0.34), 420, 560);
    const width = Math.min(targetWidth, viewportWidth - margin * 2);
    const maxHeight = clamp(Math.round(viewportHeight * 0.82), 280, 620);
    const estimatedHeight = panelSize?.height
      ? Math.min(panelSize.height, maxHeight)
      : clamp(Math.round(maxHeight * 0.68), 240, maxHeight);

    if (!activeFocusRect) {
      return {
        top: "50%",
        left: "50%",
        transform: "translate(-50%, -50%)",
        width,
        maxHeight,
        overflowY: "auto",
      };
    }

    const target = toBoxRect(activeFocusRect);
    const gap = 18;
    const verticalCenter = Math.round(target.top + target.height / 2 - estimatedHeight / 2);
    const horizontalCenter = Math.round(target.left + target.width / 2 - width / 2);

    const candidates = [
      {
        top: target.bottom + gap,
        left: horizontalCenter,
      },
      {
        top: target.top - estimatedHeight - gap,
        left: horizontalCenter,
      },
      {
        top: verticalCenter,
        left: target.right + gap,
      },
      {
        top: verticalCenter,
        left: target.left - width - gap,
      },
      {
        top: Math.round((viewportHeight - estimatedHeight) / 2),
        left: Math.round((viewportWidth - width) / 2),
      },
    ];

    const scored = candidates.map((candidate, index) => {
      const clampedTop = clamp(candidate.top, margin, viewportHeight - estimatedHeight - margin);
      const clampedLeft = clamp(candidate.left, margin, viewportWidth - width - margin);
      const panelRect: BoxRect = {
        top: clampedTop,
        left: clampedLeft,
        width,
        height: estimatedHeight,
        right: clampedLeft + width,
        bottom: clampedTop + estimatedHeight,
      };
      const overlap = overlapArea(panelRect, target);
      const clampPenalty =
        Math.abs(candidate.top - clampedTop) + Math.abs(candidate.left - clampedLeft);
      const distancePenalty =
        Math.abs(clampedTop - candidate.top) +
        Math.abs(clampedLeft - candidate.left) +
        Math.abs(clampedTop - target.top) * 0.05 +
        Math.abs(clampedLeft - target.left) * 0.02;
      const centerPenalty = index === candidates.length - 1 ? 40 : 0;
      const score = overlap * 1000 + clampPenalty * 6 + distancePenalty + centerPenalty;
      return { score, top: clampedTop, left: clampedLeft };
    });

    const best = scored.sort((a, b) => a.score - b.score)[0];

    return {
      top: best.top,
      left: best.left,
      width,
      maxHeight,
      overflowY: "auto",
    };
  }, [activeFocusRect, panelSize, viewport.height, viewport.width]);

  if (!isOpen) return null;

  return (
    <div className="dashboard-onboarding-tour fixed inset-0 z-[120]" role="dialog" aria-modal="true" aria-labelledby="tour-title">
      <button
        type="button"
        className="dashboard-onboarding-tour-hitarea absolute inset-0"
        onClick={() => closeTour("dismissed")}
        aria-label="Close onboarding walkthrough"
      />

      {activeFocusRect ? (
        <div
          className="dashboard-onboarding-tour-focus absolute"
          style={{
            top: activeFocusRect.top,
            left: activeFocusRect.left,
            width: activeFocusRect.width,
            height: activeFocusRect.height,
          }}
          aria-hidden
        />
      ) : (
        <div className="dashboard-onboarding-tour-backdrop absolute inset-0" aria-hidden />
      )}

      <section ref={panelRef} className="dashboard-onboarding-tour-panel absolute" style={panelStyle}>
        <div className="dashboard-onboarding-tour-headline">
          <span className="dashboard-onboarding-tour-kicker">
            <Flag className="h-3.5 w-3.5" />
            Guided Dashboard Setup
          </span>
          <span className="dashboard-onboarding-tour-path">{pathLabel}</span>
        </div>
        <button
          type="button"
          className="dashboard-onboarding-tour-close"
          onClick={() => closeTour("dismissed")}
          aria-label="Skip onboarding walkthrough"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="dashboard-onboarding-tour-step">
          Step {stepIndex + 1} of {TOUR_STEPS.length}
        </div>
        <div className="dashboard-onboarding-tour-progress" aria-hidden>
          <span
            className="dashboard-onboarding-tour-progress-fill"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
        <h2 id="tour-title" className="dashboard-onboarding-tour-title">
          {currentStep.title}
        </h2>
        <p className="dashboard-onboarding-tour-description">{currentStep.description}</p>
        {isNavigating ? (
          <p className="dashboard-onboarding-tour-helper">Opening next page...</p>
        ) : null}
        <div className="dashboard-onboarding-tour-dots" aria-hidden>
          {TOUR_STEPS.map((step, index) => {
            const active = index === stepIndex;
            const visited = index < stepIndex;
            return (
              <button
                key={step.id}
                type="button"
                className="dashboard-onboarding-tour-dot"
                data-active={active ? "true" : "false"}
                data-visited={visited ? "true" : "false"}
                aria-label={`Go to step ${index + 1}`}
                onClick={() => jumpToStep(index)}
              />
            );
          })}
        </div>

        <div className="dashboard-onboarding-tour-actions">
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={handleBack}
            disabled={stepIndex === 0}
            className="rounded-full"
          >
            <ArrowLeft className="mr-1 h-3.5 w-3.5" />
            Back
          </Button>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => closeTour("dismissed")}
              className="rounded-full"
            >
              Skip
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={handleNext}
              className="rounded-full"
              disabled={isNavigating}
            >
              {isLastStep ? "Finish" : "Next"}
              {!isLastStep ? <ArrowRight className="ml-1 h-3.5 w-3.5" /> : null}
            </Button>
          </div>
        </div>
        <p className="dashboard-onboarding-tour-helper">
          Tip: use keyboard arrows to move faster.
        </p>
      </section>
    </div>
  );
}
