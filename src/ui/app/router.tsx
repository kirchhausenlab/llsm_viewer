import { lazy, Suspense } from 'react';
import DatasetSetupRoute from './routes/DatasetSetupRoute';
import { useAppRouteState } from './hooks/useAppRouteState';

const ViewerRoute = lazy(() => import('./routes/ViewerRoute'));

function AppRouter() {
  const { isViewerLaunched, datasetSetupProps, viewerRouteProps } = useAppRouteState();

  return (
    <>
      {!isViewerLaunched ? <DatasetSetupRoute {...datasetSetupProps} /> : null}
      {viewerRouteProps ? (
        <Suspense fallback={isViewerLaunched ? <div role="status">Loading viewer...</div> : null}>
          <ViewerRoute {...viewerRouteProps} />
        </Suspense>
      ) : null}
    </>
  );
}

export default AppRouter;
