import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { ViewerProp, ViewerPropVolumeDimensions } from '../../../../types/viewerProps';

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

const clampPositive = (value: number, fallback: number) =>
  Number.isFinite(value) && value > 0 ? value : fallback;

function buildViewerProp(
  id: string,
  labelNumber: number,
  index: number,
  volumeDimensions: ViewerPropVolumeDimensions
): ViewerProp {
  const width = clampPositive(volumeDimensions.width, 1);
  const height = clampPositive(volumeDimensions.height, 1);
  const depth = clampPositive(volumeDimensions.depth, 1);
  const centerX = width / 2 - 0.5;
  const centerY = height / 2 - 0.5;
  const centerZ = depth / 2 - 0.5;
  const name = `Prop #${labelNumber}`;
  const text = 'Add text here';

  return {
    id,
    name,
    type: 'text',
    dimension: '2d',
    visible: true,
    color: '#ffffff',
    text,
    screen: {
      x: 0.5,
      y: 0.5,
      rotation: 0,
      fontSize: 30,
      flipX: false,
      flipY: false,
    },
    world: {
      x: centerX + index * Math.max(2, width * 0.03),
      y: centerY + index * Math.max(2, height * 0.03),
      z: centerZ,
      roll: 0,
      pitch: 0,
      yaw: 0,
      fontSize: Math.max(6, height * 0.08),
      flipX: false,
      flipY: true,
      flipZ: false,
      facingMode: 'fixed',
      occlusionMode: 'always-on-top',
      unitMode: 'voxel',
    },
  };
}

export type UseViewerPropsStateOptions = {
  volumeDimensions: ViewerPropVolumeDimensions;
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
  setAllVisible: (visible: boolean) => void;
  clearProps: () => void;
  deleteProp: (propId: string) => void;
};

export function useViewerPropsState({
  volumeDimensions,
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

  const createProp = useCallback(() => {
    const index = propsRef.current.length;
    const id = `viewer-prop-${nextIdRef.current}`;
    const labelNumber = nextLabelNumberRef.current;
    nextIdRef.current += 1;
    nextLabelNumberRef.current += 1;
    const nextProp = buildViewerProp(id, labelNumber, index, volumeDimensions);
    setProps((current) => [...current, nextProp]);
    selectedPropIdRef.current = id;
    setSelectedPropId(id);
  }, [volumeDimensions]);

  const selectProp = useCallback((propId: string) => {
    if (!propsRef.current.some((entry) => entry.id === propId)) {
      return;
    }
    selectedPropIdRef.current = propId;
    setSelectedPropId(propId);
  }, []);

  const updateProp = useCallback((propId: string, updater: (current: ViewerProp) => ViewerProp) => {
    setProps((current) =>
      current.map((entry) => (entry.id === propId ? updater(entry) : entry))
    );
  }, []);

  const updateSelectedProp = useCallback(
    (updater: (current: ViewerProp) => ViewerProp) => {
      const activeId = selectedPropIdRef.current;
      if (!activeId) {
        return;
      }
      setProps((current) =>
        current.map((entry) => (entry.id === activeId ? updater(entry) : entry))
      );
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

  const setAllVisible = useCallback((visible: boolean) => {
    setProps((current) =>
      current.map((entry) => (entry.visible === visible ? entry : { ...entry, visible }))
    );
  }, []);

  const clearProps = useCallback(() => {
    setProps([]);
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
    setAllVisible,
    clearProps,
    deleteProp,
  };
}
