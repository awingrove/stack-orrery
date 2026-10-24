import { test, expect } from '@playwright/test';

// Per-stage teaching drawer (stage-teaching-drawer brief): HUD toggle + the
// per-stage narrative from js/panel/teaching.js. These assertions live in
// their own spec (guard-file-size splits e2e by responsibility, as with
// orrery-plane.spec.js — panel.spec.js sits at its 450-line cap). Titles are
// manifest pins (PANEL-1): do not reword.

// CHECKS: the drawer renders the entry for the *current* stage on every
// stage switch and stays open across those switches. Named counter-example —
// on stage 1 the stage-3 cache headline ("Shared cache-aside with tick-based
// TTL") appears only after switching to stage 3; back on stage 1 it leaves
// the drawer.
test('should open the teaching drawer, trace it across stage switches, and show stage-1 content only on stage 1', async ({
  page,
}) => {
  await page.goto('/panel.html');

  const drawer = page.getByTestId('teaching-panel');
  const headline = page.getByTestId('teaching-headline');
  await expect(drawer).toBeHidden(); // closed by default: first view is the orrery
  await page.getByTestId('teaching-toggle').click();
  await expect(drawer).toBeVisible();

  const stage1Headline = await headline.textContent();
  await expect(headline).toContainText('FIFO queue');
  // The single-server entry must not leak the cache story on stage 1.
  await expect(drawer).not.toContainText(/\bcache\b|\bttl\b/i);

  await page.getByTestId('stage-pill-2').click();
  await expect(headline).toContainText('LoadBalancer');
  await expect(drawer).toBeVisible(); // open state persists across stage switches
  await expect(drawer).not.toContainText(/\bcache\b|\bttl\b/i);

  await page.getByTestId('stage-pill-3').click();
  await expect(headline).toHaveText('Shared cache-aside with tick-based TTL');
  await expect(drawer).toBeVisible();
  await expect(drawer).toContainText('TTL');

  // Back on stage 1 the cache entry leaves the drawer — the stage-1
  // headline returns verbatim.
  await page.getByTestId('stage-pill-1').click();
  await expect(headline).toHaveText(stage1Headline);
  await expect(drawer).not.toContainText(/\bcache\b|\bttl\b/i);
  await expect(drawer).toBeVisible();
});

// CHECKS: the outbound link tracks the active stage — each stage cites its
// own system-design-primer section (index stays right for the pending
// fallback), as a new-tab plain anchor (no JS behind it).
test('should link to the system-design-primer section for the active stage', async ({ page }) => {
  await page.goto('/panel.html');

  await page.getByTestId('teaching-toggle').click();
  const link = page.getByTestId('teaching-primer-link');
  await expect(link).toBeVisible();
  await expect(link).toHaveAttribute('target', '_blank');
  await expect(link).toHaveAttribute('rel', 'noreferrer');

  for (const [stage, anchor] of [
    [1, '#performance-vs-scalability'],
    [2, '#load-balancer'],
    [3, '#cache-aside'],
    [4, '#availability-patterns'],
    [5, '#asynchronism'],
  ]) {
    if (stage > 1) await page.getByTestId(`stage-pill-${stage}`).click();
    await expect(link, `stage ${stage} primer link`).toHaveAttribute(
      'href',
      `https://github.com/donnemartin/system-design-primer${anchor}`,
    );
  }
});
