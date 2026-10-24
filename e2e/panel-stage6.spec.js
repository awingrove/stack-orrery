import { test, expect } from '@playwright/test';

// Stage 6a (stage6a-dns-crossnet brief): the DNS 10.60 tick-TTL ledger and
// the cross-subnet Router 10.65 ⇄ 20.1. The orrery redraws to 8 rings, the
// hosted URL example.com/about walks a 9-hop trace whose first two hops
// are the DNS ask -> the ledger answer (no pre-resolution GET frame: the
// browser's GET only becomes a wire token after the answer), and the DNS
// code + ledger rows open in the bottom inspector.
test('should switch to Stage 6, resolve example.com through DNS 10.60, and inspect DNS code + TTL ledger', async ({
  page,
}) => {
  await page.goto('/panel.html');

  await page.getByTestId('stage-pill-6').click();
  await expect(page.getByTestId('stage-pill-6')).toHaveAttribute('aria-current', 'true');
  await expect(page.getByTestId('node-dns')).toBeVisible();
  await expect(page.getByTestId('node-router')).toBeVisible();
  await expect(page.locator('.orrery-ring')).toHaveCount(8);
  await expect(page.locator('.orrery-ring').first()).toHaveAttribute('r', '400');
  await expect(page.locator('.orrery-ring').last()).toHaveAttribute('r', '3200');
  await expect(page.locator('#node-router .ip-chip')).toHaveText('10.65 ⇄ 20.1');
  // The two new HUD cards carry their stats trios, both wire columns exist.
  await expect(page.getByTestId('dns-stats')).toHaveText(
    'Lookups: 0 · Cached: 0 · Authoritative: 0 · TTL: 300t',
  );
  await expect(page.getByTestId('router-stats')).toHaveText('Router 10.65 ⇄ 20.1 · Routed: 0');
  await expect(page.locator('#packet-req-dns')).toContainText('who is? =>');
  await expect(page.locator('#packet-res-dns')).toContainText('<- answer');
  await expect(page.locator('#packet-req-router')).toContainText('route =>');
  await expect(page.locator('#packet-res-router')).toContainText('<- via router');

  // The full hosted trace walks 9 hops: ask + answer then the stage-5 chain.
  await page.getByTestId('url-input').fill('example.com/about');
  for (let hop = 0; hop < 9; hop++) await page.getByTestId('btn-next-hop').click();
  await expect(page.getByTestId('hop-status')).toContainText('Hop 9/9');
  await expect(page.getByTestId('browser-rendered-body')).toHaveText('This is the about page');
  await expect(page.getByTestId('browser-status-badge')).toContainText('200');

  // The ledger census: one authoritative lookup wrote one live entry.
  await expect(page.getByTestId('dns-stats')).toHaveText(
    'Lookups: 1 · Cached: 0 · Authoritative: 1 · TTL: 300t',
  );
  await expect(page.getByTestId('dns-entries-list')).toContainText(
    /example\.com · 10\.1 · ttl \d+t/,
  );

  // The DNS code + live ledger open in the inspector; the router tab reads
  // the gateway pair too.
  await page.getByTestId('node-dns').click();
  await expect(page.getByTestId('inspector-code')).toContainText('createDns');
  await expect(page.getByTestId('inspector-state')).toContainText('"authoritative": 1');
  await page.locator('.comp-tab[data-select="router"]').click();
  await expect(page.getByTestId('inspector-code')).toContainText('createRouter');
  await expect(page.getByTestId('inspector-state')).toContainText('"rightAddress": "20.1"');
});

// The hosted trace's ask/answer hops are visible as their own sentences with
// the DNS card active on the ask — the mechanism, not a summary badge. No
// pre-resolution GET hop exists: the wire starts at the ask.
test('should trace example.com/about with DNS ask + answer hops', async ({ page }) => {
  await page.goto('/panel.html');

  await page.getByTestId('stage-pill-6').click();
  await page.getByTestId('url-input').fill('example.com/about');

  await page.getByTestId('btn-next-hop').click();
  await expect(page.getByTestId('hop-status')).toHaveText(
    'Hop 1/9: Browser (10.2) -> DNS (10.60): who is example.com?',
  );
  await expect(page.locator('#node-dns.active-hop')).not.toHaveCount(0);
  await expect(page.locator('#packet-req-dns.lane-active')).not.toHaveCount(0);

  await page.getByTestId('btn-next-hop').click();
  await expect(page.getByTestId('hop-status')).toHaveText(
    'Hop 2/9: DNS (10.60) -> Browser (10.2) answers 10.1',
  );
  await expect(page.locator('#packet-res-dns.lane-active')).not.toHaveCount(0);

  // Hops 3-9 replay the stage-5 chain renumbered (+2) behind the prelude.
  for (let hop = 0; hop < 7; hop++) await page.getByTestId('btn-next-hop').click();
  await expect(page.getByTestId('hop-status')).toHaveText(
    'Hop 9/9: Worker (10.41) idle — no async jobs in this trace',
  );
  await expect(page.getByTestId('journey-log')).toContainText('hop 3/9');
});

// CHECKS: named counter-example — a plain /about path keeps the stage-5 hop
// story on Stage 6: 8 hops, no DNS hop, no ledger consult, no cross-subnet.
test('should keep GET /about on Stage 6 at the Stage 5 hop story', async ({ page }) => {
  await page.goto('/panel.html');

  await page.getByTestId('stage-pill-6').click();
  await page.getByTestId('url-input').fill('/about');
  for (let hop = 0; hop < 8; hop++) await page.getByTestId('btn-next-hop').click();
  await expect(page.getByTestId('hop-status')).toHaveText(
    'Hop 8/8: Worker (10.41) idle — no async jobs in this trace',
  );
  await expect(page.getByTestId('browser-rendered-body')).toHaveText('This is the about page');
  await expect(page.getByTestId('dns-stats')).toHaveText(
    'Lookups: 0 · Cached: 0 · Authoritative: 0 · TTL: 300t',
  );
  await expect(page.getByTestId('dns-entries-list')).toHaveText('');
  await expect(page.locator('#journey-log .journey-entry')).toHaveCount(8);

  // Send & Watch Hops stops at the trace's own final hop (8, not 10) — the
  // host-less trace must not keep re-emitting.
  await page.getByTestId('btn-play-request').click();
  await expect(page.getByTestId('hop-status')).toHaveText(
    'Hop 8/8: Worker (10.41) idle — no async jobs in this trace',
  );
  await expect(page.getByTestId('dns-stats')).toHaveText(
    'Lookups: 0 · Cached: 0 · Authoritative: 0 · TTL: 300t',
  );
});

// Negative case (DL-3): an unknown host answers NX and renders the refusal
// card — no GET is emitted, served stays 0, and the ledger stays empty.
test('should render the NX card on Stage 6 for a missing host without emitting a GET', async ({
  page,
}) => {
  await page.goto('/panel.html');

  await page.getByTestId('stage-pill-6').click();
  await page.getByTestId('url-input').fill('nope.example/about');
  // Send & Watch Hops stops at the NX trace's own final hop (2).
  await page.getByTestId('btn-url-go').click();
  await expect(page.getByTestId('hop-status')).toHaveText(
    'Hop 2/2: DNS (10.60) -> Browser (10.2): NX no record — no GET emitted',
  );
  await expect(page.getByTestId('browser-status-badge')).toHaveText('NX (GET nope.example/about)');
  await expect(page.getByTestId('browser-rendered-body')).toHaveText(
    'NX no record — no GET emitted',
  );
  // No served exchange anywhere: nothing reached the server pool.
  await expect(page.getByTestId('exchange-inspector')).toHaveText('No requests served yet');
  await expect(page.getByTestId('dns-entries-list')).toHaveText('');
  await expect(page.locator('#journey-log .journey-entry')).toHaveCount(2);
});

// Deep-link: the live-stage list extends to 6; unknown values still fall
// back to Stage 1 (the existing ?stage=9 pin covers that direction).
test('should deep-link ?stage=6 into the DNS topology', async ({ page }) => {
  await page.goto('/panel.html?stage=6');
  await expect(page.getByTestId('stage-pill-6')).toHaveAttribute('aria-current', 'true');
  await expect(page.getByTestId('node-dns')).toBeVisible();
  await expect(page.getByTestId('node-router')).toBeVisible();
});
