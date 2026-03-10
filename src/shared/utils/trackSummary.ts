import type { CompiledTrackSetHeader } from '../../types/tracks';

const computeTrackSummary = (
  summary: CompiledTrackSetHeader | null | undefined
): { totalPoints: number; totalTracks: number } => {
  if (!summary) {
    return { totalPoints: 0, totalTracks: 0 };
  }

  return {
    totalPoints: summary.totalPoints,
    totalTracks: summary.totalTracks
  };
};

export { computeTrackSummary };
