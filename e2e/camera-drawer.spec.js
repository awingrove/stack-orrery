import { test, expect } from '@playwright/test';

// PINS: the control-room rail (Stage R1 remodel) hosts the teaching,
// missions, and legend surfaces OUT of the camera viewport — a wheel or
// drag that starts on a docked rail surface is rail scroll input, never
// camera zoom/pan (the pre-fix trap: the camera's viewport-level wheel/
// pointer handlers intercepted drawer scroll and preventDefault-ed it into
// a camera zoom). The structural paydown: nothing scrollable is a
// descendant of .orrery-viewport any more, so the plane's own gestures stay
// camera input by construction — the control pin proves the plane still
// zooms.

async function drawerOpen(page) {
  await page.goto('/panel.html?stage=6'); // longest narrative: the panel can scroll
  await page.getByTestId('teaching-toggle').click();
  await expect(page.getByTestId('teaching-panel')).toBeVisible();
}

test('should scroll the docked rail panel with the wheel without driving the camera zoom', async ({
  page,
}) => {
  await drawerOpen(page);
  const panel = page.getByTestId('teaching-panel');
  // NEW host pin (Stage R1): the scrolled surface is rail-docked, so the
  // wheel below lands outside the camera viewport entirely.
  expect(await panel.evaluate((el) => Boolean(el.closest('.rail')))).toBe(true);

  const scrollBefore = await panel.evaluate((el) => el.scrollTop);
  const zoomBefore = await page.getByTestId('zoom-status').textContent();

  const box = await panel.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);

  // CHECKS: at-end wheel containment — the rail never chains the wheel into
  // the document's scroll (the R1 probe defect: scrollY 300 slid the plane
  // out from under subsequent wheel targets).
  const pageScrollBefore = await page.evaluate(() => window.scrollY);
  await page.mouse.wheel(0, 320);

  expect(await page.evaluate(() => window.scrollY)).toBe(pageScrollBefore);
  const scrollAfter = await panel.evaluate((el) => el.scrollTop);
  expect(scrollAfter).toBeGreaterThan(scrollBefore);
  await expect(page.getByTestId('zoom-status')).toHaveText(zoomBefore);
});

test('should leave the camera transform untouched when a drag starts inside a drawer', async ({
  page,
}) => {
  await drawerOpen(page);
  const world = page.getByTestId('orrery-world');
  const transformBefore = await world.evaluate((el) => el.style.transform);
  const zoomBefore = await page.getByTestId('zoom-status').textContent();

  const box = await page.getByTestId('teaching-panel').boundingBox();
  await page.mouse.move(box.x + 40, box.y + 40);
  await page.mouse.down();
  await page.mouse.move(box.x + 110, box.y + 90, { steps: 4 });
  await page.mouse.up();

  const transformAfter = await world.evaluate((el) => el.style.transform);
  expect(transformAfter).toBe(transformBefore);
  await expect(page.getByTestId('zoom-status')).toHaveText(zoomBefore);
});

test('should keep wheel zoom working on the plane itself', async ({ page }) => {
  await drawerOpen(page);
  const zoomStatus = page.getByTestId('zoom-status');
  const zoomBefore = await zoomStatus.textContent();

  const viewport = page.getByTestId('orrery-viewport');
  const box = await viewport.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.wheel(0, -240);

  await expect(zoomStatus).not.toHaveText(zoomBefore);
});
