// Browser wiring for the service-worker registrar: the only file that imports workbox-window (ADR-034).
// Thin by design — all behaviour lives in serviceWorkerRegistrar.ts. NOT RUN in a browser yet.
import { Workbox } from 'workbox-window';
import type { ServiceWorkerRegistrar } from '../../application/ports';
import { createServiceWorkerRegistrar, type WorkerHandle } from './serviceWorkerRegistrar';

function createHandle(): WorkerHandle {
  // Relative to the page so a sub-path deployment works (base './', ADR-008). vite-plugin-pwa emits sw.ts as sw.js.
  const workbox = new Workbox(new URL('sw.js', document.baseURI).href);
  return {
    onInstalled: (callback) => workbox.addEventListener('installed', (event) => callback({ isUpdate: event.isUpdate === true })),
    onWaiting: (callback) => workbox.addEventListener('waiting', () => callback()),
    onControlling: (callback) => workbox.addEventListener('controlling', () => callback()),
    register: async () => {
      const registration = await workbox.register();
      return { hasActiveWorker: Boolean(registration?.active) };
    },
    skipWaiting: () => workbox.messageSkipWaiting(),
  };
}

export const browserServiceWorkerRegistrar: ServiceWorkerRegistrar = createServiceWorkerRegistrar({
  environment: () => ({
    hasServiceWorkerApi: 'serviceWorker' in navigator,
    isSecureContext: window.isSecureContext,
    // devOptions.enabled is false in vite.config.ts, so there is no /sw.js in `npm run dev`.
    isProductionBuild: import.meta.env.PROD,
  }),
  createHandle,
});
