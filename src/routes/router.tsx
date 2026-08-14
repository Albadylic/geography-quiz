import { lazy, Suspense, type ReactNode } from 'react';
import { createBrowserRouter } from 'react-router-dom';
import { AppLayout } from './AppLayout';
import { HomeScreen } from '@/features/home/HomeScreen';
import { NotFoundScreen } from './NotFoundScreen';
import { ScreenError } from './ScreenError';
import { ScreenLoading } from './ScreenLoading';

/**
 * Routes per plan §10.
 *
 * Every screen except home is lazy. Home is the entry point and needs none of
 * the quiz machinery, so splitting here keeps the 176KB dataset — and the
 * engine that reads it — out of the initial download entirely (T7.4).
 */
const SetupScreen = lazy(() =>
  import('@/features/setup/SetupScreen').then((m) => ({ default: m.SetupScreen })),
);
const PlayScreen = lazy(() =>
  import('@/features/play/PlayScreen').then((m) => ({ default: m.PlayScreen })),
);
const ResultsScreen = lazy(() =>
  import('@/features/results/ResultsScreen').then((m) => ({ default: m.ResultsScreen })),
);
const RevisionScreen = lazy(() =>
  import('@/features/revision/RevisionScreen').then((m) => ({ default: m.RevisionScreen })),
);
const StatsScreen = lazy(() =>
  import('@/features/stats/StatsScreen').then((m) => ({ default: m.StatsScreen })),
);
const SettingsScreen = lazy(() =>
  import('@/features/settings/SettingsScreen').then((m) => ({ default: m.SettingsScreen })),
);
const ColourScreen = lazy(() =>
  import('@/features/colour/ColourScreen').then((m) => ({ default: m.ColourScreen })),
);

/** Wraps a lazy screen in its loading state (T7.3). */
function screen(node: ReactNode): ReactNode {
  return <Suspense fallback={<ScreenLoading />}>{node}</Suspense>;
}

export const router = createBrowserRouter([
  {
    element: <AppLayout />,
    errorElement: <ScreenError />,
    children: [
      { path: '/', element: <HomeScreen /> },
      { path: '/play/colour/setup', element: screen(<ColourScreen />) },
      { path: '/play/colour', element: screen(<ColourScreen />) },
      { path: '/play/:mode/setup', element: screen(<SetupScreen />) },
      { path: '/play/:mode', element: screen(<PlayScreen />) },
      { path: '/results/:sessionId', element: screen(<ResultsScreen />) },
      { path: '/revision', element: screen(<RevisionScreen />) },
      { path: '/stats', element: screen(<StatsScreen />) },
      { path: '/settings', element: screen(<SettingsScreen />) },
      { path: '*', element: <NotFoundScreen /> },
    ],
  },
]);
