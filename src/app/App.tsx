import type { ReactElement } from 'react';
import { AppProvider } from './providers/AppProvider';
import { UiProvider } from './providers/UiProvider';
import { AppRoutes } from './routes';

export function App(): ReactElement {
  return (
    <AppProvider>
      <UiProvider>
        <AppRoutes />
      </UiProvider>
    </AppProvider>
  );
}
