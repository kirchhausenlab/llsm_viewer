import { expect, test } from '@playwright/test';
import { resolveDatasetFixture } from './helpers/dataset';
import { launchViewerFromFixture } from './helpers/workflows';

const fixture = resolveDatasetFixture();

test('@smoke viewer settings controls work after launch', async ({ page }) => {
  test.skip(!fixture.available, fixture.reason ?? 'Local TIFF fixture is unavailable.');

  await launchViewerFromFixture(page, fixture);

  await page.getByRole('button', { name: 'Show viewer settings window' }).click();
  const viewerSettingsWindow = page.locator('.floating-window--viewer-settings');
  await expect(viewerSettingsWindow.getByRole('heading', { name: 'Viewer settings' })).toBeVisible();

  const renderStyleButton = viewerSettingsWindow.getByRole('button', { name: 'Rendering' });
  const initialRenderStylePressed = await renderStyleButton.getAttribute('aria-pressed');
  await renderStyleButton.click();
  await expect(renderStyleButton).toHaveAttribute(
    'aria-pressed',
    initialRenderStylePressed === 'true' ? 'false' : 'true'
  );

  const samplingButton = viewerSettingsWindow.getByRole('button', { name: /Quality|Speed/ });
  const initialSamplingLabel = (await samplingButton.textContent())?.trim();
  await samplingButton.click();
  if (initialSamplingLabel === 'Quality') {
    await expect(viewerSettingsWindow.getByRole('button', { name: 'Speed' })).toBeVisible();
  } else {
    await expect(viewerSettingsWindow.getByRole('button', { name: 'Quality' })).toBeVisible();
  }

  const blendingButton = viewerSettingsWindow.getByRole('button', { name: /Additive|Alpha/ });
  const initialBlendingLabel = (await blendingButton.textContent())?.trim();
  await blendingButton.click();
  if (initialBlendingLabel === 'Additive') {
    await expect(viewerSettingsWindow.getByRole('button', { name: 'Alpha' })).toBeVisible();
  } else {
    await expect(viewerSettingsWindow.getByRole('button', { name: 'Additive' })).toBeVisible();
  }

  const fpsSlider = viewerSettingsWindow.locator('#fps-slider');
  await expect(fpsSlider).toBeVisible();
  await fpsSlider.evaluate((element) => {
    const input = element as HTMLInputElement;
    input.value = '12';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await expect(fpsSlider).toHaveValue('12');

  await page.getByRole('button', { name: 'Close viewer settings window' }).click();
  await expect(viewerSettingsWindow).toBeHidden();
});
