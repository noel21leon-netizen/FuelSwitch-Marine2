// Ports (interfaces) implemented by adapters in src/infrastructure. Application code depends on these, never on browser APIs.
import type { AlertDue, ChangeoverLogEntry, VesselPosition } from '../domain';

// ---- Position ----
export type PositionErrorKind =
  | 'unsupported' | 'insecure-context' | 'permission-denied' | 'position-unavailable' | 'timeout' | 'invalid-fix';

export type PositionProviderStatus = 'started' | 'stopped' | 'finished';

/** Present on an error event only when the provider has scheduled an automatic restart of the GPS search. */
export interface PositionRetry { readonly attempt: number; readonly inSeconds: number }

export type PositionEvent =
  | { readonly type: 'position'; readonly position: VesselPosition }
  | { readonly type: 'error'; readonly kind: PositionErrorKind; readonly message: string; readonly retry?: PositionRetry }
  | { readonly type: 'status'; readonly status: PositionProviderStatus };

export type PositionListener = (event: PositionEvent) => void;

/** A source of position fixes: browser GPS or the deterministic simulator. Never invents a value it was not given. */
export interface PositionProvider {
  readonly kind: 'browser-gps' | 'simulator';
  /** Begin delivering events. Calling start twice must not create two watchers. */
  start(listener: PositionListener): void;
  stop(): void;
}

// ---- Notifications ----
export type NotificationPermissionState = 'granted' | 'denied' | 'default' | 'unsupported';

export type NotificationDelivery =
  | { readonly delivered: true }
  | { readonly delivered: false; readonly reason: 'unsupported' | 'permission-not-granted' | 'failed'; readonly detail: string };

export interface NotificationProvider {
  permission(): NotificationPermissionState;
  /** Must be called from a user gesture (button tap). */
  requestPermission(): Promise<NotificationPermissionState>;
  show(alert: AlertDue): Promise<NotificationDelivery>;
}

export type AlertDelivery = 'notified' | 'in-app-only';

// ---- Changeover log persistence (FR-009) ----
export interface LogLoadResult {
  readonly entries: readonly ChangeoverLogEntry[];
  /** Stored records that failed validation and were NOT loaded (never silently dropped without a count). */
  readonly rejectedCount: number;
}

export interface LogStore {
  loadAll(): Promise<LogLoadResult>;
  /** Insert or replace one entry by id. Rejects (throws) if the device could not store it. */
  put(entry: ChangeoverLogEntry): Promise<void>;
}

// ---- PWA / service worker (FR-010, NFR-003) ----
export type PwaUnsupportedReason = 'no-service-worker-api' | 'insecure-context' | 'development-build';

/** Facts reported by the service-worker adapter. It reports only what the browser told it; it never guesses. */
export type PwaLifecycleEvent =
  | { readonly type: 'unsupported'; readonly reason: PwaUnsupportedReason }
  | { readonly type: 'registering' }
  | { readonly type: 'registered' }
  /** The worker has finished installing, so the app shell and bundled demo data are in the cache. */
  | { readonly type: 'shell-cached' }
  /** A newer version is installed and waiting. Nothing changes until the user asks (ADR-035). */
  | { readonly type: 'update-waiting' }
  | { readonly type: 'failed'; readonly message: string };

export type PwaApplyResult = { readonly ok: true } | { readonly ok: false; readonly message: string };
export type PwaListener = (event: PwaLifecycleEvent) => void;

export interface ServiceWorkerRegistrar {
  /** Begin registration. Idempotent: calling it twice must not register twice. Never throws; failures arrive as events. */
  start(): void;
  /** Receive every event so far (replayed in order) and all later ones. Returns an unsubscribe function. */
  subscribe(listener: PwaListener): () => void;
  /** Ask the waiting worker to take over. Resolves when the new worker controls the page, or with a reason it did not. Never reloads. */
  applyUpdate(): Promise<PwaApplyResult>;
}

// ---- Install help (5C-2, ADR-038) ----

/** Facts about the page, gathered by an adapter. `hasBeforeInstallPrompt` is true only while the browser's install event is actually being held (Chromium fires it; Safari/Firefox do not). */
export interface InstallEnvironment {
  readonly isStandalone: boolean;
  readonly hasBeforeInstallPrompt: boolean;
  readonly isIos: boolean;
  readonly isSecureContext: boolean;
}

export type InstallPromptOutcome =
  | { readonly status: 'accepted' }
  | { readonly status: 'dismissed' }
  /** No install event is being held (never fired, already used, or already installed). */
  | { readonly status: 'unavailable' }
  | { readonly status: 'failed'; readonly message: string };

export interface InstallPromptPort {
  /** Current facts. Cheap and synchronous; safe to call on every change notification. */
  getEnvironment(): InstallEnvironment;
  /** Called after the environment may have changed (install event captured, app installed). Returns an unsubscribe function. */
  subscribe(listener: () => void): () => void;
  /** Show the browser's install prompt. Only call from a user tap. Single use: the held event is consumed. Never throws. */
  promptInstall(): Promise<InstallPromptOutcome>;
}
