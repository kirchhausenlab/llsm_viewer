export type DesktopRenderResolution = 'performance' | 'balanced' | 'sharp';

export type DesktopRenderResolutionOption = {
  value: DesktopRenderResolution;
  label: string;
  pixelRatioCap: number;
};

export const DESKTOP_RENDER_RESOLUTION_OPTIONS: readonly DesktopRenderResolutionOption[] = [
  { value: 'performance', label: 'Performance', pixelRatioCap: 1 },
  { value: 'balanced', label: 'Balanced', pixelRatioCap: 1.5 },
  { value: 'sharp', label: 'Sharp', pixelRatioCap: 2 },
];

export const DEFAULT_DESKTOP_RENDER_RESOLUTION: DesktopRenderResolution = 'performance';
export const DEFAULT_DESKTOP_RENDER_PIXEL_RATIO_CAP = 1;

export function resolveDesktopRenderResolutionPixelRatioCap(
  renderResolution: DesktopRenderResolution,
): number {
  return (
    DESKTOP_RENDER_RESOLUTION_OPTIONS.find((option) => option.value === renderResolution)
      ?.pixelRatioCap ?? DEFAULT_DESKTOP_RENDER_PIXEL_RATIO_CAP
  );
}
