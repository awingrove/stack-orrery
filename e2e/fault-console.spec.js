import { test, expect } from '@playwright/test';

// B-6 fault console (docs/plans/2026-10-27-b6-fault-console.md): the rail's
// fourth surface flips REAL component state (webserver setDown) and the
// transport refuses on the wire before the server is consulted. Every
// assertion reads the real sim machinery — refusal frames, queue depth,
// mission chips — not UI-local state. Titles are manifest pins — do not
// reword.

const faultsTab = (page) => page.getByTestId('rail-tab-faults');

const toggle = (page) => page.getByTestId('fault-toggle-webserver');

const stateChip = (page) => page.getByTestId('fault-state-webserver');

// Crowd ticks land refused sends only while down; each tick is a real
// arrival roll, so read the refusal tally off the recovery mission's own
// progress line after a few ticks.
const recoveryChip = (page) =>
  page.getByTestId('mission-item').filter({ hasText: 'refusal' }).getByTestId('mission-status');

test('should toggle the webserver fault from the rail console and read connection refused in the trace', async ({
  page,
}) => {
  await page.goto('/panel.html');

  // Stage 1 carries the stage's own fault switch; other stages show the
  // console's empty-state line, not blank space.
  await faultsTab(page).click();
  await expect(page.getByTestId('faults-section')).toBeVisible();
  await expect(stateChip(page)).toHaveText('off');
  await expect(toggle(page)).toHaveAttribute('aria-pressed', 'false');
  await expect(page.getByTestId('node-down-chip')).toBeHidden();

  await page.getByTestId('stage-pill-2').click();
  await expect(page.locator('.rail-host:not([hidden]) .rail-empty')).toHaveText(
    'No faults for this stage yet.',
  );
  await expect(page.getByTestId('faults-section')).toHaveCount(0);
  await page.getByTestId('stage-pill-1').click();
  await expect(page.getByTestId('faults-section')).toBeVisible();

  // Flipping the switch sets the component's down flag: DOWN chip on the
  // 10.1 card and on the console row, both read back from the snapshot.
  await toggle(page).click();
  await expect(stateChip(page)).toHaveText('DOWN');
  await expect(toggle(page)).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('node-down-chip')).toBeVisible();
  await expect(page.getByTestId('node-down-chip')).toHaveText('DOWN');

  // The trace aborts at the deliver hop with the transport's own verdict:
  // hop 2/2, no served record, the browser shows its refusal error page.
  await page.getByTestId('url-input').fill('/about');
  await page.getByTestId('btn-next-hop').click();
  await expect(page.getByTestId('hop-status')).toContainText('Hop 1/4');
  await page.getByTestId('btn-next-hop').click();
  await expect(page.getByTestId('hop-status')).toContainText('Hop 2/2');
  await expect(page.getByTestId('hop-status')).toContainText('connection refused');
  const refusalEntry = page.locator('.journey-log .journey-entry', {
    hasText: 'connection refused',
  });
  await expect(refusalEntry).toContainText('hop 2/2');
  await expect(page.getByTestId('browser-status-badge')).toContainText('REFUSED');
  await expect(page.getByTestId('browser-rendered-body')).toContainText('connection refused');

  // Toggling back restores normal service — the same switch, nothing else.
  await toggle(page).click();
  await expect(stateChip(page)).toHaveText('off');
  await expect(page.getByTestId('node-down-chip')).toBeHidden();
});

test('should keep crowd sends refused while down and restore a 200 after toggle-back', async ({
  page,
}) => {
  await page.goto('/panel.html');
  await faultsTab(page).click();
  await toggle(page).click();
  await expect(stateChip(page)).toHaveText('DOWN');

  // Crowd sends over the wire, while down: refusals count, but the queue
  // depth stays flat — refused arrivals go unenqueued.
  for (let i = 0; i < 5; i += 1) await page.getByTestId('step-button').click();
  await expect(page.getByTestId('queue-depth')).toHaveText('0');
  await expect(page.getByTestId('served')).toHaveText('0');

  // The refusal tally is read off the recovery mission's progress line —
  // the sim is the referee (rows refresh while the missions surface is
  // docked but not shown).
  await page.getByTestId('rail-tab-missions').click();
  await expect(recoveryChip(page)).toContainText(/○ refusals: [1-9]/);

  // Toggle back: the very next trace walks the restored served story and
  // the browser renders a real 200.
  await faultsTab(page).click();
  await toggle(page).click();
  await expect(stateChip(page)).toHaveText('off');
  await page.getByTestId('btn-url-go').click();
  await expect(page.getByTestId('browser-status-badge')).toContainText(/^200 /);
  await expect(page.getByTestId('queue-depth')).toHaveText('0');
});

test('should verify the stage-1 recovery mission only after refusal and recovery', async ({
  page,
}) => {
  await page.goto('/panel.html');
  await page.getByTestId('rail-tab-missions').click();
  await expect(recoveryChip(page)).toContainText('○ refusals: 0');

  // Phase 1 — down: the refusal is real (the tally moves), but no served
  // exchange exists, so the mission is NOT complete.
  await faultsTab(page).click();
  await toggle(page).click();
  await page.getByTestId('url-input').fill('/about');
  await page.getByTestId('btn-next-hop').click(); // hop 1: the emit estimate
  await page.getByTestId('btn-next-hop').click(); // hop 2: refused at the deliver hop
  await expect(page.getByTestId('hop-status')).toContainText('Hop 2/2');
  await expect(page.getByTestId('hop-status')).toContainText('connection refused');
  await expect(recoveryChip(page)).toContainText(/○ refusals: [1-9]/);
  await expect(recoveryChip(page)).not.toContainText('✓');

  // Phase 2 — restored: a refusal behind it and a served 200 on top; only
  // now the detector's two legs both hold and the chip latches done.
  await toggle(page).click();
  await expect(stateChip(page)).toHaveText('off');
  await page.getByTestId('btn-url-go').click();
  await expect(page.getByTestId('browser-status-badge')).toContainText(/^200 /);
  await expect(recoveryChip(page)).toContainText(/✓ done · tick \d+/);
});
