"use client";
import * as React from "react";
import { ChevronDown, Mail, Phone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { trackEvent } from "@/lib/analytics";
import { cn } from "@/lib/utils";

type ButtonVariant = React.ComponentProps<typeof Button>["variant"];

export default function VCardDownload({
  handle,
  label = "Save vCard",
  className,
  variant,
  iconSrc,
  iconAlt = "Site icon",
  emails = [],
  phones = [],
}: {
  handle: string;
  label?: string;
  className?: string;
  variant?: ButtonVariant;
  iconSrc?: string;
  iconAlt?: string;
  emails?: string[];
  phones?: string[];
}) {
  const hrefBase = `/api/vcard/${encodeURIComponent(handle)}`;
  const [downloading, setDownloading] = React.useState(false);
  const [open, setOpen] = React.useState(false);
  const hasDetails = emails.length > 0 || phones.length > 0;

  function buildFreshHref() {
    return `${hrefBase}?download=${Date.now()}`;
  }

  async function download() {
    const href = buildFreshHref();
    void trackEvent("vcard_download_click", { handle });
    try {
      setDownloading(true);
      // iOS Safari doesn't support the download attribute reliably. Open URL directly.
      const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
      const isIOS = /iP(hone|od|ad)/.test(ua);
      if (isIOS) {
        void trackEvent("vcard_download_success", { handle, mode: "ios_redirect" });
        window.location.assign(href);
        return;
      }
      // Fetch and trigger a Blob download so the filename is correct across browsers.
      const res = await fetch(href, { cache: "no-store" });
      if (!res.ok) {
        // fallback navigation if headers blocked by CSP
        void trackEvent("vcard_download_success", { handle, mode: "redirect_fallback" });
        window.location.assign(href);
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${handle}.vcf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      void trackEvent("vcard_download_success", { handle, mode: "blob" });
    } catch (error) {
      const message =
        error instanceof Error ? error.message.slice(0, 160) : "unknown";
      void trackEvent("vcard_download_failed", { handle, message });
      window.location.assign(href);
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className="w-full sm:w-auto">
      <div className="inline-flex w-full items-stretch sm:w-auto">
        <Button
          onClick={download}
          disabled={downloading}
          aria-label={label}
          title={label}
          className={cn(
            "min-w-0 flex-1 sm:flex-none",
            className,
            hasDetails && "rounded-r-none border-r-0 pr-5"
          )}
          variant={variant}
        >
          {iconSrc ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={iconSrc}
              alt={iconAlt}
              className="mr-2 h-4 w-4"
              aria-hidden
            />
          ) : null}
          <span className="truncate">{downloading ? "Preparing..." : label}</span>
        </Button>
        {hasDetails ? (
          <button
            type="button"
            aria-label={open ? "Hide contact details" : "Show contact details"}
            aria-expanded={open}
            onClick={() => setOpen((current) => !current)}
            className="inline-flex min-h-11 w-14 shrink-0 items-center justify-center rounded-l-none rounded-r-full border border-l-0 border-[color:var(--profile-contact-button-border)] bg-card/85 text-foreground shadow-sm transition-[background-color,color,box-shadow,transform] duration-200 ease-out hover:bg-card active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <ChevronDown
              className={cn(
                "h-4 w-4 transition-transform duration-200",
                open ? "rotate-180" : "rotate-0"
              )}
              aria-hidden
            />
          </button>
        ) : null}
      </div>
      {hasDetails ? (
        <div
          className={cn(
            "overflow-hidden rounded-2xl text-card-foreground transition-all duration-200 ease-out sm:min-w-[20rem]",
            open
              ? "mt-2 max-h-80 translate-y-0 border border-border/70 bg-card/95 opacity-100 shadow-xl backdrop-blur"
              : "pointer-events-none mt-0 max-h-0 -translate-y-1 border border-transparent opacity-0"
          )}
        >
          <div className="space-y-3 p-3">
            {emails.length ? (
              <ContactDetailGroup
                icon={Mail}
                label="Emails"
                values={emails}
                hrefPrefix="mailto:"
              />
            ) : null}
            {phones.length ? (
              <ContactDetailGroup
                icon={Phone}
                label="Phone numbers"
                values={phones}
                hrefPrefix="tel:"
              />
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function ContactDetailGroup({
  icon: Icon,
  label,
  values,
  hrefPrefix,
}: {
  icon: typeof Mail;
  label: string;
  values: string[];
  hrefPrefix: string;
}) {
  return (
    <div className="space-y-2">
      <div className="flex min-h-5 items-center gap-2 text-[11px] font-semibold uppercase leading-none tracking-[0.18em] text-muted-foreground">
        <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
        <span className="inline-flex h-4 items-center">{label}</span>
      </div>
      <div className="space-y-1">
        {values.map((value) => (
          <a
            key={`${label}-${value}`}
            href={`${hrefPrefix}${
              hrefPrefix === "tel:"
                ? value.replace(/[^\d+]/g, "") || value.trim()
                : value.trim()
            }`}
            className="block truncate rounded-xl border border-border/50 bg-background/70 px-3 py-2 text-sm text-foreground transition hover:bg-background"
          >
            {value}
          </a>
        ))}
      </div>
    </div>
  );
}
