import { ShieldAlert } from 'lucide-react';
import { Navigate, Outlet, useLocation } from 'react-router';
import { useMe } from '../lib/auth';
import { Empty, PageLoader } from './ui';

export function RequireAuth({ admin }: { admin?: boolean }) {
  const { me, loading } = useMe();
  const location = useLocation();
  if (loading) return <PageLoader />;
  if (!me) return <Navigate to={`/login?next=${encodeURIComponent(location.pathname)}`} replace />;
  if (admin && me.role !== 'admin') return <Empty icon={<ShieldAlert className="size-10" />} title="需要管理员权限" />;
  return <Outlet />;
}
