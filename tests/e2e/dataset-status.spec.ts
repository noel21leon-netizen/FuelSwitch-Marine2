// Dataset status through the real UI: EXPIRED and UNVERIFIED data must never look like plain current data.
// The test datasets are served in place of the bundled demo file with page.route(); the app code is unchanged.
import { expect, test } from '@playwright/test';
import { DATASET_VARIANTS } from './fixtures/datasets';
import { DEMO_BANNER, blockMapTiles, goTab, metric, openApp } from './support';

test.describe('SYNTHETIC (the bundled demo file)', () => {
  test('is labelled SYNTHETIC with the demo notice, and still drives the ETA', async ({ page, context }) => {
    await blockMapTiles(context);
    await openApp(page);
    await expect(metric(page, 'Next boundary')).toContainText('(SYNTHETIC) — demo data');
    await expect(page.getByLabel('Status')).toContainText('ETA AVAILABLE');
    await goTab(page, 'More');
    await expect(page.getByText('SOx / PM boundary: SYNTHETIC')).toBeVisible();
    await expect(page.locator('.dataset-notice').filter({ hasText: DEMO_BANNER })).toBeVisible();
  });
});

test.describe('UNVERIFIED test file', () => {
  test('is labelled UNVERIFIED with a warning on the Dashboard and the More tab; the ETA is still calculated', async ({ page, context }) => {
    await blockMapTiles(context);
    await page.route('**/demo-data/synthetic-eca.geojson', (route) => route.fulfill({ json: DATASET_VARIANTS.unverified.json }));
    await openApp(page);
    await expect(metric(page, 'Next boundary')).toHaveText('E2E UNVERIFIED test file (UNVERIFIED) — not verified');
    await expect(page.getByLabel('Status')).toContainText('ETA AVAILABLE');
    await goTab(page, 'More');
    await expect(page.getByText('SOx / PM boundary: UNVERIFIED')).toBeVisible();
    await expect(page.locator('.dataset-notice--warn')).toContainText('WARNING: UNVERIFIED BOUNDARY — NOT FOR NAVIGATION OR REGULATORY COMPLIANCE');
  });
});

for (const [variant, expectedBlockText] of [
  ['expired-flag', 'is marked EXPIRED. It is not used for calculations.'],
  ['expired-date', 'has expired (effective to 2026-01-01T00:00:00Z). It is not used for calculations.'],
] as const) {
  test.describe(`EXPIRED test file (${variant})`, () => {
    test('is NOT USED: labelled EXPIRED everywhere, no boundary distance, ETA unavailable', async ({ page, context }) => {
      const { name, json } = DATASET_VARIANTS[variant];
      await blockMapTiles(context);
      await page.route('**/demo-data/synthetic-eca.geojson', (route) => route.fulfill({ json }));
      await openApp(page);
      await expect(metric(page, 'Next boundary')).toHaveText(`EXPIRED — ${name} (not used)`);
      await expect(metric(page, 'Boundary distance')).not.toContainText('nm along');
      await expect(page.getByLabel('Status')).toContainText('ETA UNAVAILABLE');
      await goTab(page, 'More');
      await expect(page.getByText('SOx / PM boundary: EXPIRED')).toBeVisible();
      const notice = page.locator('.dataset-notice--block');
      await expect(notice).toContainText('NOT USED:');
      await expect(notice).toContainText(expectedBlockText);
    });
  });
}
