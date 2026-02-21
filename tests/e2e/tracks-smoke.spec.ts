import { expect, test } from '@playwright/test';
import { resolveDatasetFixture } from './helpers/dataset';
import { launchViewerFromFixture, STANDARD_VOXEL_RESOLUTION } from './helpers/workflows';

const fixture = resolveDatasetFixture();

function buildTrackCsvBuffer(): Buffer {
  const rows = [
    ['1', '0', '0', '10', '10', '5', '100', '0'],
    ['1', '0', '1', '11', '11', '5', '110', '0'],
    ['1', '0', '2', '12', '12', '5', '120', '0'],
    ['2', '0', '0', '20', '20', '8', '90', '0'],
    ['2', '0', '1', '21', '20', '8', '95', '0']
  ];
  return Buffer.from(rows.map((row) => row.join(',')).join('\n'));
}

test('@smoke can upload tracks and interact with track controls after launch', async ({ page }) => {
  await launchViewerFromFixture(page, fixture, {
    channelName: 'Ch1',
    voxelResolution: STANDARD_VOXEL_RESOLUTION,
    trackCsv: {
      name: 'tracks.csv',
      mimeType: 'text/csv',
      buffer: buildTrackCsvBuffer()
    }
  });
  await expect(
    page.locator('h2.floating-window-title').filter({ hasText: /^Tracks$/ })
  ).toBeVisible({ timeout: 60_000 });

  const trackLabelButton = page.getByRole('button', { name: 'Track #1', exact: true });
  await trackLabelButton.evaluate((element) => {
    (element as HTMLButtonElement).click();
  });
  await expect(trackLabelButton).toHaveAttribute('aria-pressed', 'true');

  const followButton = page.getByRole('button', { name: 'Follow' });
  await expect(followButton).toBeVisible();

  const deselectLegendButton = page.getByRole('button', { name: /Deselect .*Track #1/ });
  await expect(deselectLegendButton).toBeVisible();
  await deselectLegendButton.evaluate((element) => {
    (element as HTMLButtonElement).click();
  });

  await expect(trackLabelButton).toHaveAttribute('aria-pressed', 'false');
  await expect(page.getByRole('button', { name: 'Follow' })).toHaveCount(0);
});
