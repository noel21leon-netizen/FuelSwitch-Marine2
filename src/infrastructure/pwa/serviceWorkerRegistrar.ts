// Service-worker registration adapter, browser-free core (FR-010, NFR-003, ADR-034).
// Do NOT import workbox-window here: the real library is wired in browserServiceWorker.ts so this logic stays testable.
// Reports only what the browser reports. A service worker does not track location and this adapter never implies it does.
import type { PwaApplyResult, PwaLifecycleEvent, PwaListener, ServiceWorkerRegistrar } from '../../application/ports';

/** The few worker facts the adapter needs, in plain callbacks (the Workbox wrapper maps its events onto these). */
export interface WorkerHandle {
  /** Install finished. `isUpdate` is false for the very first install. */
  onInstalled(callback: (info: { readonly isUpdate: boolean }) => void): void;
  /** A newer worker is installed and waiting. */
  onWaiting(callback: () => void): void;
  /** A new worker took control of this page. */
  onControlling(callback: () => void): void;
  /** Resolves when registration finished; `hasActiveWorker` is true when a worker is already active (repeat visit). */
  register(): Promise<{ readonly hasActiveWorker: boolean }>;
  /** Ask the waiting worker to activate (posts SKIP_WAITING). */
  skipWaiting(): void;
}

export interface RegistrarEnvironment {
  readonly hasServiceWorkerApi: boolean;
  readonly isSecureContext: boolean;
  readonly isProductionBuild: boolean;
}

export interface RegistrarOptions {
  /** Read lazily at start() so nothing touches browser globals at import time. */
  readonly environment: () => RegistrarEnvironment;
  readonly createHandle: () => WorkerHandle;
  /** How long to wait for the new worker to take control after the user asked. Default 10 000 ms. */
  readonly applyTimeoutMs?: number;
  readonly setTimeoutFn?: (callback: () => void, ms: number) => unknown;
  readonly clearTimeoutFn?: (id: unknown) => void;
}

const DEFAULT_APPLY_TIMEOUT_MS = 10_000;

export function createServiceWorkerRegistrar(options: RegistrarOptions): ServiceWorkerRegistrar {
  const setTimer = options.setTimeoutFn ?? ((callback, ms) => globalThis.setTimeout(callback, ms));
  const clearTimer = options.clearTimeoutFn ?? ((id) => globalThis.clearTimeout(id as ReturnType<typeof setTimeout>));
  const applyTimeoutMs = options.applyTimeoutMs ?? DEFAULT_APPLY_TIMEOUT_MS;

  const events: PwaLifecycleEvent[] = [];
  const listeners = new Set<PwaListener>();
  let started = false;
  let handle: WorkerHandle | null = null;
  let updateWaiting = false;
  let pending: { readonly promise: Promise<PwaApplyResult>; readonly complete: (result: PwaApplyResult) => void } | null = null;

  const emit = (event: PwaLifecycleEvent): void => {
    events.push(event);
    for (const listener of [...listeners]) {
      try { listener(event); } catch { /* one broken listener must not stop the others or the registration */ }
    }
  };

  const unsupportedReason = (): Extract<PwaLifecycleEvent, { type: 'unsupported' }>['reason'] | null => {
    const env = options.environment();
    if (!env.isProductionBuild) return 'development-build';
    if (!env.isSecureContext) return 'insecure-context';
    if (!env.hasServiceWorkerApi) return 'no-service-worker-api';
    return null;
  };

  function start(): void {
    if (started) return;
    started = true;
    let reason: ReturnType<typeof unsupportedReason>;
    try { reason = unsupportedReason(); } catch (error) { emit({ type: 'failed', message: `Could not check service worker support: ${String(error)}` }); return; }
    if (reason) { emit({ type: 'unsupported', reason }); return; }
    emit({ type: 'registering' });
    let created: WorkerHandle;
    try { created = options.createHandle(); } catch (error) { emit({ type: 'failed', message: `Service worker could not be created: ${String(error)}` }); return; }
    handle = created;
    created.onInstalled(({ isUpdate }) => { if (!isUpdate) emit({ type: 'shell-cached' }); });
    created.onWaiting(() => { updateWaiting = true; emit({ type: 'update-waiting' }); });
    created.onControlling(() => { pending?.complete({ ok: true }); });
    created.register().then(
      ({ hasActiveWorker }) => { emit({ type: 'registered' }); if (hasActiveWorker) emit({ type: 'shell-cached' }); },
      (error: unknown) => emit({ type: 'failed', message: `Service worker registration failed: ${String(error)}` }),
    );
  }

  function subscribe(listener: PwaListener): () => void {
    for (const event of events) listener(event);
    listeners.add(listener);
    return () => { listeners.delete(listener); };
  }

  function applyUpdate(): Promise<PwaApplyResult> {
    if (pending) return pending.promise;
    if (!handle || !updateWaiting) return Promise.resolve({ ok: false, message: 'No update is waiting.' });
    const worker = handle;
    let settle!: (result: PwaApplyResult) => void;
    const promise = new Promise<PwaApplyResult>((resolve) => { settle = resolve; });
    let timer: unknown;
    const complete = (result: PwaApplyResult): void => {
      if (!pending) return;
      clearTimer(timer);
      pending = null;
      settle(result);
    };
    pending = { promise, complete };
    timer = setTimer(
      () => complete({ ok: false, message: `The new version did not take over within ${Math.round(applyTimeoutMs / 1000)} s. You can try again, or close and reopen the app.` }),
      applyTimeoutMs,
    );
    try { worker.skipWaiting(); } catch (error) { complete({ ok: false, message: `The update request failed: ${String(error)}` }); }
    return promise;
  }

  return { start, subscribe, applyUpdate };
}
