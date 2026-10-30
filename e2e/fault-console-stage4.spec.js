import { test, expect } from '@playwright/test';
import { faultsTab, journeyHop, runHops, traceWith } from './fault-console-helpers.js';

// B-6d (docs/plans/2026-10-30-b6d-primary-down.md): the primary-down fault
// is the Database's own setPrimaryDown flag — the first fault where the GET
// story and the POST story split on one stage: POSTs answer a real 503
// (nothing written, nothing invalidated), replica GETs keep serving, and
// async /jobs still 202s. Every assertion reads the real sim machinery —
// frames, db stats, mission chips — not UI-local state. Titles are manifest
// pins — do not reword.

const primaryToggle = (page) => page.getByTestId('fault-toggle-primary');

const primaryChip = (page) => page.getByTestId('fault-state-primary');

const primaryCardChip = (page) => page.locator('#node-db [data-testid="node-down-chip"]');

const writeFailChip = (page) =>
  page
    .getByTestId('mission-item')
    .filter({ hasText: 'fail a write' })
    .getByTestId('mission-status');

test('should down the primary from the rail console and watch writes fail while reads keep serving', async ({
  page,
}) => {
  await page.goto('/panel.html?stage=4');
  await faultsTab(page).click();
  await expect(page.getByTestId('faults-section')).toBeVisible();
  await expect(primaryChip(page)).toHaveText('off');
  await expect(primaryToggle(page)).toHaveAttribute('aria-pressed', 'false');
  await expect(primaryCardChip(page)).toBeHidden();

  // The flip is component state: the console chip reads DOWN and the 10.30
  // card carries the real DOWN/danger chip — exactly one fault chip visible.
  await primaryToggle(page).click();
  await expect(primaryChip(page)).toHaveText('DOWN');
  await expect(primaryToggle(page)).toHaveAttribute('aria-pressed', 'true');
  await expect(primaryCardChip(page)).toBeVisible();
  await expect(primaryCardChip(page)).toHaveText('DOWN');
  await expect(page.locator('[data-testid="node-down-chip"]:visible')).toHaveCount(1);

  // A traced POST fails with the real 503 — the browser renders it and the
  // database writes nothing (P v1 rows, Writes: 0).
  await traceWith(page, { method: 'POST', path: '/about', hops: 7 });
  await expect(page.getByTestId('hop-status')).toContainText('Hop 7/7');
  await expect(page.getByTestId('browser-status-badge')).toContainText('503');
  await expect(page.getByTestId('browser-rendered-body')).toHaveText(
    'Write unavailable (primary down)',
  );
  await expect(page.getByTestId('db-stats')).toHaveText('Reads: 0 · Writes: 0 · Lag: 3t');
  await expect(page.getByTestId('db-rows-list')).toContainText('/about · P v1 · R v1');

  // Reads keep serving: a traced GET walks the replica-SELECT story to a
  // real 200 while the fault is still on.
  await traceWith(page, { method: 'GET', path: '/about', hops: 7 });
  await expect(page.getByTestId('browser-status-badge')).toContainText(/^200 /);
  await expect(page.getByTestId('db-stats')).toHaveText('Reads: 1 · Writes: 0 · Lag: 3t');

  // Restore: the chip and card chip clear together and the write lands.
  await primaryToggle(page).click();
  await expect(primaryChip(page)).toHaveText('off');
  await expect(primaryCardChip(page)).toBeHidden();
  await traceWith(page, { method: 'POST', path: '/about', hops: 7 });
  await expect(page.getByTestId('browser-status-badge')).toContainText(/^200 /);
  await expect(page.getByTestId('db-stats')).toHaveText('Reads: 1 · Writes: 1 · Lag: 3t');
  await expect(page.getByTestId('db-rows-list')).toContainText('/about · P v2 · R v1');
});

test('should narrate the failed write as a real 503 without ever faking a WRITE frame', async ({
  page,
}) => {
  await page.goto('/panel.html?stage=4');
  await faultsTab(page).click();
  await primaryToggle(page).click();
  await expect(primaryChip(page)).toHaveText('DOWN');

  await page.getByTestId('req-method').selectOption('POST');
  await page.getByTestId('url-input').fill('/about');
  await runHops(page, 5);
  // Hop 5/7 is the database hop: the refusal narrates itself from the real
  // record, and the WRITE sentence a healthy write carries does not appear.
  await expect(page.getByTestId('hop-status')).toContainText(
    'Database WRITE FAILED @ Primary (10.30) — primary down, nothing written',
  );
  await expect(journeyHop(page, 'WRITE FAILED')).toContainText(
    'hop 5/7 · Database WRITE FAILED (/about) @ 10.30 — primary down, nothing written',
  );
  await expect(journeyHop(page, 'Database WRITE /about')).toHaveCount(0);

  await runHops(page, 2);
  await expect(page.getByTestId('hop-status')).toContainText('Hop 7/7');
  // The full served arc: the 503 rides the normal hops to the browser — no
  // connection-refused card, no aborted hop. (Hop 7/7 repeats the delivery
  // frame, so the entry is anchored on its unique hop label.)
  await expect(journeyHop(page, 'hop 6/7')).toContainText('503 Write unavailable (primary down)');
  await expect(journeyHop(page, 'connection refused')).toHaveCount(0);
  await expect(page.getByTestId('browser-status-badge')).toContainText('503');

  // The mission's readout moves but stays pending — a restored write is
  // still missing.
  await expect(writeFailChip(page)).toContainText(/○ failed writes: 1 · last: WRITE_DOWN/);
  await expect(writeFailChip(page)).not.toContainText('✓');
});

test('should verify the stage-4 write-fail mission only after failed write and restored write', async ({
  page,
}) => {
  await page.goto('/panel.html?stage=4');
  await page.getByTestId('rail-tab-missions').click();
  // B-6d: stage 4 carries four since the write-fail mission joined the
  // write/stale/catchup trio.
  await expect(page.getByTestId('mission-item')).toHaveCount(4);
  await expect(writeFailChip(page)).toContainText('○ failed writes: 0 · last: —');

  // Phase 1 — down: the failed write is real (the readout moves), but no
  // restored write exists behind it, so the mission is NOT complete.
  await faultsTab(page).click();
  await primaryToggle(page).click();
  await traceWith(page, { method: 'POST', path: '/about', hops: 7 });
  await page.getByTestId('rail-tab-missions').click();
  await expect(writeFailChip(page)).toContainText(/○ failed writes: 1 · last: WRITE_DOWN/);
  await expect(writeFailChip(page)).not.toContainText('✓');

  // Phase 2 — restored: the failed write behind it and a real 200 WRITE on
  // top; only now both legs hold and the chip latches done.
  await faultsTab(page).click();
  await primaryToggle(page).click();
  await expect(primaryChip(page)).toHaveText('off');
  await traceWith(page, { method: 'POST', path: '/about', hops: 7 });
  await expect(page.getByTestId('browser-status-badge')).toContainText(/^200 /);
  await page.getByTestId('rail-tab-missions').click();
  await expect(writeFailChip(page)).toContainText(/✓ done · tick \d+/);
});
