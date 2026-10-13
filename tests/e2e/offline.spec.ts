// Offline reload after the first load. Uses the REAL service worker (the other specs block it) and a real clock.
// Headless desktop Chromium only: this says nothing about iOS Safari, Android Chrome, storage eviction or a phone's cache limits (KOS 13).
import { expect, test } from '@playwright/test';
import { DEMO_BANNER, blockMapTiles, goTab, metric } from './support';

test.use({ serviceWorkers: 'allow' });

test('after the first load finishes caching, a reload with the network off still opens the app with its bundled demo data', async ({ page, context }) => {
  await blockMapTiles(context);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'FuelSwitch Marine' })).toBeVisible();

  await goTab(page, 'More');
  // "Offline ready" means the worker finished installing (R-031); the reload below is the actual offline check.
  await expect(page.getByText('Offline ready', { exact: true })).toBeVisible({ timeout: 45_000 });

  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'FuelSwitch Marine' })).toBeVisible();
  await expect(page.getByText('OFFLINE', { exact: true })).toBeVisible();
  await expect(page.getByText(DEMO_BANNER).first()).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(0); // no "could not load the bundled demo data" error
  await expect(metric(page, 'Next boundary')).toContainText('SYNTHETIC'); // the dataset came from the precache
  await expect(metric(page, 'Position')).toHaveText(/^-?\d+\.\d{5}, -?\d+\.\d{5}$/);
});
