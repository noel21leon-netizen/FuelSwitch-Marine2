/// <reference lib="webworker" />
// Service worker source (chunk 1). Registered from the app by src/infrastructure/pwa (chunk 5C-1, ADR-034); update UX in src/features/pwa.
//
// Scope of caching (see KOS ADR-009 / 07-geodata-spec):
//  - Precaches the built app shell and the bundled SYNTHETIC demo data only.
//  - Does NOT runtime-cache any production regulatory dataset. Cached data must never be
//    presented as current; dataset status is decided by the app from its own metadata.
//  - A service worker does NOT provide continuous geolocation. It does not track position.
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';

declare const self: ServiceWorkerGlobalScope;

cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST);
registerRoute(new NavigationRoute(createHandlerBoundToURL('index.html')));

// Safe update: a new worker waits until the user taps "Update and reload" (ADR-035). workbox-window posts this message.
// clientsClaim() is deliberately NOT called: a new worker must never take over a page mid-monitoring on its own.
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    void self.skipWaiting();
  }
});
