import { expect, test } from '@playwright/test';
import { resolveDatasetFixture } from './helpers/dataset';
import { launchViewerFromFixture } from './helpers/workflows';

const fixture = resolveDatasetFixture();

test('@smoke can preprocess local TIFF fixture and launch viewer', async ({ page }) => {
  test.skip(!fixture.available, fixture.reason ?? 'Local TIFF fixture is unavailable.');

  await launchViewerFromFixture(page, fixture);
  await expect(
    page.getByRole('button', { name: /Start playback|Pause playback/ })
  ).toBeVisible();
});
