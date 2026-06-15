"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { brand, hasBrandMark } from "@/config/brand";
import LanguageSwitcher from "@/components/i18n/LanguageSwitcher";
import { isPublicProfilePathname } from "@/lib/routing";

const FOOTER_LEGAL_LINKS = [
  { label: "Privacy", href: "/privacy" },
  { label: "Terms", href: "/terms" },
  { label: "Security", href: "/security" },
  { label: "Accessibility", href: "/accessibility" },
  { label: "Warranty", href: "/warranty" },
] as const;

function Footer() {
  const currentYear = new Date().getFullYear();
  const pathname = usePathname();
  const isDashboard = pathname?.startsWith("/dashboard");
  const isPublicProfile = isPublicProfilePathname(pathname);

  if (isDashboard || isPublicProfile) {
    return null;
  }

  return (
    <footer className="landing-alt-font relative overflow-hidden border-t border-white/40 bg-[#050816] text-white">
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(148,163,184,0.25),_rgba(5,8,22,0))]"
        aria-hidden
      />
      <div className="relative mx-auto max-w-6xl px-3 py-10 sm:px-6 sm:py-16">
        <div className="grid gap-7 sm:gap-12 lg:grid-cols-[1.3fr_0.9fr_1fr]">
          <div className="space-y-6 sm:space-y-8">
            <div className="flex items-center gap-3 text-lg font-semibold sm:flex-row sm:items-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/10">
                {hasBrandMark() ? (
                  <Image
                    src={(brand.logomark || brand.logo) ?? ""}
                    alt={`${brand.name} mark`}
                    width={32}
                    height={32}
                    className="h-8 w-8 object-contain"
                  />
                ) : (
                  <span
                    className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-white text-sm font-bold text-[#050816]"
                    aria-hidden="true"
                  >
                    {(brand.shortName ?? brand.name).slice(0, 1)}
                  </span>
                )}
              </div>
              <div>
                <p className="text-xs uppercase tracking-[0.24em] text-white/70 sm:text-sm sm:tracking-[0.4em]">
                  {brand.name}
                </p>
                <p className="text-xl font-bold text-white sm:text-2xl">
                  Stay Connected.
                </p>
              </div>
            </div>
            <p className="mt-6 text-sm text-white/70">
              Linket turns every tap into a live microsite, lead capture, and
              follow-up customers actually remember. Built for students,
              creators, and field teams who want intros that stick.
            </p>
          </div>

          <div className="space-y-4">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-white/60 sm:tracking-[0.35em]">
              Legal
            </p>
            <ul className="space-y-2">
              {FOOTER_LEGAL_LINKS.map((link) => (
                <li key={link.label}>
                  <Link
                    href={link.href}
                    className="transition hover:text-white"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div className="space-y-6 text-sm text-white/70">
            <LanguageSwitcher className="border-white/10 bg-white/10 text-white" />
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-white/60 sm:tracking-[0.35em]">
                Contact
              </p>
              <p className="break-words text-white/80">hello@linketconnect.com</p>
              <p className="text-white/60">
                400 Bizzell St, College Station, TX
              </p>
            </div>
          </div>
        </div>

        <div className="mt-10 flex flex-col gap-4 border-t border-white/10 pt-6 text-xs text-white/60 sm:mt-12 sm:flex-row sm:items-center sm:justify-between">
          <p>
            {"\u00a9"} {currentYear} {brand.name}. All rights reserved.
          </p>
          <div className="grid grid-cols-2 gap-x-4 gap-y-2 sm:flex sm:flex-wrap sm:items-center sm:gap-4">
            <Link href="/privacy" className="transition hover:text-white">
              Privacy
            </Link>
            <Link href="/terms" className="transition hover:text-white">
              Terms
            </Link>
            <Link href="/security" className="transition hover:text-white">
              Security
            </Link>
            <Link href="/warranty" className="transition hover:text-white">
              Warranty
            </Link>
            <Link
              href="mailto:hello@linketconnect.com"
              className="transition hover:text-white"
            >
              Contact sales
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}

export default Footer;
