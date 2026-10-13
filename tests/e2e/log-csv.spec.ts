// Changeover log: create, confirm start/completion (human-confirmed only), CSV download, persistence across reload.
import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { ALERT_PLAN, advance, blockMapTiles, goTab, metric, openApp, setPlan } from './support';

test('Log entry lifecycle and CSV export (SIMULATED provenance), then the entry survives a reload', async ({ page, context }) => {
  await blockMapTiles(context);
  await openApp(page);
  await setPlan(page, ALERT_PLAN.durationMinutes, ALERT_PLAN.marginMinutes);
  await goTab(page, 'Log');

  await expect(page.getByText('No log entries yet.')).toBeVisible();
  await expect(page.getByText('SIMULATED — entries created now are marked SIMULATED and are not real events.')).toBeVisible();
  await page.getByRole('button', { name: 'Create entry from current plan' }).click();
  await expect(page.getByText('Log entry created from the current plan.')).toBeVisible();
  const entry = page.locator('article.log-entry');
  await expect(entry).toHaveCount(1);
  await expect(entry.locator('.chip--simulated')).toHaveText('SIMULATED');
  await expect(metric(page, 'Confirmed start')).toHaveText('Not confirmed');
  await expect(metric(page, 'Actual duration')).toHaveText('Unavailable until both times are confirmed');

  // The start and completion come from the person pressing the buttons, never from the replay or the plan.
  await page.getByRole('button', { name: 'Confirm changeover STARTED' }).click();
  await expect(page.getByText('Start recorded as confirmed by you.')).toBeVisible();
  await expect(metric(page, 'Confirmed start')).not.toHaveText('Not confirmed');
  await advance(page, 120_000); // later simulated time, so completion is after start
  await page.getByRole('button', { name: 'Confirm changeover COMPLETED' }).click();
  await expect(page.getByText('Completion recorded as confirmed by you.')).toBeVisible();
  await expect(metric(page, 'Actual duration')).toHaveText(/^\d+ min \(from the times you entered\)$/);

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Download CSV' }).click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/\.csv$/);
  const path = await download.path();
  const csv = readFileSync(path, 'utf8');
  const [header = '', ...rows] = csv.split(/\r?\n/).filter((l) => l.trim() !== '');
  expect(header.split(',')).toEqual(expect.arrayContaining(['provenance', 'data_notice']));
  expect(rows).toHaveLength(1);
  expect(rows[0]).toContain('SIMULATED');

  await page.reload();
  await goTab(page, 'Log');
  await expect(page.locator('article.log-entry')).toHaveCount(1);
});
