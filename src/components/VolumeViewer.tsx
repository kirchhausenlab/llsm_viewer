import { useEffect, useMemo, useRef, useState } from 'react';
import type { VolumePayload } from '../api';
import './VolumeViewer.css';

type VolumeViewerProps = {
  volume: VolumePayload | null;
  filename: string | null;
  timeIndex: number;
  totalTimepoints: number;
  isLoading: boolean;
};

type SliceInfo = {
  min: number;
  max: number;
};

function normalizeValue(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) {
    return 0;
  }
  if (max <= min) {
    return 0;
  }
  return (value - min) / (max - min);
}

function VolumeViewer({ volume, filename, isLoading, timeIndex, totalTimepoints }: VolumeViewerProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [sliceInfo, setSliceInfo] = useState<SliceInfo | null>(null);

  const title = useMemo(() => {
    if (!filename) {
      return 'No dataset selected';
    }
    return `${filename}`;
  }, [filename]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!volume || !canvas) {
      if (canvas) {
        const context = canvas.getContext('2d');
        context?.clearRect(0, 0, canvas.width, canvas.height);
      }
      setSliceInfo(null);
      return;
    }

    const width = volume.width;
    const height = volume.height;
    const depth = volume.depth;
    const channels = volume.channels;
    const sliceIndex = Math.floor(depth / 2);

    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext('2d');
    if (!context) {
      return;
    }

    const floatData = new Float32Array(volume.data);
    const sliceLength = width * height * channels;
    const offset = sliceIndex * sliceLength;

    let minValue = Number.POSITIVE_INFINITY;
    let maxValue = Number.NEGATIVE_INFINITY;

    const imageData = context.createImageData(width, height);
    const output = imageData.data;

    if (channels === 1) {
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const voxelIndex = offset + (y * width + x);
          const value = floatData[voxelIndex];
          if (value < minValue) minValue = value;
          if (value > maxValue) maxValue = value;
        }
      }

      const rangeMin = minValue;
      const rangeMax = maxValue;

      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const voxelIndex = offset + (y * width + x);
          const normalized = normalizeValue(floatData[voxelIndex], rangeMin, rangeMax);
          const byteValue = Math.max(0, Math.min(255, Math.round(normalized * 255)));
          const pixelIndex = (y * width + x) * 4;
          output[pixelIndex + 0] = byteValue;
          output[pixelIndex + 1] = byteValue;
          output[pixelIndex + 2] = byteValue;
          output[pixelIndex + 3] = 255;
        }
      }

      setSliceInfo({ min: rangeMin, max: rangeMax });
    } else if (channels === 3) {
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const baseIndex = offset + (y * width + x) * channels;
          const r = floatData[baseIndex + 0];
          const g = floatData[baseIndex + 1];
          const b = floatData[baseIndex + 2];
          minValue = Math.min(minValue, r, g, b);
          maxValue = Math.max(maxValue, r, g, b);
        }
      }

      const rangeMin = minValue;
      const rangeMax = maxValue;

      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const baseIndex = offset + (y * width + x) * channels;
          const pixelIndex = (y * width + x) * 4;
          output[pixelIndex + 0] = Math.round(
            normalizeValue(floatData[baseIndex + 0], rangeMin, rangeMax) * 255
          );
          output[pixelIndex + 1] = Math.round(
            normalizeValue(floatData[baseIndex + 1], rangeMin, rangeMax) * 255
          );
          output[pixelIndex + 2] = Math.round(
            normalizeValue(floatData[baseIndex + 2], rangeMin, rangeMax) * 255
          );
          output[pixelIndex + 3] = 255;
        }
      }

      setSliceInfo({ min: rangeMin, max: rangeMax });
    } else {
      output.fill(0);
      setSliceInfo(null);
    }

    context.putImageData(imageData, 0, 0);
  }, [volume]);

  return (
    <div className="volume-viewer">
      <header>
        <div>
          <h2>{title}</h2>
          {volume ? (
            <p>
              {volume.width} × {volume.height} × {volume.depth} · {volume.channels} channel{volume.channels > 1 ? 's' : ''}
            </p>
          ) : (
            <p>Select a dataset to preview its central slice.</p>
          )}
        </div>
        <div className="time-info">
          <span>Frame {totalTimepoints === 0 ? 0 : timeIndex + 1}</span>
          <span>/</span>
          <span>{totalTimepoints}</span>
        </div>
      </header>

      <section className="viewer-surface">
        {isLoading && <div className="overlay">Loading…</div>}
        <canvas ref={canvasRef} />
      </section>

      {sliceInfo && (
        <footer>
          <span>Slice normalization: {sliceInfo.min.toFixed(3)} – {sliceInfo.max.toFixed(3)}</span>
        </footer>
      )}
    </div>
  );
}

export default VolumeViewer;
