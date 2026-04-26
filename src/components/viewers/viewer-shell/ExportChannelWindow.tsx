import type { ChannelExportSource } from '../../../shared/utils/channelExport';
import FloatingWindow from '../../widgets/FloatingWindow';
import type { LayoutProps } from './types';

type ExportChannelWindowProps = {
  initialPosition: LayoutProps['exportChannelWindowInitialPosition'];
  windowMargin: number;
  controlWindowWidth: number;
  resetSignal: number;
  sources: ChannelExportSource[];
  selectedSourceId: string;
  fileName: string;
  busy: boolean;
  message: string | null;
  onSourceChange: (id: string) => void;
  onFileNameChange: (value: string) => void;
  onExport: () => void;
  onClose: () => void;
};

function getSourceId(source: ChannelExportSource): string {
  return `${source.kind}:${source.channelId}`;
}

export default function ExportChannelWindow({
  initialPosition,
  windowMargin,
  controlWindowWidth,
  resetSignal,
  sources,
  selectedSourceId,
  fileName,
  busy,
  message,
  onSourceChange,
  onFileNameChange,
  onExport,
  onClose,
}: ExportChannelWindowProps) {
  const canExport = sources.length > 0 && fileName.trim().length > 0 && !busy;
  return (
    <FloatingWindow
      title="Export channel"
      className="floating-window--export-channel"
      initialPosition={initialPosition}
      width={`min(${controlWindowWidth}px, calc(100vw - ${windowMargin * 2}px))`}
      resetSignal={resetSignal}
      onClose={onClose}
    >
      <div className="global-controls export-channel-window">
        <div className="control-row export-channel-row">
          <label htmlFor="export-channel-select">Channel</label>
          <select
            id="export-channel-select"
            value={selectedSourceId}
            onChange={(event) => onSourceChange(event.target.value)}
            disabled={busy || sources.length === 0}
          >
            {sources.map((source) => (
              <option key={getSourceId(source)} value={getSourceId(source)}>
                {source.name}
              </option>
            ))}
          </select>
        </div>

        <div className="control-row export-channel-row">
          <label htmlFor="export-channel-format">Format</label>
          <select id="export-channel-format" value="tif" disabled>
            <option value="tif">.tif</option>
          </select>
        </div>

        <div className="control-row export-channel-row">
          <label htmlFor="export-channel-file-name">File name</label>
          <input
            id="export-channel-file-name"
            type="text"
            value={fileName}
            onChange={(event) => onFileNameChange(event.target.value)}
            disabled={busy}
          />
        </div>

        <div className="control-row export-channel-actions">
          <button type="button" onClick={onExport} disabled={!canExport}>
            Export
          </button>
        </div>

        {message ? (
          <div className="export-channel-message" role="status" aria-live="polite">
            {message}
          </div>
        ) : null}
      </div>
    </FloatingWindow>
  );
}

export { getSourceId as getChannelExportSourceId };
