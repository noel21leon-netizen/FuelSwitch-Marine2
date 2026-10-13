// Browser notification adapter (FR-008). Feature-detected and permission-gated. Delivery is best-effort and ONLY while the app is
// alive (NOTIFICATION_LIMIT_TEXT). Every failure is returned as a value so the UI can say what happened — nothing is swallowed.
import type { AlertDue } from '../../../domain';
import type {
  NotificationDelivery, NotificationPermissionState, NotificationProvider,
} from '../../../application/ports';
import { FEATURE_NAME } from '../../../shared/constants';

export interface NotificationOptionsLike { body?: string; tag?: string; requireInteraction?: boolean }

/** Structural subset of the browser Notification API + service-worker registration, injectable for tests. */
export interface NotificationEnvironment {
  readonly supported: boolean;
  permission(): NotificationPermissionState;
  requestPermission(): Promise<NotificationPermissionState>;
  /** Preferred path (required on Android Chrome). Resolves false if no service-worker registration is available. */
  showViaServiceWorker(title: string, options: NotificationOptionsLike): Promise<boolean>;
  /** Fallback for desktop browsers. May throw. */
  showDirect(title: string, options: NotificationOptionsLike): void;
}

export function detectNotificationEnvironment(): NotificationEnvironment {
  const supported = typeof Notification !== 'undefined';
  const asState = (p: string): NotificationPermissionState => (p === 'granted' || p === 'denied' || p === 'default' ? p : 'default');
  return {
    supported,
    permission: () => (supported ? asState(Notification.permission) : 'unsupported'),
    requestPermission: async () => (supported ? asState(await Notification.requestPermission()) : 'unsupported'),
    showViaServiceWorker: async (title, options) => {
      if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return false;
      const reg = await navigator.serviceWorker.getRegistration();
      if (!reg) return false;
      await reg.showNotification(title, options);
      return true;
    },
    showDirect: (title, options) => { new Notification(title, options); },
  };
}

export class BrowserNotificationProvider implements NotificationProvider {
  constructor(private readonly env: NotificationEnvironment = detectNotificationEnvironment()) {}

  permission(): NotificationPermissionState {
    return this.env.supported ? this.env.permission() : 'unsupported';
  }

  /** Call from a user gesture. Returns the resulting state; 'denied' is final until the user changes browser settings. */
  async requestPermission(): Promise<NotificationPermissionState> {
    if (!this.env.supported) return 'unsupported';
    try { return await this.env.requestPermission(); } catch { return this.permission(); }
  }

  async show(alert: AlertDue): Promise<NotificationDelivery> {
    if (!this.env.supported) return { delivered: false, reason: 'unsupported', detail: 'Notifications are not supported by this browser.' };
    if (this.env.permission() !== 'granted') {
      return { delivered: false, reason: 'permission-not-granted', detail: 'Notification permission has not been granted; the alert is shown in the app only.' };
    }
    const title = `${FEATURE_NAME} — advisory`;
    // `tag` lets the browser collapse a repeat of the same alert; the scheduler already suppresses duplicates.
    const options: NotificationOptionsLike = { body: alert.message, tag: alert.id, requireInteraction: false };
    try {
      if (await this.env.showViaServiceWorker(title, options)) return { delivered: true };
    } catch { /* fall through to the direct constructor */ }
    try {
      this.env.showDirect(title, options);
      return { delivered: true };
    } catch (e) {
      return { delivered: false, reason: 'failed', detail: e instanceof Error ? e.message : 'The browser refused to show the notification.' };
    }
  }
}
