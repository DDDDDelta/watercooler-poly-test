import { Navigate, Outlet, useLocation } from 'react-router';
import { useMe } from '../lib/auth';
import { PageLoader } from './ui';

export function RequireAuth() {
  const { me, loading } = useMe();
  const location = useLocation();
  if (loading) return <PageLoader />;
  if (!me) return <Navigate to={`/login?next=${encodeURIComponent(location.pathname)}`} replace />;
  return <Outlet />;
}
