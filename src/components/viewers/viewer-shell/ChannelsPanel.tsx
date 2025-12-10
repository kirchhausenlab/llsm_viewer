import type { MouseEvent } from 'react';

import { DEFAULT_WINDOW_MAX, DEFAULT_WINDOW_MIN, createDefaultLayerSettings } from '../../../state/layerSettings';
import { DEFAULT_LAYER_COLOR, GRAYSCALE_COLOR_SWATCHES, normalizeHexColor } from '../../../shared/colorMaps/layerColors';
import { applyAlphaToHex } from '../../../shared/utils/appHelpers';
import BrightnessContrastHistogram from '../BrightnessContrastHistogram';
import FloatingWindow from '../../widgets/FloatingWindow';
import type { ChannelsPanelProps, ChannelPanelStyle, LayoutProps } from './types';

const formatNormalizedIntensity = (value: number): string => {
  const fixed = value.toFixed(3);
  return fixed.replace(/(\.\d*?[1-9])0+$/, '$1').replace(/\.0+$/, '');
};

export type ChannelsPanelWindowProps = ChannelsPanelProps & {
  layout: Pick<LayoutProps, 'windowMargin' | 'controlWindowWidth' | 'layersWindowInitialPosition' | 'resetToken'>;
};

export default function ChannelsPanel({
  layout,
  loadedChannelIds,
  channelNameMap,
  channelVisibility,
  channelTintMap,
  activeChannelId,
  onChannelTabSelect,
  onChannelVisibilityToggle,
  channelLayersMap,
  channelActiveLayer,
  layerSettings,
  getLayerDefaultSettings,
  onChannelLayerSelect,
  onChannelReset,
  onLayerWindowMinChange,
  onLayerWindowMaxChange,
  onLayerBrightnessChange,
  onLayerContrastChange,
  onLayerAutoContrast,
  onLayerOffsetChange,
  onLayerColorChange,
  onLayerInvertToggle
}: ChannelsPanelWindowProps) {
  const { windowMargin, controlWindowWidth, layersWindowInitialPosition, resetToken } = layout;

  return (
    <FloatingWindow
      title="Channels"
      initialPosition={layersWindowInitialPosition}
      width={`min(${controlWindowWidth}px, calc(100vw - ${windowMargin * 2}px))`}
      className="floating-window--channels"
      resetSignal={resetToken}
      headerContent={
        loadedChannelIds.length > 0 ? (
          <div className="channel-tabs channel-tabs--header" role="tablist" aria-label="Volume channels">
            {loadedChannelIds.map((channelId) => {
              const label = channelNameMap.get(channelId) ?? 'Untitled channel';
              const displayLabel = label.length > 9 ? `${label.slice(0, 6)}...` : label;
              const isActive = channelId === activeChannelId;
              const isVisible = channelVisibility[channelId] ?? true;
              const tabClassName = ['channel-tab', isActive ? 'is-active' : '', !isVisible ? 'is-hidden' : '']
                .filter(Boolean)
                .join(' ');
              const labelClassName = isVisible
                ? 'channel-tab-label'
                : 'channel-tab-label channel-tab-label--hidden';
              const tintColor = channelTintMap.get(channelId) ?? DEFAULT_LAYER_COLOR;
              const tabStyle: ChannelPanelStyle = {
                '--channel-tab-background': applyAlphaToHex(tintColor, 0.18),
                '--channel-tab-background-active': applyAlphaToHex(tintColor, 0.35),
                '--channel-tab-border': 'rgba(255, 255, 255, 0.15)',
                '--channel-tab-border-active': applyAlphaToHex(tintColor, 0.55)
              };
              const handleChannelTabClick = (event: MouseEvent<HTMLButtonElement>) => {
                if (event.button !== 0) return;
                onChannelTabSelect(channelId);
              };

              const handleChannelTabAuxClick = (event: MouseEvent<HTMLButtonElement>) => {
                if (event.button === 1) {
                  event.preventDefault();
                  onChannelVisibilityToggle(channelId);
                }
              };
              return (
                <button
                  key={channelId}
                  type="button"
                  className={tabClassName}
                  style={tabStyle}
                  onClick={handleChannelTabClick}
                  onAuxClick={handleChannelTabAuxClick}
                  title={isVisible ? 'Middle click to hide this channel' : 'Middle click to show this channel'}
                  role="tab"
                  id={`channel-tab-${channelId}`}
                  aria-label={label}
                  aria-selected={isActive}
                  aria-controls={`channel-panel-${channelId}`}
                >
                  <span className={labelClassName}>{displayLabel}</span>
                </button>
              );
            })}
          </div>
        ) : null
      }
    >
      <div className="sidebar sidebar-left">
        {loadedChannelIds.length > 0 ? (
          <div className="channel-controls">
            {loadedChannelIds.map((channelId) => {
              const channelLayers = channelLayersMap.get(channelId) ?? [];
              const selectedLayerKey = channelActiveLayer[channelId] ?? channelLayers[0]?.key ?? null;
              const selectedLayer =
                channelLayers.find((layer) => layer.key === selectedLayerKey) ?? channelLayers[0] ?? null;
              const settings = selectedLayer
                ? layerSettings[selectedLayer.key] ?? getLayerDefaultSettings(selectedLayer.key)
                : createDefaultLayerSettings();
              const sliderDisabled = !selectedLayer || selectedLayer.volumes.length === 0;
              const offsetDisabled = sliderDisabled || channelId !== activeChannelId;
              const firstVolume = selectedLayer?.volumes[0] ?? null;
              const isGrayscale = Boolean(firstVolume && firstVolume.channels === 1);
              const normalizedColor = normalizeHexColor(settings.color, DEFAULT_LAYER_COLOR);
              const displayColor = normalizedColor.toUpperCase();
              const isActive = channelId === activeChannelId;
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
                  {channelLayers.length > 1 ? (
                    <div className="channel-layer-selector" role="radiogroup" aria-label={`${channelNameMap.get(channelId) ?? 'Channel'} volume`}>
                      {channelLayers.map((layer) => {
                        const isSelected = Boolean(selectedLayer && selectedLayer.key === layer.key);
                        const inputId = `channel-${channelId}-layer-${layer.key}`;
                        return (
                          <label key={layer.key} className="channel-layer-option" htmlFor={inputId}>
                            <input
                              type="radio"
                              id={inputId}
                              name={`channel-layer-${channelId}`}
                              checked={isSelected}
                              onChange={() => onChannelLayerSelect(channelId, layer.key)}
                            />
                            <span>{layer.label}</span>
                          </label>
                        );
                      })}
                    </div>
                  ) : channelLayers.length === 0 ? (
                    <p className="channel-empty-hint">No volume available for this channel.</p>
                  ) : null}
                  {selectedLayer ? (
                    <>
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
                        volume={firstVolume}
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
                      {isGrayscale ? (
                        <div className="color-control">
                          <div className="color-control-header">
                            <span id={`layer-color-label-${selectedLayer.key}`}>Tint color</span>
                            <span>{displayColor}</span>
                          </div>
                          <div className="color-swatches" role="radiogroup" aria-labelledby={`layer-color-label-${selectedLayer.key}`}>
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
