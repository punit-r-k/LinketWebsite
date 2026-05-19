"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import {
  DEFAULT_LOCALE,
  LOCALE_STORAGE_KEY,
  TRANSLATIONS,
  getHtmlLang,
  normalizeLocale,
  persistLocalePreference,
  translatePhrase,
  type LocaleSource,
  type SupportedLocale,
} from "@/lib/i18n";

type LocaleContextValue = {
  locale: SupportedLocale;
  setLocale: (locale: SupportedLocale, source?: LocaleSource) => void;
  tr: (text: string) => string;
  ui: (typeof TRANSLATIONS)[SupportedLocale]["ui"];
};

const LocaleContext = createContext<LocaleContextValue | null>(null);

const textNodeOriginals = new WeakMap<Text, string>();
const attributeOriginals = new WeakMap<Element, Partial<Record<string, string>>>();

const TRANSLATABLE_ATTRIBUTES = [
  "aria-label",
  "alt",
  "placeholder",
  "title",
] as const;

function isSupportedTextParent(parent: Node | null) {
  if (!(parent instanceof HTMLElement)) return false;
  if (
    parent.closest(
      "script,style,textarea,select,code,pre,[contenteditable='true'],[data-no-translate]"
    )
  ) {
    return false;
  }
  return true;
}

function translatePreservingWhitespace(
  value: string,
  locale: SupportedLocale
) {
  const compact = value.trim().replace(/\s+/g, " ");
  if (!compact) return value;
  const translated = translatePhrase(locale, compact);
  if (translated === compact || translated === value) return value;

  const leading = value.match(/^\s*/)?.[0] ?? "";
  const trailing = value.match(/\s*$/)?.[0] ?? "";
  return `${leading}${translated}${trailing}`;
}

function hasKnownTranslationSource(value: string) {
  const compact = value.trim().replace(/\s+/g, " ");
  if (!compact) return false;
  return (
    translatePhrase("es", compact) !== compact ||
    translatePhrase("pt", compact) !== compact
  );
}

function translateTextNode(node: Text, locale: SupportedLocale) {
  if (!isSupportedTextParent(node.parentNode)) return;
  const currentValue = node.nodeValue ?? "";
  let original = textNodeOriginals.get(node);
  if (!original) {
    if (!hasKnownTranslationSource(currentValue)) return;
    original = currentValue;
    textNodeOriginals.set(node, original);
  } else if (
    currentValue !== original &&
    hasKnownTranslationSource(currentValue)
  ) {
    original = currentValue;
    textNodeOriginals.set(node, original);
  }
  const next =
    locale === DEFAULT_LOCALE
      ? original
      : translatePreservingWhitespace(original, locale);
  if (node.nodeValue !== next) {
    node.nodeValue = next;
  }
}

function translateElementAttributes(
  element: Element,
  locale: SupportedLocale
) {
  if (
    element.closest(
      "script,style,textarea,select,code,pre,[contenteditable='true'],[data-no-translate]"
    )
  ) {
    return;
  }

  const originals = attributeOriginals.get(element) ?? {};
  let changed = false;

  for (const attribute of TRANSLATABLE_ATTRIBUTES) {
    if (!element.hasAttribute(attribute)) continue;
    const currentValue = element.getAttribute(attribute) ?? "";
    let original = originals[attribute];
    if (!original) {
      if (!hasKnownTranslationSource(currentValue)) continue;
      original = currentValue;
      originals[attribute] = original;
      changed = true;
    } else if (
      currentValue !== original &&
      hasKnownTranslationSource(currentValue)
    ) {
      original = currentValue;
      originals[attribute] = original;
      changed = true;
    }
    const next =
      locale === DEFAULT_LOCALE
        ? original
        : translatePreservingWhitespace(original, locale);
    if (currentValue !== next) {
      element.setAttribute(attribute, next);
    }
  }

  if (changed) {
    attributeOriginals.set(element, originals);
  }
}

function translateTree(root: Node, locale: SupportedLocale) {
  if (root instanceof Element) {
    translateElementAttributes(root, locale);
  }

  const elementWalker = document.createTreeWalker(
    root,
    NodeFilter.SHOW_ELEMENT
  );
  while (elementWalker.nextNode()) {
    translateElementAttributes(elementWalker.currentNode as Element, locale);
  }

  const textWalker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  while (textWalker.nextNode()) {
    translateTextNode(textWalker.currentNode as Text, locale);
  }
}

function LocaleDomTranslator({ locale }: { locale: SupportedLocale }) {
  const applyingRef = useRef(false);

  useEffect(() => {
    if (typeof document === "undefined" || !document.body) return;

    const apply = (root: Node = document.body) => {
      if (applyingRef.current) return;
      applyingRef.current = true;
      try {
        translateTree(root, locale);
      } finally {
        applyingRef.current = false;
      }
    };

    apply();
    const observer = new MutationObserver((mutations) => {
      if (applyingRef.current) return;
      window.requestAnimationFrame(() => {
        for (const mutation of mutations) {
          if (mutation.type === "attributes") {
            const target = mutation.target;
            if (target instanceof Element) {
              apply(target);
            }
            continue;
          }
          for (const node of Array.from(mutation.addedNodes)) {
            if (node instanceof Text) {
              translateTextNode(node, locale);
            } else if (node instanceof Element) {
              apply(node);
            }
          }
        }
      });
    });

    observer.observe(document.body, {
      attributes: true,
      attributeFilter: [...TRANSLATABLE_ATTRIBUTES],
      childList: true,
      subtree: true,
    });

    return () => observer.disconnect();
  }, [locale]);

  return null;
}

export function LocaleProvider({
  children,
  initialLocale,
}: {
  children: ReactNode;
  initialLocale: SupportedLocale;
}) {
  const [locale, setLocaleState] = useState<SupportedLocale>(
    normalizeLocale(initialLocale) ?? DEFAULT_LOCALE
  );

  useEffect(() => {
    try {
      const requestedLocale = normalizeLocale(
        new URLSearchParams(window.location.search).get("lang")
      );
      if (requestedLocale) {
        persistLocalePreference(requestedLocale, "manual");
        setLocaleState(requestedLocale);
        return;
      }
      const storedLocale = normalizeLocale(
        window.localStorage.getItem(LOCALE_STORAGE_KEY)
      );
      if (storedLocale && storedLocale !== locale) {
        setLocaleState(storedLocale);
      }
    } catch {
      // Storage can be unavailable in strict browser settings.
    }
    // Run once after hydration; cookie/server state remains the fallback.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    document.documentElement.lang = getHtmlLang(locale);
  }, [locale]);

  const setLocale = useCallback(
    (nextLocale: SupportedLocale, source: LocaleSource = "manual") => {
      const normalized = normalizeLocale(nextLocale) ?? DEFAULT_LOCALE;
      persistLocalePreference(normalized, source);
      setLocaleState(normalized);
      window.dispatchEvent(
        new CustomEvent("linket:locale-changed", {
          detail: { locale: normalized, source },
        })
      );
    },
    []
  );

  const value = useMemo<LocaleContextValue>(
    () => ({
      locale,
      setLocale,
      tr: (text: string) => translatePhrase(locale, text),
      ui: TRANSLATIONS[locale].ui,
    }),
    [locale, setLocale]
  );

  return (
    <LocaleContext.Provider value={value}>
      {children}
      <LocaleDomTranslator locale={locale} />
    </LocaleContext.Provider>
  );
}

export function useI18n() {
  const context = useContext(LocaleContext);
  if (!context) {
    throw new Error("useI18n must be used within LocaleProvider.");
  }
  return context;
}
