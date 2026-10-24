import { test, expect } from '@playwright/test';

// PINS: the parity contract in DESIGN.md "Filesystem & Interface Tables" —
// each WebServer filesystem row (`.fs-list`) shares the Network mini-IP
// table's two-part look: the file path carries the same address-column
// color a `.mini-table` row gives a mini-IP, and the served body renders
// the same on-surface text color as the table's name column. Asserted as
// equality with the live tokens so any future palette retune keeps parity.
test('should style WebServer filesystem rows like the Network mini-IP table', async ({ page }) => {
  await page.goto('/panel.html');
  await expect(page.getByTestId('node-webserver')).toBeVisible();

  const colors = await page.evaluate(() => {
    const cs = (el) => getComputedStyle(el).color;
    return {
      netAddress: cs(document.querySelector('.mini-table td:first-child')),
      netName: cs(document.querySelector('.mini-table td:not(:first-child)')),
      fsPath: cs(document.querySelector('#node-webserver .fs-path')),
      fsBody: cs(document.querySelector('#route-about')),
    };
  });

  expect(colors.fsPath).toBe(colors.netAddress);
  expect(colors.fsBody).toBe(colors.netName);
});
