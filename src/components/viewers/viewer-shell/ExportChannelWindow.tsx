import type { ChannelExportSource } from '../../../shared/utils/channelExport';
import FloatingWindow from '../../widgets/FloatingWindow';
import type { LayoutProps } from './types';
import {
  ViewerWindowButton,
  ViewerWindowMessage,
  ViewerWindowRow,
  ViewerWindowSelect,
  ViewerWindowStack,
} from './window-ui';

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
      <ViewerWindowStack className="export-channel-window">
        <ViewerWindowRow className="export-channel-row" align="center">
          <label htmlFor="export-channel-select">Channel</label>
          <ViewerWindowSelect
            id="export-channel-select"
            value={selectedSourceId}
            onChange={(event) => onSourceChange(event.target.value)}
            disabled={busy || sources.length === 0}
            expand
          >
            {sources.map((source) => (
              <option key={getSourceId(source)} value={getSourceId(source)}>
                {source.name}
              </option>
            ))}
          </ViewerWindowSelect>
        </ViewerWindowRow>

        <ViewerWindowRow className="export-channel-row" align="center">
          <label htmlFor="export-channel-format">Format</label>
          <ViewerWindowSelect id="export-channel-format" value="tif" disabled expand>
            <option value="tif">.tif</option>
          </ViewerWindowSelect>
        </ViewerWindowRow>

        <ViewerWindowRow className="export-channel-row" align="center">
          <label htmlFor="export-channel-file-name">File name</label>
          <input
            id="export-channel-file-name"
            type="text"
            value={fileName}
            onChange={(event) => onFileNameChange(event.target.value)}
            disabled={busy}
          />
        </ViewerWindowRow>

        <ViewerWindowRow className="export-channel-actions" justify="end" wrap>
          <ViewerWindowButton type="button" onClick={onExport} disabled={!canExport}>
            Export
          </ViewerWindowButton>
        </ViewerWindowRow>

        {message ? (
          <ViewerWindowMessage className="export-channel-message" role="status" aria-live="polite">
            {message}
          </ViewerWindowMessage>
        ) : null}
      </ViewerWindowStack>
    </FloatingWindow>
  );
}

export { getSourceId as getChannelExportSourceId };
