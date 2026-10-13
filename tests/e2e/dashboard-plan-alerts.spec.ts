// Dashboard values, Plan entry, alerts and the skipped-alert row. Headless desktop Chromium, route replay (SIMULATED).
import { expect, test } from '@playwright/test';
import { ALERT_PLAN, DEMO_BANNER, SKIP_PLAN, advance, blockMapTiles, goTab, metric, openApp, setPlan } from './support';

test.beforeEach(async ({ page, context }) => {
  await blockMapTiles(context);
  await openApp(page);
});

test('Dashboard shows a SIMULATED fix with the demo notice and says what is unavailable until a duration is entered', async ({ page }) => {
  await expect(page.getByText(DEMO_BANNER).first()).toBeVisible();
  await expect(page.getByLabel('Status')).toContainText('SIMULATED');
  await expect(metric(page, 'Position')).toHaveText(/^-?\d+\.\d{5}, -?\d+\.\d{5}$/);
  await expect(metric(page, 'Fix age')).toContainText('fresh');
  await expect(metric(page, 'Fix time (UTC)')).toContainText(/^2026-10-12T00:0\d:/);
  await expect(metric(page, 'Next boundary')).toContainText('SYNTHETIC');
  await expect(metric(page, 'Boundary distance')).toContainText(/\d+\.\d nm along route/);
  await expect(metric(page, 'Changeover duration')).toHaveText('Enter a duration on Plan');
  await expect(metric(page, 'Planned start')).toContainText('No manually verified changeover duration has been entered.');
  await expect(metric(page, 'Skipped alerts')).toHaveText('None this session');
});

test('Plan entry: the duration is labelled manual (not FOBAS) and the planned start appears about 90 simulated minutes ahead', async ({ page }) => {
  await goTab(page, 'Plan');
  await expect(page.getByText('The FOBAS calculation is not implemented.')).toBeVisible();
  await setPlan(page, ALERT_PLAN.durationMinutes, ALERT_PLAN.marginMinutes);
  await expect(metric(page, 'Changeover duration')).toContainText('1180 min');
  await expect(metric(page, 'Changeover duration')).toContainText('NOT a FOBAS result');
  await expect(metric(page, 'Safety margin')).toHaveText('7 min');
  // 90 simulated minutes minus the few seconds already replayed; a range, not an exact number.
  await expect(metric(page, 'Planned start')).toHaveText(/· (8[5-9]|90) min$/);
});

test('Alerts fire as simulated time passes: 60, then 30, then start-overdue — each visible in the Log tab and none skipped', async ({ page }) => {
  await setPlan(page, ALERT_PLAN.durationMinutes, ALERT_PLAN.marginMinutes);
  await goTab(page, 'Log');
  await page.getByRole('button', { name: 'Create entry from current plan' }).click();
  await expect(page.getByText('Log entry created from the current plan.')).toBeVisible();
  const ack = (re: RegExp) => page.getByRole('button', { name: re });
  await expect(ack(/^Acknowledge:/)).toHaveCount(0);

  await advance(page, 345_000); // about 191 replay steps, beyond the 60-minute point (~step 180)
  await expect(ack(/^Acknowledge: .*\(60-min alert\)/)).toBeVisible();
  await expect(ack(/\(30-min alert\)/)).toHaveCount(0);

  await advance(page, 330_000); // beyond the 30-minute point (~step 360)
  await expect(ack(/^Acknowledge: .*\(30-min alert\)/)).toBeVisible();

  await advance(page, 330_000); // beyond the planned start (~step 540)
  await expect(ack(/^Acknowledge: Planned changeover start time has passed/)).toBeVisible();

  await goTab(page, 'Dashboard');
  await expect(metric(page, 'Skipped alerts')).toHaveText('None this session');
});

test('A plan that is already close at first sight skips the earlier threshold and the Dashboard says why', async ({ page }) => {
  await setPlan(page, SKIP_PLAN.durationMinutes, SKIP_PLAN.marginMinutes);
  const skipped = metric(page, 'Skipped alerts');
  await expect(skipped).toContainText('60-min alert skipped: already passed when the first usable plan was calculated');
  await expect(skipped).toContainText('the 30-min alert was raised instead');
});
