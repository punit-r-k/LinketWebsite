"use client";

import * as React from "react";

import { cn } from "@/lib/utils";

interface NavItem {
  label: string;
  id: string;
  gradient?: string;
  shadow?: string;
}

interface AdaptiveNavPillProps {
  items: readonly NavItem[];
  activeId?: string | null;
  onSelect?: (id: string) => void;
}

/**
 * Minimal navigation bar used across the landing page.
 * It relies on solid surfaces so the active section stays legible.
 */
export function AdaptiveNavPill({
  items,
  activeId,
  onSelect,
}: AdaptiveNavPillProps) {
  const handleSectionClick = React.useCallback(
    (sectionId: string) => {
      onSelect?.(sectionId);
    },
    [onSelect]
  );

  return (
    <div className="w-full max-w-5xl">
      <nav
        role="tablist"
        aria-label="Site sections"
        className="relative grid w-full grid-cols-1 gap-2 rounded-full border border-slate-200 bg-white p-2 shadow-[var(--shadow-grounded)] sm:grid-cols-2 lg:flex lg:items-center"
      >
        {items.map((item) => {
          const isActive = Boolean(activeId && item.id === activeId);
          const accentGradient =
            item.gradient ?? "linear-gradient(120deg,#f8d058,#f8b878)";
          const accentShadow =
            item.shadow ?? "0 12px 30px rgba(248,184,120,0.25)";

          return (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              aria-current={isActive ? "page" : undefined}
              className={cn(
                "relative flex h-12 items-center justify-center rounded-full px-5 text-sm font-semibold uppercase tracking-[0.08em] transition-[transform,color,background-color,box-shadow] duration-200 ease-out motion-reduce:transform-none motion-reduce:transition-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#58c0e0] active:scale-[0.985]",
                isActive ? "text-[#0b1220]" : "text-[#606b85] hover:text-[#0b1220]"
              )}
              style={{
                backgroundImage: isActive ? accentGradient : undefined,
                border: "none",
                backgroundColor: isActive ? undefined : "#ffffff",
                boxShadow: isActive
                  ? accentShadow
                  : "inset 0 0 0 1px rgba(217,224,234,0.95)",
                minWidth: "120px",
              }}
              onClick={() => handleSectionClick(item.id)}
            >
              <span className="whitespace-normal text-center leading-tight">
                {item.label}
              </span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}
