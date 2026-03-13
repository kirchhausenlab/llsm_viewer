const MAX_COMPACT_CHANNEL_LABEL_LENGTH = 11;

export function formatCompactChannelLabel(label: string): string {
  const trimmedLabel = label.trim();
  if (trimmedLabel.length <= MAX_COMPACT_CHANNEL_LABEL_LENGTH) {
    return trimmedLabel;
  }
  return trimmedLabel.slice(0, MAX_COMPACT_CHANNEL_LABEL_LENGTH);
}
