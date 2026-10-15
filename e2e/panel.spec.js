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

  // A manual step advances the clock once; it starts the interval timer.
  await page.waitForTimeout(300);
  await expect(page.getByTestId('tick')).toHaveText('1');
  await expect(page.getByTestId('server-address')).toHaveText('10.1');
});
