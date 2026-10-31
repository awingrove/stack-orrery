import { test, expect } from '@playwright/test';
import { faultsTab, journeyHop, cacheEntryRows, missionChip } from './fault-console-helpers.js';

// B-6 fault console (docs/plans/2026-10-27-b6-fault-console.md): the rail's
// fourth surface flips REAL component state (webserver setDown) and the
// transport refuses on the wire before the server is consulted. Every
// assertion reads the real sim machinery — refusal frames, queue depth,
// mission chips — not UI-local state. Titles are manifest pins — do not
// reword. The B-6d stage-4 primary-down tests live in
// fault-console-stage4.spec.js (guard-file-size); the shared helpers are
// imported from fault-console-helpers.js.

const toggle = (page) => page.getByTestId('fault-toggle-webserver');

const stateChip = (page) => page.getByTestId('fault-state-webserver');

// Crowd ticks land refused sends only while down; each tick is a real
// arrival roll, so read the refusal tally off the recovery mission's own
// progress line after a few ticks.
const recoveryChip = (page) => missionChip(page, 'refusal');

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
  // still reading component state. B-6c: stage 3 owns the cache-bypass row;
  // B-6d: stage 4 owns the primary-down row; B-6e: stage 5 owns the
  // worker-crash row; B-6f: stage 6 owns the DNS-record row — the ladder
  // finish, so every shipped stage carries exactly one row and the
  // rail-empty line is no longer reachable through the stage ladder
  // (fault-console.js still renders no section for a stage with no rows).
  await expect(page.getByTestId('fault-toggle-backend-10-12')).toBeVisible();
  await expect(page.getByTestId('fault-state-backend-10-12')).toHaveText('off');
  await page.getByTestId('stage-pill-4').click();
  await expect(page.getByTestId('fault-toggle-primary')).toBeVisible();
  await expect(page.getByTestId('fault-state-primary')).toHaveText('off');
  await page.getByTestId('stage-pill-5').click();
  await expect(page.getByTestId('fault-toggle-worker')).toBeVisible();
  await expect(page.getByTestId('fault-state-worker')).toHaveText('off');
  await page.getByTestId('stage-pill-6').click();
  await expect(page.getByTestId('fault-toggle-dns')).toBeVisible();
  await expect(page.getByTestId('fault-state-dns')).toHaveText('off');
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

const failoverChip = (page) => missionChip(page, 'rejoin');

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

// B-6c (docs/plans/2026-10-29-b6c-cache-bypass.md): the bypassed cache is a
// miss storm, not a down component — the shared cache's own isBypass() flag
// takes it out of the path, the origin serves every GET, the counters
// freeze, and tick-based TTL keeps evicting so a long bypass rejoins cold.
// Titles are manifest pins — do not reword.

const cacheToggle = (page) => page.getByTestId('fault-toggle-cache');

const cacheChip = (page) => page.getByTestId('fault-state-cache');

const bypassCardChip = (page) => page.locator('#node-cache [data-testid="node-bypass-chip"]');

const coldChip = (page) => missionChip(page, 'Bypass the cache');

test('should bypass the cache from the rail console and watch the origin take every GET', async ({
  page,
}) => {
  await page.goto('/panel.html');
  await page.getByTestId('stage-pill-3').click();
  await expect(page.getByTestId('node-cache')).toBeVisible();
  await page.getByTestId('rail-tab-faults').click();
  await expect(page.getByTestId('fault-toggle-cache')).toBeVisible();
  await expect(cacheChip(page)).toHaveText('off');
  await expect(cacheToggle(page)).toHaveAttribute('aria-pressed', 'false');
  await expect(bypassCardChip(page)).toBeHidden();

  // The flip is component state: the console chip reads BYPASS and the
  // 10.20 card carries the same-paired chip — warn, not the DOWN danger.
  await cacheToggle(page).click();
  await expect(cacheChip(page)).toHaveText('BYPASS');
  await expect(cacheToggle(page)).toHaveAttribute('aria-pressed', 'true');
  await expect(bypassCardChip(page)).toBeVisible();
  await expect(bypassCardChip(page)).toHaveText('BYPASS');
  // Exactly one fault chip on the page at a time — no DOWN chip is showing.
  await expect(page.locator('[data-testid="node-down-chip"]:visible')).toHaveCount(0);

  // Crowd while bypassed: served keeps flowing, but every cache counter
  // freezes (nothing consults the cache) and no entry appears.
  for (let i = 0; i < 6; i += 1) await page.getByTestId('step-button').click();
  await expect(page.getByTestId('served')).not.toHaveText('0');
  await expect(page.getByTestId('cache-stats')).toHaveText('Hits: 0 · Misses: 0 · TTL: 10t');
  await expect(cacheEntryRows(page)).toHaveCount(0);

  // A traced GET narrates the bypass at the cache hop and still renders a
  // real 200 — the origin answered.
  await page.getByTestId('url-input').fill('/about');
  for (let hop = 0; hop < 5; hop += 1) await page.getByTestId('btn-next-hop').click();
  await expect(page.getByTestId('hop-status')).toContainText('cache BYPASSED');
  await page.getByTestId('btn-next-hop').click();
  await expect(page.getByTestId('hop-status')).toContainText('Hop 6/6');
  await expect(page.getByTestId('browser-status-badge')).toContainText(/^200 /);
  await expect(journeyHop(page, 'cache BYPASSED (/about)')).toContainText('hop 4/6');
  await expect(journeyHop(page, 'connection refused')).toHaveCount(0);
  // The traced GET filled nothing either — the counters did not move.
  await expect(page.getByTestId('cache-stats')).toHaveText('Hits: 0 · Misses: 0 · TTL: 10t');

  // Toggling off rejoins the path: the chip and card chip clear together.
  await cacheToggle(page).click();
  await expect(cacheChip(page)).toHaveText('off');
  await expect(bypassCardChip(page)).toBeHidden();
});

test('should narrate the bypass in the stage-3 trace with a fresh HIT after rejoin', async ({
  page,
}) => {
  await page.goto('/panel.html');
  await page.getByTestId('stage-pill-3').click();
  // Warm the shared cache first — the second trace is a real HIT, so the
  // bypass has a live entry to take out of the path.
  await page.getByTestId('url-input').fill('/about');
  for (let hop = 0; hop < 6; hop += 1) await page.getByTestId('btn-next-hop').click();
  await expect(page.getByTestId('cache-stats')).toHaveText('Hits: 0 · Misses: 1 · TTL: 10t');
  for (let hop = 0; hop < 6; hop += 1) await page.getByTestId('btn-next-hop').click();
  await expect(page.getByTestId('cache-stats')).toHaveText('Hits: 1 · Misses: 1 · TTL: 10t');

  await page.getByTestId('rail-tab-faults').click();
  await cacheToggle(page).click();
  await expect(page.getByTestId('fault-state-cache')).toHaveText('BYPASS');
  // The full 6-hop served story runs with the bypass named at the cache hop.
  for (let hop = 0; hop < 6; hop += 1) await page.getByTestId('btn-next-hop').click();
  await expect(page.getByTestId('hop-status')).toContainText('Hop 6/6');
  await expect(page.getByTestId('browser-status-badge')).toContainText(/^200 /);
  await expect(journeyHop(page, 'cache BYPASSED (/about)')).toContainText(
    'hop 4/6 · 10.11 -> 10.20 | cache BYPASSED (/about)',
  );
  await expect(journeyHop(page, 'connection refused')).toHaveCount(0);

  // A LONG bypass: the engine keeps evicting expired entries on schedule —
  // the warmed entry ages out with nobody looking, so the ledger empties.
  for (let i = 0; i < 11; i += 1) await page.getByTestId('step-button').click();
  await expect(cacheEntryRows(page)).toHaveCount(0);

  // Rejoin: the first GET is a fresh MISS that fills anew — no zombie warm
  // entry is resurrected.
  await cacheToggle(page).click();
  await expect(page.getByTestId('fault-state-cache')).toHaveText('off');
  await page.getByTestId('url-input').fill('/about');
  for (let hop = 0; hop < 6; hop += 1) await page.getByTestId('btn-next-hop').click();
  await expect(journeyHop(page, 'cache MISS (/about)')).toContainText('hop 4/6');
  await expect(page.getByTestId('browser-status-badge')).toContainText(/^200 /);
  // The refill is live: the very next traced GET is the fresh HIT.
  for (let hop = 0; hop < 6; hop += 1) await page.getByTestId('btn-next-hop').click();
  await expect(journeyHop(page, 'cache HIT (/about)')).toContainText('hop 4/6');
  await expect(page.getByTestId('browser-status-badge')).toContainText(/^200 /);
});

test('should verify the stage-3 cold mission only after bypass and rejoin', async ({ page }) => {
  await page.goto('/panel.html');
  await page.getByTestId('rail-tab-missions').click();
  await page.getByTestId('stage-pill-3').click();
  await expect(page.getByTestId('node-cache')).toBeVisible();
  // B-6c: stage 3 carries four since the bypass-cold mission joined the
  // fill/hit/expire trio.
  await expect(page.getByTestId('mission-item')).toHaveCount(4);
  await expect(coldChip(page)).toContainText('○ bypassed: 0 · cache: —');

  // Phase 1 — bypass on with the cache still cold: the origin-path tally
  // moves while the fault is on, but no exchange is a HIT, so the mission
  // is NOT complete.
  await page.getByTestId('rail-tab-faults').click();
  await cacheToggle(page).click();
  for (let i = 0; i < 6; i += 1) await page.getByTestId('step-button').click();
  await page.getByTestId('rail-tab-missions').click();
  await expect(coldChip(page)).toContainText(/○ bypassed: [1-9]\d* · cache: B/);
  await expect(coldChip(page)).not.toContainText('✓');

  // Phase 2 — restore: the rejoined path is cold, so the traced GET is a
  // MISS; the rejoin leg has no HIT yet, so the chip stays pending.
  await page.getByTestId('rail-tab-faults').click();
  await cacheToggle(page).click();
  await expect(page.getByTestId('fault-state-cache')).toHaveText('off');
  await page.getByTestId('url-input').fill('/about');
  for (let hop = 0; hop < 6; hop += 1) await page.getByTestId('btn-next-hop').click();
  await page.getByTestId('rail-tab-missions').click();
  await expect(coldChip(page)).toContainText(/○ bypassed: [1-9]\d* · cache: MISS/);
  await expect(coldChip(page)).not.toContainText('✓');

  // Phase 3 — the refill answers: the next traced GET lands the fresh HIT
  // and both legs hold — only now the chip latches done.
  await page.getByTestId('url-input').fill('/about');
  for (let hop = 0; hop < 6; hop += 1) await page.getByTestId('btn-next-hop').click();
  await expect(coldChip(page)).toContainText(/✓ done · tick \d+/);
});
