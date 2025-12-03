export function clamp(value: number, min: number, max: number) {
  if (value < min) {
    return min;
  }
  if (value > max) {
    return max;
  }
  return value;
}

export function getColorComponents(color: string) {
  const hex = color.startsWith('#') ? color.slice(1) : color;
  const normalized =
    hex.length === 3
      ? hex
          .split('')
          .map((char) => char + char)
          .join('')
      : hex;
  const safeHex = normalized.padEnd(6, 'f').slice(0, 6);
  const red = parseInt(safeHex.slice(0, 2), 16) / 255;
  const green = parseInt(safeHex.slice(2, 4), 16) / 255;
  const blue = parseInt(safeHex.slice(4, 6), 16) / 255;
  return { r: red, g: green, b: blue };
}

export function mixWithWhite(color: { r: number; g: number; b: number }, intensity: number) {
  const amount = clamp(intensity, 0, 1);
  return {
    r: clamp(color.r + (1 - color.r) * amount, 0, 1),
    g: clamp(color.g + (1 - color.g) * amount, 0, 1),
    b: clamp(color.b + (1 - color.b) * amount, 0, 1)
  };
}

export function componentsToCss({ r, g, b }: { r: number; g: number; b: number }) {
  const red = Math.round(clamp(r, 0, 1) * 255);
  const green = Math.round(clamp(g, 0, 1) * 255);
  const blue = Math.round(clamp(b, 0, 1) * 255);
  return `rgb(${red}, ${green}, ${blue})`;
}
