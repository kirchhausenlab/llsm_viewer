import type { PreprocessedTracksDescriptor } from './types';

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

export function createTracksDescriptor(path: string): PreprocessedTracksDescriptor {
  return { path, format: 'csv', columns: 8, decimalPlaces: 3 };
}

function trimTrailingZeros(value: string): string {
  const trimmed = value.replace(/(?:\.0+|(\.\d+?)0+)$/, '$1');
  if (trimmed === '-0') {
    return '0';
  }
  return trimmed;
}

function capDecimalStringToPlaces(raw: string, places: number): string {
  const value = raw.trim();
  const match = /^-?\d+\.(\d+)$/.exec(value);
  if (!match) {
    return value;
  }
  const fractional = match[1] ?? '';
  if (fractional.length <= places) {
    return value;
  }
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return value;
  }
  return trimTrailingZeros(numeric.toFixed(places));
}

export function serializeTrackEntriesToCsvBytes(
  entries: string[][],
  options?: { decimalPlaces?: number }
): Uint8Array {
  const decimalPlaces = options?.decimalPlaces ?? 3;
  if (!Number.isFinite(decimalPlaces) || decimalPlaces < 0) {
    throw new Error(`Invalid decimal place cap: ${String(decimalPlaces)}`);
  }

  const lines: string[] = [];
  for (const row of entries) {
    if (row.length === 0) {
      continue;
    }
    if (row.length !== 8) {
      throw new Error('Track CSV rows must contain exactly 8 columns.');
    }
    const capped = row.map((value) => capDecimalStringToPlaces(value, decimalPlaces));
    lines.push(capped.join(','));
  }
  const csv = `${lines.join('\n')}${lines.length > 0 ? '\n' : ''}`;
  return textEncoder.encode(csv);
}

export function parseTrackEntriesFromCsvBytes(bytes: Uint8Array): string[][] {
  const contents = textDecoder.decode(bytes);
  const lines = contents.split(/\r?\n/);
  const rows: string[][] = [];

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      continue;
    }
    const columns = line.split(',');
    if (columns.length !== 8) {
      throw new Error('Track CSV payload must contain exactly 8 comma-separated columns per row.');
    }
    rows.push(columns.map((value) => value.trim()));
  }

  return rows;
}

