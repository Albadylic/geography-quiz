import { createBrowserRouter } from 'react-router-dom';
import { AppLayout } from './AppLayout';
import { HomeScreen } from '@/features/home/HomeScreen';
import { SetupScreen } from '@/features/setup/SetupScreen';
import { PlayScreen } from '@/features/play/PlayScreen';
import { ResultsScreen } from '@/features/results/ResultsScreen';
import { RevisionScreen } from '@/features/revision/RevisionScreen';
import { StatsScreen } from '@/features/stats/StatsScreen';
import { SettingsScreen } from '@/features/settings/SettingsScreen';
import { NotFoundScreen } from './NotFoundScreen';

/** Routes per plan §10. */
export const router = createBrowserRouter([
  {
    element: <AppLayout />,
    errorElement: <NotFoundScreen />,
    children: [
      { path: '/', element: <HomeScreen /> },
      { path: '/play/:mode/setup', element: <SetupScreen /> },
      { path: '/play/:mode', element: <PlayScreen /> },
      { path: '/results/:sessionId', element: <ResultsScreen /> },
      { path: '/revision', element: <RevisionScreen /> },
      { path: '/stats', element: <StatsScreen /> },
      { path: '/settings', element: <SettingsScreen /> },
      { path: '*', element: <NotFoundScreen /> },
    ],
  },
]);
