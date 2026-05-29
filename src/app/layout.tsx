import type { Metadata } from "next";
import { cookies, headers } from "next/headers";
import {
  Averia_Serif_Libre,
  Geist,
  Geist_Mono,
  Nunito,
  Quicksand,
} from "next/font/google";
import "./globals.css";
import Navbar from "@/components/site/navbar";
import PrefetchRoutes from "@/components/site/PrefetchRoutes";
import Footer from "@/components/site/footer";
import { Toaster } from "@/components/system/toaster";
import ServiceWorkerRegister from "@/components/system/ServiceWorkerRegister";
import DebugErrorOverlay from "@/components/system/DebugErrorOverlay";
import GlobalErrorLogger from "@/components/system/GlobalErrorLogger";
import AnalyticsBinder from "@/components/system/AnalyticsBinder";
import ConfirmDialogHost from "@/components/system/ConfirmDialogHost";
import "@/styles/theme.css";
import Script from "next/script";
import { brand } from "@/config/brand";
import { LocaleProvider } from "@/components/i18n/LocaleProvider";
import { getPublicPricingSnapshot } from "@/lib/billing/pricing";
import {
  DEFAULT_LOCALE,
  LOCALE_COOKIE_NAME,
  LOCALE_SOURCE_COOKIE_NAME,
  getHtmlLang,
  normalizeLocale,
  resolveDetectedLocale,
  translatePhrase,
  type SupportedLocale,
} from "@/lib/i18n";
import { getConfiguredSiteOrigin } from "@/lib/site-url";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const display = Quicksand({
  variable: "--font-display",
  subsets: ["latin"],
});

const landing = Nunito({
  variable: "--font-landing",
  subsets: ["latin"],
});

const landingSerif = Averia_Serif_Libre({
  variable: "--font-landing-serif",
  weight: ["300", "400", "700"],
  subsets: ["latin"],
});

function getOpenGraphLocale(locale: SupportedLocale) {
  if (locale === "es") return "es_ES";
  if (locale === "pt") return "pt_BR";
  return "en_US";
}

async function getInitialLocale() {
  const cookieStore = await cookies();
  const headerStore = await headers();
  const cookieSource = cookieStore.get(LOCALE_SOURCE_COOKIE_NAME)?.value;
  const cookieLocale =
    !cookieSource || cookieSource === "manual"
      ? cookieStore.get(LOCALE_COOKIE_NAME)?.value
      : undefined;

  return (
    normalizeLocale(cookieLocale) ??
    resolveDetectedLocale({
      cookieLocale: headerStore.get("x-linket-locale"),
      country:
        headerStore.get("x-vercel-ip-country") ??
        headerStore.get("cf-ipcountry") ??
        headerStore.get("x-country-code"),
      acceptLanguage: headerStore.get("accept-language"),
    }) ??
    DEFAULT_LOCALE
  );
}

function buildMetadata(locale: SupportedLocale): Metadata {
  const localizedTagline = translatePhrase(locale, brand.tagline);
  const localizedBlurb = translatePhrase(locale, brand.blurb);
  const localizedTitle = `${brand.name} - ${localizedTagline}`;

  return {
    title: {
      default: localizedTitle,
      template: `%s | ${brand.name}`,
    },
    description: localizedBlurb,
    icons: {
      icon: [
        { url: "/favicon-search-96.png", type: "image/png", sizes: "96x96" },
        { url: "/favicon-search-192.png", type: "image/png", sizes: "192x192" },
      ],
      shortcut: ["/favicon-search-96.png"],
      apple: "/apple-touch-icon.png",
    },
    metadataBase: new URL(getConfiguredSiteOrigin()),
    openGraph: {
      title: localizedTitle,
      description: localizedBlurb,
      url: "/",
      siteName: brand.name,
      images: [
        {
          url: "/og.png",
          width: 1366,
          height: 768,
          alt: `${brand.name} logo`,
        },
      ],
      locale: getOpenGraphLocale(locale),
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title: brand.name,
      description: localizedBlurb,
      images: ["/og.png"],
    },
  };
}

export async function generateMetadata(): Promise<Metadata> {
  return buildMetadata(await getInitialLocale());
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const initialLocale = await getInitialLocale();
  const siteUrl = getConfiguredSiteOrigin();
  const pricing = getPublicPricingSnapshot();
  const oneTimeBundlePrice = pricing.individual.webPlusLinketBundle.oneTime;
  const productJsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: `${brand.name} NFC Keychain`,
    description: translatePhrase(initialLocale, brand.blurb),
    image: `${siteUrl}/og.png`,
    brand: {
      "@type": "Brand",
      name: brand.name,
    },
    offers: {
      "@type": "Offer",
      priceCurrency: "USD",
      price: oneTimeBundlePrice.toFixed(2),
      availability: "https://schema.org/InStock",
      url: siteUrl,
    },
  };
  return (
    <html
      lang={getHtmlLang(initialLocale)}
      suppressHydrationWarning
      data-scroll-behavior="smooth"
    >
      <body
        suppressHydrationWarning
        className={`${geistSans.variable} ${geistMono.variable} ${display.variable} ${landing.variable} ${landingSerif.variable} flex min-h-dvh flex-col antialiased bg-background text-foreground`}
      >
        <LocaleProvider initialLocale={initialLocale}>
          <PrefetchRoutes />
          <AnalyticsBinder />
          <a
            href="#main"
            className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:rounded-lg focus:bg-white focus:px-3 focus:py-2 focus:text-sm focus:shadow"
          >
            Skip to content
          </a>
          <Navbar />
          <main id="main" className="flex-1 min-h-0">
            {children}
          </main>
          <Footer />
          <Script
            id="product-jsonld"
            type="application/ld+json"
            strategy="afterInteractive"
          >
            {JSON.stringify(productJsonLd)}
          </Script>
          <ServiceWorkerRegister />
          <GlobalErrorLogger />
          <DebugErrorOverlay />
          <ConfirmDialogHost />
          <Toaster />
        </LocaleProvider>
      </body>
    </html>
  );
}
