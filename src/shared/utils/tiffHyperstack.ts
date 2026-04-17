export type ImagejHyperstackLayout = {
  channels: number;
  slices: number;
  frames: number;
  images: number;
};

function parsePositiveInt(value: string | undefined): number | null {
  if (!value) {
    return null;
  }
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }
  return parsed;
}

export function parseImagejHyperstackLayout(imageDescription: unknown): ImagejHyperstackLayout | null {
  if (typeof imageDescription !== 'string' || imageDescription.length === 0) {
    return null;
  }

  const entries = new Map<string, string>();
  const cleaned = imageDescription.replace(/\0+$/g, '');
  for (const line of cleaned.split(/\r?\n/)) {
    const separatorIndex = line.indexOf('=');
    if (separatorIndex <= 0) {
      continue;
    }
    const key = line.slice(0, separatorIndex).trim().toLowerCase();
    const value = line.slice(separatorIndex + 1).trim();
    if (!key || !value) {
      continue;
    }
    entries.set(key, value);
  }

  if (!entries.has('imagej') || entries.get('hyperstack') !== 'true') {
    return null;
  }

  const channels = parsePositiveInt(entries.get('channels'));
  const slices = parsePositiveInt(entries.get('slices'));
  const frames = parsePositiveInt(entries.get('frames')) ?? 1;
  const images = parsePositiveInt(entries.get('images'));

  if (!channels || !slices || !images) {
    return null;
  }
  if (channels * slices * frames !== images) {
    return null;
  }

  return {
    channels,
    slices,
    frames,
    images
  };
}

export function resolveImagejPageChannelLayout({
  samplesPerPixel,
  imageCount,
  imageDescription
}: {
  samplesPerPixel: number;
  imageCount: number;
  imageDescription: unknown;
}): ImagejHyperstackLayout | null {
  if (!Number.isFinite(samplesPerPixel) || samplesPerPixel !== 1) {
    return null;
  }
  const layout = parseImagejHyperstackLayout(imageDescription);
  if (!layout) {
    return null;
  }
  if (layout.images !== imageCount || layout.channels <= 1 || layout.frames !== 1) {
    return null;
  }
  return layout;
}
