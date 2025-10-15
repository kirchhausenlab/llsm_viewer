import { normalizeHexColor } from './layerColors';

export type TrackColorOption = {
  value: string;
  label: string;
};

export const TRACK_COLOR_SWATCHES: TrackColorOption[] = [
  { value: '#FF6B6B', label: 'Red' },
  { value: '#FF9F40', label: 'Orange' },
  { value: '#FFD93D', label: 'Yellow' },
  { value: '#6BCB77', label: 'Green' },
  { value: '#4D96FF', label: 'Blue' },
  { value: '#8E94F2', label: 'Indigo' },
  { value: '#FF6BF1', label: 'Magenta' }
];

export const DEFAULT_TRACK_COLOR = TRACK_COLOR_SWATCHES[0].value;

export function normalizeTrackColorHex(color: string): string {
  return normalizeHexColor(color, DEFAULT_TRACK_COLOR).toUpperCase();
}
