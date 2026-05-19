"use client";

import { Languages } from "lucide-react";

import { useI18n } from "@/components/i18n/LocaleProvider";
import { LOCALE_OPTIONS, type SupportedLocale } from "@/lib/i18n";
import { cn } from "@/lib/utils";

type LanguageSwitcherProps = {
  className?: string;
  compact?: boolean;
};

export default function LanguageSwitcher({
  className,
  compact = false,
}: LanguageSwitcherProps) {
  const { locale, setLocale, ui } = useI18n();

  return (
    <div
      className={cn(
        "inline-flex items-center gap-1 rounded-full border border-foreground/10 bg-white/75 p-1 text-xs text-foreground shadow-sm backdrop-blur",
        className
      )}
      aria-label={ui.languageSwitcher.ariaLabel}
    >
      {!compact ? (
        <span className="inline-flex items-center gap-1.5 px-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          <Languages className="h-3.5 w-3.5" aria-hidden />
          {ui.languageSwitcher.label}
        </span>
      ) : (
        <Languages className="ml-1 h-3.5 w-3.5 text-muted-foreground" aria-hidden />
      )}
      {LOCALE_OPTIONS.map((option) => {
        const active = option.code === locale;
        return (
          <button
            key={option.code}
            type="button"
            onClick={() => setLocale(option.code as SupportedLocale)}
            className={cn(
              "rounded-full px-2.5 py-1.5 font-semibold uppercase tracking-[0.08em] transition",
              active
                ? "bg-foreground text-background"
                : "text-muted-foreground hover:bg-foreground/5 hover:text-foreground"
            )}
            aria-pressed={active}
            aria-label={`${ui.languageSwitcher.ariaLabel}: ${option.nativeLabel}`}
          >
            {option.code}
          </button>
        );
      })}
    </div>
  );
}
