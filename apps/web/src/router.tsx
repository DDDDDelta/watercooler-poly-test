import { createBrowserRouter } from 'react-router';
import { Layout } from './components/Layout';
import { RequireAuth } from './components/RequireAuth';
import Admin from './pages/Admin';
import CreateMarket from './pages/CreateMarket';
import Home from './pages/Home';
import Leaderboard from './pages/Leaderboard';
import { Login, Register } from './pages/Auth';
import Market from './pages/Market';
import NotFound from './pages/NotFound';
import PortfolioPage from './pages/Portfolio';
import Profile from './pages/Profile';
import SettingsPage from './pages/Settings';

export const router = createBrowserRouter(
  [
    {
      element: <Layout />,
      children: [
        { path: '/', element: <Home /> },
        { path: '/market/:id', element: <Market /> },
        { path: '/leaderboard', element: <Leaderboard /> },
        { path: '/u/:id', element: <Profile /> },
        { path: '/login', element: <Login /> },
        { path: '/register', element: <Register /> },
        {
          element: <RequireAuth />,
          children: [
            { path: '/create', element: <CreateMarket /> },
            { path: '/portfolio', element: <PortfolioPage /> },
            { path: '/settings', element: <SettingsPage /> },
          ],
        },
        {
          element: <RequireAuth admin />,
          children: [{ path: '/admin', element: <Admin /> }],
        },
        { path: '*', element: <NotFound /> },
      ],
    },
  ],
  { basename: import.meta.env.BASE_URL.replace(/\/+$/, '') || '/' },
);
