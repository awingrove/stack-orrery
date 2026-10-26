import { test, expect } from '@playwright/test';

// B-2 missions on the real page (TEST-RULES): the section injects itself
// into the teaching drawer at boot; every assertion reads the real
// sim machinery — chips flip only when a missions.js detector says so on a
// real engine snapshot. Titles are manifest pins (PANEL slice tests) — do
// not reword.

const openDrawer = async (page) => {
  await page.getByTestId('teaching-toggle').click();
  await expect(page.getByTestId('teaching-panel')).toBeVisible();
};

const mission = (page, goalText) => page.getByTestId('mission-item').filter({ hasText: goalText });

const chipOf = (page, goalText) => mission(page, goalText).getByTestId('mission-status');

// PINS: done means done — the chip carries the completing tick recorded at
// detection time and stops changing: crowd ticks, further traces, anything
// the snapshot says later cannot rewrite a stored completion.
const assertDoneStable = async (page, goalText) => {
  const chip = chipOf(page, goalText);
  await expect(chip).toContainText(/✓ done · tick \d+/);
  const doneText = await chip.textContent();
  return doneText;
};

test('should verify a mission automatically from real sim state (stage 1: 404)', async ({
  page,
}) => {
  await page.goto('/panel.html');
  await openDrawer(page);
  await expect(page.getByTestId('missions-section')).toBeVisible();
  const items = page.getByTestId('mission-item');
  await expect(items).toHaveCount(3); // 2-3 missions per stage; stage 1 carries three
  await expect(chipOf(page, 'Get a 404')).toContainText('○');

  // The learner's own trace moves the sim; nobody clicked the mission chip.
  await page.getByTestId('url-input').fill('/missing');
  for (let hop = 0; hop < 4; hop++) await page.getByTestId('btn-next-hop').click();

  const doneText = await assertDoneStable(page, 'Get a 404');

  // Crowd-tick stability ride-along: clock runs, verification holds, the
  // done chip stays byte-identical.
  await page.getByTestId('start-button').click();
  await expect(page.locator('.journey-log .journey-entry').first()).toContainText('tick ');
  await page.getByTestId('start-button').click(); // pause, clock stopped
  await expect(chipOf(page, 'Get a 404')).toHaveText(doneText);
});

test('should not complete the 404 mission on a 405', async ({ page }) => {
  await page.goto('/panel.html');
  await openDrawer(page);
  await page.getByTestId('req-method').selectOption('POST');
  await page.getByTestId('url-input').fill('/about');
  for (let hop = 0; hop < 4; hop++) await page.getByTestId('btn-next-hop').click();
  await expect(page.getByTestId('hop-status')).toContainText('405');

  // Named counter-example: the wrong-method branch's 405 is not a
  // missing-path answer — the 404 mission stays pending.
  await expect(chipOf(page, 'Get a 404')).toContainText('○');
  await expect(chipOf(page, 'Get a 404')).not.toContainText('✓');

  // The 405 is real sim state in its own right — its own mission reads it.
  await expect(chipOf(page, 'Send a method')).toContainText(/✓ done · tick \d+/);
});

test('should complete the edge-HIT mission only on a trace edge HIT, not an origin cache HIT', async ({
  page,
}) => {
  await page.goto('/panel.html');
  await openDrawer(page);
  await page.getByTestId('stage-pill-6').click();
  await expect(page.getByTestId('node-cdn')).toBeVisible();

  // Two hosted example.com/about runs warm the ORIGIN chain: the second
  // run's /about GET is a cache HIT at Cache 10.20. The edge ledger saw no
  // GET from either run, so the edge mission must stay pending.
  await page.getByTestId('url-input').fill('example.com/about');
  for (let hop = 0; hop < 9; hop++) await page.getByTestId('btn-next-hop').click();
  await page.getByTestId('url-input').fill('example.com/about');
  for (let hop = 0; hop < 9; hop++) await page.getByTestId('btn-next-hop').click();
  const edge = chipOf(page, 'edge HIT');
  await expect(edge).toContainText('○ fills: 0');

  // cd.example.com/about MISSes at the edge and pulls the origin — the
  // pull rides that warm origin cache (cacheStatus HIT inside the chain)
  // and fills the ledger. Origin HIT, edge MISS: still pending.
  await page.getByTestId('url-input').fill('cd.example.com/about');
  for (let hop = 0; hop < 9; hop++) await page.getByTestId('btn-next-hop').click();
  await expect(page.getByTestId('cdn-stats')).toHaveText(
    'Hits: 0 · Misses: 1 · Fills: 1 · TTL: 10t',
  );
  await expect(edge).toContainText('○ fills: 1');
  await expect(edge).not.toContainText('✓');

  // The next trace inside the TTL is the edge's own HIT shape (6 hops):
  // `trace.edgeStatus === 'HIT'` completes the mission, per the 6b flow.
  await page.getByTestId('url-input').fill('cd.example.com/about');
  for (let hop = 0; hop < 6; hop++) await page.getByTestId('btn-next-hop').click();
  await expect(page.getByTestId('hop-status')).toContainText('Hop 6/6');
  await expect(edge).toContainText(/✓ done · tick \d+/);
});

test('should prefill the mini-browser from a mission that carries a URL (no auto-send)', async ({
  page,
}) => {
  await page.goto('/panel.html');
  await openDrawer(page);
  const idle = 'Idle — type a path and click Go or Step 1 Hop ->';
  await expect(page.getByTestId('hop-status')).toHaveText(idle);

  await mission(page, 'Get a 404').click(); // carries /missing
  await expect(page.getByTestId('url-input')).toHaveValue('/missing');

  // The click filled the input and nothing else: no Go dispatch, no hop
  // bunny, no request sent — the learner still presses the button.
  await expect(page.getByTestId('hop-status')).toHaveText(idle);
  await expect(page.getByTestId('browser-rendered-body')).toHaveText(
    'Send a request or step a hop to render a response.',
  );
});

test('should clear verified missions on a stage switch', async ({ page }) => {
  await page.goto('/panel.html');
  await openDrawer(page);
  await page.getByTestId('url-input').fill('/missing');
  for (let hop = 0; hop < 4; hop++) await page.getByTestId('btn-next-hop').click();
  await expect(chipOf(page, 'Get a 404')).toContainText(/✓ done · tick \d+/);

  // Stage 2 rebuilds the list per its own registry: fresh rows, none done.
  await page.getByTestId('stage-pill-2').click();
  await expect(page.getByTestId('node-lb')).toBeVisible();
  await expect(page.getByTestId('mission-item')).toHaveCount(2);
  await expect(chipOf(page, 'Next -> flip')).toContainText('○');

  // Back on stage 1 the 404 mission is pending again: the verified set and
  // its completing tick were forgotten with the switch.
  await page.getByTestId('stage-pill-1').click();
  const items = page.getByTestId('mission-item');
  await expect(items).toHaveCount(3);
  await expect(chipOf(page, 'Get a 404')).toContainText('○ last:');
  await expect(chipOf(page, 'Get a 404')).not.toContainText('✓');
});
