import { expect, test } from '@playwright/test';
import { resolveDatasetFixture } from './helpers/dataset';
import { STANDARD_VOXEL_RESOLUTION } from './helpers/workflows';

const fixture = resolveDatasetFixture();

test('@nightly preprocesses local fixture within sanity budget and reports timing', async ({ page }) => {
  const { x, y, z } = STANDARD_VOXEL_RESOLUTION;
  const budgetMs = Number.parseInt(process.env.PREPROCESS_E2E_MAX_MS ?? '240000', 10);
  const maxAllowedMs = Number.isFinite(budgetMs) && budgetMs > 0 ? budgetMs : 240_000;

  await page.goto('/');
  await page.getByRole('button', { name: 'Set up new experiment' }).click();
  await expect(page.getByRole('heading', { name: 'Set up new experiment' })).toBeVisible();
  await page.getByRole('button', { name: '3D movie' }).click();

  await page.getByLabel('X:').fill(x);
  await page.getByLabel('Y:').fill(y);
  await page.getByLabel('Z:').fill(z);

  await page.getByRole('button', { name: '+ Add channel' }).click();
  const channelSection = page.locator('.setup-section').first();
  const channelTab = channelSection.locator('.setup-row [role="tab"]').first();
  await expect(channelTab).toBeVisible();
  await channelTab.click();

  await channelTab.dblclick();
  const nameInput = channelTab.locator('.channel-name-input');
  await expect(nameInput).toBeVisible({ timeout: 2_000 });
  await nameInput.fill('PerfCh1');
  await nameInput.press('Enter');

  const channelRow = channelTab.locator('xpath=ancestor::div[contains(@class,"setup-row")]').first();
  const volumeInput = channelRow.locator('input[type="file"][accept*=".tif"]');
  await volumeInput.setInputFiles(fixture.tiffPaths);
  const fileCountLabel =
    fixture.tiffPaths.length === 1 ? '1 file selected' : `${fixture.tiffPaths.length} files selected`;
  await expect(channelRow.locator('.channel-layer-drop-subtitle')).toContainText(fileCountLabel);

  const preprocessButton = page.getByRole('button', { name: 'Preprocess experiment' });
  await expect(preprocessButton).toBeEnabled();

  const startedAt = Date.now();
  await preprocessButton.click();

  const launchButton = page.getByRole('button', { name: 'Launch viewer' });
  await expect(launchButton).toBeVisible({ timeout: 240_000 });
  await expect(launchButton).toBeEnabled({ timeout: 240_000 });
  const elapsedMs = Date.now() - startedAt;

  console.log(
    `[preprocess-perf] elapsedMs=${elapsedMs} files=${fixture.tiffPaths.length} budgetMs=${maxAllowedMs}`
  );
  expect(elapsedMs).toBeLessThanOrEqual(maxAllowedMs);
});
