export type LayerColorOption = {
  label: string;
  value: string;
};

export const DEFAULT_LAYER_COLOR = '#ffffff';

export const GRAYSCALE_COLOR_SWATCHES: LayerColorOption[] = [
  { label: 'White', value: '#ffffff' },
  { label: 'Warm red', value: '#f87171' },
  { label: 'Amber', value: '#facc15' },
  { label: 'Lime', value: '#84cc16' },
  { label: 'Emerald', value: '#10b981' },
  { label: 'Teal', value: '#14b8a6' },
  { label: 'Sky', value: '#38bdf8' },
  { label: 'Indigo', value: '#6366f1' },
  { label: 'Violet', value: '#a855f7' },
  { label: 'Magenta', value: '#f472b6' }
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
