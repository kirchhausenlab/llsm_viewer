import type { FunctionComponent } from 'react';

export type HoverDebugProps = {
  message: string | null;
};

export const HoverDebug: FunctionComponent<HoverDebugProps> = ({ message }) => {
  if (!message) {
    return null;
  }

  return (
    <div className="hover-debug" role="status" aria-live="polite">
      Hover sampling unavailable: {message}
    </div>
  );
};
