import { test, expect } from '@playwright/test';
import { faultsTab, journeyHop, missionChip, traceWith } from './fault-console-helpers.js';

// B-6e (docs/plans/2026-10-31-b6e-worker-crash.md): the worker-crash fault
// is the queue's OWN setCrashed flag — the 202 story keeps answering while
// the worker's step() pauses, the backlog grows visibly, and a job caught
// ACTIVE at the crash moment re-delivers on restore. Every assertion reads
// the real sim machinery — crash-tail frames, queue stats, job rows,
// mission chips — not UI-local state. Titles are manifest pins — do not
// reword.

const workerToggle = (page) => page.getByTestId('fault-toggle-worker');

const workerChip = (page) => page.getByTestId('fault-state-worker');

const workerCardChip = (page) => page.locator('#node-worker [data-testid="node-down-chip"]');

const redeliverChip = (page) => missionChip(page, 'Crash the worker');

// "Enqueued: N · Completed: M · Active: ..."-shaped queue HUD line.
const queueStats = (page) => page.getByTestId('queue-stats');

const dbStatsText = (page) => page.getByTestId('db-stats');

test('should crash the worker from the rail console and watch async jobs wait, then re-deliver', async ({
  page,
}) => {
  await page.goto('/panel.html?stage=5');
  await faultsTab(page).click();
  await expect(page.getByTestId('faults-section')).toBeVisible();
  await expect(workerChip(page)).toHaveText('off');
  await expect(workerToggle(page)).toHaveAttribute('aria-pressed', 'false');
  await expect(workerCardChip(page)).toBeHidden();

  // A real async job first: the 8-hop POST /jobs story lands it in the
  // queue, the browser renders the 202 before any work ran.
  await traceWith(page, { method: 'POST', path: '/jobs', hops: 8 });
  await expect(page.getByTestId('browser-status-badge')).toContainText('202');
  await expect(queueStats(page)).toHaveText(/Enqueued: 1 · Completed: 0/);
  await expect(page.getByTestId('queue-jobs-list')).toContainText('#1 · /jobs · queued @ tick');

  // One tick puts the job in flight — the crash then catches it mid-flight.
  await page.getByTestId('step-button').click();
  await expect(page.getByTestId('worker-stats')).toContainText('processing #1');

  // The flip is component state: the console chip reads DOWN and the 10.41
  // card carries the real DOWN/danger chip — exactly one fault chip
  // visible.
  await workerToggle(page).click();
  await expect(workerChip(page)).toHaveText('DOWN');
  await expect(workerToggle(page)).toHaveAttribute('aria-pressed', 'true');
  await expect(workerCardChip(page)).toBeVisible();
  await expect(workerCardChip(page)).toHaveText('DOWN');
  await expect(page.locator('[data-testid="node-down-chip"]:visible')).toHaveCount(1);

  // While crashed the worker is honest idle — the in-flight job sits back
  // in the queue, and ticks drain nothing (Completed stays 0).
  await expect(page.getByTestId('worker-stats')).toContainText('Idle');
  await expect(page.getByTestId('queue-jobs-list')).toContainText('#1 · /jobs · queued @ tick');
  await expect(page.getByTestId('worker-stats')).not.toContainText('processing');
  await expect(queueStats(page)).toHaveText(/Enqueued: 1 · Completed: 0/);
  for (let i = 0; i < 3; i += 1) await page.getByTestId('step-button').click();
  await expect(queueStats(page)).toHaveText(/Completed: 0/);

  // The backlog still grows — a new 202 answers while the worker waits.
  await traceWith(page, { method: 'POST', path: '/jobs', hops: 8 });
  await expect(page.getByTestId('browser-status-badge')).toContainText('202');
  await expect(queueStats(page)).toHaveText(/Enqueued: 2 · Completed: 0/);
  await expect(page.getByTestId('queue-jobs-list')).toContainText('#2 · /jobs · queued @ tick');

  // Restore: the chip and card chip clear together, and delivery resumes —
  // the re-delivered head job re-times from scratch and commits for real.
  await workerToggle(page).click();
  await expect(workerChip(page)).toHaveText('off');
  await expect(workerCardChip(page)).toBeHidden();
  await page.getByTestId('step-button').click();
  await expect(page.getByTestId('worker-stats')).toContainText('processing #1');
  for (let i = 0; i < 2; i += 1) await page.getByTestId('step-button').click();
  await expect(page.getByTestId('worker-stats')).toContainText('processing #2');
  await expect(queueStats(page)).toHaveText(/Enqueued: 2 · Completed: 1 · Active/);
  for (let i = 0; i < 2; i += 1) await page.getByTestId('step-button').click();
  await expect(queueStats(page)).toHaveText(/Enqueued: 2 · Completed: 2 · Active: none/);
  await expect(dbStatsText(page)).toContainText('Writes: 2');
});

test('should narrate the crashed worker without ever faking a commit', async ({ page }) => {
  await page.goto('/panel.html?stage=5');
  await faultsTab(page).click();

  // Crash BEFORE any job exists — the flip moves nothing.
  await workerToggle(page).click();
  await expect(workerChip(page)).toHaveText('DOWN');

  // The full async story keeps its 202 arc (the enqueue runs before any
  // worker consult), and hop 8/8 reads the LIVE queue state — one job
  // waiting — while the commit sentence a healthy tail carries stays gone
  // from the whole log.
  await traceWith(page, { method: 'POST', path: '/jobs', hops: 8 });
  await expect(page.getByTestId('hop-status')).toContainText('Hop 8/8');
  await expect(page.getByTestId('hop-status')).toContainText(
    'Worker (10.41) crashed — 1 job(s) waiting in the queue (nothing committed)',
  );
  await expect(journeyHop(page, 'crashed — 1 job(s) waiting')).toContainText(
    'hop 8/8 · Worker 10.41 crashed — 1 job(s) waiting in the queue (nothing committed)',
  );
  await expect(journeyHop(page, 'finished job and committed')).toHaveCount(0);
  await expect(journeyHop(page, 'connection refused')).toHaveCount(0);
  // The browser really got its 202 — the crash faked no refusal either.
  await expect(page.getByTestId('browser-status-badge')).toContainText('202');
  await expect(queueStats(page)).toHaveText(/Enqueued: 1 · Completed: 0/);

  // The synchronous story is untouched by the worker's crash: a traced
  // POST write-through walks the normal cache/database arc to a real 200.
  await traceWith(page, { method: 'POST', path: '/about', hops: 8 });
  await expect(page.getByTestId('browser-status-badge')).toContainText(/^200 /);
  await expect(journeyHop(page, 'Database WRITE /about')).toContainText('hop 4/8');
  await expect(dbStatsText(page)).toContainText('Writes: 1');
});

test('should verify the stage-5 re-delivery mission only after crash and restore', async ({
  page,
}) => {
  await page.goto('/panel.html?stage=5');
  await page.getByTestId('rail-tab-missions').click();
  // B-6e: stage 5 carries four since the re-delivery mission joined the
  // 202/commit/drain trio.
  await expect(page.getByTestId('mission-item')).toHaveCount(4);
  await expect(redeliverChip(page)).toContainText('○ redelivered: 0 · commits: 0');

  // Phase 1 — a pre-crash commit alone cannot latch it: a real commit
  // tallies Completed, but with zero redeliveries behind it the readout
  // stays pending.
  await traceWith(page, { method: 'POST', path: '/jobs', hops: 8 });
  for (let i = 0; i < 3; i += 1) await page.getByTestId('step-button').click();
  await expect(queueStats(page)).toHaveText(/Completed: 1/);
  await expect(redeliverChip(page)).toContainText('○ redelivered: 0 · commits: 0');
  await expect(redeliverChip(page)).not.toContainText('✓');

  // Phase 2 — crash with the next job in flight: the redelivery leg moves,
  // but no re-delivered commit is behind it yet, so the chip stays pending.
  await faultsTab(page).click();
  await traceWith(page, { method: 'POST', path: '/jobs', hops: 8 });
  await page.getByTestId('step-button').click();
  await workerToggle(page).click();
  await expect(workerChip(page)).toHaveText('DOWN');
  await page.getByTestId('rail-tab-missions').click();
  await expect(redeliverChip(page)).toContainText(/○ redelivered: 1 · commits: 0/);
  await expect(redeliverChip(page)).not.toContainText('✓');

  // Phase 3 — restore: the SAME work re-delivers and commits; only now
  // both legs hold and the chip latches done.
  await faultsTab(page).click();
  await workerToggle(page).click();
  await expect(workerChip(page)).toHaveText('off');
  await page.getByTestId('step-button').click();
  for (let i = 0; i < 2; i += 1) await page.getByTestId('step-button').click();
  await expect(queueStats(page)).toHaveText(/Enqueued: 2 · Completed: 2 · Active: none/);
  await page.getByTestId('rail-tab-missions').click();
  await expect(redeliverChip(page)).toContainText(/✓ done · tick \d+/);
});
