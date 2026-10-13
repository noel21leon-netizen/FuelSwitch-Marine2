// Shared helpers for the e2e specs. Desktop headless Chromium only (see playwright.config.ts).
import { expect, type BrowserContext, type Locator, type Page } from '@playwright/test';
import { E2E_START_UTC } from './fixtures/datasets';

export const DEMO_BANNER = 'DEMO DATA — NOT FOR NAVIGATION OR REGULATORY COMPLIANCE';

export type TabName = 'Dashboard' | 'Map' | 'Plan' | 'Log' | 'More';

/** Map tiles need the internet and are never part of what these tests check. */
export async function blockMapTiles(context: BrowserContext): Promise<void> {
  await context.route(/tile\.openstreetmap\.org/, (route) => route.abort());
}

/**
 * Opens the app with a controllable page clock and then PAUSES it.
 * The replay emits one fix every 1.8 s of page time and each fix advances simulated time by 10 s, so reaching the
 * boundary takes hours of real time. With the clock paused, `advance()` moves page time on demand.
 */
export async function openApp(page: Page): Promise<void> {
  await page.clock.install({ time: new Date(E2E_START_UTC) });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'FuelSwitch Marine' })).toBeVisible();
  await page.clock.pauseAt(new Date(Date.parse(E2E_START_UTC) + 60_000));
}

/** Advances page time in small steps so the app's async work (controller ticks, React renders) can settle between steps. */
export async function advance(page: Page, totalMs: number, stepMs = 9_000): Promise<void> {
  for (let done = 0; done < totalMs; done += stepMs) await page.clock.runFor(Math.min(stepMs, totalMs - done));
}

export async function goTab(page: Page, tab: TabName): Promise<void> {
  await page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: tab, exact: true }).click();
}

const escapeRegExp = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** The <dd> that follows the <dt> with exactly this label (Dashboard and log metrics). */
export function metric(page: Page, label: string): Locator {
  return page.locator('dt', { hasText: new RegExp(`^${escapeRegExp(label)}$`) }).locator('xpath=following-sibling::dd[1]');
}

/** Enters the manually verified duration and safety margin on the Plan tab, then returns to the Dashboard. */
export async function setPlan(page: Page, durationMinutes: number, marginMinutes: number): Promise<void> {
  await goTab(page, 'Plan');
  await page.getByLabel('Manually verified duration (minutes)').fill(String(durationMinutes));
  await page.getByLabel('Safety margin (minutes)').fill(String(marginMinutes));
  await goTab(page, 'Dashboard');
}

/**
 * Plan used by the alert tests. In route replay the boundary is 255.3 nm / 1276.7 simulated minutes from the start at 12 kn
 * (derived with the domain code while designing the test, see KOS 11). 1180 + 7 min of lead therefore puts the planned start
 * about 90 simulated minutes after the start, so the 60/30/15/5-minute alerts then the start-overdue alert follow in order.
 */
export const ALERT_PLAN = { durationMinutes: 1180, marginMinutes: 7 } as const;
/** Planned start only ~17 simulated minutes away at the first plan: the 60-minute threshold is already past (skipped), 30 is raised. */
export const SKIP_PLAN = { durationMinutes: 1200, marginMinutes: 60 } as const;
