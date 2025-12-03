const computeTrackSummary = (entries: string[][]): { totalRows: number; uniqueTracks: number } => {
  if (entries.length === 0) {
    return { totalRows: 0, uniqueTracks: 0 };
  }
  const identifiers = new Set<string>();
  for (const row of entries) {
    if (row.length === 0) {
      continue;
    }
    identifiers.add(row[0] ?? '');
  }
  return {
    totalRows: entries.length,
    uniqueTracks: identifiers.size
  };
};

export { computeTrackSummary };
