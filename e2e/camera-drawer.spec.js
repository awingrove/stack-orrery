import { test, expect } from '@playwright/test';

// PINS: camera drawers (.camera-drawer: legend, teaching) keep their own
// scroll and text selection — a wheel or drag that starts on a drawer is
// native drawer input, never camera zoom/pan (the pre-fix trap: the camera's
// viewport-level wheel/pointer handlers intercepted drawer scroll and
// preventDefault-ed it into a camera zoom). The control pin proves the plane
// itself still zooms.

async function drawerOpen(page) {
  await page.goto('/panel.html?stage=6'); // longest narrative: the drawer can scroll
  await page.getByTestId('teaching-toggle').click();
  await expect(page.getByTestId('teaching-panel')).toBeVisible();
}

test('should scroll the teaching drawer with the wheel without driving the camera zoom', async ({
  page,
}) => {
  await drawerOpen(page);
  const panel = page.getByTestId('teaching-panel');
  const scrollBefore = await panel.evaluate((el) => el.scrollTop);
  const zoomBefore = await page.getByTestId('zoom-status').textContent();

  const box = await panel.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.wheel(0, 320);

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
