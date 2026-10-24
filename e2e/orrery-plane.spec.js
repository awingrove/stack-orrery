import { test, expect } from '@playwright/test';

// The orrery plane is camera-driven and its outer ring is addressable; these
// assertions live in their own spec (guard-file-size splits e2e by
// responsibility). The sim runs from a fixed seed, so the tick sequence —
// and therefore these thresholds — are identical on every run.

// The orrery plane is camera-driven: one concentric SVG ring per architectural
// layer (3 in Stage 1, 4 in Stage 2, r_k = k * ringGap), zoom via HUD buttons
// and wheel (toward the cursor), pan via pointer drag, and a Fit-to-view reset
// that restores the initial framing computed from the stage bounds.
test('should pan and zoom the concentric orrery plane and reset with Fit to view', async ({
  page,
}) => {
  await page.goto('/panel.html');

  const viewport = page.getByTestId('orrery-viewport');
  await expect(page.locator('.orrery-ring')).toHaveCount(3); // compute, network, clients
  await expect(page.locator('.orrery-ring').first()).toHaveAttribute('r', '400');
  await expect(page.locator('.orrery-ring').last()).toHaveAttribute('r', '1200');
  // Stage 2 adds its 4th layer ring (LoadBalancer gets its own ring, Network
  // and Browsers move outward).
  await page.getByTestId('stage-pill-2').click();
  await expect(page.locator('.orrery-ring')).toHaveCount(4);
  await expect(page.locator('.orrery-ring').last()).toHaveAttribute('r', '1600');
  await page.getByTestId('stage-pill-1').click();
  await expect(page.locator('.orrery-ring')).toHaveCount(3);
  await expect(page.locator('.orrery-satellite').first()).toBeVisible();

  const zoomStatus = page.getByTestId('zoom-status');
  const initialZoom = await zoomStatus.textContent();
  const world = page.getByTestId('orrery-world');
  const transformBefore = await world.evaluate((el) => el.style.transform);

  // HUD zoom-in changes the zoom% badge...
  await page.getByTestId('btn-zoom-in').click();
  await expect(zoomStatus).not.toHaveText(initialZoom);

  // ...and the wheel zooms toward the cursor (crowd satellite dots stay).
  // Wheel and drag coordinates derive from the viewport's bounding box, so
  // they stay inside the clipped plane and do not depend on hardcoded page
  // coordinates like y = 600.
  const box = await viewport.boundingBox();
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  await page.mouse.move(box.x + 80, cy);
  await page.mouse.wheel(0, -120);
  await expect(page.locator('.orrery-satellite')).toHaveCount(5);

  // Pointer drag pans the plane: the world transform changes, and the
  // transient .is-panning class is gone once the drag ends.
  await page.mouse.move(box.x + 100, cy);
  await page.mouse.down();
  await page.mouse.move(cx + 100, cy - 20, { steps: 6 });
  await page.mouse.up();
  const transformAfterPan = await world.evaluate((el) => el.style.transform);
  expect(transformAfterPan).not.toBe(transformBefore);
  await expect(viewport).not.toHaveClass(/is-panning/);

  // Fit to view restores the initial framing exactly.
  await page.getByTestId('btn-zoom-fit').click();
  await expect(zoomStatus).toHaveText(initialZoom);

  // Live tuning: the ring-gap slider rescales the stage's rings as
  // r_k = k * ringGap (460 / 920 / 1380 in Stage 1) with the camera left
  // where Fit put it, and the readouts mirror their sliders immediately.
  await expect(page.getByTestId('ring-gap-value')).toHaveText('400px');
  await expect(page.locator('.orrery-ring').first()).toHaveAttribute('r', '400');
  await expect(page.locator('.orrery-ring').last()).toHaveAttribute('r', '1200');
  const compact10_3 = page.getByTestId('browser-node-10.3');
  const compactLeftBefore = await compact10_3.evaluate((el) => el.style.left);
  await page.getByTestId('ring-gap-slider').fill('460');
  await expect(page.getByTestId('ring-gap-value')).toHaveText('460px');
  await expect(page.locator('.orrery-ring').first()).toHaveAttribute('r', '460');
  await expect(page.locator('.orrery-ring').last()).toHaveAttribute('r', '1380');
  // The compact Ring-3 browsers move live with the ring gap too, not just the
  // SVG rings.
  const compactLeftAfter = await compact10_3.evaluate((el) => el.style.left);
  expect(compactLeftAfter).not.toBe(compactLeftBefore);
  await expect(zoomStatus).toHaveText(initialZoom); // camera untouched by tuning

  // Zoom speed retunes every zoom gesture (buttons, wheel, keyboard) and can
  // dial the per-step factor all the way down to 1.01x.
  await page.getByTestId('zoom-speed-slider').fill('1.01');
  await expect(page.getByTestId('zoom-speed-value')).toHaveText('1.01x');
});

// Ring 3 browsers are addressable: clicking a compact browser node expands
// it into #node-browser (header updated to that browser's name and mini-IP)
// and collapses the previously expanded browser into a compact node.
test('should expand Ring 3 browsers by clicking their compact nodes and return to 10.2', async ({
  page,
}) => {
  await page.goto('/panel.html');

  await expect(page.getByTestId('browser-ring-nodes').locator('> *')).toHaveCount(4); // 10.3..10.6 compact
  await page.getByTestId('browser-node-10.3').click();
  await expect(page.getByTestId('browser-ip-chip')).toHaveText('10.3');
  await expect(page.getByTestId('browser-role-name')).toHaveText('Browser-2');
  await expect(page.getByTestId('browser-node-10.2')).toBeVisible();

  await page.getByTestId('browser-node-10.2').click();
  await expect(page.getByTestId('browser-ip-chip')).toHaveText('10.2');
  await expect(page.getByTestId('browser-role-name')).toHaveText('Browser (You)');
});
