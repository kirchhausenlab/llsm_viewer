import { expect, test } from '@playwright/test';

test('@visual front page initial state', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Mirante4D' })).toBeVisible();
  await expect(page.getByText('Developed by Jose Inacio Costa-Filho')).toBeVisible();

  await expect(page).toHaveScreenshot('frontpage-initial.png', {
    fullPage: true
  });
});

test('@visual front page setup mode', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Set up new experiment' }).click();
  await expect(page.getByRole('heading', { name: 'Set up new experiment' })).toBeVisible();

  await expect(page).toHaveScreenshot('frontpage-setup.png', {
    fullPage: true
  });
});

test('@visual front page public experiments mode', async ({ page }) => {
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
          },
          {
            id: 'npc1',
            label: 'NPC1',
            description: '5 timepoints, 1 channel (raw), tracks.',
            baseUrl: 'https://mirante4d.s3.us-east-1.amazonaws.com/examples/datasets/npc2_5.zarr',
            timepoints: 5
          }
        ]
      })
    });
  });

  await page.goto('/');
  await page.getByRole('button', { name: 'Load public experiments' }).click();
  await expect(page.getByRole('heading', { name: 'Load public experiments' })).toBeVisible();
  await expect(page.getByText('Visualize the experiments used in the SpatialDINO paper.')).toBeVisible();

  await expect(page).toHaveScreenshot('frontpage-public-experiments.png', {
    fullPage: true
  });
});
