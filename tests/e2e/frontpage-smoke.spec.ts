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

  await page.getByRole('button', { name: 'Return' }).click();
  await expect(page.getByRole('heading', { name: 'Mirante4D' })).toBeVisible();

  await page.getByRole('button', { name: 'Set up new experiment' }).click();
  await page.getByRole('button', { name: '3D movie' }).click();
  await expect(page.getByText('Resolution:')).toBeVisible();
  await expect(page.getByLabel('X:')).toBeVisible();
  await expect(page.getByLabel('Y:')).toBeVisible();
  await expect(page.getByLabel('Z:')).toBeVisible();
  await expect(page.getByLabel('T:')).toBeVisible();
  await expect(page.getByLabel('Temporal unit')).toBeVisible();

  await page.getByRole('button', { name: 'Return' }).click();
  await returnToExperimentTypeChooser();

  await page.getByRole('button', { name: '2D movie' }).click();
  await expect(page.getByLabel('X:')).toBeVisible();
  await expect(page.getByLabel('Y:')).toBeVisible();
  await expect(page.getByLabel('T:')).toBeVisible();
  await expect(page.getByLabel('Z:')).toHaveCount(0);
  await expect(page.getByLabel('Temporal unit')).toBeVisible();

  await page.getByRole('button', { name: 'Return' }).click();
  await returnToExperimentTypeChooser();

  await page.getByRole('button', { name: 'Single 3D volume' }).click();
  await expect(page.getByLabel('X:')).toBeVisible();
  await expect(page.getByLabel('Y:')).toBeVisible();
  await expect(page.getByLabel('Z:')).toBeVisible();
  await expect(page.getByLabel('T:')).toHaveCount(0);
  await expect(page.getByLabel('Temporal unit')).toHaveCount(0);

  await page.getByRole('button', { name: 'Return' }).click();
  await returnToExperimentTypeChooser();

  await page.getByRole('button', { name: 'Return' }).click();
  await expect(page.getByRole('heading', { name: 'Mirante4D' })).toBeVisible();
});

test('@smoke public experiments page opens and returns to the front page', async ({ page }) => {
  await page.route('https://mirante4d.s3.us-east-1.amazonaws.com/examples/catalog.json', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        version: 1,
        examples: [
          {
            id: 'ap2',
            label: 'AP2',
            description: '1 timepoint, 3 channels (raw, PCA, instance segmentation).',
            baseUrl: 'https://mirante4d.s3.us-east-1.amazonaws.com/examples/datasets/ap2.zarr',
            timepoints: 1
          }
        ]
      })
    });
  });

  await page.goto('/');
  await page.getByRole('button', { name: 'Load public experiments' }).click();

  await expect(page.getByRole('heading', { name: 'Load public experiments' })).toBeVisible();
  await expect(page.getByText('Visualize the experiments used in the SpatialDINO paper.')).toBeVisible();
  await expect(page.getByText('AP2')).toBeVisible();

  await page.getByRole('button', { name: 'Return' }).click();
  await expect(page.getByRole('heading', { name: 'Mirante4D' })).toBeVisible();
});
