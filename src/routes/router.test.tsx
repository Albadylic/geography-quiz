import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { AppLayout } from './AppLayout';
import { HomeScreen } from '@/features/home/HomeScreen';
import { NotFoundScreen } from './NotFoundScreen';

function renderAt(path: string) {
  const router = createMemoryRouter(
    [
      {
        element: <AppLayout />,
        children: [
          { path: '/', element: <HomeScreen /> },
          { path: '*', element: <NotFoundScreen /> },
        ],
      },
    ],
    { initialEntries: [path] },
  );
  return render(<RouterProvider router={router} />);
}

describe('route skeleton', () => {
  it('renders the home screen at /', () => {
    renderAt('/');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/learn the/i);
  });

  it('links every mode card to a route', () => {
    renderAt('/');
    for (const name of ['Flags', 'Capitals', 'Combo', 'Colour the flag', 'Revision']) {
      expect(screen.getByRole('link', { name: new RegExp(name, 'i') })).toBeInTheDocument();
    }
  });

  it('falls back to the not-found screen for unknown paths', () => {
    renderAt('/nowhere');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/off the map/i);
  });
});
