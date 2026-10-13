// Wording for each PWA state (FR-010). Pure: no React, no browser APIs. Every state carries a text label (NFR-008).
import type { PwaState } from '../../application/use-cases/pwaStatus';
import { OFFLINE_SCOPE_TEXT, UPDATE_RELOAD_WARNING } from '../../shared/constants';

export type PwaTone = 'info' | 'ok' | 'warn' | 'error';
export interface PwaView {
  readonly label: string;
  readonly detail: string;
  readonly tone: PwaTone;
  /** The only action the UI may offer for this state. */
  readonly action: 'apply-update' | null;
}

export function describePwaState(state: PwaState): PwaView {
  switch (state.status) {
    case 'not-started':
      return { label: 'Offline status: not checked yet', detail: 'The app has not finished setting up offline use.', tone: 'info', action: null };
    case 'unsupported':
      switch (state.reason) {
        case 'development-build':
          return { label: 'Offline use: not active in a development build', detail: 'The service worker is only registered in a production build. Use npm run build then npm run preview, or a deployed HTTPS build.', tone: 'info', action: null };
        case 'insecure-context':
          return { label: 'Offline use unavailable: page is not secure', detail: 'Service workers need HTTPS (localhost on the same machine is also accepted). A self-signed certificate usually does not work on phones.', tone: 'warn', action: null };
        case 'no-service-worker-api':
          return { label: 'Offline use unavailable in this browser', detail: 'This browser does not provide service workers, so the app cannot be cached for offline use. It still works online.', tone: 'warn', action: null };
      }
      return { label: 'Offline use unavailable', detail: 'Service workers cannot be used here.', tone: 'warn', action: null };
    case 'registering':
      return { label: 'Setting up offline use…', detail: 'Registering the service worker.', tone: 'info', action: null };
    case 'registered':
      return { label: 'Service worker registered — not ready offline yet', detail: 'Waiting for the app files to finish caching. Do not rely on offline use yet.', tone: 'info', action: null };
    case 'offline-ready':
      return { label: 'Offline ready', detail: OFFLINE_SCOPE_TEXT, tone: 'ok', action: null };
    case 'update-available':
      return { label: 'Update available', detail: state.applyError ? `${UPDATE_RELOAD_WARNING} The last attempt failed: ${state.applyError}` : UPDATE_RELOAD_WARNING, tone: 'warn', action: 'apply-update' };
    case 'applying-update':
      return { label: 'Applying update…', detail: 'Keep the app open. It reloads when the new version is active.', tone: 'info', action: null };
    case 'update-applied':
      return { label: 'Update applied', detail: 'Reloading the app now.', tone: 'ok', action: null };
    case 'failed':
      return { label: 'Offline setup failed', detail: `${state.message} The app can still be used online. Reload the page to try again.`, tone: 'error', action: null };
  }
}
