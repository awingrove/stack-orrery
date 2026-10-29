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
  // B-6b: both fault cards mount their DOWN chip shells now — the stage-1
  // assertions scope to the 10.1 card.
  await expect(page.locator('#node-webserver [data-testid="node-down-chip"]')).toBeHidden();

  await page.getByTestId('stage-pill-2').click();
  // B-6b: stage 2 now owns the backend-10.12 row — the console shows it,
  // still reading component state, and stage 3 carries the empty-state.
  await expect(page.getByTestId('fault-toggle-backend-10-12')).toBeVisible();
  await expect(page.getByTestId('fault-state-backend-10-12')).toHaveText('off');
  await page.getByTestId('stage-pill-3').click();
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
  await expect(page.locator('#node-webserver [data-testid="node-down-chip"]')).toBeVisible();
  await expect(page.locator('#node-webserver [data-testid="node-down-chip"]')).toHaveText('DOWN');
  await expect(page.locator('#node-webserver-2 [data-testid="node-down-chip"]')).toBeHidden();

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
  await expect(page.locator('#node-webserver [data-testid="node-down-chip"]')).toBeHidden();
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

// B-6b (docs/plans/2026-10-28-b6b-backend-failover.md): on stage 2 the down
// backend is not a refusal story — the LB cursor skips it and the pool
// keeps serving. Titles are manifest pins — do not reword.

const backendToggle = (page) => page.getByTestId('fault-toggle-backend-10-12');

const backendChip = (page) => page.getByTestId('fault-state-backend-10-12');

const failoverChip = (page) =>
  page.getByTestId('mission-item').filter({ hasText: 'rejoin' }).getByTestId('mission-status');

test('should skip the down backend in the round-robin and keep the crowd served', async ({
  page,
}) => {
  await page.goto('/panel.html');
  await page.getByTestId('stage-pill-2').click();
  await expect(page.getByTestId('node-lb')).toBeVisible();
  await page.getByTestId('rail-tab-faults').click();
  // Take 10.12 down before anything is sent, so its per-backend count is
  // still zero and the failover mission cannot latch off a warm count.
  await backendToggle(page).click();
  await expect(backendChip(page)).toHaveText('DOWN');
  await expect(backendToggle(page)).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('fault-toggle-webserver')).toHaveCount(0);
  // Exactly one DOWN chip on the page — the 10.12 card's; 10.11 stays normal.
  const down12 = page.locator('#node-webserver-2 [data-testid="node-down-chip"]');
  await expect(down12).toBeVisible();
  await expect(down12).toHaveText('DOWN');
  await expect(page.locator('#node-webserver [data-testid="node-down-chip"]')).toBeHidden();
  await expect(page.locator('[data-testid="node-down-chip"]:visible')).toHaveCount(1);

  // Crowd while down: served keeps flowing and 10.12's counter stays frozen.
  for (let i = 0; i < 10; i += 1) await page.getByTestId('step-button').click();
  await expect(page.getByTestId('served')).not.toHaveText('0');
  const frozen = await page.getByTestId('lb-backend-2').textContent();
  await expect(page.getByTestId('lb-backend-1')).not.toHaveText(/10\.11 WebServer-1 \(0\)/);
  await expect(page.getByTestId('lb-backend-2')).toHaveText(frozen);
  // The skip leg moved on the failover mission's own readout — no refusal
  // tallies exist to watch on this stage, only skips.
  await expect(failoverChip(page)).toContainText(/○ skips: [1-9]\d* · 10\.12: 0/);
  await expect(failoverChip(page)).not.toContainText('✓');

  // Restore: the cursor's seat was 10.12's the whole time — it rejoins on
  // the very next forward, takes its share again, and the chip latches.
  await backendToggle(page).click();
  await expect(backendChip(page)).toHaveText('off');
  await expect(down12).toBeHidden();
  await expect(page.getByTestId('lb-next-backend')).toHaveText('Next -> 10.12');
  for (let i = 0; i < 10; i += 1) await page.getByTestId('step-button').click();
  await expect(page.getByTestId('lb-backend-2')).not.toHaveText(frozen);
  await page.getByTestId('rail-tab-missions').click();
  await expect(failoverChip(page)).toContainText(/✓ done · tick \d+/);
});

test('should narrate the skip in the stage-2 trace without aborting the served story', async ({
  page,
}) => {
  await page.goto('/panel.html');
  await page.getByTestId('stage-pill-2').click();
  await page.getByTestId('rail-tab-faults').click();

  // Warm the rotation first (fault off): one full 5-hop trace leaves the
  // cursor seated on 10.12 — with the fresh cursor on 10.11 the first
  // traced pick would still be a plain healthy pick with no crossed seat.
  await page.getByTestId('url-input').fill('/about');
  for (let hop = 0; hop < 5; hop += 1) await page.getByTestId('btn-next-hop').click();
  await expect(page.getByTestId('hop-status')).toContainText('Hop 5/5');

  await backendToggle(page).click();
  await expect(backendChip(page)).toHaveText('DOWN');

  // The full 5-hop served story runs with the skip named at the LB hop.
  for (let hop = 0; hop < 5; hop += 1) await page.getByTestId('btn-next-hop').click();
  await expect(page.getByTestId('hop-status')).toContainText('Hop 5/5');
  await expect(page.getByTestId('browser-status-badge')).toContainText(/^200 /);
  const lbHop = page.locator('.journey-log .journey-entry', { hasText: 'skipped' });
  await expect(lbHop).toContainText(
    'hop 3/5 · LB 10.1 -> 10.11 (GET /about) queued — 10.12 is down — skipped',
  );
  await expect(
    page.locator('.journey-log .journey-entry', { hasText: 'connection refused' }),
  ).toHaveCount(0);
  // Both finished runs read a served 200 story from 10.11 — the down trace
  // kept the full served story, the skip noted in its LB hop only.
  await expect(
    page.locator('.journey-log .journey-entry', { hasText: 'hop 4/5 · 10.11 -> 10.2 | 200' }),
  ).toHaveCount(2);

  // Toggle back — the served story keeps its byte shape again and the
  // cursor lands on the rejoined 10.12 first.
  await backendToggle(page).click();
  await expect(backendChip(page)).toHaveText('off');
  await expect(page.getByTestId('lb-next-backend')).toHaveText('Next -> 10.12');
  for (let hop = 0; hop < 5; hop += 1) await page.getByTestId('btn-next-hop').click();
  await expect(page.getByTestId('hop-status')).toContainText('Hop 5/5');
  await expect(
    page.locator('.journey-log .journey-entry', {
      hasText: 'LB 10.1 -> 10.12 (GET /about) queued',
    }),
  ).toHaveCount(1);
  await expect(
    page.locator('.journey-log .journey-entry', { hasText: 'connection refused' }),
  ).toHaveCount(0);
});

test('should verify the stage-2 failover mission only after skip and rejoin', async ({ page }) => {
  await page.goto('/panel.html');
  await page.getByTestId('rail-tab-missions').click();
  await page.getByTestId('stage-pill-2').click();
  await expect(page.getByTestId('mission-item')).toHaveCount(3);
  await expect(failoverChip(page)).toContainText('○ skips: 0 · 10.12: 0');

  // Phase 1 — down: skips are real (the readout moves, the crowd stays
  // served), but 10.12 serves nothing, so the mission is NOT complete.
  await page.getByTestId('rail-tab-faults').click();
  await backendToggle(page).click();
  await expect(backendChip(page)).toHaveText('DOWN');
  for (let i = 0; i < 8; i += 1) await page.getByTestId('step-button').click();
  await expect(page.getByTestId('served')).not.toHaveText('0');
  await expect(failoverChip(page)).toContainText(/○ skips: [1-9]\d* · 10\.12: 0/);
  await expect(failoverChip(page)).not.toContainText('✓');

  // Phase 2 — restored: the down-phase skip behind it and a fresh 10.12
  // forward on top; only now both legs hold and the chip latches done.
  await backendToggle(page).click();
  for (let i = 0; i < 8; i += 1) await page.getByTestId('step-button').click();
  await expect(failoverChip(page)).toContainText(/✓ done · tick \d+/);
});
