import { useCallback, useEffect, useRef, useState } from 'react';

import type { ChannelSource } from '../../hooks/useChannelSources';

export type ChannelRemovalContext = {
  removedChannelId: string;
  previousChannels: ChannelSource[];
  nextChannels: ChannelSource[];
};

type UseChannelEditingParams = {
  channels: ChannelSource[];
  isLaunchingViewer: boolean;
};

export function useChannelEditing({ channels, isLaunchingViewer }: UseChannelEditingParams) {
  const [editingChannelId, setEditingChannelId] = useState<string | null>(null);
  const [activeChannelId, setActiveChannelId] = useState<string | null>(null);
  const editingChannelOriginalNameRef = useRef('');
  const editingChannelInputRef = useRef<HTMLInputElement | null>(null);
  const pendingChannelFocusIdRef = useRef<string | null>(null);

  const resetChannelEditingState = useCallback(() => {
    setActiveChannelId(null);
    setEditingChannelId(null);
    pendingChannelFocusIdRef.current = null;
  }, []);

  const startEditingChannel = useCallback((channelId: string, originalName: string) => {
    editingChannelOriginalNameRef.current = originalName;
    setActiveChannelId(channelId);
    setEditingChannelId(channelId);
  }, []);

  const queuePendingChannelFocus = useCallback((channelId: string, originalName: string) => {
    pendingChannelFocusIdRef.current = channelId;
    editingChannelOriginalNameRef.current = originalName;
  }, []);

  const handleChannelRemoved = useCallback(
    ({ removedChannelId, previousChannels, nextChannels }: ChannelRemovalContext) => {
      setActiveChannelId((previousActiveId) => {
        if (nextChannels.length === 0) {
          return null;
        }

        if (previousActiveId && nextChannels.some((channel) => channel.id === previousActiveId)) {
          return previousActiveId;
        }

        const removedIndex = previousChannels.findIndex((channel) => channel.id === removedChannelId);
        if (removedIndex <= 0) {
          return nextChannels[0].id;
        }

        const fallbackIndex = Math.min(removedIndex - 1, nextChannels.length - 1);
        return nextChannels[fallbackIndex]?.id ?? nextChannels[0].id;
      });

      if (editingChannelId === removedChannelId) {
        setEditingChannelId(null);
      }
    },
    [editingChannelId]
  );

  useEffect(() => {
    if (editingChannelId && editingChannelId !== activeChannelId) {
      setEditingChannelId(null);
    }
  }, [activeChannelId, editingChannelId]);

  useEffect(() => {
    if (channels.length === 0) {
      if (activeChannelId !== null) {
        setActiveChannelId(null);
      }
      return;
    }

    if (!activeChannelId || !channels.some((channel) => channel.id === activeChannelId)) {
      setActiveChannelId(channels[0].id);
    }
  }, [activeChannelId, channels]);

  useEffect(() => {
    const pendingChannelId = pendingChannelFocusIdRef.current;
    if (!pendingChannelId) {
      return;
    }

    const pendingChannel = channels.find((channel) => channel.id === pendingChannelId);
    if (!pendingChannel) {
      pendingChannelFocusIdRef.current = null;
      return;
    }

    pendingChannelFocusIdRef.current = null;
    startEditingChannel(pendingChannelId, pendingChannel.name);
  }, [channels, startEditingChannel]);

  useEffect(() => {
    if (editingChannelId && !channels.some((channel) => channel.id === editingChannelId)) {
      setEditingChannelId(null);
    }
  }, [channels, editingChannelId]);

  useEffect(() => {
    if (isLaunchingViewer) {
      setEditingChannelId(null);
    }
  }, [isLaunchingViewer]);

  useEffect(() => {
    if (editingChannelId) {
      editingChannelInputRef.current?.focus();
      editingChannelInputRef.current?.select();
    }
  }, [editingChannelId]);

  return {
    activeChannelId,
    editingChannelId,
    editingChannelInputRef,
    editingChannelOriginalNameRef,
    setActiveChannelId,
    setEditingChannelId,
    startEditingChannel,
    queuePendingChannelFocus,
    handleChannelRemoved,
    resetChannelEditingState
  };
}

export default useChannelEditing;
