import { expect, type Page } from '@playwright/test';
import type { DatasetFixture } from './dataset';

type TrackCsvPayload = {
  name: string;
  mimeType?: string;
  buffer: Buffer;
};

export type ChannelFixtureSetup = {
  name: string;
  tiffPaths: string[];
  segmentation?: boolean;
  trackCsv?: TrackCsvPayload;
};

type LaunchSetupOptions = {
  voxelResolution?: { x: string; y: string; z: string };
};

const DEFAULT_VOXEL_RESOLUTION = { x: '1', y: '1', z: '1' } as const;

export async function launchViewerFromChannelFixtures(
  page: Page,
  channels: ChannelFixtureSetup[],
  options: LaunchSetupOptions = {}
): Promise<{ timepointCount: number }> {
  if (channels.length === 0) {
    throw new Error('launchViewerFromChannelFixtures requires at least one channel.');
  }

  const voxelResolution = options.voxelResolution ?? DEFAULT_VOXEL_RESOLUTION;

  await page.goto('/');
  await page.getByRole('button', { name: 'Set up new experiment' }).click();
  await expect(page.getByRole('heading', { name: 'Set up new experiment' })).toBeVisible();

  await page.getByLabel('X:').fill(voxelResolution.x);
  await page.getByLabel('Y:').fill(voxelResolution.y);
  await page.getByLabel('Z:').fill(voxelResolution.z);

  for (const [channelIndex, channel] of channels.entries()) {
    await page.getByRole('button', { name: '+ Add channel' }).click();

    const channelTabs = page.locator('.channel-tabs [role="tab"]');
    await expect(channelTabs).toHaveCount(channelIndex + 1);
    const targetTab = channelTabs.nth(channelIndex);
    await targetTab.click();

    const nameInput = page.locator('.channel-name-input').first();
    let canEditNameInline = await nameInput
      .waitFor({ state: 'visible', timeout: 2_000 })
      .then(() => true)
      .catch(() => false);
    if (!canEditNameInline) {
      await targetTab.dblclick();
      canEditNameInline = await nameInput
        .waitFor({ state: 'visible', timeout: 2_000 })
        .then(() => true)
        .catch(() => false);
    }
    if (canEditNameInline) {
      await nameInput.fill(channel.name);
      await nameInput.press('Enter');
    } else {
      throw new Error(`Unable to edit name for channel "${channel.name}".`);
    }

    const volumeInput = page.locator('input[type="file"][accept*=".tif"]').first();
    await volumeInput.setInputFiles(channel.tiffPaths);
    const fileCountLabel = channel.tiffPaths.length === 1 ? '1 file' : `${channel.tiffPaths.length} files`;
    await expect(page.locator('.channel-layer-status')).toContainText(fileCountLabel);

    const segmentationCheckbox = page.getByRole('checkbox', { name: 'Segmentation volume' });
    if (channel.segmentation) {
      await segmentationCheckbox.check();
      await expect(segmentationCheckbox).toBeChecked();
    } else {
      await segmentationCheckbox.uncheck();
      await expect(segmentationCheckbox).not.toBeChecked();
    }

    if (channel.trackCsv) {
      const trackInput = page.locator('input[type="file"][accept=".csv"]').first();
      await trackInput.setInputFiles({
        name: channel.trackCsv.name,
        mimeType: channel.trackCsv.mimeType ?? 'text/csv',
        buffer: channel.trackCsv.buffer
      });
      await expect(page.locator('.channel-tracks-filename')).toContainText(channel.trackCsv.name);
      await expect(page.locator('.channel-tracks-status')).toContainText(/Loaded/i);
    }
  }

  const preprocessButton = page.getByRole('button', { name: 'Preprocess experiment' });
  await expect(preprocessButton).toBeEnabled();
  await preprocessButton.click();

  const launchButton = page.getByRole('button', { name: 'Launch viewer' });
  await expect(launchButton).toBeVisible({ timeout: 240_000 });
  await expect(launchButton).toBeEnabled({ timeout: 240_000 });
  await launchButton.click();

  await expect(page.getByRole('button', { name: 'File' })).toBeVisible({ timeout: 60_000 });

  return { timepointCount: channels[0].tiffPaths.length };
}

export async function launchViewerFromFixture(
  page: Page,
  fixture: DatasetFixture,
  options: { channelName?: string; trackCsv?: TrackCsvPayload } = {}
): Promise<{ timepointCount: number }> {
  return launchViewerFromChannelFixtures(page, [
    {
      name: options.channelName ?? 'Ch1',
      tiffPaths: fixture.tiffPaths,
      segmentation: false,
      trackCsv: options.trackCsv
    }
  ]);
}
