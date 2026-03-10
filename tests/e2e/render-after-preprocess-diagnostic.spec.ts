import { expect, test } from '@playwright/test';
import { resolveDatasetFixture } from './helpers/dataset';
import { STANDARD_VOXEL_RESOLUTION } from './helpers/workflows';

const fixture = resolveDatasetFixture();

test('diagnostic: offscreen render metrics after in-app preprocess', async ({ page }, testInfo) => {
  const { x, y, z } = STANDARD_VOXEL_RESOLUTION;

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
  await nameInput.fill('DiagCh1');
  await nameInput.press('Enter');

  const channelRow = channelTab.locator('xpath=ancestor::div[contains(@class,"setup-row")]').first();
  const volumeInput = channelRow.locator('input[type="file"][accept*=".tif"]');
  await volumeInput.setInputFiles(fixture.tiffPaths);

  const preprocessButton = page.getByRole('button', { name: 'Preprocess experiment' });
  await expect(preprocessButton).toBeEnabled();
  await preprocessButton.click();

  const launchButton = page.getByRole('button', { name: 'Launch viewer' });
  await expect(launchButton).toBeVisible({ timeout: 240_000 });
  await expect(launchButton).toBeEnabled({ timeout: 240_000 });
  await launchButton.click();

  await page.waitForTimeout(1500);
  const offscreenMetrics = await page.evaluate(() => {
    const capture = (window as Window & {
      __LLSM_CAPTURE_RENDER_TARGET_METRICS__?: (() => Record<string, unknown> | null) | null;
    }).__LLSM_CAPTURE_RENDER_TARGET_METRICS__;
    return typeof capture === 'function' ? capture() : null;
  });
  const runtime = await page.evaluate(() => {
    const getter = (window as Window & { __LLSM_VOLUME_RESOURCE_SUMMARY__?: (() => unknown) | null })
      .__LLSM_VOLUME_RESOURCE_SUMMARY__;
    return typeof getter === 'function' ? getter() : null;
  });

  const png = testInfo.outputPath('viewer-after-preprocess.png');
  await page.screenshot({ path: png, fullPage: true });

  console.log(`[render-after-preprocess] page=${png}`);
  console.log(`[render-after-preprocess] offscreenMetrics=${JSON.stringify(offscreenMetrics)}`);
  console.log(`[render-after-preprocess] runtime=${JSON.stringify(runtime)}`);
});

