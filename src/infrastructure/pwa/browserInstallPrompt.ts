// Browser wiring for the install-prompt adapter (5C-2). The only file that reads window/navigator for install facts.
// Created at import time so the one-shot `beforeinstallprompt` event is not missed before React mounts.
import { createInstallPrompt, type InstallPromptController } from './installPrompt';

interface NavigatorWithStandalone { readonly standalone?: boolean; readonly platform?: string; readonly maxTouchPoints?: number; readonly userAgent?: string }

export function createBrowserInstallPrompt(win: Window): InstallPromptController {
  const nav = win.navigator as unknown as NavigatorWithStandalone;
  return createInstallPrompt({
    eventTarget: win as unknown as { addEventListener(t: string, l: (e: unknown) => void): void; removeEventListener(t: string, l: (e: unknown) => void): void },
    isStandalone: () => {
      try {
        if (win.matchMedia('(display-mode: standalone)').matches) return true;
      } catch { /* matchMedia unavailable: fall through to the iOS flag */ }
      return nav.standalone === true; // iOS Safari home-screen apps
    },
    // iPadOS 13+ reports itself as a Mac with touch: treat a touch-capable "MacIntel" as iPad.
    isIos: () => /iPad|iPhone|iPod/.test(nav.userAgent ?? '') || (nav.platform === 'MacIntel' && (nav.maxTouchPoints ?? 0) > 1),
    isSecureContext: () => win.isSecureContext === true,
  });
}

export const browserInstallPrompt: InstallPromptController = createBrowserInstallPrompt(window);
browserInstallPrompt.start();
