import { test, expect } from '@playwright/test';

// Stage 6b CDN edge (stage6b-cdn-edge brief): cd.example.com resolves to the
// edge at 20.1. A GET inside the edge's 10t TTL is served from the fill
// ledger in 6 hops (HIT); the first run pulls the origin through the real
// Router/LB/backend chain and fills (9 hops, MISS); a POST rides the same
// origin leg minus the fill. All assertions read the real cards and the
// journey log — no scripted counts except the hop pins themselves.

const HOP = async (page) => page.getByTestId('btn-next-hop').click();

test('should resolve cd.example.com and serve an edge HIT through the Router (6 hops)', async ({
  page,
}) => {
  await page.goto('/panel.html');
  await page.getByTestId('stage-pill-6').click();
  await page.getByTestId('url-input').fill('cd.example.com/about');

  // The very first run has nothing to HIT: the MISS shape fills the edge
  // (9 hops — pinned in detail by the next test).
  for (let hop = 0; hop < 9; hop++) await HOP(page);
  await expect(page.getByTestId('cdn-stats')).toHaveText(
    'Hits: 0 · Misses: 1 · Fills: 1 · TTL: 10t',
  );
  await expect(page.getByTestId('cdn-entries-list')).toContainText(/\/about · ttl \d+t/);

  // The second run inside the TTL is the HIT shape: 6 hops ending at the
  // browser render, and the answer still names the resolved 20.1 (not
  // the hostname) on the wire.
  await page.getByTestId('url-input').fill('cd.example.com/about');
  for (let hop = 0; hop < 6; hop++) await HOP(page);
  await expect(page.getByTestId('hop-status')).toHaveText(
    'Hop 6/6: Browser (10.2) received and displayed 200',
  );
  await expect(page.getByTestId('journey-log')).toContainText(
    /hop 4\/6 · 20\.1 -> 10\.65 \| 200 This is the about page \(edge HIT, ttl \d+t\)/,
  );
  await expect(page.getByTestId('browser-rendered-body')).toHaveText('This is the about page');
  // The edge counters: one miss that filled, one hit that served — no
  // second origin pull (misses stay at 1).
  await expect(page.getByTestId('cdn-stats')).toHaveText(
    'Hits: 1 · Misses: 1 · Fills: 1 · TTL: 10t',
  );
  // The Router counted both directions of both runs' crossings.
  await expect(page.getByTestId('router-stats')).toHaveText('Router 10.65 ⇄ 20.254 · Routed: 5');
});

test('should pull the origin through the Router on an edge MISS and fill the ledger (9 hops)', async ({
  page,
}) => {
  await page.goto('/panel.html');
  await page.getByTestId('stage-pill-6').click();
  await page.getByTestId('url-input').fill('cd.example.com/about');

  for (let hop = 0; hop < 9; hop++) {
    await HOP(page);
  }
  await expect(page.getByTestId('hop-status')).toHaveText(
    'Hop 9/9: Browser (10.2) received and displayed 200',
  );
  // The MISS chain is visible hop-by-hop: the ledger answer names 20.1, the
  // Router crossing, the pull through the Router into the real LB queue,
  // then the fill rides the reverse crossing.
  await expect(page.getByTestId('journey-log')).toContainText(
    /hop 2\/9 · 10\.60 -> 10\.2 \| 20\.1/,
  );
  await expect(page.getByTestId('journey-log')).toContainText(
    /hop 4\/9 · 20\.1 -> 10\.65 \| MISS — pulling origin 10\.1 via router/,
  );
  await expect(page.getByTestId('journey-log')).toContainText(
    /hop 5\/9 · 20\.1 -> 10\.1 \| GET \/about \(edge pull via router\)/,
  );
  await expect(page.getByTestId('journey-log')).toContainText(
    /hop 8\/9 · 10\.65 -> 10\.2 \| 200 This is the about page delivered \(edge FILL \/about, ttl 10t\)/,
  );
  // The Router counted exactly three crossings (forward, pull, reverse).
  await expect(page.getByTestId('router-stats')).toHaveText('Router 10.65 ⇄ 20.254 · Routed: 3');
  // The fill ledger holds the pulled origin bytes with their TTL row.
  await expect(page.getByTestId('cdn-stats')).toHaveText(
    'Hits: 0 · Misses: 1 · Fills: 1 · TTL: 10t',
  );
  await expect(page.getByTestId('cdn-entries-list')).toContainText(/\/about · ttl \d+t/);
  // The pull really ran the cache-aside origin chain: Cache 10.20 warmed.
  await expect(page.getByTestId('cache-stats')).toHaveText('Hits: 0 · Misses: 1 · TTL: 10t');
});

// Counter-example (DL-3): the origin's /about really changes — the hosted
// POST write-through updates Primary 10.30 at tick 2 and invalidates the
// origin Cache — but the edge's ledger entry still answers with the OLD
// bytes until its TTL expires. Only the post-expiry pull serves the new
// bytes (e2e mirror of the engine-side TTL pin).
test('should keep an origin edit stale at the edge until the TTL expires', async ({ page }) => {
  await page.goto('/panel.html');
  await page.getByTestId('stage-pill-6').click();
  await page.getByTestId('url-input').fill('cd.example.com/about');
  for (let hop = 0; hop < 9; hop++) await HOP(page); // fill at tick 1

  // The origin edit, by its real mechanism: a hosted POST write-through.
  await page.getByTestId('req-method').selectOption('POST');
  await page.getByTestId('url-input').fill('example.com/about');
  for (let hop = 0; hop < 9; hop++) await HOP(page);
  await expect(page.getByTestId('hop-status')).toHaveText(
    'Hop 9/9: Worker (10.41) idle — no async jobs in this trace',
  );
  await expect(page.getByTestId('browser-rendered-body')).toHaveText('Updated /about at tick 2');

  // Back to a GET inside the edge TTL: the ledger still answers the OLD
  // bytes in 6 hops — the write changed nothing at the edge.
  await page.getByTestId('req-method').selectOption('GET');
  await page.getByTestId('url-input').fill('cd.example.com/about');
  for (let hop = 0; hop < 6; hop++) await HOP(page);
  await expect(page.getByTestId('browser-rendered-body')).toHaveText('This is the about page');
  await expect(page.getByTestId('journey-log')).toContainText(/hop 4\/6 .*edge HIT/);
  await expect(page.getByTestId('cdn-stats')).toHaveText(
    'Hits: 1 · Misses: 1 · Fills: 1 · TTL: 10t',
  );

  // Step the clock past the entry's expiry (filled at 1, dead at 11; the
  // clock is at 3) — then the next run MISSes and the pull returns the new
  // bytes (replication lag is well behind by then).
  for (let i = 0; i < 8; i++) await page.getByTestId('step-button').click();
  await page.getByTestId('url-input').fill('cd.example.com/about');
  for (let hop = 0; hop < 9; hop++) await HOP(page);
  await expect(page.getByTestId('hop-status')).toHaveText(
    'Hop 9/9: Browser (10.2) received and displayed 200',
  );
  // The post-expiry pull refilled the ledger from the changed origin: the
  // browser renders the NEW bytes and the fill counter climbs again.
  await expect(page.getByTestId('browser-rendered-body')).toHaveText('Updated /about at tick 2');
  await expect(page.getByTestId('cdn-stats')).toHaveText(
    'Hits: 1 · Misses: 2 · Fills: 2 · TTL: 10t',
  );
});

// Counter-example (DL-4): a POST on a CDN name does not touch the edge
// ledger — it rides the MISS shape's origin leg (9 hops, a real origin
// answer) and the edge counters stay at their initial values with an empty
// fill ledger.
test('should pass a POST through to the origin without filling the edge', async ({ page }) => {
  await page.goto('/panel.html');
  await page.getByTestId('stage-pill-6').click();
  await page.getByTestId('req-method').selectOption('POST');
  await page.getByTestId('url-input').fill('cd.example.com/note');
  for (let hop = 0; hop < 9; hop++) await HOP(page);

  await expect(page.getByTestId('hop-status')).toHaveText(
    'Hop 9/9: Browser (10.2) received and displayed 200',
  );
  // The origin really answered through the chain: the pass-through ran the
  // Router's three crossings and the POST moved the database, not the edge.
  await expect(page.getByTestId('router-stats')).toHaveText('Router 10.65 ⇄ 20.254 · Routed: 3');
  await expect(page.getByTestId('journey-log')).toContainText(
    /hop 4\/9 .*POST \/note is not edge-cacheable, pulling origin 10\.1 via router/,
  );
  await expect(page.getByTestId('journey-log')).toContainText(
    /hop 8\/9 .*200 Updated \/note at tick 1 delivered \(no edge FILL — non-GET pass-through\)/,
  );
  // CHECKS: the named counter-example itself — no lookup, no fill, no row.
  await expect(page.getByTestId('cdn-stats')).toHaveText(
    'Hits: 0 · Misses: 0 · Fills: 0 · TTL: 10t',
  );
  await expect(page.getByTestId('cdn-entries-list')).toHaveText('');
});
