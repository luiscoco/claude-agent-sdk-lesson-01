import { test, expect } from '@playwright/test';
test('a student can observe the demo, inspect an envelope, and export a trace', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Run guided demo' }).click();
  await expect(page.locator('#run-status')).toHaveText('Complete', { timeout: 15_000 });
  await expect(page.locator('#message-count')).toHaveText('7 messages');
  await expect(page.locator('#result-text')).toContainText('addTask()');
  await page.locator('.message-user summary').first().click();
  await expect(page.locator('.message-user').first()).toContainText('tool_result');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export trace' }).click();
  expect((await download).suggestedFilename()).toBe('lesson-01-demo-trace.json');
});
test('the package map teaches the type-only entry and the actual pinned version', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('tab', { name: /Package map/ }).click();
  await expect(page.getByRole('heading', { name: 'Tool types', exact: true })).toBeVisible();
  await expect(page.locator('#package-grid')).toContainText('import type { FileReadInput }');
  await expect(page.locator('#version')).toHaveText('SDK 0.3.310');
});
test('quiz feedback supports all four Lesson 1 learning outcomes', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('tab', { name: /Check your understanding/ }).click();
  for (const [i, answer] of [0, 1, 2, 1].entries())
    await page.locator(`input[name=q${i}][value="${answer}"]`).check();
  await page.getByRole('button', { name: 'Check my answers' }).click();
  await expect(page.locator('#quiz-score')).toContainText('4 / 4 correct');
});
test('the lab fits a phone viewport without horizontal overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /An agent loop/ })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('tab', { name: /Package map/ }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
test('stop cancels the guided replay and leaves it ready for another run', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Run guided demo' }).click();
  await expect(page.getByRole('button', { name: 'Stop', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Stop', exact: true }).click();
  await expect(page.locator('#run-status')).toHaveText('Cancelled');
  await expect(page.getByRole('button', { name: 'Run guided demo' })).toBeEnabled();
});
