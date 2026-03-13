import type { FC } from 'react';

type FrontPageHeaderProps = {
  title: string;
  showReturnButton: boolean;
  onReturnToStart: () => void;
  isFrontPageLocked: boolean;
  versionLabel?: string | null;
  performanceNotice?: {
    title: string;
    lines: string[];
  } | null;
};

const FrontPageHeader: FC<FrontPageHeaderProps> = ({
  title,
  showReturnButton,
  onReturnToStart,
  isFrontPageLocked,
  versionLabel = null,
  performanceNotice = null
}) => {
  return (
    <header className={`front-page-header${performanceNotice ? ' front-page-header--with-performance-note' : ''}`}>
      <div className="front-page-title-row">
        <div className="front-page-title-copy">
          <div className="front-page-title-heading">
            <h1>{title}</h1>
            {versionLabel ? <span className="front-page-version-label">{versionLabel}</span> : null}
          </div>
        </div>
        <div className="front-page-header-actions">
          {showReturnButton ? (
            <button
              type="button"
              className="channel-add-button front-page-return-button"
              onClick={onReturnToStart}
              disabled={isFrontPageLocked}
            >
              Return
            </button>
          ) : null}
        </div>
      </div>
      {performanceNotice ? (
        <aside className="front-page-performance-note" aria-label={performanceNotice.title}>
          <p className="front-page-performance-note-title">{performanceNotice.title}</p>
          {performanceNotice.lines.map((line) => (
            <p key={line} className="front-page-performance-note-line">
              {line}
            </p>
          ))}
        </aside>
      ) : null}
    </header>
  );
};

export default FrontPageHeader;
export type { FrontPageHeaderProps };
