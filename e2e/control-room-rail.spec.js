import { test, expect } from '@playwright/test';

// Stage R1 — control-room rail (docs/plans/2026-10-26-style2-control-room-
// remodel.md): the teaching drawer, the missions section, and the legend
// drawer dock into the page-level .rail beside the orrery plane; the rail
// hosts them via tabs Teach / Missions / Legend, one surface visible at a
// time, and stacks under the plane below the css 1100px breakpoint. Titles
// are manifest pins (PANEL slice tests) — do not reword.

const insideRail = (page, testId) =>
  page.getByTestId(testId).evaluate((el) => Boolean(el.closest('.rail')));

test('should dock teaching, missions, and legend into the right rail with the plane unchanged', async ({
  page,
}) => {
  await page.goto('/panel.html');

  // Two-zone page: the rail column sits to the right of the clipped plane.
  const plane = await page.getByTestId('orrery-viewport').boundingBox();
  const railBox = await page.getByTestId('rail').boundingBox();
  expect(railBox.x).toBeGreaterThanOrEqual(plane.x + plane.width);

  // Closed by default: the first view is the orrery plane, no surface open.
  await expect(page.getByTestId('teaching-panel')).toBeHidden();
  await expect(page.getByTestId('legend-panel')).toBeHidden();

  // Teaching docks into the rail (testid unchanged, host re-parented).
  await page.getByTestId('teaching-toggle').click();
  await expect(page.getByTestId('teaching-panel')).toBeVisible();
  expect(await insideRail(page, 'teaching-panel')).toBe(true);

  // Missions is its own rail surface; opening it hides the teach host.
  await page.getByTestId('rail-tab-missions').click();
  await expect(page.getByTestId('missions-section')).toBeVisible();
  expect(await insideRail(page, 'missions-section')).toBe(true);
  await expect(page.getByTestId('teaching-panel')).toBeHidden();

  // Legend docks through its camera-HUD toggle; missions yields.
  await page.getByTestId('legend-toggle').click();
  await expect(page.getByTestId('legend-panel')).toBeVisible();
  expect(await insideRail(page, 'legend-panel')).toBe(true);
  await expect(page.getByTestId('missions-section')).toBeHidden();

  // The plane is unchanged: node cards, rings, and the camera HUD
  // stay on .orrery-viewport, and no docked surface leaked into it.
  expect(await insideRail(page, 'node-browser')).toBe(false);
  expect(
    await page
      .getByTestId('legend-panel')
      .evaluate((el) => Boolean(el.closest('[data-testid="orrery-viewport"]'))),
  ).toBe(false);
  await expect(page.getByTestId('node-browser')).toBeVisible();
  await expect(page.locator('.orrery-ring')).toHaveCount(3);
  await expect(page.locator('.camera-hud')).toBeVisible();

  // Rail content follows stage switches (render hook), tab state retained.
  await page.getByTestId('stage-pill-3').click();
  await expect(page.getByTestId('node-cache')).toBeVisible();
  await expect(page.getByTestId('legend-panel')).toBeVisible();
  expect(await page.locator('.rail-tab.rail-tab-active').textContent()).toBe('Legend');
});

test('should keep the rail tab state across stage switches', async ({ page }) => {
  await page.goto('/panel.html');

  // Dock missions, then switch stages: the tab survives and the missions
  // section rebuilds per stage registry (stage 2 carries two missions).
  await page.getByTestId('teaching-toggle').click();
  await page.getByTestId('rail-tab-missions').click();
  await expect(page.getByTestId('missions-section')).toBeVisible();

  await page.getByTestId('stage-pill-2').click();
  await expect(page.getByTestId('node-lb')).toBeVisible();
  await expect(page.getByTestId('missions-section')).toBeVisible();
  await expect(page.getByTestId('mission-item')).toHaveCount(2);
  expect(await page.locator('.rail-tab.rail-tab-active').textContent()).toBe('Missions');

  // Start/step a tick — the camera pipeline leaves the rail tab untouched.
  await page.getByTestId('step-button').click();
  await expect(page.getByTestId('missions-section')).toBeVisible();
  expect(await page.locator('.rail-tab.rail-tab-active').textContent()).toBe('Missions');
});

test('should collapse the rail under the viewport below the responsive breakpoint', async ({
  page,
}) => {
  await page.goto('/panel.html');

  // Desktop (default 1280px): two-zone side-by-side.
  let plane = await page.getByTestId('orrery-viewport').boundingBox();
  let railBox = await page.getByTestId('rail').boundingBox();
  expect(railBox.x).toBeGreaterThanOrEqual(plane.x + plane.width);

  // Breakpoint 1100px (named in css/panel/rail.css): below it the rail
  // stacks UNDER the plane in the page flow — same column, lower in flow.
  await page.setViewportSize({ width: 1000, height: 800 });
  plane = await page.getByTestId('orrery-viewport').boundingBox();
  railBox = await page.getByTestId('rail').boundingBox();
  expect(railBox.y).toBeGreaterThanOrEqual(plane.y + plane.height);
  expect(Math.abs(railBox.x - plane.x)).toBeLessThanOrEqual(2);
});
