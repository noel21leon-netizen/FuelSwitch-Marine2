// Install-prompt adapter core (5C-2, ADR-038). Browser-free: the event target and environment probes are injected.
// Captures `beforeinstallprompt` (Chromium only), defers it, and shows it only when the user taps (promptInstall).
import type { InstallEnvironment, InstallPromptOutcome, InstallPromptPort } from '../../application/ports';

/** The part of Chromium's BeforeInstallPromptEvent this adapter uses. */
export interface DeferredInstallEvent {
  preventDefault(): void;
  prompt(): Promise<void>;
  readonly userChoice: Promise<{ readonly outcome: 'accepted' | 'dismissed' }>;
}

export interface InstallEventTarget {
  addEventListener(type: string, listener: (event: unknown) => void): void;
  removeEventListener(type: string, listener: (event: unknown) => void): void;
}

export interface InstallPromptDeps {
  readonly eventTarget: InstallEventTarget;
  readonly isStandalone: () => boolean;
  readonly isIos: () => boolean;
  readonly isSecureContext: () => boolean;
}

const isDeferredEvent = (e: unknown): e is DeferredInstallEvent =>
  typeof e === 'object' && e !== null && typeof (e as DeferredInstallEvent).prompt === 'function' && typeof (e as DeferredInstallEvent).preventDefault === 'function';

export interface InstallPromptController extends InstallPromptPort {
  /** Begin listening. Idempotent. Call as early as possible: the browser fires the install event once, soon after load. */
  start(): void;
}

export function createInstallPrompt(deps: InstallPromptDeps): InstallPromptController {
  let deferred: DeferredInstallEvent | null = null;
  let installedThisSession = false;
  let started = false;
  let inFlight: Promise<InstallPromptOutcome> | null = null;
  const listeners = new Set<() => void>();
  const notify = (): void => { for (const l of [...listeners]) l(); };

  const onBeforeInstall = (event: unknown): void => {
    if (!isDeferredEvent(event)) return;
    // Hold the browser's own mini-infobar back; the user installs from the More tab on a tap.
    event.preventDefault();
    deferred = event;
    notify();
  };
  const onInstalled = (): void => { installedThisSession = true; deferred = null; notify(); };

  return {
    start() {
      if (started) return;
      started = true;
      deps.eventTarget.addEventListener('beforeinstallprompt', onBeforeInstall);
      deps.eventTarget.addEventListener('appinstalled', onInstalled);
    },
    getEnvironment(): InstallEnvironment {
      return {
        isStandalone: deps.isStandalone() || installedThisSession,
        hasBeforeInstallPrompt: deferred !== null,
        isIos: deps.isIos(),
        isSecureContext: deps.isSecureContext(),
      };
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    promptInstall() {
      if (inFlight) return inFlight; // a double tap must not open two prompts
      const event = deferred;
      if (!event) return Promise.resolve({ status: 'unavailable' });
      deferred = null; // the browser allows each event to be used once
      inFlight = (async (): Promise<InstallPromptOutcome> => {
        try {
          await event.prompt();
          const choice = await event.userChoice;
          return choice.outcome === 'accepted' ? { status: 'accepted' } : { status: 'dismissed' };
        } catch (e) {
          return { status: 'failed', message: e instanceof Error ? e.message : String(e) };
        } finally {
          inFlight = null;
          notify();
        }
      })();
      notify(); // the held event is gone: advice must change right away
      return inFlight;
    },
  };
}
