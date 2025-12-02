import type { TrackDefinition, TrackPoint } from '../types/tracks';

/**
 * Applies a Gaussian smoothing kernel to a track's points. Non-finite point values are ignored so
 * isolated `NaN` or `Infinity` entries do not contaminate neighboring samples. If the sigma value is
 * not positive or the input is empty, the original array is returned unchanged.
 */
export const smoothTrackPoints = (points: TrackPoint[], sigma: number): TrackPoint[] => {
  if (!Number.isFinite(sigma) || sigma <= 0 || points.length === 0) {
    return points;
  }

  const radius = Math.max(1, Math.ceil(sigma * 3));
  const varianceFactor = 2 * sigma * sigma;
  const weights: number[] = [];

  for (let offset = -radius; offset <= radius; offset++) {
    const weight = Math.exp(-(offset * offset) / varianceFactor);
    weights.push(weight);
  }

  return points.map((point, index) => {
    let weightedSumX = 0;
    let weightedSumY = 0;
    let weightedSumZ = 0;
    let weightedAmplitude = 0;
    let weightTotal = 0;

    for (let offset = -radius; offset <= radius; offset++) {
      const neighborIndex = index + offset;
      if (neighborIndex < 0 || neighborIndex >= points.length) {
        continue;
      }

      const neighbor = points[neighborIndex];
      if (
        !Number.isFinite(neighbor.x) ||
        !Number.isFinite(neighbor.y) ||
        !Number.isFinite(neighbor.z) ||
        !Number.isFinite(neighbor.amplitude)
      ) {
        continue;
      }

      const weight = weights[offset + radius];
      weightTotal += weight;
      weightedSumX += neighbor.x * weight;
      weightedSumY += neighbor.y * weight;
      weightedSumZ += neighbor.z * weight;
      weightedAmplitude += neighbor.amplitude * weight;
    }

    if (weightTotal === 0) {
      return point;
    }

    return {
      time: point.time,
      x: weightedSumX / weightTotal,
      y: weightedSumY / weightTotal,
      z: weightedSumZ / weightTotal,
      amplitude: weightedAmplitude / weightTotal
    };
  });
};

/**
 * Smooths the amplitude channel for a collection of tracks while preserving all other metadata on
 * each point. Invalid sigma values short-circuit and return the original reference so callers can
 * avoid unnecessary allocations.
 */
export const applyGaussianAmplitudeSmoothing = (tracks: TrackDefinition[], sigma: number) => {
  if (!Number.isFinite(sigma) || sigma <= 0) {
    return tracks;
  }

  return tracks.map((track) => {
    const smoothedPoints = smoothTrackPoints(track.points, sigma);
    return {
      ...track,
      points: smoothedPoints.map((point, index) => ({
        ...track.points[index],
        amplitude: point.amplitude
      }))
    };
  });
};
