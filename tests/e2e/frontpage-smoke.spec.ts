import { expect, test } from '@playwright/test';
import { resolveDatasetFixture } from './helpers/dataset';
import { launchViewerFromFixture, STANDARD_VOXEL_RESOLUTION } from './helpers/workflows';

const fixture = resolveDatasetFixture();

test('@smoke can preprocess local TIFF fixture and launch viewer', async ({ page }) => {
  await launchViewerFromFixture(page, fixture, {
    channelName: 'Ch1',
    voxelResolution: STANDARD_VOXEL_RESOLUTION
  });
  await expect(
    page.getByRole('button', { name: /Start playback|Pause playback/ })
  ).toBeVisible();
});

test('@smoke setup flow steps back through chooser before front page', async ({ page }) => {
  const returnToExperimentTypeChooser = async () => {
    const chooserText = page.getByText('Choose the type of experiment:');
    if ((await chooserText.count()) > 0 && (await chooserText.first().isVisible().catch(() => false))) {
      return;
    }
    await expect(page.getByRole('heading', { name: 'Mirante4D' })).toBeVisible();
    await page.getByRole('button', { name: 'Set up new experiment' }).click();
    await expect(chooserText).toBeVisible();
  };

  await page.goto('/');
  await page.getByRole('button', { name: 'Set up new experiment' }).click();

  await expect(page.getByText('Choose the type of experiment:')).toBeVisible();
  await expect(page.getByRole('button', { name: '3D movie' })).toBeVisible();
  await expect(page.getByRole('button', { name: '2D movie' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Single 3D volume' })).toBeVisible();

  await page.getByRole('button', { name: '↩ Return' }).click();
  await expect(page.getByRole('heading', { name: 'Mirante4D' })).toBeVisible();

  await page.getByRole('button', { name: 'Set up new experiment' }).click();
  await page.getByRole('button', { name: '3D movie' }).click();
  await expect(page.getByText('Resolution:')).toBeVisible();
  await expect(page.getByLabel('X:')).toBeVisible();
  await expect(page.getByLabel('Y:')).toBeVisible();
  await expect(page.getByLabel('Z:')).toBeVisible();
  await expect(page.getByLabel('T:')).toBeVisible();
  await expect(page.getByLabel('Temporal unit')).toBeVisible();

  await page.getByRole('button', { name: '↩ Return' }).click();
  await returnToExperimentTypeChooser();

  await page.getByRole('button', { name: '2D movie' }).click();
  await expect(page.getByLabel('X:')).toBeVisible();
  await expect(page.getByLabel('Y:')).toBeVisible();
  await expect(page.getByLabel('T:')).toBeVisible();
  await expect(page.getByLabel('Z:')).toHaveCount(0);
  await expect(page.getByLabel('Temporal unit')).toBeVisible();

  await page.getByRole('button', { name: '↩ Return' }).click();
  await returnToExperimentTypeChooser();

  await page.getByRole('button', { name: 'Single 3D volume' }).click();
  await expect(page.getByLabel('X:')).toBeVisible();
  await expect(page.getByLabel('Y:')).toBeVisible();
  await expect(page.getByLabel('Z:')).toBeVisible();
  await expect(page.getByLabel('T:')).toHaveCount(0);
  await expect(page.getByLabel('Temporal unit')).toHaveCount(0);

  await page.getByRole('button', { name: '↩ Return' }).click();
  await returnToExperimentTypeChooser();

  await page.getByRole('button', { name: '↩ Return' }).click();
  await expect(page.getByRole('heading', { name: 'Mirante4D' })).toBeVisible();
});
