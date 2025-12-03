import { useCallback, useState } from 'react';

import { DEFAULT_FPS } from '../../shared/utils/viewerPlayback';

export type ViewerPlaybackState = {
  selectedIndex: number;
  isPlaying: boolean;
  fps: number;
};

export type ViewerPlaybackActions = {
  setSelectedIndex: React.Dispatch<React.SetStateAction<number>>;
  togglePlayback: () => void;
  setFps: React.Dispatch<React.SetStateAction<number>>;
  stopPlayback: () => void;
  setIsPlaying: React.Dispatch<React.SetStateAction<boolean>>;
};

export type ViewerPlaybackHook = ViewerPlaybackState & ViewerPlaybackActions;

export function useViewerPlayback(initialIndex = 0, initialFps = DEFAULT_FPS): ViewerPlaybackHook {
  const [selectedIndex, setSelectedIndex] = useState(initialIndex);
  const [isPlaying, setIsPlaying] = useState(false);
  const [fps, setFps] = useState(initialFps);

  const togglePlayback = useCallback(() => {
    setIsPlaying((value) => !value);
  }, []);

  const stopPlayback = useCallback(() => {
    setIsPlaying(false);
  }, []);

  return {
    selectedIndex,
    isPlaying,
    fps,
    setSelectedIndex,
    togglePlayback,
    setFps,
    stopPlayback,
    setIsPlaying
  };
}
