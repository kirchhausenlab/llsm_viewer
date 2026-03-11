import FloatingWindow from '../../widgets/FloatingWindow';
import type { LayoutProps, PlaybackControlsProps } from './types';

export type RecordWindowProps = {
  layout: Pick<LayoutProps, 'windowMargin' | 'controlWindowWidth' | 'recordWindowInitialPosition' | 'resetToken'>;
  playbackControls: Pick<
    PlaybackControlsProps,
    | 'recordingBitrateMbps'
    | 'onRecordingBitrateMbpsChange'
    | 'onStartRecording'
    | 'onStopRecording'
    | 'isRecording'
    | 'canRecord'
  >;
  isOpen: boolean;
  onClose: () => void;
};

export default function RecordWindow({
  layout,
  playbackControls,
  isOpen,
  onClose
}: RecordWindowProps) {
  const { windowMargin, controlWindowWidth, recordWindowInitialPosition, resetToken } = layout;
  const {
    recordingBitrateMbps,
    onRecordingBitrateMbpsChange,
    onStartRecording,
    onStopRecording,
    isRecording,
    canRecord
  } = playbackControls;

  if (!isOpen) {
    return null;
  }

  return (
    <FloatingWindow
      title="Record"
      initialPosition={recordWindowInitialPosition}
      width={`min(${controlWindowWidth}px, calc(100vw - ${windowMargin * 2}px))`}
      className="floating-window--record"
      resetSignal={resetToken}
      onClose={onClose}
    >
      <div className="sidebar sidebar-right">
        <div className="global-controls">
          <div className="control-group viewer-recording-row">
            <div className="viewer-mode-row">
              <button
                type="button"
                className={
                  isRecording
                    ? 'playback-button playback-toggle playing'
                    : 'playback-button playback-toggle'
                }
                onClick={onStartRecording}
                disabled={!canRecord || isRecording}
                aria-pressed={isRecording}
              >
                Record
              </button>
              <button
                type="button"
                className="playback-button"
                onClick={onStopRecording}
                disabled={!isRecording}
              >
                Stop
              </button>
            </div>
          </div>

          {typeof recordingBitrateMbps === 'number' && onRecordingBitrateMbpsChange ? (
            <div className="control-group control-group--slider">
              <label htmlFor="recording-bitrate-slider">
                Recording bitrate (Mbps) <span>{recordingBitrateMbps}</span>
              </label>
              <div className="double-range-input">
                <input
                  id="recording-bitrate-slider"
                  type="range"
                  min={1}
                  max={100}
                  step={1}
                  value={recordingBitrateMbps}
                  onChange={(event) => onRecordingBitrateMbpsChange(Number(event.target.value))}
                  disabled={isRecording}
                />
                <input
                  type="number"
                  min={1}
                  max={100}
                  value={recordingBitrateMbps}
                  onChange={(event) => onRecordingBitrateMbpsChange(Number(event.target.value))}
                  disabled={isRecording}
                />
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </FloatingWindow>
  );
}
