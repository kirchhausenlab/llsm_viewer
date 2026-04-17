import FloatingWindow from '../../widgets/FloatingWindow';
import type { LayoutProps, PlaybackControlsProps } from './types';

export type RecordWindowProps = {
  layout: Pick<LayoutProps, 'windowMargin' | 'controlWindowWidth' | 'recordWindowInitialPosition' | 'resetToken'>;
  playbackControls: Pick<
    PlaybackControlsProps,
    | 'recordingBitrateMbps'
    | 'onRecordingBitrateMbpsChange'
    | 'countdownSeconds'
    | 'onCountdownSecondsChange'
    | 'onTakeScreenshot'
    | 'canTakeScreenshot'
    | 'onRecordingPrimaryAction'
    | 'onStopRecording'
    | 'recordingStatus'
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
    countdownSeconds,
    onCountdownSecondsChange,
    onTakeScreenshot,
    canTakeScreenshot,
    onRecordingPrimaryAction,
    onStopRecording,
    recordingStatus,
    isRecording,
    canRecord
  } = playbackControls;

  const primaryButtonLabel =
    recordingStatus === 'pending-start' || recordingStatus === 'pending-resume'
      ? 'Abort'
      : recordingStatus === 'recording'
        ? 'Pause'
        : recordingStatus === 'paused'
          ? 'Resume'
          : 'Record';
  const isStopEnabled =
    recordingStatus === 'recording' || recordingStatus === 'paused' || recordingStatus === 'pending-resume';
  const isCountdownEditingDisabled = recordingStatus === 'pending-start' || recordingStatus === 'recording' || recordingStatus === 'pending-resume';
  const primaryButtonClassName = [
    'playback-button',
    'playback-toggle',
    'viewer-recording-primary',
    recordingStatus === 'recording'
      ? 'is-recording'
      : recordingStatus === 'paused'
        ? 'is-paused'
        : recordingStatus === 'pending-start' || recordingStatus === 'pending-resume'
          ? 'is-pending'
          : null
  ]
    .filter(Boolean)
    .join(' ');

  if (!isOpen) {
    return null;
  }

  return (
    <FloatingWindow
      title="Screen capture"
      initialPosition={recordWindowInitialPosition}
      width={`min(${controlWindowWidth}px, calc(100vw - ${windowMargin * 2}px))`}
      className="floating-window--record"
      resetSignal={resetToken}
      onClose={onClose}
    >
      <div className="sidebar sidebar-right">
        <div className="global-controls">
          <div className="control-group viewer-recording-row viewer-recording-row--single">
            <button
              type="button"
              className="playback-button viewer-recording-screenshot"
              onClick={onTakeScreenshot}
              disabled={!canTakeScreenshot}
            >
              Screenshot
            </button>
          </div>

          <div className="control-group viewer-recording-row">
            <div className="viewer-mode-row">
              <button
                type="button"
                className={primaryButtonClassName}
                onClick={onRecordingPrimaryAction}
                disabled={!canRecord}
                aria-pressed={isRecording}
              >
                {primaryButtonLabel}
              </button>
              <button
                type="button"
                className="playback-button"
                onClick={onStopRecording}
                disabled={!isStopEnabled}
              >
                Stop
              </button>
            </div>
          </div>

          {typeof countdownSeconds === 'number' && onCountdownSecondsChange ? (
            <div className="control-group">
              <div className="viewer-recording-countdown-row">
                <label htmlFor="recording-countdown-input">Countdown:</label>
                <input
                  id="recording-countdown-input"
                  type="number"
                  min={0}
                  max={5}
                  step={1}
                  value={countdownSeconds}
                  onChange={(event) => onCountdownSecondsChange(Number(event.target.value))}
                  disabled={isCountdownEditingDisabled}
                />
              </div>
            </div>
          ) : null}

          {typeof recordingBitrateMbps === 'number' && onRecordingBitrateMbpsChange ? (
            <div className="control-group control-group--slider">
              <label htmlFor="recording-bitrate-slider">
                Recording bitrate (Mbps) <span>{recordingBitrateMbps}</span>
              </label>
              <input
                id="recording-bitrate-slider"
                type="range"
                min={1}
                max={100}
                step={1}
                value={recordingBitrateMbps}
                onChange={(event) => onRecordingBitrateMbpsChange(Number(event.target.value))}
                disabled={recordingStatus !== 'idle'}
              />
            </div>
          ) : null}
        </div>
      </div>
    </FloatingWindow>
  );
}
