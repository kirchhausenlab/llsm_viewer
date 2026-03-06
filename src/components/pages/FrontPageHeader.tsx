import type { FC } from 'react';
import ThemeModeToggle from '../app/ThemeModeToggle';

type FrontPageHeaderProps = {
  title: string;
  showReturnButton: boolean;
  onReturnToStart: () => void;
  isFrontPageLocked: boolean;
};

const FrontPageHeader: FC<FrontPageHeaderProps> = ({
  title,
  showReturnButton,
  onReturnToStart,
  isFrontPageLocked
}) => {
  return (
    <header className="front-page-header">
      <div className="front-page-title-row">
        <div className="front-page-title-copy">
          <h1>{title}</h1>
        </div>
        <div className="front-page-header-actions">
          <ThemeModeToggle className="front-page-theme-toggle" />
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
    </header>
  );
};

export default FrontPageHeader;
export type { FrontPageHeaderProps };
