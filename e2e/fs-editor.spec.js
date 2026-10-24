import { test, expect } from '@playwright/test';

// The editable filesystem (editable-fs brief): the rows are the sim's own
// view — each card renders its snapshot server's fs Map (no static markup),
// a pencil swaps one row per card into an inline editor, and a commit
// writes through engine.setWebFile (invalidating nothing). Runs against the
// real page and the seeded sim, so every exchange string below is fixed.

test('should edit a file inline on Stage 1 and serve the new bytes', async ({ page }) => {
  await page.goto('/panel.html');

  // Rendered, not static: the two rows exist only because the snapshot's
  // fs Map does (insertion order "/", "/about").
  const list = page.getByTestId('server-fs-list');
  await expect(list).toBeVisible();
  await expect(list.locator('.route-item')).toHaveCount(2);

  // Grid + ellipsis computeds (asserted once, per the brief): two columns,
  // body cell single-line with hidden overflow + ellipsis.
  const styles = await page.evaluate(() => {
    const row = document.querySelector('#server-fs-list .route-item');
    const body = row.querySelector('.fs-body');
    return {
      gridTemplateColumns: getComputedStyle(row).gridTemplateColumns,
      overflowX: getComputedStyle(body).overflowX,
      textOverflow: getComputedStyle(body).textOverflow,
      whiteSpace: getComputedStyle(body).whiteSpace,
    };
  });
  expect(styles.gridTemplateColumns.split(' ')).toHaveLength(2);
  expect(styles.overflowX).toBe('hidden');
  expect(styles.textOverflow).toBe('ellipsis');
  expect(styles.whiteSpace).toBe('nowrap');

  const aboutRow = list.locator('.route-item[data-file="route-about"]');
  await expect(aboutRow).toContainText('This is the about page');
  await aboutRow.hover();
  await aboutRow.locator('.fs-edit').click();

  const input = aboutRow.locator('.fs-input');
  await expect(input).toBeVisible();
  const save = aboutRow.locator('.fs-commit');
  // Unchanged draft -> the save control waits (does not reach the engine).
  await expect(save).toBeDisabled();
  await input.fill('');
  await expect(save).toBeDisabled(); // empty draft
  await input.fill('New body');
  await expect(save).toBeEnabled();
  await input.press('Enter');

  // The row re-renders from the new snapshot — editor closed, new bytes.
  await expect(input).toHaveCount(0);
  await expect(aboutRow).toContainText('New body');

  // The sim actually serves them: the seeded first tick's GET /about.
  await page.getByTestId('step-button').click();
  await expect(page.getByTestId('exchange-inspector')).toContainText('GET /about => 200 New body');
});

test('should keep the edit cached-stale on Stage 3 until the TTL expires', async ({ page }) => {
  // Counter-example pin (editable-fs brief): an edit is not a POST — the
  // shared Cache is not invalidated. A GET inside the entry's TTL serves
  // the OLD body on a HIT; the new bytes serve only after expiry.
  await page.goto('/panel.html?stage=3');

  // Warm the shared Cache on the first 6-hop trace (round-robin -> 10.11,
  // cold MISS fills the entry from the fs Map).
  for (let hop = 0; hop < 6; hop++) await page.getByTestId('btn-next-hop').click();
  await expect(page.getByTestId('cache-stats')).toHaveText('Hits: 0 · Misses: 1 · TTL: 10t');

  // Edit /about on WebServer-1's filesystem (10.11) to "New body".
  const list = page.getByTestId('server-fs-list');
  const aboutRow = list.locator('.route-item[data-file="route-about"]');
  await aboutRow.hover();
  await aboutRow.locator('.fs-edit').click();
  const input = aboutRow.locator('.fs-input');
  await input.fill('New body');
  await input.press('Enter');
  await expect(input).toHaveCount(0);
  await expect(aboutRow).toContainText('New body');

  // Inside the TTL (entry expires at tick 11, tick is 2 now): the second
  // trace rides the shared entry on 10.12 and serves the OLD body — no
  // write-through, the row is already the future, the cache is the past.
  for (let hop = 0; hop < 6; hop++) await page.getByTestId('btn-next-hop').click();
  await expect(page.getByTestId('browser-rendered-body')).toHaveText('This is the about page');
  await expect(page.getByTestId('cache-stats')).toHaveText('Hits: 1 · Misses: 1 · TTL: 10t');

  // Step the ticks past the entry's expiry (ttlTicks 10, cached @ tick 1):
  // the aged-out entry is gone and only the fs Map now holds "New body".
  for (let i = 0; i < 12; i++) await page.getByTestId('step-button').click();

  // A post-expiry trace serves the NEW bytes.
  for (let hop = 0; hop < 6; hop++) await page.getByTestId('btn-next-hop').click();
  await expect(page.getByTestId('browser-rendered-body')).toHaveText('New body');
});

test('should cancel an inline edit with Escape and disable commit on an empty draft', async ({
  page,
}) => {
  await page.goto('/panel.html');

  const list = page.getByTestId('server-fs-list');
  const aboutRow = list.locator('.route-item[data-file="route-about"]');
  await aboutRow.hover();
  await aboutRow.locator('.fs-edit').click();

  const input = aboutRow.locator('.fs-input');
  await expect(input).toBeVisible();
  await expect(aboutRow.locator('.fs-commit')).toBeDisabled(); // unchanged draft
  await input.fill('');
  await expect(aboutRow.locator('.fs-commit')).toBeDisabled(); // empty draft
  await input.fill('New body');
  await expect(aboutRow.locator('.fs-commit')).toBeEnabled();
  await input.press('Escape');

  // Escape restores the row from the snapshot — no edit left open, no fs
  // mutation of any kind.
  await expect(input).toHaveCount(0);
  await expect(aboutRow).toContainText('This is the about page');

  // The sim really is untouched: the seeded tick-1 GET /about serves the
  // original bytes (as it did before this slice existed).
  await page.getByTestId('step-button').click();
  await expect(page.getByTestId('exchange-inspector')).toContainText(
    'GET /about => 200 This is the about page',
  );
});
