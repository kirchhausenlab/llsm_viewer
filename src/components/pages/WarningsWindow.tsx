import type { FC, ReactNode } from 'react';
import FloatingWindow from '../widgets/FloatingWindow';

type WarningsWindowProps = {
  title: string;
  launchErrorMessage: string | null;
  warningWindowInitialPosition: { x: number; y: number };
  warningWindowWidth: number;
  datasetErrorResetSignal: number;
  onDatasetErrorDismiss: () => void;
  children?: ReactNode;
};

const WarningsWindow: FC<WarningsWindowProps> = ({
  title,
  launchErrorMessage,
  warningWindowInitialPosition,
  warningWindowWidth,
  datasetErrorResetSignal,
  onDatasetErrorDismiss,
  children
}) => {
  if (!launchErrorMessage) {
    return null;
  }

  return (
    <FloatingWindow
      title={title}
      className="floating-window--warning"
      bodyClassName="warning-window-body"
      width={warningWindowWidth}
      initialPosition={warningWindowInitialPosition}
      resetSignal={datasetErrorResetSignal}
    >
      <div className="warning-window-content">
        <p className="warning-window-intro">The viewer could not be launched.</p>
        <p className="warning-window-message">{launchErrorMessage}</p>
        <p className="warning-window-hint">Review the dataset configuration and try again.</p>
        <div className="warning-window-actions">
          <button type="button" className="warning-window-action-button" onClick={onDatasetErrorDismiss}>
            Got it
          </button>
          {children}
        </div>
      </div>
    </FloatingWindow>
  );
};

export default WarningsWindow;
export type { WarningsWindowProps };
