import { test, expect } from '@playwright/test';

// B-5 compare tray on the real page (TEST-RULES): the tray injects itself
// into .log-card at boot; every assertion reads the real journey-log
// machinery — the completion branch of stepOneHop snapshots the run, the
// pure model pairs it, no doubles anywhere.

const headline = (page) => page.getByTestId('compare-headline');
const rowAt = (page, row) => page.getByTestId('compare-rows').locator('.compare-row').nth(row);
const cellText = async (page, row, side) =>
  rowAt(page, row).locator(`.compare-${side}`).textContent();

// PINS: cells of the tray carry the runs' own frame texts — reading them
// verbatim is the DL-3 pin (the tray renders the log's entries, not a
// summary of its own invention).
const assertNotEmDash = async (page, row, side) => {
  expect(await cellText(page, row, side)).not.toBe('—');
};

test('should compare the last two trace runs hop-by-hop in the compare tray', async ({ page }) => {
  await page.goto('/panel.html');
  await page.getByTestId('stage-pill-3').click();
  await expect(page.getByTestId('node-cache')).toBeVisible();
  await page.getByTestId('url-input').fill('/about');

  // Run 1 (cold MISS on 10.11) alone is an incomplete pair: no tray rows.
  for (let hop = 0; hop < 6; hop++) await page.getByTestId('btn-next-hop').click();
  await expect(page.getByTestId('compare-tray')).toBeHidden();

  // Run 2 (warm HIT on 10.12) completes the pair.
  for (let hop = 0; hop < 6; hop++) await page.getByTestId('btn-next-hop').click();
  await expect(headline(page)).toHaveText('6 vs 6 hops · /about vs /about');
  await expect(page.getByTestId('compare-rows').locator('.compare-row')).toHaveCount(6);
  expect(await cellText(page, 4, 'left')).toBe('10.11 -> 10.2 | 200 This is the about page (MISS)');
  expect(await cellText(page, 4, 'right')).toBe('10.12 -> 10.2 | 200 This is the about page (HIT)');
  for (let row = 0; row < 6; row++) {
    await assertNotEmDash(page, row, 'left');
    await assertNotEmDash(page, row, 'right');
  }

  // Snapshot at completion (named counter-example): two more full runs push
  // the journey log past its 20-entry cap — the trimmed earlier runs are
  // gone from the log, while the tray keeps every row of its two stored runs.
  for (let extraRuns = 0; extraRuns < 2; extraRuns += 1) {
    for (let hop = 0; hop < 6; hop++) await page.getByTestId('btn-next-hop').click();
  }
  await expect(page.locator('.journey-log .journey-entry')).toHaveCount(20);
  await expect(page.getByTestId('compare-rows').locator('.compare-row')).toHaveCount(6);
  for (let row = 0; row < 6; row++) {
    await assertNotEmDash(page, row, 'left');
    await assertNotEmDash(page, row, 'right');
  }
  await expect(headline(page)).toHaveText('6 vs 6 hops · /about vs /about');
});

test('should show em-dash rows where one run is shorter (9 vs 6)', async ({ page }) => {
  await page.goto('/panel.html');
  await page.getByTestId('stage-pill-6').click();
  await expect(page.getByTestId('node-cdn')).toBeVisible();

  // Warm the edge first: cd.example.com/about MISSes and fills the ledger
  // in 9 hops.
  await page.getByTestId('url-input').fill('cd.example.com/about');
  for (let hop = 0; hop < 9; hop++) await page.getByTestId('btn-next-hop').click();
  await expect(page.getByTestId('hop-status')).toContainText('Hop 9/9');

  // example.com/about rides the subnet-10 hosted shape: 9 hops.
  await page.getByTestId('url-input').fill('example.com/about');
  for (let hop = 0; hop < 9; hop++) await page.getByTestId('btn-next-hop').click();
  await expect(page.getByTestId('hop-status')).toContainText('Hop 9/9');

  // The warm GET answers from the edge ledger in 6 hops — the shorter run.
  await page.getByTestId('url-input').fill('cd.example.com/about');
  for (let hop = 0; hop < 6; hop++) await page.getByTestId('btn-next-hop').click();
  await expect(page.getByTestId('hop-status')).toContainText('Hop 6/6');

  await expect(headline(page)).toHaveText(
    '9 vs 6 hops · example.com/about vs cd.example.com/about',
  );
  await expect(page.getByTestId('compare-rows').locator('.compare-row')).toHaveCount(9);
  expect(await cellText(page, 0, 'left')).toBe('10.2 -> 10.60 | who is example.com?');
  expect(await cellText(page, 0, 'right')).toBe('10.2 -> 10.60 | who is cd.example.com?');
  expect(await cellText(page, 5, 'right')).toBe('Browser 10.2 received and displayed 200');
  // Rows 7-9: the exhausted right side keeps its em-dash, the 9-hop left
  // side is not dropped or padded (nothing drops — the alignment contract).
  for (const row of [6, 7, 8]) {
    expect(await cellText(page, row, 'right')).toBe('—');
    await assertNotEmDash(page, row, 'left');
  }
});

test('should never compare crowd-tick runs into the tray', async ({ page }) => {
  await page.goto('/panel.html');
  await page.getByTestId('url-input').fill('/about');
  for (let hop = 0; hop < 4; hop++) await page.getByTestId('btn-next-hop').click();
  for (let hop = 0; hop < 4; hop++) await page.getByTestId('btn-next-hop').click();
  await expect(headline(page)).toHaveText('4 vs 4 hops · /about vs /about');
  const rowsBefore = await page.getByTestId('compare-rows').innerText();

  // Named counter-example: the crowd runs while both trace runs sit in the
  // tray. Tick entries land in #journey-log, but the tray's only entry door
  // is the trace completion branch, so the stored pair stays byte-identical.
  await page.getByTestId('start-button').click();
  await expect(page.locator('.journey-log .journey-entry').first()).toContainText('tick ');
  await page.getByTestId('start-button').click(); // pause, clock stopped

  await expect(headline(page)).toHaveText('4 vs 4 hops · /about vs /about');
  expect(await page.getByTestId('compare-rows').innerText()).toEqual(rowsBefore);
});

test('should clear the compare tray on a stage switch', async ({ page }) => {
  await page.goto('/panel.html');
  await page.getByTestId('url-input').fill('/about');
  for (let hop = 0; hop < 4; hop++) await page.getByTestId('btn-next-hop').click();
  for (let hop = 0; hop < 4; hop++) await page.getByTestId('btn-next-hop').click();
  await expect(headline(page)).toHaveText('4 vs 4 hops · /about vs /about');

  // The switch really happened, and the cleared tray shows no stale rows
  // and raises no crash (counter-example: two pinned runs then a switch).
  await page.getByTestId('stage-pill-2').click();
  await expect(page.getByTestId('node-lb')).toBeVisible();
  await expect(page.getByTestId('compare-tray')).toBeHidden();
  await expect(page.getByTestId('compare-rows')).toHaveText('');
  await expect(headline(page)).toHaveText('');
});
