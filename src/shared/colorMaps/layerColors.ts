export type LayerColorOption = {
  label: string;
  value: string;
};

export const DEFAULT_LAYER_COLOR = '#ffffff';

export const GRAYSCALE_COLOR_SWATCHES: LayerColorOption[] = [
  { label: 'White', value: '#ffffff' },
  { label: 'Blue', value: '#3b82f6' },
  { label: 'Green', value: '#22c55e' },
  { label: 'Red', value: '#ef4444' },
  { label: 'Magenta', value: '#d946ef' },
  { label: 'Cyan', value: '#06b6d4' },
  { label: 'Yellow', value: '#facc15' }
];

export function normalizeHexColor(
  input: string | null | undefined,
  fallback: string = DEFAULT_LAYER_COLOR
): string {
  const fallbackHex = /^#[0-9a-fA-F]{6}$/.test(fallback)
    ? fallback.toLowerCase()
    : DEFAULT_LAYER_COLOR;

  if (!input) {
    return fallbackHex;
  }

  const trimmed = input.trim();
  if (trimmed.length === 0) {
    return fallbackHex;
  }

  const prefixed = trimmed.startsWith('#') ? trimmed : `#${trimmed}`;

  if (/^#[0-9a-fA-F]{6}$/.test(prefixed)) {
    return prefixed.toLowerCase();
  }

  if (/^#[0-9a-fA-F]{3}$/.test(prefixed)) {
    const hex = prefixed.slice(1);
    return `#${hex[0]}${hex[0]}${hex[1]}${hex[1]}${hex[2]}${hex[2]}`.toLowerCase();
  }

  return fallbackHex;
}
