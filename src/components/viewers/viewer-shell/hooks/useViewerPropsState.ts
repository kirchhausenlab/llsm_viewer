import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { ViewerProp, ViewerPropVolumeDimensions } from '../../../../types/viewerProps';
import type { VoxelResolutionValues } from '../../../../types/voxelResolution';
import {
  buildViewerProp,
  normalizeViewerPropTimeRange,
  resolveViewerPropWorldAxisRange,
} from '../viewerPropDefaults';

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
const clampNumber = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

export type UseViewerPropsStateOptions = {
  volumeDimensions: ViewerPropVolumeDimensions;
  totalTimepoints: number;
  voxelResolution?: VoxelResolutionValues | null;
};

export type UseViewerPropsStateResult = {
  props: ViewerProp[];
  selectedPropId: string | null;
  selectedProp: ViewerProp | null;
  createProp: () => void;
  selectProp: (propId: string) => void;
  updateProp: (propId: string, updater: (current: ViewerProp) => ViewerProp) => void;
  updateSelectedProp: (updater: (current: ViewerProp) => ViewerProp) => void;
  updateScreenPosition: (propId: string, nextPosition: { x: number; y: number }) => void;
  updateWorldPosition: (propId: string, nextPosition: { x: number; y: number }) => void;
  setAllVisible: (visible: boolean) => void;
  clearProps: () => void;
  deleteProp: (propId: string) => void;
};

export function useViewerPropsState({
  volumeDimensions,
  totalTimepoints,
  voxelResolution,
}: UseViewerPropsStateOptions): UseViewerPropsStateResult {
  const [props, setProps] = useState<ViewerProp[]>([]);
  const [selectedPropId, setSelectedPropId] = useState<string | null>(null);
  const nextIdRef = useRef(1);
  const nextLabelNumberRef = useRef(1);
  const propsRef = useRef<ViewerProp[]>(props);
  const selectedPropIdRef = useRef<string | null>(selectedPropId);

  useEffect(() => {
    propsRef.current = props;
  }, [props]);

  useEffect(() => {
    selectedPropIdRef.current = selectedPropId;
  }, [selectedPropId]);

  useEffect(() => {
    const current = propsRef.current;
    if (current.length === 0) {
      return;
    }

    let changed = false;
    const next = current.map((entry) => {
      const normalizedRange = normalizeViewerPropTimeRange(
        entry.initialTimepoint,
        entry.finalTimepoint,
        totalTimepoints
      );
      if (
        normalizedRange.initialTimepoint === entry.initialTimepoint &&
        normalizedRange.finalTimepoint === entry.finalTimepoint
      ) {
        return entry;
      }
      changed = true;
      return {
        ...entry,
        ...normalizedRange,
      };
    });

    if (!changed) {
      return;
    }

    propsRef.current = next;
    setProps(next);
  }, [totalTimepoints]);

  const createProp = useCallback(() => {
    const index = propsRef.current.length;
    const id = `viewer-prop-${nextIdRef.current}`;
    const labelNumber = nextLabelNumberRef.current;
    nextIdRef.current += 1;
    nextLabelNumberRef.current += 1;
    const nextProp = buildViewerProp(
      id,
      labelNumber,
      index,
      volumeDimensions,
      totalTimepoints,
      voxelResolution ?? null
    );
    const next = [...propsRef.current, nextProp];
    propsRef.current = next;
    setProps(next);
    selectedPropIdRef.current = id;
    setSelectedPropId(id);
  }, [totalTimepoints, volumeDimensions, voxelResolution]);

  const selectProp = useCallback((propId: string) => {
    if (!propsRef.current.some((entry) => entry.id === propId)) {
      return;
    }
    selectedPropIdRef.current = propId;
    setSelectedPropId(propId);
  }, []);

  const updateProp = useCallback((propId: string, updater: (current: ViewerProp) => ViewerProp) => {
    const next = propsRef.current.map((entry) => (entry.id === propId ? updater(entry) : entry));
    propsRef.current = next;
    setProps(next);
  }, []);

  const updateSelectedProp = useCallback(
    (updater: (current: ViewerProp) => ViewerProp) => {
      const activeId = selectedPropIdRef.current;
      if (!activeId) {
        return;
      }
      const next = propsRef.current.map((entry) => (entry.id === activeId ? updater(entry) : entry));
      propsRef.current = next;
      setProps(next);
    },
    []
  );

  const updateScreenPosition = useCallback(
    (propId: string, nextPosition: { x: number; y: number }) => {
      updateProp(propId, (current) => ({
        ...current,
        screen: {
          ...current.screen,
          x: clamp01(nextPosition.x),
          y: clamp01(nextPosition.y),
        },
      }));
    },
    [updateProp]
  );

  const updateWorldPosition = useCallback(
    (propId: string, nextPosition: { x: number; y: number }) => {
      const xRange = resolveViewerPropWorldAxisRange(volumeDimensions, 'x');
      const yRange = resolveViewerPropWorldAxisRange(volumeDimensions, 'y');
      updateProp(propId, (current) => ({
        ...current,
        world: {
          ...current.world,
          x: clampNumber(nextPosition.x, xRange.min, xRange.max),
          y: clampNumber(nextPosition.y, yRange.min, yRange.max),
        },
      }));
    },
    [updateProp, volumeDimensions]
  );

  const setAllVisible = useCallback((visible: boolean) => {
    const next = propsRef.current.map((entry) =>
      entry.visible === visible ? entry : { ...entry, visible }
    );
    propsRef.current = next;
    setProps(next);
  }, []);

  const clearProps = useCallback(() => {
    propsRef.current = [];
    setProps([]);
    nextIdRef.current = 1;
    nextLabelNumberRef.current = 1;
    selectedPropIdRef.current = null;
    setSelectedPropId(null);
  }, []);

  const deleteProp = useCallback((propId: string) => {
    const current = propsRef.current;
    const index = current.findIndex((entry) => entry.id === propId);
    if (index < 0) {
      return;
    }
    const next = current.filter((entry) => entry.id !== propId);
    propsRef.current = next;
    setProps(next);

    if (selectedPropIdRef.current !== propId) {
      if (selectedPropIdRef.current && next.some((entry) => entry.id === selectedPropIdRef.current)) {
        return;
      }
      selectedPropIdRef.current = next[0]?.id ?? null;
      setSelectedPropId(next[0]?.id ?? null);
      return;
    }

    const fallback = next[index] ?? next[index - 1] ?? null;
    selectedPropIdRef.current = fallback?.id ?? null;
    setSelectedPropId(fallback?.id ?? null);
  }, []);

  const selectedProp = useMemo(
    () => props.find((entry) => entry.id === selectedPropId) ?? null,
    [props, selectedPropId]
  );

  return {
    props,
    selectedPropId,
    selectedProp,
    createProp,
    selectProp,
    updateProp,
    updateSelectedProp,
    updateScreenPosition,
    updateWorldPosition,
    setAllVisible,
    clearProps,
    deleteProp,
  };
}
