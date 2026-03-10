import { expect, type Page } from '@playwright/test';
import type { DatasetFixture } from './dataset';

type TrackCsvPayload = {
  name: string;
  mimeType: string;
  buffer: Buffer;
};

export type ChannelFixtureSetup = {
  name: string;
  tiffPaths: string[];
  segmentation?: boolean;
  trackCsv?: TrackCsvPayload;
};

type LaunchSetupOptions = {
  voxelResolution: { x: string; y: string; z: string };
};

export const STANDARD_VOXEL_RESOLUTION = { x: '1', y: '1', z: '1' } as const;

export async function launchViewerFromChannelFixtures(
  page: Page,
  channels: ChannelFixtureSetup[],
  options: LaunchSetupOptions
): Promise<{ timepointCount: number }> {
  if (channels.length === 0) {
    throw new Error('launchViewerFromChannelFixtures requires at least one channel.');
  }

  const voxelResolution = options.voxelResolution;

  await page.goto('/');
  await page.getByRole('button', { name: 'Set up new experiment' }).click();
  await expect(page.getByRole('heading', { name: 'Set up new experiment' })).toBeVisible();
  await page.getByRole('button', { name: '3D movie' }).click();

  await page.getByLabel('X:').fill(voxelResolution.x);
  await page.getByLabel('Y:').fill(voxelResolution.y);
  await page.getByLabel('Z:').fill(voxelResolution.z);

  const channelSection = page
    .locator('.setup-section')
    .filter({ has: page.getByRole('heading', { name: 'Channels' }) })
    .first();
  const segmentationChannelSection = page
    .locator('.setup-section')
    .filter({ has: page.getByRole('heading', { name: 'Segmentation channels' }) })
    .first();
  let channelCount = 0;
  let segmentationChannelCount = 0;

  for (const channel of channels) {
    const isSegmentation = channel.segmentation === true;
    if (isSegmentation) {
      await page.getByRole('button', { name: '+ Add segmentation channel' }).click();
    } else {
      await page.getByRole('button', { name: '+ Add channel' }).click();
    }

    const targetSection = isSegmentation ? segmentationChannelSection : channelSection;
    const channelTabs = targetSection.locator('.setup-row [role="tab"]');
    const nextCount = isSegmentation ? segmentationChannelCount + 1 : channelCount + 1;
    await expect(channelTabs).toHaveCount(nextCount);
    const targetTab = channelTabs.nth(nextCount - 1);
    await targetTab.click();

    const nameInput = targetTab.locator('.channel-name-input');
    await targetTab.dblclick();
    await expect(nameInput).toBeVisible({ timeout: 2_000 });
    await nameInput.fill(channel.name);
    await nameInput.press('Enter');

    const channelRow = targetTab.locator('xpath=ancestor::div[contains(@class,"setup-row")]').first();
    const volumeInput = channelRow.locator('input[type="file"][accept*=".tif"]');
    await volumeInput.setInputFiles(channel.tiffPaths);
    const fileCountLabel =
      channel.tiffPaths.length === 1 ? '1 file selected' : `${channel.tiffPaths.length} files selected`;
    await expect(channelRow.locator('.channel-layer-drop-subtitle')).toContainText(fileCountLabel);

    if (isSegmentation) {
      segmentationChannelCount += 1;
    } else {
      channelCount += 1;
    }
  }

  const trackSection = page
    .locator('.setup-section')
    .filter({ has: page.getByRole('heading', { name: 'Tracks' }) })
    .first();
  const tracksToAttach = channels.filter((channel) => channel.trackCsv);
  for (const [trackIndex, channel] of tracksToAttach.entries()) {
    await page.getByRole('button', { name: '+ Add track' }).click();

    const trackTabs = trackSection.locator('.setup-row [role="tab"]');
    await expect(trackTabs).toHaveCount(trackIndex + 1);
    const trackTab = trackTabs.nth(trackIndex);
    await trackTab.dblclick();
    const trackNameInput = trackTab.locator('.channel-name-input');
    await expect(trackNameInput).toBeVisible({ timeout: 2_000 });
    await trackNameInput.fill(`Track ${trackIndex + 1}`);
    await trackNameInput.press('Enter');

    const trackRow = trackTab.locator('xpath=ancestor::div[contains(@class,"setup-row")]').first();
    const trackInput = trackRow.locator('input[type="file"][accept=".csv"]');

    if (channel.trackCsv) {
      await trackInput.setInputFiles({
        name: channel.trackCsv.name,
        mimeType: channel.trackCsv.mimeType,
        buffer: channel.trackCsv.buffer
      });
      await expect(trackRow.locator('.channel-tracks-subtitle')).toContainText('1 file selected');
    }

    const bindSelect = trackRow.locator('.track-card-bind-select');
    await bindSelect.selectOption({ label: channel.name });
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
  options: {
    channelName: string;
    voxelResolution: { x: string; y: string; z: string };
    trackCsv?: TrackCsvPayload;
  }
): Promise<{ timepointCount: number }> {
  return launchViewerFromChannelFixtures(
    page,
    [
      {
        name: options.channelName,
        tiffPaths: fixture.tiffPaths,
        segmentation: false,
        trackCsv: options.trackCsv
      }
    ],
    { voxelResolution: options.voxelResolution }
  );
}
