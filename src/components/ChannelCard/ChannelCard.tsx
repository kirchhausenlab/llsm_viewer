import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ChangeEvent, DragEvent, FormEvent } from 'react';
import {
  chooseDropboxFiles,
  DropboxConfigurationError,
  getDropboxAppKeyInfo,
  setDropboxAppKey,
  type DropboxAppKeySource
} from '../../integrations/dropbox';
import { classNames } from '../../utils/classNames';
import type { ChannelSource, ChannelValidation } from '../../types/channelSources';
import styles from './ChannelCard.module.css';

type ChannelCardProps = {
  channel: ChannelSource;
  validation: ChannelValidation;
  isDisabled: boolean;
  onLayerFilesAdded: (id: string, files: File[]) => void;
  onLayerDrop: (id: string, dataTransfer: DataTransfer) => void;
  onLayerSegmentationToggle: (channelId: string, layerId: string, value: boolean) => void;
  onLayerRemove: (channelId: string, layerId: string) => void;
  onTrackFileSelected: (channelId: string, file: File | null) => void;
  onTrackDrop: (channelId: string, dataTransfer: DataTransfer) => void;
  onTrackClear: (channelId: string) => void;
};

export default function ChannelCard({
  channel,
  validation,
  isDisabled,
  onLayerFilesAdded,
  onLayerDrop,
  onLayerSegmentationToggle,
  onLayerRemove,
  onTrackFileSelected,
  onTrackDrop,
  onTrackClear
}: ChannelCardProps) {
  const layerInputRef = useRef<HTMLInputElement | null>(null);
  const trackInputRef = useRef<HTMLInputElement | null>(null);
  const dragCounterRef = useRef(0);
  const trackDragCounterRef = useRef(0);
  const [isLayerDragging, setIsLayerDragging] = useState(false);
  const [isTrackDragging, setIsTrackDragging] = useState(false);
  const [dropboxImportTarget, setDropboxImportTarget] = useState<'layers' | 'tracks' | null>(null);
  const [dropboxError, setDropboxError] = useState<string | null>(null);
  const [dropboxErrorContext, setDropboxErrorContext] = useState<'layers' | 'tracks' | null>(null);
  const [dropboxInfo, setDropboxInfo] = useState<string | null>(null);
  const [isDropboxConfigOpen, setIsDropboxConfigOpen] = useState(false);
  const [dropboxAppKeyInput, setDropboxAppKeyInput] = useState('');
  const [dropboxAppKeySource, setDropboxAppKeySource] = useState<DropboxAppKeySource | null>(null);

  const isDropboxImporting = dropboxImportTarget !== null;
  const primaryLayer = channel.layers[0] ?? null;

  const syncDropboxConfigState = useCallback(() => {
    const info = getDropboxAppKeyInfo();
    setDropboxAppKeyInput(info.appKey ?? '');
    setDropboxAppKeySource(info.source);
  }, []);

  useEffect(() => {
    syncDropboxConfigState();
  }, [syncDropboxConfigState]);

  useEffect(() => {
    if (isDisabled) {
      setIsLayerDragging(false);
      setIsTrackDragging(false);
      setDropboxImportTarget(null);
      setDropboxError(null);
      setDropboxErrorContext(null);
      setDropboxInfo(null);
      setIsDropboxConfigOpen(false);
    }
  }, [isDisabled]);

  const handleDropboxConfigCancel = useCallback(() => {
    setIsDropboxConfigOpen(false);
  }, []);

  const handleDropboxConfigInputChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      setDropboxAppKeyInput(event.target.value);
      if (dropboxInfo) {
        setDropboxInfo(null);
      }
    },
    [dropboxInfo]
  );

  const handleDropboxConfigSubmit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (dropboxAppKeySource === 'env') {
        setIsDropboxConfigOpen(false);
        return;
      }
      const trimmed = dropboxAppKeyInput.trim();
      setDropboxAppKey(trimmed ? trimmed : null);
      syncDropboxConfigState();
      setIsDropboxConfigOpen(false);
      setDropboxError(null);
      setDropboxErrorContext(null);
      setDropboxInfo(
        trimmed
          ? 'Dropbox app key saved. Try importing from Dropbox again.'
          : 'Saved Dropbox app key cleared.'
      );
    },
    [dropboxAppKeyInput, dropboxAppKeySource, syncDropboxConfigState]
  );

  const handleDropboxConfigClear = useCallback(() => {
    setDropboxAppKey(null);
    syncDropboxConfigState();
    setDropboxInfo('Saved Dropbox app key cleared.');
    setDropboxError(null);
    setDropboxErrorContext(null);
  }, [syncDropboxConfigState]);

  const handleLayerBrowse = useCallback(() => {
    if (isDisabled || isDropboxImporting) {
      return;
    }
    layerInputRef.current?.click();
  }, [isDisabled, isDropboxImporting]);

  const handleLayerInputChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      if (isDisabled || isDropboxImporting) {
        event.target.value = '';
        return;
      }
      const fileList = event.target.files;
      if (fileList && fileList.length > 0) {
        onLayerFilesAdded(channel.id, Array.from(fileList));
      }
      event.target.value = '';
    },
    [channel.id, isDisabled, isDropboxImporting, onLayerFilesAdded]
  );

  const handleLayerDragEnter = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      if (isDisabled || isDropboxImporting) {
        return;
      }
      dragCounterRef.current += 1;
      setIsLayerDragging(true);
    },
    [isDisabled, isDropboxImporting]
  );

  const handleLayerDragOver = useCallback((event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (isDisabled || isDropboxImporting) {
      event.dataTransfer.dropEffect = 'none';
      return;
    }
    event.dataTransfer.dropEffect = 'copy';
  }, [isDisabled, isDropboxImporting]);

  const handleLayerDragLeave = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      if (isDisabled || isDropboxImporting) {
        return;
      }
      dragCounterRef.current = Math.max(0, dragCounterRef.current - 1);
      if (dragCounterRef.current === 0) {
        setIsLayerDragging(false);
      }
    },
    [isDisabled, isDropboxImporting]
  );

  const handleLayerDrop = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      dragCounterRef.current = 0;
      setIsLayerDragging(false);
      if (isDisabled || isDropboxImporting) {
        return;
      }
      const { dataTransfer } = event;
      if (!dataTransfer) {
        return;
      }
      onLayerDrop(channel.id, dataTransfer);
    },
    [channel.id, isDisabled, isDropboxImporting, onLayerDrop]
  );

  const handleDropboxImport = useCallback(async () => {
    if (isDisabled || isDropboxImporting) {
      return;
    }
    setDropboxError(null);
    setDropboxErrorContext(null);
    setDropboxInfo(null);
    setDropboxImportTarget('layers');
    try {
      const files = await chooseDropboxFiles({
        extensions: ['.tif', '.tiff'],
        multiselect: true
      });
      if (files.length > 0) {
        onLayerFilesAdded(channel.id, files);
      }
    } catch (error) {
      console.error('Failed to import from Dropbox', error);
      setDropboxErrorContext('layers');
      if (error instanceof DropboxConfigurationError) {
        syncDropboxConfigState();
        setIsDropboxConfigOpen(true);
        setDropboxError(
          'Dropbox is not configured yet. Add your Dropbox app key below to connect your account.'
        );
      } else {
        const message = error instanceof Error ? error.message : 'Failed to import files from Dropbox.';
        setDropboxError(message);
      }
    } finally {
      setDropboxImportTarget(null);
    }
  }, [
    channel.id,
    isDisabled,
    isDropboxImporting,
    onLayerFilesAdded,
    syncDropboxConfigState
  ]);

  const handleTrackDropboxImport = useCallback(async () => {
    if (isDisabled || isDropboxImporting) {
      return;
    }
    setDropboxError(null);
    setDropboxErrorContext(null);
    setDropboxInfo(null);
    setDropboxImportTarget('tracks');
    try {
      const files = await chooseDropboxFiles({
        extensions: ['.csv'],
        multiselect: false
      });
      const [file] = files;
      if (file) {
        onTrackFileSelected(channel.id, file);
      }
    } catch (error) {
      console.error('Failed to import tracks from Dropbox', error);
      setDropboxErrorContext('tracks');
      if (error instanceof DropboxConfigurationError) {
        syncDropboxConfigState();
        setIsDropboxConfigOpen(true);
        setDropboxError(
          'Dropbox is not configured yet. Add your Dropbox app key below to connect your account.'
        );
      } else {
        const message = error instanceof Error ? error.message : 'Failed to import tracks from Dropbox.';
        setDropboxError(message);
      }
    } finally {
      setDropboxImportTarget(null);
    }
  }, [
    channel.id,
    isDisabled,
    isDropboxImporting,
    onTrackFileSelected,
    syncDropboxConfigState
  ]);

  const handleTrackBrowse = useCallback(() => {
    if (isDisabled || isDropboxImporting) {
      return;
    }
    trackInputRef.current?.click();
  }, [isDisabled, isDropboxImporting]);

  const handleTrackInputChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      if (isDisabled || isDropboxImporting) {
        event.target.value = '';
        return;
      }
      const fileList = event.target.files;
      if (fileList && fileList.length > 0) {
        onTrackFileSelected(channel.id, fileList[0] ?? null);
      }
      event.target.value = '';
    },
    [channel.id, isDisabled, isDropboxImporting, onTrackFileSelected]
  );

  const handleTrackDragEnter = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      if (isDisabled || isDropboxImporting) {
        return;
      }
      trackDragCounterRef.current += 1;
      setIsTrackDragging(true);
    },
    [isDisabled, isDropboxImporting]
  );

  const handleTrackDragLeave = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      if (isDisabled || isDropboxImporting) {
        return;
      }
      trackDragCounterRef.current = Math.max(0, trackDragCounterRef.current - 1);
      if (trackDragCounterRef.current === 0) {
        setIsTrackDragging(false);
      }
    },
    [isDisabled, isDropboxImporting]
  );

  const handleTrackDrop = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      trackDragCounterRef.current = 0;
      setIsTrackDragging(false);
      if (isDisabled || isDropboxImporting) {
        return;
      }
      const { dataTransfer } = event;
      if (!dataTransfer) {
        return;
      }
      onTrackDrop(channel.id, dataTransfer);
    },
    [channel.id, isDisabled, isDropboxImporting, onTrackDrop]
  );

  const trackEntryCount = channel.trackEntries.length;
  const uniqueTrackCount = useMemo(() => {
    const identifiers = new Set<string>();
    for (const row of channel.trackEntries) {
      const trackId = row[0];
      if (trackId) {
        identifiers.add(trackId);
      }
    }
    return identifiers.size;
  }, [channel.trackEntries]);

  const loadedTrackSummary = useMemo(() => {
    if (trackEntryCount === 0) {
      return 'Loaded 0 track entries.';
    }
    if (uniqueTrackCount > 0) {
      const trackLabel = uniqueTrackCount === 1 ? '1 track' : `${uniqueTrackCount} tracks`;
      if (uniqueTrackCount === trackEntryCount) {
        return `Loaded ${trackLabel}.`;
      }
      const entryLabel =
        trackEntryCount === 1 ? '1 track entry' : `${trackEntryCount} track entries`;
      return `Loaded ${trackLabel} across ${entryLabel}.`;
    }
    return trackEntryCount === 1
      ? 'Loaded 1 track entry.'
      : `Loaded ${trackEntryCount} track entries.`;
  }, [trackEntryCount, uniqueTrackCount]);

  return (
    <section
      className={classNames(styles.channelCard, isDisabled && styles.isDisabled)}
      aria-disabled={isDisabled}
    >
      <p className={styles.channelLayerDropTitle}>Upload volume (.tif/.tiff sequence)</p>
      <div
        className={classNames(styles.channelLayerDrop, isLayerDragging && styles.isActive)}
        onDragEnter={handleLayerDragEnter}
        onDragOver={handleLayerDragOver}
        onDragLeave={handleLayerDragLeave}
        onDrop={handleLayerDrop}
      >
        <input
          ref={layerInputRef}
          className={styles.fileDropInput}
          type="file"
          accept=".tif,.tiff,.TIF,.TIFF"
          multiple
          onChange={handleLayerInputChange}
          disabled={isDisabled || isDropboxImporting}
        />
        <div className={styles.channelLayerDropContent}>
          <button
            type="button"
            className={styles.channelLayerDropButton}
            onClick={handleLayerBrowse}
            disabled={isDisabled || isDropboxImporting}
          >
            From Files
          </button>
          <button
            type="button"
            className={styles.channelLayerDropButton}
            onClick={handleDropboxImport}
            disabled={isDisabled || isDropboxImporting}
          >
            {dropboxImportTarget === 'layers' ? 'Importing…' : 'From Dropbox'}
          </button>
          <p className={styles.channelLayerDropSubtitle}>Or drop sequence folder here</p>
        </div>
        {dropboxImportTarget === 'layers' ? (
          <p className={styles.channelLayerDropStatus}>Importing from Dropbox…</p>
        ) : null}
        {dropboxInfo ? <p className={styles.channelLayerDropInfo}>{dropboxInfo}</p> : null}
        {dropboxError && dropboxErrorContext === 'layers' ? (
          <p className={styles.channelLayerDropError}>{dropboxError}</p>
        ) : null}
        {isDropboxConfigOpen ? (
          <form className={styles.channelDropboxConfig} onSubmit={handleDropboxConfigSubmit} noValidate>
            <label className={styles.channelDropboxConfigLabel} htmlFor={`dropbox-app-key-${channel.id}`}>
              Dropbox app key
            </label>
            <input
              id={`dropbox-app-key-${channel.id}`}
              type="text"
              className={styles.channelDropboxConfigInput}
              placeholder="slate-your-app-key"
              value={dropboxAppKeyInput}
              onChange={handleDropboxConfigInputChange}
              disabled={isDisabled || dropboxAppKeySource === 'env'}
              autoComplete="off"
            />
            <p className={styles.channelDropboxConfigHint}>
              Generate an app key in the{' '}
              <a href="https://www.dropbox.com/developers/apps" target="_blank" rel="noreferrer">
                Dropbox App Console
              </a>{' '}
              (Scoped app with Dropbox Chooser enabled) and paste it here.
            </p>
            {dropboxAppKeySource === 'env' ? (
              <p className={styles.channelDropboxConfigNote}>
                This deployment provides a Dropbox app key. Contact your administrator to change it.
              </p>
            ) : null}
            <div className={styles.channelDropboxConfigActions}>
              <button
                type="submit"
                className={styles.channelDropboxConfigSave}
                disabled={isDisabled}
              >
                {dropboxAppKeySource === 'env' ? 'Close' : 'Save app key'}
              </button>
              <button
                type="button"
                className={styles.channelDropboxConfigCancel}
                onClick={handleDropboxConfigCancel}
              >
                Cancel
              </button>
              {dropboxAppKeySource === 'local' ? (
                <button
                  type="button"
                  className={styles.channelDropboxConfigClear}
                  onClick={handleDropboxConfigClear}
                >
                  Remove saved key
                </button>
              ) : null}
            </div>
          </form>
        ) : null}
      </div>
      {primaryLayer ? (
        <ul className={styles.channelLayerList}>
          <li key={primaryLayer.id} className={styles.channelLayerItem}>
            <div className={styles.channelLayerHeader}>
              <span className={styles.channelLayerTitle}>Volume</span>
              <button
                type="button"
                className={styles.channelLayerRemove}
                onClick={() => onLayerRemove(channel.id, primaryLayer.id)}
                aria-label="Remove volume"
                disabled={isDisabled}
              >
                Remove
              </button>
            </div>
            <p className={styles.channelLayerMeta}>
              {primaryLayer.files.length === 1 ? '1 file' : `${primaryLayer.files.length} files`}
            </p>
            <label className={styles.channelLayerFlag}>
              <input
                type="checkbox"
                checked={primaryLayer.isSegmentation}
                onChange={(event) =>
                  onLayerSegmentationToggle(channel.id, primaryLayer.id, event.target.checked)
                }
                disabled={isDisabled}
              />
              <span>Segmentation volume</span>
            </label>
          </li>
        </ul>
      ) : null}
      <p className={styles.channelTracksTitle}>Upload tracks (optional, .csv file)</p>
      <div
        className={classNames(styles.channelTracksDrop, isTrackDragging && styles.isActive)}
        onDragEnter={handleTrackDragEnter}
        onDragLeave={handleTrackDragLeave}
        onDragOver={handleLayerDragOver}
        onDrop={handleTrackDrop}
      >
        <input
          ref={trackInputRef}
          className={styles.fileDropInput}
          type="file"
          accept=".csv"
          onChange={handleTrackInputChange}
          disabled={isDisabled || isDropboxImporting}
        />
        <div className={styles.channelTracksContent}>
          <div className={styles.channelTracksRow}>
            <div className={styles.channelTracksDescription}>
              <button
                type="button"
                className={styles.channelTracksButton}
                onClick={handleTrackBrowse}
                disabled={isDisabled || isDropboxImporting}
              >
                From Files
              </button>
              <button
                type="button"
                className={styles.channelTracksButton}
                onClick={handleTrackDropboxImport}
                disabled={isDisabled || isDropboxImporting}
              >
                {dropboxImportTarget === 'tracks' ? 'Importing…' : 'From Dropbox'}
              </button>
              <p className={styles.channelTracksSubtitle}>Or drop the tracks file here</p>
            </div>
            {channel.trackFile ? (
              <button
                type="button"
                onClick={() => onTrackClear(channel.id)}
                className={styles.channelTrackClear}
                disabled={isDisabled || isDropboxImporting}
              >
                Clear
              </button>
            ) : null}
          </div>
          {dropboxImportTarget === 'tracks' ? (
            <p className={styles.channelTracksStatus}>Importing from Dropbox…</p>
          ) : null}
          {dropboxError && dropboxErrorContext === 'tracks' ? (
            <p className={styles.channelTracksError}>{dropboxError}</p>
          ) : null}
          {channel.trackError ? <p className={styles.channelTracksError}>{channel.trackError}</p> : null}
          {channel.trackStatus === 'loading' ? (
            <p className={styles.channelTracksStatus}>Loading tracks…</p>
          ) : null}
          {channel.trackStatus === 'loaded' ? (
            <p className={styles.channelTracksStatus}>{loadedTrackSummary}</p>
          ) : null}
        </div>
      </div>
    </section>
  );
}
