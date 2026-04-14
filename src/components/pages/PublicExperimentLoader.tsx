import type { FC } from 'react';
import type { PublicExperimentCatalogEntry } from '../../shared/utils/publicExperimentCatalog';

type PublicExperimentLoaderProps = {
  isOpen: boolean;
  catalogUrl: string | null;
  publicExperiments: PublicExperimentCatalogEntry[];
  isCatalogLoading: boolean;
  isPreprocessedImporting: boolean;
  activePublicExperimentId: string | null;
  publicExperimentError: string | null;
  onRefreshPublicExperiments: () => void | Promise<void>;
  onLoadPublicExperiment: (experimentId: string) => void | Promise<void>;
};

const PublicExperimentLoader: FC<PublicExperimentLoaderProps> = ({
  isOpen,
  publicExperiments,
  isCatalogLoading,
  isPreprocessedImporting,
  activePublicExperimentId,
  publicExperimentError,
  onRefreshPublicExperiments,
  onLoadPublicExperiment
}) => {
  if (!isOpen) {
    return null;
  }

  return (
    <section className="public-experiment-loader" aria-label="Public experiments">
      <div className="public-experiment-loader-toolbar">
        <p className="public-experiment-loader-subtitle">
          Visualize the experiments used in the SpatialDINO paper.
        </p>
        <button
          type="button"
          className="channel-add-button public-experiment-refresh-button"
          onClick={onRefreshPublicExperiments}
          disabled={isCatalogLoading || isPreprocessedImporting}
        >
          {isCatalogLoading ? 'Refreshing…' : 'Refresh list'}
        </button>
      </div>

      {isCatalogLoading && publicExperiments.length === 0 ? (
        <p className="public-experiment-loader-status">Loading the public experiment catalog…</p>
      ) : null}
      {!isCatalogLoading && publicExperiments.length === 0 ? (
        <p className="public-experiment-loader-status">
          No public experiments are currently listed. Refresh the catalog or verify the hosted `catalog.json`.
        </p>
      ) : null}

      {publicExperiments.length > 0 ? (
        <div className="public-experiment-grid">
          {publicExperiments.map((experiment) => {
            const isLoadingThis = activePublicExperimentId === experiment.id && isPreprocessedImporting;
            return (
              <article key={experiment.id} className="public-experiment-card">
                <div className="public-experiment-card-header">
                  <div className="public-experiment-card-copy">
                    <h3>{experiment.label}</h3>
                    <p className="public-experiment-card-description">{experiment.description}</p>
                  </div>
                </div>
                <button
                  type="button"
                  className="channel-add-button public-experiment-card-button"
                  onClick={() => onLoadPublicExperiment(experiment.id)}
                  disabled={isPreprocessedImporting}
                >
                  {isLoadingThis ? 'Loading experiment…' : 'Load experiment'}
                </button>
              </article>
            );
          })}
        </div>
      ) : null}

      {publicExperimentError ? <p className="preprocessed-loader-error">{publicExperimentError}</p> : null}
    </section>
  );
};

export default PublicExperimentLoader;
export type { PublicExperimentLoaderProps };
