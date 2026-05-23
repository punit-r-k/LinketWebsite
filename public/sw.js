const VERSION = "v4";
const PAGE_CACHE = `linket-pages-${VERSION}`;
const ASSET_CACHE = `linket-assets-${VERSION}`;
const CACHE_ALLOWLIST = [PAGE_CACHE, ASSET_CACHE];
const NETWORK_TIMEOUT_MS = 8000;
const RESERVED_PATHS = new Set([
  "api",
  "dashboard",
  "accessibility",
  "forgot-password",
  "profile",
  "l",
  "u",
  "auth",
]);

self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names
          .filter((name) => !CACHE_ALLOWLIST.includes(name))
          .map((name) => caches.delete(name))
      );
      await self.clients.claim();
    })()
  );
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

function isPublicProfilePath(url) {
  const segments = url.pathname.split("/").filter(Boolean);
  if (segments.length !== 1) return false;
  const segment = segments[0];
  if (!segment || RESERVED_PATHS.has(segment)) return false;
  if (segment.includes(".")) return false;
  return true;
}

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response && response.ok) {
    cache.put(request, response.clone());
  }
  return response;
}

async function networkFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  let timeoutId;
  try {
    const controller = new AbortController();
    timeoutId = setTimeout(() => controller.abort(), NETWORK_TIMEOUT_MS);
    const response = await fetch(request, { signal: controller.signal });
    clearTimeout(timeoutId);
    if (response && response.ok) {
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    if (timeoutId) clearTimeout(timeoutId);
    const cached = await cache.match(request);
    if (cached) return cached;
    try {
      const response = await fetch(request);
      if (response && response.ok) {
        cache.put(request, response.clone());
      }
      return response;
    } catch {
      return new Response("Offline", {
        status: 503,
        headers: { "Content-Type": "text/plain" },
      });
    }
  }
}

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return;
  if (url.pathname.startsWith("/mockups/")) return;

  if (event.request.mode === "navigate") {
    if (isPublicProfilePath(url)) {
      event.respondWith(networkFirst(event.request, PAGE_CACHE));
    }
    return;
  }

  if (url.pathname.startsWith("/_next/")) {
    event.respondWith(networkFirst(event.request, ASSET_CACHE));
    return;
  }

  if (["style", "font", "image"].includes(event.request.destination)) {
    event.respondWith(cacheFirst(event.request, ASSET_CACHE));
  }
});
