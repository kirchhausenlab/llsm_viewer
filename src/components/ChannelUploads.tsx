import { useCallback, useRef, useState, type DragEvent } from 'react';
import type { ReactNode, ChangeEvent } from 'react';

export type ChannelUploadsProps = {
  variant: 'layers' | 'tracks';
  accept: string;
  multiple?: boolean;
  disabled: boolean;
  isBusy?: boolean;
  browseLabel: string;
  subtitle: string;
  onFilesSelected: (files: File[]) => void;
  onDropDataTransfer: (dataTransfer: DataTransfer) => void;
  actionSlot?: ReactNode;
  rightSlot?: ReactNode;
  statusSlot?: ReactNode;
};

export default function ChannelUploads({
  variant,
  accept,
  multiple,
  disabled,
  isBusy = false,
  browseLabel,
  subtitle,
  onFilesSelected,
  onDropDataTransfer,
  actionSlot,
  rightSlot,
  statusSlot
}: ChannelUploadsProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const dragCounterRef = useRef(0);
  const [isDragging, setIsDragging] = useState(false);

  const handleBrowse = useCallback(() => {
    if (disabled || isBusy) {
      return;
    }
    inputRef.current?.click();
  }, [disabled, isBusy]);

  const handleInputChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      if (disabled || isBusy) {
        event.target.value = '';
        return;
      }
      const fileList = event.target.files;
      if (fileList && fileList.length > 0) {
        onFilesSelected(Array.from(fileList));
      }
      event.target.value = '';
    },
    [disabled, isBusy, onFilesSelected]
  );

  const handleDragEnter = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      if (disabled || isBusy) {
        return;
      }
      dragCounterRef.current += 1;
      setIsDragging(true);
    },
    [disabled, isBusy]
  );

  const handleDragOver = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      if (disabled || isBusy) {
        event.dataTransfer.dropEffect = 'none';
        return;
      }
      event.dataTransfer.dropEffect = 'copy';
    },
    [disabled, isBusy]
  );

  const handleDragLeave = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      if (disabled || isBusy) {
        return;
      }
      dragCounterRef.current = Math.max(0, dragCounterRef.current - 1);
      if (dragCounterRef.current === 0) {
        setIsDragging(false);
      }
    },
    [disabled, isBusy]
  );

  const handleDrop = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      dragCounterRef.current = 0;
      setIsDragging(false);
      if (disabled || isBusy) {
        return;
      }
      const { dataTransfer } = event;
      if (!dataTransfer) {
        return;
      }
      onDropDataTransfer(dataTransfer);
    },
    [disabled, isBusy, onDropDataTransfer]
  );

  const dropClassName = variant === 'layers' ? 'channel-layer-drop' : 'channel-tracks-drop';
  const contentClassName = variant === 'layers' ? 'channel-layer-drop-content' : 'channel-tracks-content';
  const rowClassName = variant === 'layers' ? 'channel-layer-row' : 'channel-tracks-row';
  const descriptionClassName =
    variant === 'layers' ? 'channel-layer-description' : 'channel-tracks-description';
  const browseButtonClassName =
    variant === 'layers' ? 'channel-layer-drop-button' : 'channel-tracks-button';
  const subtitleClassName = variant === 'layers' ? 'channel-layer-drop-subtitle' : 'channel-tracks-subtitle';

  return (
    <div
      className={`${dropClassName}${isDragging ? ' is-active' : ''}`}
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <input
        ref={inputRef}
        className="file-drop-input"
        type="file"
        accept={accept}
        multiple={multiple}
        onChange={handleInputChange}
        disabled={disabled || isBusy}
      />
      <div className={contentClassName}>
        <div className={rowClassName}>
          <div className={descriptionClassName}>
            <button
              type="button"
              className={browseButtonClassName}
              onClick={handleBrowse}
              disabled={disabled || isBusy}
            >
              {browseLabel}
            </button>
            {actionSlot}
            <p className={subtitleClassName}>{subtitle}</p>
          </div>
          {rightSlot}
        </div>
        {statusSlot}
      </div>
    </div>
  );
}
