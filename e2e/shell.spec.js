import { test, expect } from '@playwright/test';

// Arrival is by clicking in-app links (TEST-RULES click-through rule),
// never goto() deep URLs — this spec proves the shell leads somewhere.
test('should reach the diagram panel from the landing page', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1, name: 'stack-orrery' })).toBeVisible();

  await page.getByRole('main').getByRole('link', { name: 'Diagram panel' }).click();

  await expect(page).toHaveURL(/panel\.html$/);
  await expect(page.getByRole('heading', { level: 1, name: /Diagram panel/ })).toBeVisible();
});
