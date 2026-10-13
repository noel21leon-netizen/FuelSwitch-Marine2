// Install help (FR-010, NFR-001). Pure: decides what to tell the user about installing the app. No browser globals.
// Never promises that an install prompt exists everywhere; HTTPS is required (ADR-015, ADR-038).
import type { InstallEnvironment, InstallPromptOutcome } from '../ports';
import { INSTALL_HTTPS_TEXT } from '../../shared/constants';

export type InstallAdvice =
  | { readonly kind: 'already-installed'; readonly label: string; readonly detail: string }
  | { readonly kind: 'install-prompt-available'; readonly label: string; readonly detail: string }
  | { readonly kind: 'ios-add-to-home-screen'; readonly label: string; readonly detail: string }
  | { readonly kind: 'not-available'; readonly reason: 'insecure-context' | 'no-install-prompt'; readonly label: string; readonly detail: string };

/**
 * Precedence (first match wins):
 *  1. standalone            → already installed (nothing to do)
 *  2. not a secure context  → not available: HTTPS is required (applies to iOS too, so it is checked before iOS)
 *  3. install event held    → the app can show the browser's prompt on a tap
 *  4. iOS                   → manual steps: Share → Add to Home Screen (iOS never offers a prompt)
 *  5. otherwise             → not available here, with the honest reason
 */
export function installAdvice(env: InstallEnvironment): InstallAdvice {
  if (env.isStandalone) {
    return { kind: 'already-installed', label: 'Installed', detail: 'This app is running as an installed app. Saved settings and log entries stay on this device.' };
  }
  if (!env.isSecureContext) {
    return {
      kind: 'not-available', reason: 'insecure-context', label: 'Install not available: page is not secure',
      detail: `${INSTALL_HTTPS_TEXT} Open the app from an https:// address (localhost on the same computer also counts).`,
    };
  }
  if (env.hasBeforeInstallPrompt) {
    return {
      kind: 'install-prompt-available', label: 'Install prompt available',
      detail: 'This browser can show an install prompt. Tap Install app and follow the browser\'s steps. The browser decides whether the install succeeds.',
    };
  }
  if (env.isIos) {
    return {
      kind: 'ios-add-to-home-screen', label: 'iPhone / iPad: Share → Add to Home Screen',
      detail: 'In Safari, tap the Share button, then Add to Home Screen. iOS does not show an install prompt, and other iOS browsers may not offer this. The app cannot detect whether you finished.',
    };
  }
  return {
    kind: 'not-available', reason: 'no-install-prompt', label: 'Install prompt not available here',
    detail: `This browser has not offered an install prompt. It may not support installing web apps, the app may already be installed, or the browser may offer it only from its own menu (for example Install app or Add to Home screen). ${INSTALL_HTTPS_TEXT}`,
  };
}

/** Text for the result of tapping Install app. The app never claims an install finished beyond what the browser reported. */
export function describeInstallOutcome(outcome: InstallPromptOutcome): string {
  switch (outcome.status) {
    case 'accepted':
      return 'The browser reports the install was accepted. Look for the app on your home screen or app list; this app cannot confirm it finished.';
    case 'dismissed':
      return 'Install was dismissed. The browser may offer the prompt again later.';
    case 'unavailable':
      return 'The install prompt is no longer available. Reload the page, or use the browser\'s own menu to install.';
    case 'failed':
      return `The install prompt failed: ${outcome.message}`;
  }
}
