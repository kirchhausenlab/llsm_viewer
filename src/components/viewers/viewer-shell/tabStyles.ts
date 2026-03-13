import type { CSSProperties } from 'react';

import { applyAlphaToHex } from '../../../shared/utils/appHelpers';

export type ViewerTabStyle = CSSProperties & Record<string, string>;

const RAINBOW_TAB_BACKGROUND =
  'linear-gradient(120deg, rgba(255, 101, 101, 0.24) 0%, rgba(255, 191, 73, 0.22) 24%, rgba(93, 215, 140, 0.22) 49%, rgba(101, 166, 255, 0.24) 74%, rgba(199, 123, 255, 0.28) 100%)';
const RAINBOW_TAB_BACKGROUND_ACTIVE =
  'linear-gradient(120deg, rgba(255, 118, 118, 0.34) 0%, rgba(255, 202, 95, 0.32) 24%, rgba(108, 227, 154, 0.32) 49%, rgba(118, 179, 255, 0.34) 74%, rgba(209, 135, 255, 0.38) 100%)';

export function buildTintedTabStyle(tintColor: string, isLightTint: boolean): ViewerTabStyle {
  return {
    '--channel-tab-background': applyAlphaToHex(tintColor, 0.18),
    '--channel-tab-background-active': applyAlphaToHex(tintColor, 0.35),
    '--channel-tab-border': 'rgba(255, 255, 255, 0.15)',
    '--channel-tab-border-active': applyAlphaToHex(tintColor, 0.55),
    '--channel-tab-highlight': applyAlphaToHex(tintColor, 0.82),
    '--channel-tab-contrast-outline': isLightTint ? 'var(--panel-border-strong)' : 'transparent'
  };
}

export function buildRainbowTabStyle(): ViewerTabStyle {
  return {
    '--channel-tab-background': RAINBOW_TAB_BACKGROUND,
    '--channel-tab-background-active': RAINBOW_TAB_BACKGROUND_ACTIVE,
    '--channel-tab-border': 'rgba(255, 255, 255, 0.18)',
    '--channel-tab-border-active': 'rgba(255, 255, 255, 0.28)',
    '--channel-tab-highlight': 'rgba(255, 196, 102, 0.72)',
    '--channel-tab-contrast-outline': 'transparent'
  };
}
