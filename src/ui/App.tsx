import AppLayout from './app/layout';
import AppRouter from './app/router';
import AppProviders from './app/providers';

export default function App() {
  return (
    <AppProviders>
      <AppLayout>
        <AppRouter />
      </AppLayout>
    </AppProviders>
  );
}
