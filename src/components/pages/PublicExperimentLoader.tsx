import { useMemo, type FC } from 'react';
import type { PublicExperimentCatalogEntry } from '../../shared/utils/publicExperimentCatalog';

type PublicExperimentLoaderProps = {
  isOpen: boolean;
  catalogUrl: string;
  publicExperiments: PublicExperimentCatalogEntry[];
  isCatalogLoading: boolean;
  isPreprocessedImporting: boolean;
  activePublicExperimentId: string | null;
  publicExperimentError: string | null;
  onRefreshPublicExperiments: () => void | Promise<void>;
  onLoadPublicExperiment: (experimentId: string) => void | Promise<void>;
};

function formatTimepoints(count: number): string {
  return `${count} timepoint${count === 1 ? '' : 's'}`;
}

const PublicExperimentLoader: FC<PublicExperimentLoaderProps> = ({
  isOpen,
  catalogUrl,
  publicExperiments,
  isCatalogLoading,
  isPreprocessedImporting,
  activePublicExperimentId,
  publicExperimentError,
  onRefreshPublicExperiments,
  onLoadPublicExperiment
}) => {
  const catalogHost = useMemo(() => {
    try {
      return new URL(catalogUrl).host;
    } catch {
      return catalogUrl;
    }
  }, [catalogUrl]);

  if (!isOpen) {
    return null;
  }

  return (
    <section className="public-experiment-loader" aria-label="Public experiments">
      <div className="public-experiment-loader-hero">
        <div className="public-experiment-loader-copy">
          <p className="public-experiment-loader-kicker">Public experiments</p>
          <h2>Start with hosted datasets</h2>
          <p className="public-experiment-loader-subtitle">
            Curated examples stream directly from public S3 storage. The viewer requests only the chunks it needs, so
            you can inspect the pipeline without preparing local files first.
          </p>
        </div>
        <div className="public-experiment-loader-actions">
          <button
            type="button"
            className="channel-add-button public-experiment-refresh-button"
            onClick={onRefreshPublicExperiments}
            disabled={isCatalogLoading || isPreprocessedImporting}
          >
            {isCatalogLoading ? 'Refreshing…' : 'Refresh list'}
          </button>
          <p className="public-experiment-loader-host">Catalog source: {catalogHost}</p>
        </div>
      </div>

      <div className="public-experiment-loader-facts" aria-label="Public experiment facts">
        <div className="public-experiment-loader-fact">
          <span className="public-experiment-loader-fact-label">Streaming</span>
          <span className="public-experiment-loader-fact-value">Remote chunks are fetched on demand.</span>
        </div>
        <div className="public-experiment-loader-fact">
          <span className="public-experiment-loader-fact-label">No local prep</span>
          <span className="public-experiment-loader-fact-value">Use the same viewer path without copying data first.</span>
        </div>
        <div className="public-experiment-loader-fact">
          <span className="public-experiment-loader-fact-label">Best use</span>
          <span className="public-experiment-loader-fact-value">Quick smoke tests, demos, and regression checks.</span>
        </div>
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
                  <div>
                    <h3>{experiment.label}</h3>
                    <p className="public-experiment-card-description">{experiment.description}</p>
                  </div>
                  <span className="public-experiment-card-pill">{formatTimepoints(experiment.timepoints)}</span>
                </div>
                <p className="public-experiment-card-meta">
                  Loads through the same preprocessed runtime used for local `.zarr` datasets.
                </p>
                <button
                  type="button"
                  className="channel-add-button public-experiment-card-button"
                  onClick={() => onLoadPublicExperiment(experiment.id)}
                  disabled={isPreprocessedImporting}
                >
                  {isLoadingThis ? 'Loading example…' : 'Load example'}
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
