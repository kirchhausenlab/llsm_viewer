const MAX_COMPACT_CHANNEL_LABEL_LENGTH = 9;
const COMPACT_CHANNEL_LABEL_PREFIX_LENGTH = 6;

export function formatCompactChannelLabel(label: string): string {
  const trimmedLabel = label.trim();
  if (trimmedLabel.length <= MAX_COMPACT_CHANNEL_LABEL_LENGTH) {
    return trimmedLabel;
  }
  return `${trimmedLabel.slice(0, COMPACT_CHANNEL_LABEL_PREFIX_LENGTH)}...`;
}
