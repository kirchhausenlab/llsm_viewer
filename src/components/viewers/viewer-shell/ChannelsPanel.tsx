import {
  DEFAULT_WINDOW_MAX,
  DEFAULT_WINDOW_MIN,
  RENDER_STYLE_MIP,
  RENDER_STYLE_SLICE,
  createDefaultLayerSettings,
  resolveIntensityRenderModeConfig,
  resolveIntensityRenderModeValue,
  type IntensityRenderModeValue
} from '../../../state/layerSettings';
import { DEFAULT_LAYER_COLOR, GRAYSCALE_COLOR_SWATCHES, normalizeHexColor } from '../../../shared/colorMaps/layerColors';
import BrightnessContrastHistogram from '../BrightnessContrastHistogram';
import FloatingWindow from '../../widgets/FloatingWindow';
import type { ChannelsPanelProps, ChannelPanelStyle, LayoutProps } from './types';

const formatNormalizedIntensity = (value: number): string => {
  const fixed = value.toFixed(3);
  return fixed.replace(/(\.\d*?[1-9])0+$/, '$1').replace(/\.0+$/, '');
};

export type ChannelsPanelWindowProps = ChannelsPanelProps & {
  layout: Pick<LayoutProps, 'windowMargin' | 'controlWindowWidth' | 'layersWindowInitialPosition' | 'resetToken'>;
  isOpen: boolean;
  onClose: () => void;
};

export default function ChannelsPanel({
  layout,
  isOpen,
  onClose,
  isPlaying,
  loadedChannelIds,
  channelNameMap,
  channelVisibility,
  channelTintMap,
  activeChannelId,
  onChannelReset,
  onChannelVisibilityToggle,
  channelLayersMap,
  layerVolumesByKey,
  layerBrickAtlasesByKey,
  layerSettings,
  getLayerDefaultSettings,
  onLayerWindowMinChange,
  onLayerWindowMaxChange,
  onLayerBrightnessChange,
  onLayerContrastChange,
  onLayerAutoContrast,
  onLayerOffsetChange,
  onLayerColorChange,
  onLayerRenderStyleChange,
  onLayerInvertToggle
}: ChannelsPanelWindowProps) {
  const { windowMargin, controlWindowWidth, layersWindowInitialPosition, resetToken } = layout;
  const activeChannelLabel = activeChannelId ? channelNameMap.get(activeChannelId) ?? 'Untitled channel' : null;
  const activeChannelVisible = activeChannelId ? (channelVisibility[activeChannelId] ?? true) : true;

  if (!isOpen) {
    return null;
  }

  return (
    <FloatingWindow
      title="Channels"
      initialPosition={layersWindowInitialPosition}
      width={`min(${controlWindowWidth}px, calc(100vw - ${windowMargin * 2}px))`}
      className="floating-window--channels"
      resetSignal={resetToken}
      onClose={onClose}
    >
      <div className="sidebar sidebar-left">
        {loadedChannelIds.length > 0 ? (
          <div className="channel-controls">
            {activeChannelLabel ? (
              <div className="channel-current-row">
                <span className="channel-current-title">{activeChannelLabel}</span>
                <button
                  type="button"
                  className="channel-action-button channel-current-visibility-button"
                  onClick={() => {
                    if (!activeChannelId) {
                      return;
                    }
                    onChannelVisibilityToggle(activeChannelId);
                  }}
                  title={activeChannelVisible ? 'Hide current channel' : 'Show current channel'}
                >
                  {activeChannelVisible ? 'Hide' : 'Show'}
                </button>
              </div>
            ) : null}
            {loadedChannelIds.map((channelId) => {
              const channelLayers = channelLayersMap.get(channelId) ?? [];
              const selectedLayer = channelLayers[0] ?? null;
              const settings = selectedLayer
                ? layerSettings[selectedLayer.key] ?? getLayerDefaultSettings(selectedLayer.key)
                : createDefaultLayerSettings();
              const sliderDisabled = !selectedLayer || selectedLayer.volumeCount === 0;
              const renderStyleDisabled = sliderDisabled;
              const offsetDisabled = sliderDisabled || channelId !== activeChannelId;
              const currentVolume = selectedLayer ? layerVolumesByKey[selectedLayer.key] ?? null : null;
              const currentHistogram = selectedLayer
                ? currentVolume?.histogram ?? layerBrickAtlasesByKey[selectedLayer.key]?.histogram ?? null
                : null;
              const isGrayscale = Boolean(selectedLayer && selectedLayer.channels === 1);
              const normalizedColor = normalizeHexColor(settings.color, DEFAULT_LAYER_COLOR);
              const displayColor = normalizedColor.toUpperCase();
              const isActive = channelId === activeChannelId;
              const segmentation3dActive = Boolean(
                selectedLayer?.isSegmentation && settings.renderStyle !== RENDER_STYLE_SLICE,
              );
              const intensityRenderMode = selectedLayer?.isSegmentation
                ? null
                : resolveIntensityRenderModeValue(settings.renderStyle, settings.samplingMode);
              const invertDisabled = sliderDisabled || Boolean(selectedLayer?.isSegmentation);
              const invertTitle = selectedLayer?.isSegmentation
                ? 'Invert LUT is unavailable for segmentation volumes.'
                : undefined;
              const channelTint = channelTintMap.get(channelId) ?? DEFAULT_LAYER_COLOR;
              const channelPanelStyle: ChannelPanelStyle = {
                '--channel-slider-color': channelTint
              };

              return (
                <div
                  key={channelId}
                  id={`channel-panel-${channelId}`}
                  role="tabpanel"
                  aria-labelledby={`channel-tab-${channelId}`}
                  className={isActive ? 'channel-panel is-active' : 'channel-panel'}
                  hidden={!isActive}
                  style={channelPanelStyle}
                >
                  {isActive ? (
                    <>
                      {channelLayers.length === 0 ? (
                        <p className="channel-empty-hint">No volume available for this channel.</p>
                      ) : null}
                      {selectedLayer ? (
                        <>
                          <div className="channel-primary-actions">
                            <div className="channel-primary-actions-row" role="group" aria-label="Render style">
                              {selectedLayer.isSegmentation ? (
                                <>
                                  <button
                                    type="button"
                                    className="channel-action-button"
                                    onClick={() => onLayerRenderStyleChange(selectedLayer.key, RENDER_STYLE_MIP)}
                                    disabled={renderStyleDisabled}
                                    aria-pressed={segmentation3dActive}
                                  >
                                    3D
                                  </button>
                                  <button
                                    type="button"
                                    className="channel-action-button"
                                    onClick={() => onLayerRenderStyleChange(selectedLayer.key, RENDER_STYLE_SLICE)}
                                    disabled={renderStyleDisabled}
                                    aria-pressed={settings.renderStyle === RENDER_STYLE_SLICE}
                                  >
                                    Slice
                                  </button>
                                </>
                              ) : (
                                <div className="channel-render-mode-control">
                                  <select
                                    id={`layer-render-mode-${selectedLayer.key}`}
                                    className="channel-render-mode-select"
                                    value={intensityRenderMode ?? 'mip'}
                                    onChange={(event) => {
                                      const nextMode = event.target.value as IntensityRenderModeValue;
                                      const nextConfig = resolveIntensityRenderModeConfig(nextMode);
                                      onLayerRenderStyleChange(
                                        selectedLayer.key,
                                        nextConfig.renderStyle,
                                        nextConfig.samplingMode
                                      );
                                    }}
                                    disabled={renderStyleDisabled}
                                    aria-label="Render mode"
                                  >
                                    <option value="mip">Max Int Projection (MIP)</option>
                                    <option value="mip-v">Max Int Projection (MIP) - Voxel</option>
                                    <option value="iso">Isosurfaces (ISO)</option>
                                    <option value="bl">Beer-Lambert (BL)</option>
                                    <option value="slice">2D Slices (XY)</option>
                                  </select>
                                </div>
                              )}
                            </div>
                          </div>
                          <div className="channel-primary-actions">
                            <div className="channel-primary-actions-row">
                              <button
                                type="button"
                                className="channel-action-button"
                                onClick={() => onChannelReset(channelId)}
                                disabled={channelLayers.length === 0}
                              >
                                Reset
                              </button>
                              <button
                                type="button"
                                className="channel-action-button"
                                onClick={() => onLayerInvertToggle(selectedLayer.key)}
                                disabled={invertDisabled}
                                aria-pressed={settings.invert}
                                title={invertTitle}
                              >
                                Invert
                              </button>
                              <button
                                type="button"
                                className="channel-action-button"
                                onClick={() => onLayerAutoContrast(selectedLayer.key)}
                                disabled={sliderDisabled}
                              >
                                Auto
                              </button>
                            </div>
                          </div>
                          <BrightnessContrastHistogram
                            className="channel-histogram"
                            volume={currentVolume}
                            histogram={currentHistogram}
                            isPlaying={isPlaying}
                            windowMin={settings.windowMin}
                            windowMax={settings.windowMax}
                            defaultMin={DEFAULT_WINDOW_MIN}
                            defaultMax={DEFAULT_WINDOW_MAX}
                            sliderRange={settings.sliderRange}
                            tintColor={channelTint}
                          />
                      <div className="slider-control slider-control--pair">
                        <div className="slider-control slider-control--inline">
                          <label htmlFor={`layer-window-min-${selectedLayer.key}`}>
                            Minimum <span>{formatNormalizedIntensity(settings.windowMin)}</span>
                          </label>
                          <input
                            id={`layer-window-min-${selectedLayer.key}`}
                            type="range"
                            min={DEFAULT_WINDOW_MIN}
                            max={DEFAULT_WINDOW_MAX}
                            step={0.001}
                            value={settings.windowMin}
                            onChange={(event) => onLayerWindowMinChange(selectedLayer.key, Number(event.target.value))}
                            disabled={sliderDisabled}
                          />
                        </div>
                        <div className="slider-control slider-control--inline">
                          <label htmlFor={`layer-window-max-${selectedLayer.key}`}>
                            Maximum <span>{formatNormalizedIntensity(settings.windowMax)}</span>
                          </label>
                          <input
                            id={`layer-window-max-${selectedLayer.key}`}
                            type="range"
                            min={DEFAULT_WINDOW_MIN}
                            max={DEFAULT_WINDOW_MAX}
                            step={0.001}
                            value={settings.windowMax}
                            onChange={(event) => onLayerWindowMaxChange(selectedLayer.key, Number(event.target.value))}
                            disabled={sliderDisabled}
                          />
                        </div>
                      </div>
                      <div className="slider-control slider-control--pair">
                        <div className="slider-control slider-control--inline">
                          <label htmlFor={`layer-brightness-${selectedLayer.key}`}>Brightness</label>
                          <input
                            id={`layer-brightness-${selectedLayer.key}`}
                            type="range"
                            min={0}
                            max={settings.sliderRange}
                            step={1}
                            value={settings.brightnessSliderIndex}
                            onChange={(event) => onLayerBrightnessChange(selectedLayer.key, Number.parseInt(event.target.value, 10))}
                            disabled={sliderDisabled}
                          />
                        </div>
                        <div className="slider-control slider-control--inline">
                          <label htmlFor={`layer-contrast-${selectedLayer.key}`}>Contrast</label>
                          <input
                            id={`layer-contrast-${selectedLayer.key}`}
                            type="range"
                            min={0}
                            max={settings.sliderRange}
                            step={1}
                            value={settings.contrastSliderIndex}
                            onChange={(event) => onLayerContrastChange(selectedLayer.key, Number.parseInt(event.target.value, 10))}
                            disabled={sliderDisabled}
                          />
                        </div>
                      </div>
                      {isGrayscale ? (
                        <div className="color-control">
                          <div className="color-control-header">
                            <span id={`layer-color-label-${selectedLayer.key}`}>Tint color</span>
                            <span>{displayColor}</span>
                          </div>
                          <div className="color-swatch-row">
                            <div
                              className="color-swatch-grid"
                              role="radiogroup"
                              aria-labelledby={`layer-color-label-${selectedLayer.key}`}
                            >
                              {GRAYSCALE_COLOR_SWATCHES.map((swatch) => {
                                const normalized = normalizeHexColor(swatch.value, DEFAULT_LAYER_COLOR);
                                const isSelected = normalized === normalizeHexColor(settings.color, DEFAULT_LAYER_COLOR);
                                return (
                                  <button
                                    key={swatch.label}
                                    type="button"
                                    className={isSelected ? 'color-swatch-button is-selected' : 'color-swatch-button'}
                                    style={{ backgroundColor: swatch.value }}
                                    onClick={() => onLayerColorChange(selectedLayer.key, swatch.value)}
                                    aria-pressed={isSelected}
                                    aria-label={swatch.label}
                                    disabled={sliderDisabled}
                                  />
                                );
                              })}
                            </div>
                            <label
                              className={sliderDisabled ? 'color-picker-trigger is-disabled' : 'color-picker-trigger'}
                              htmlFor={`layer-color-custom-${selectedLayer.key}`}
                            >
                              <input
                                id={`layer-color-custom-${selectedLayer.key}`}
                                type="color"
                                value={normalizedColor}
                                onChange={(event) => onLayerColorChange(selectedLayer.key, event.target.value)}
                                disabled={sliderDisabled}
                                aria-label="Choose custom tint color"
                                className="color-picker-input"
                              />
                              <span
                                className="color-picker-indicator"
                                style={{ backgroundColor: normalizedColor }}
                                aria-hidden="true"
                              />
                            </label>
                          </div>
                        </div>
                      ) : null}
                      <div className="slider-control slider-control--pair">
                        <div className="slider-control slider-control--inline">
                          <label htmlFor={`layer-offset-x-${selectedLayer.key}`}>
                            X shift <span>{settings.xOffset >= 0 ? '+' : ''}{settings.xOffset.toFixed(2)} px</span>
                          </label>
                          <input
                            id={`layer-offset-x-${selectedLayer.key}`}
                            type="range"
                            min={-10}
                            max={10}
                            step={0.1}
                            value={settings.xOffset}
                            onChange={(event) => onLayerOffsetChange(selectedLayer.key, 'x', Number(event.target.value))}
                            disabled={offsetDisabled}
                          />
                        </div>
                        <div className="slider-control slider-control--inline">
                          <label htmlFor={`layer-offset-y-${selectedLayer.key}`}>
                            Y shift <span>{settings.yOffset >= 0 ? '+' : ''}{settings.yOffset.toFixed(2)} px</span>
                          </label>
                          <input
                            id={`layer-offset-y-${selectedLayer.key}`}
                            type="range"
                            min={-10}
                            max={10}
                            step={0.1}
                            value={settings.yOffset}
                            onChange={(event) => onLayerOffsetChange(selectedLayer.key, 'y', Number(event.target.value))}
                            disabled={offsetDisabled}
                          />
                        </div>
                      </div>
                        </>
                      ) : null}
                    </>
                  ) : null}
                </div>
              );
            })}
          </div>
        ) : (
          <p className="channel-empty-hint">Load a volume to configure channel properties.</p>
        )}
      </div>
    </FloatingWindow>
  );
}
