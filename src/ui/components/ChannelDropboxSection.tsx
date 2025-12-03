import type { FormEvent } from 'react';
import type { DropboxAppKeySource } from '../../integrations/dropbox';

export type DropboxTarget = 'layers' | 'tracks';

export type ChannelDropboxSectionProps = {
  channelId: string;
  variant: DropboxTarget;
  isDisabled: boolean;
  isImporting: boolean;
  error: string | null;
  info?: string | null;
  appKeyInput: string;
  appKeySource: DropboxAppKeySource | null;
  isConfigOpen: boolean;
  showConfigForm?: boolean;
  renderButton?: boolean;
  renderStatuses?: boolean;
  onImport: () => void;
  onAppKeyInputChange: (value: string) => void;
  onSubmitAppKey: () => void;
  onCancelAppKey: () => void;
  onClearAppKey: () => void;
};

const BUTTON_CLASS_MAP: Record<DropboxTarget, string> = {
  layers: 'channel-layer-drop-button',
  tracks: 'channel-tracks-button'
};

const STATUS_CLASS_MAP: Record<DropboxTarget, string> = {
  layers: 'channel-layer-drop-status',
  tracks: 'channel-tracks-status'
};

const ERROR_CLASS_MAP: Record<DropboxTarget, string> = {
  layers: 'channel-layer-drop-error',
  tracks: 'channel-tracks-error'
};

export default function ChannelDropboxSection({
  channelId,
  variant,
  isDisabled,
  isImporting,
  error,
  info,
  appKeyInput,
  appKeySource,
  isConfigOpen,
  showConfigForm = false,
  renderButton = true,
  renderStatuses = true,
  onImport,
  onAppKeyInputChange,
  onSubmitAppKey,
  onCancelAppKey,
  onClearAppKey
}: ChannelDropboxSectionProps) {
  const buttonClassName = BUTTON_CLASS_MAP[variant];
  const statusClassName = STATUS_CLASS_MAP[variant];
  const errorClassName = ERROR_CLASS_MAP[variant];

  const handleConfigSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onSubmitAppKey();
  };

  return (
    <>
      {renderButton ? (
        <button
          type="button"
          className={buttonClassName}
          onClick={onImport}
          disabled={isDisabled || isImporting}
        >
          {isImporting ? 'Importing…' : 'From Dropbox'}
        </button>
      ) : null}
      {renderStatuses ? (
        <>
          {isImporting ? <p className={statusClassName}>Importing from Dropbox…</p> : null}
          {variant === 'layers' && info ? <p className="channel-layer-drop-info">{info}</p> : null}
          {error ? <p className={errorClassName}>{error}</p> : null}
          {showConfigForm && isConfigOpen ? (
            <form className="channel-dropbox-config" onSubmit={handleConfigSubmit} noValidate>
              <label className="channel-dropbox-config-label" htmlFor={`dropbox-app-key-${channelId}`}>
                Dropbox app key
              </label>
              <input
                id={`dropbox-app-key-${channelId}`}
                type="text"
                className="channel-dropbox-config-input"
                placeholder="slate-your-app-key"
                value={appKeyInput}
                onChange={(event) => onAppKeyInputChange(event.target.value)}
                disabled={isDisabled || appKeySource === 'env'}
                autoComplete="off"
              />
              <p className="channel-dropbox-config-hint">
                Generate an app key in the{' '}
                <a href="https://www.dropbox.com/developers/apps" target="_blank" rel="noreferrer">
                  Dropbox App Console
                </a>{' '}
                (Scoped app with Dropbox Chooser enabled) and paste it here.
              </p>
              {appKeySource === 'env' ? (
                <p className="channel-dropbox-config-note">
                  This deployment provides a Dropbox app key. Contact your administrator to change it.
                </p>
              ) : null}
              <div className="channel-dropbox-config-actions">
                <button type="submit" className="channel-dropbox-config-save" disabled={isDisabled}>
                  {appKeySource === 'env' ? 'Close' : 'Save app key'}
                </button>
                <button
                  type="button"
                  className="channel-dropbox-config-cancel"
                  onClick={onCancelAppKey}
                >
                  Cancel
                </button>
                {appKeySource === 'local' ? (
                  <button
                    type="button"
                    className="channel-dropbox-config-clear"
                    onClick={onClearAppKey}
                  >
                    Remove saved key
                  </button>
                ) : null}
              </div>
            </form>
          ) : null}
        </>
      ) : null}
    </>
  );
}
