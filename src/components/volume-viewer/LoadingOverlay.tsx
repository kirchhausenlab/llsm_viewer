import type { FunctionComponent } from 'react';

export type LoadingOverlayProps = {
  visible: boolean;
};

export const LoadingOverlay: FunctionComponent<LoadingOverlayProps> = ({ visible }) => {
  if (!visible) {
    return null;
  }

  return (
    <div className="overlay">
      <div className="loading-panel">
        <span className="loading-title">Loading dataset…</span>
      </div>
    </div>
  );
};
