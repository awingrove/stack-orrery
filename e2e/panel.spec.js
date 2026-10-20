import { test, expect } from '@playwright/test';

// The overload story, asserted on the real page served by the real static
// server (TEST-RULES: no doubles; the app answers its own HTTP). The sim
// runs from a fixed seed, so the tick sequence — and therefore these
// thresholds — are identical on every run.
test('should show queue depth climbing as simulated users increase', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('main').getByRole('link', { name: 'Diagram panel' }).click(); // click-through arrival

  // N simulated users: the dot count mirrors the slider before the run starts.
  await page.getByTestId('users-slider').fill('20');
  await expect(page.getByTestId('user-dots').locator('> *')).toHaveCount(20);

  await page.getByTestId('start-button').click();

  // Arrival (~10/tick at p=0.5 over 20 users) beats service (4/tick):
  // queue depth must become visible as climbing UI state, not prose.
  await expect
    .poll(async () => Number(await page.getByTestId('queue-depth').textContent()), {
      timeout: 10_000,
    })
    .toBeGreaterThanOrEqual(5);

  // Latency is live UI state too: served responses cost at least one tick.
  const latency = await page.getByTestId('latency').textContent();
  expect(Number.parseInt(latency, 10)).toBeGreaterThanOrEqual(100);

  // The clock is running and work is being done.
  const served = Number(await page.getByTestId('served').textContent());
  expect(served).toBeGreaterThan(0);

  await page.getByTestId('start-button').click(); // pause keeps state
  const depthAtPause = await page.getByTestId('queue-depth').textContent();
  await page.waitForTimeout(300);
  await expect(page.getByTestId('queue-depth')).toHaveText(depthAtPause);
});

// The sim runs from a fixed seed, so the first manual tick's exchange is
// identical on every run; the inspector shows the wire record verbatim.
test('should step a single tick and display the slim HTTP exchange over mini-IP 10.1', async ({
  page,
}) => {
  await page.goto('/panel.html');

  await expect(page.getByTestId('server-address')).toHaveText('10.1');
  await expect(page.getByTestId('exchange-inspector')).toHaveText('No requests served yet');

  await page.getByTestId('step-button').click();
  await expect(page.getByTestId('tick')).toHaveText('1');
  await expect(page.getByTestId('exchange-inspector')).toHaveText(
    '10.6 -> 10.1 GET /about => 200 This is the about page',
  );

  // A manual step advances the clock once without starting the interval timer.
  await page.waitForTimeout(300);
  await expect(page.getByTestId('tick')).toHaveText('1');
  await expect(page.getByTestId('server-address')).toHaveText('10.1');
});

// The interactive trace runs through the same sim machinery as the crowd:
// enter a path in the mini-browser, step the 4 hops ("emit, route, serve,
// render"), and watch the response land in the browser viewport — then the
// webserver's code and live internal JSON open in the bottom inspector.
test('should trace a custom URL hop-by-hop into the browser viewport and inspect component code', async ({
  page,
}) => {
  await page.goto('/panel.html');

  await page.getByTestId('url-input').fill('/about');
  for (let hop = 0; hop < 4; hop++) await page.getByTestId('btn-next-hop').click();

  await expect(page.getByTestId('browser-rendered-body')).toHaveText('This is the about page');
  await expect(page.getByTestId('browser-status-badge')).toContainText('200');
  await expect(page.getByTestId('hop-status')).toContainText('Hop 4/4');

  await page.getByTestId('node-webserver').click();
  await expect(page.getByTestId('inspector-code')).toContainText('handleRequest');
  await expect(page.getByTestId('inspector-state')).toContainText('"servedTotal": 1');
});

// Stage 2 adds a round-robin LoadBalancer at 10.1 in front of two duplicated
// WebServers (10.11 and 10.12). Switching to Stage 2 reveals the LB and second
// server, traces 5 hops per request across alternating backends, and exposes
// the LoadBalancer's code and round-robin counters in the bottom inspector.
test('should switch to Stage 2, alternate requests across 10.11 and 10.12 via the load balancer, and inspect its code', async ({
  page,
}) => {
  await page.goto('/panel.html');

  await page.getByTestId('stage-pill-2').click();
  await expect(page.getByTestId('node-lb')).toBeVisible();
  await expect(page.getByTestId('node-webserver-2')).toBeVisible();
  await expect(page.getByTestId('server-address')).toHaveText('10.11');
  await expect(page.getByTestId('server-2-address')).toHaveText('10.12');
  await expect(page.getByTestId('lb-next-backend')).toHaveText('Next -> 10.11');

  for (let hop = 0; hop < 5; hop++) await page.getByTestId('btn-next-hop').click();
  await expect(page.getByTestId('hop-status')).toContainText('Hop 5/5');
  await expect(page.getByTestId('lb-next-backend')).toHaveText('Next -> 10.12');
  await expect(page.getByTestId('lb-backend-1')).toHaveText('10.11 WebServer-1 (1)');
  await expect(page.getByTestId('browser-rendered-body')).toHaveText('This is the about page');

  await page.getByTestId('btn-url-go').click();
  await expect(page.getByTestId('lb-next-backend')).toHaveText('Next -> 10.11');
  await expect(page.getByTestId('lb-backend-2')).toHaveText('10.12 WebServer-2 (1)');

  await page.getByTestId('node-lb').click();
  await expect(page.getByTestId('inspector-code')).toContainText('selectBackend');
  await expect(page.getByTestId('inspector-state')).toContainText('"forwardedTotal": 2');
});

// Stage 3 adds a shared cache-aside Cache (10.20) behind both backends with
// tick-based TTL. The first 6-hop trace (round-robin -> 10.11) misses and
// warms the cache; the second (-> 10.12) serves a warm HIT from the shared
// entry, and the Cache's code and live TTL state open in the inspector.
test('should switch to Stage 3, warm Cache 10.20 on a miss from 10.11, serve a hit from 10.12, and inspect cache code', async ({
  page,
}) => {
  await page.goto('/panel.html');

  await page.getByTestId('stage-pill-3').click();
  await expect(page.getByTestId('node-cache')).toBeVisible();
  await expect(page.getByTestId('node-lb')).toBeVisible();
  await expect(page.getByTestId('node-webserver-2')).toBeVisible();
  await expect(page.locator('.orrery-ring')).toHaveCount(5);
  await expect(page.locator('.orrery-ring').first()).toHaveAttribute('r', '400');
  await expect(page.locator('.orrery-ring').last()).toHaveAttribute('r', '2000');
  await expect(page.getByTestId('cache-stats')).toHaveText('Hits: 0 · Misses: 0 · TTL: 10t');

  // First trace: the cold cache lookup misses; the 200 response fills the
  // shared entry (cache-aside set).
  for (let hop = 0; hop < 6; hop++) await page.getByTestId('btn-next-hop').click();
  await expect(page.getByTestId('hop-status')).toContainText('Hop 6/6');
  await expect(page.getByTestId('cache-stats')).toHaveText('Hits: 0 · Misses: 1 · TTL: 10t');
  await expect(page.getByTestId('cache-entries-list')).toContainText('/about');
  await expect(page.getByTestId('lb-backend-1')).toHaveText('10.11 WebServer-1 (1)');

  // Second trace: round-robin moves to 10.12; the shared entry answers a
  // warm HIT — one cache, two backends.
  for (let hop = 0; hop < 6; hop++) await page.getByTestId('btn-next-hop').click();
  await expect(page.getByTestId('cache-stats')).toHaveText('Hits: 1 · Misses: 1 · TTL: 10t');
  await expect(page.getByTestId('lb-backend-2')).toHaveText('10.12 WebServer-2 (1)');
  await expect(page.getByTestId('browser-rendered-body')).toHaveText('This is the about page');

  await page.getByTestId('node-cache').click();
  await expect(page.getByTestId('inspector-code')).toContainText('createCache');
  await expect(page.getByTestId('inspector-state')).toContainText('"hits": 1');
});

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
  // they stay inside the clipped plane and never depend on hardcoded page
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
