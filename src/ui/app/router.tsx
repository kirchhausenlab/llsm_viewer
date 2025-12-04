import { Suspense } from 'react';
import DatasetSetupRoute from './routes/DatasetSetupRoute';
import ViewerRoute from './routes/ViewerRoute';
import { useAppRouteState } from './hooks/useAppRouteState';

function AppRouter() {
  const { isViewerLaunched, datasetSetupProps, viewerRouteProps } = useAppRouteState();

  return (
    <Suspense fallback={null}>
      {isViewerLaunched ? (
        <ViewerRoute {...viewerRouteProps} />
      ) : (
        <DatasetSetupRoute {...datasetSetupProps} />
      )}
    </Suspense>
  );
}

export default AppRouter;
