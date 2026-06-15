const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

export function getPreferredScrollBehavior(
  behavior: ScrollBehavior = "smooth"
): ScrollBehavior {
  if (typeof window === "undefined" || !window.matchMedia) {
    return behavior;
  }

  return window.matchMedia(REDUCED_MOTION_QUERY).matches ? "auto" : behavior;
}

export function scrollWindowTo(options: ScrollToOptions) {
  if (typeof window === "undefined") return;

  window.scrollTo({
    ...options,
    behavior: getPreferredScrollBehavior(options.behavior ?? "smooth"),
  });
}

export function scrollElementIntoView(
  element: Element | null | undefined,
  options: ScrollIntoViewOptions = {}
) {
  if (!element) return;

  element.scrollIntoView({
    ...options,
    behavior: getPreferredScrollBehavior(options.behavior ?? "smooth"),
  });
}

export function scrollPageToTop(options: ScrollToOptions = {}) {
  if (typeof window === "undefined") return;

  const scrollOptions: ScrollToOptions = {
    ...options,
    top: options.top ?? 0,
    left: options.left ?? 0,
    behavior: getPreferredScrollBehavior(options.behavior ?? "smooth"),
  };

  window.scrollTo(scrollOptions);
  document
    .querySelectorAll<HTMLElement>("[data-page-scroll], .dashboard-scroll-area")
    .forEach((scrollArea) => scrollArea.scrollTo(scrollOptions));
}
