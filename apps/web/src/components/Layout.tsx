import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CURRENCY_NAME } from '@watercooler/shared';
import clsx from 'clsx';
import {
  BarChart3,
  Gift,
  LayoutGrid,
  LogOut,
  Plus,
  Settings,
  Shield,
  Trophy,
  User as UserIcon,
  Wallet,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link, Navigate, NavLink, Outlet, useLocation, useNavigate } from 'react-router';
import { toast } from 'sonner';
import { api, errorMessage } from '../lib/api';
import { useConfig, useMe, useSetMe } from '../lib/auth';
import { formatPct } from '../lib/format';
import { Avatar } from './Avatar';
import { Money } from './Money';
import { buttonClass } from './ui';

export function Logo() {
  return (
    <Link to="/" className="group flex items-center gap-2.5">
      <span className="relative flex size-9 items-center justify-center rounded-xl border border-line-strong bg-panel">
        <span className="absolute inset-0 rounded-xl bg-aurora opacity-0 blur-md transition-opacity group-hover:opacity-50" />
        <svg viewBox="0 0 32 32" className="relative size-6">
          <defs>
            <linearGradient id="logo-g" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#22d3ee" />
              <stop offset=".55" stopColor="#8b5cf6" />
              <stop offset="1" stopColor="#ec4899" />
            </linearGradient>
          </defs>
          <path d="M16 3c4.8 5.7 8.6 10.4 8.6 14.9a8.6 8.6 0 0 1-17.2 0C7.4 13.4 11.2 8.7 16 3Z" fill="url(#logo-g)" />
          <path d="M12.3 19a3.9 3.9 0 0 0 3.7 3.7" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" fill="none" />
        </svg>
      </span>
      <span className="hidden leading-none sm:block">
        <span className="block font-display text-[17px] font-bold tracking-tight">Watercooler</span>
        <span className="block text-[10px] tracking-[0.3em] text-faint">茶水间预测市场</span>
      </span>
    </Link>
  );
}

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  clsx(
    'relative rounded-lg px-3 py-1.5 text-sm font-medium transition-colors',
    isActive ? 'text-fg' : 'text-dim hover:text-fg',
  );

function NavItem({ to, children }: { to: string; children: React.ReactNode }) {
  return (
    <NavLink to={to} end={to === '/'} className={navLinkClass}>
      {({ isActive }) => (
        <>
          {children}
          {isActive && (
            <span className="absolute inset-x-3 -bottom-[17px] h-0.5 rounded-full bg-aurora shadow-[0_0_12px_rgb(139_92_246)]" />
          )}
        </>
      )}
    </NavLink>
  );
}

function BonusButton() {
  const setMe = useSetMe();
  const mutation = useMutation({
    mutationFn: api.claimBonus,
    onSuccess: (res) => {
      setMe((me) => ({ ...me, balance: res.balance, canClaimBonus: false }));
      toast.success(`签到成功，获得 ${res.amount} ${CURRENCY_NAME}`);
    },
    onError: (err) => toast.error(errorMessage(err)),
  });
  return (
    <button
      onClick={() => mutation.mutate()}
      disabled={mutation.isPending}
      className="relative inline-flex h-9 items-center gap-1.5 rounded-xl border border-gold/30 bg-gold/10 px-2.5 text-sm font-medium text-gold transition hover:bg-gold/20 sm:px-3"
      aria-label="每日签到"
    >
      <span className="absolute -top-1 -right-1 size-2.5 animate-ping rounded-full bg-gold" />
      <span className="absolute -top-1 -right-1 size-2.5 rounded-full bg-gold" />
      <Gift className="size-4" />
      <span className="hidden sm:inline">签到</span>
    </button>
  );
}

function UserMenu() {
  const { me } = useMe();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const qc = useQueryClient();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => setOpen(false), [location.pathname]);
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  if (!me) return null;

  const logout = async () => {
    await api.logout().catch(() => undefined);
    qc.setQueryData(['me'], { user: null });
    qc.removeQueries({ queryKey: ['portfolio'] });
    await qc.invalidateQueries();
    navigate('/');
  };

  const items = [
    { to: `/u/${me.id}`, icon: UserIcon, label: '个人主页' },
    { to: '/portfolio', icon: Wallet, label: '我的持仓' },
    { to: '/settings', icon: Settings, label: '账号设置' },
    ...(me.role === 'admin' ? [{ to: '/admin', icon: Shield, label: '管理后台' }] : []),
  ];

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center rounded-full ring-2 ring-transparent transition hover:ring-white/15"
        aria-label="用户菜单"
      >
        <Avatar id={me.id} name={me.displayName} size={34} />
      </button>
      {open && (
        <div className="absolute right-0 mt-2 w-56 overflow-hidden rounded-2xl border border-line-strong bg-panel/95 p-1.5 shadow-2xl backdrop-blur-xl">
          <div className="px-3 py-2.5">
            <div className="font-medium">{me.displayName}</div>
            <div className="text-xs text-faint">@{me.username}</div>
          </div>
          <div className="my-1 h-px bg-line" />
          {items.map(({ to, icon: Icon, label }) => (
            <Link
              key={to}
              to={to}
              className="flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm text-dim transition hover:bg-white/5 hover:text-fg"
            >
              <Icon className="size-4" />
              {label}
            </Link>
          ))}
          <div className="my-1 h-px bg-line" />
          <button
            onClick={logout}
            className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-sm text-dim transition hover:bg-no/10 hover:text-no"
          >
            <LogOut className="size-4" />
            退出登录
          </button>
        </div>
      )}
    </div>
  );
}

function Navbar() {
  const { me, loading } = useMe();
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-canvas/70 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-6 px-4">
        <Logo />
        <nav className="hidden items-center gap-1 md:flex">
          <NavItem to="/">市场</NavItem>
          <NavItem to="/leaderboard">排行榜</NavItem>
          {me && <NavItem to="/portfolio">持仓</NavItem>}
        </nav>
        <div className="ml-auto flex items-center gap-2.5">
          {loading ? null : me ? (
            <>
              {me.canClaimBonus && <BonusButton />}
              <Link
                to="/portfolio"
                className="flex h-9 items-center gap-2 rounded-xl border border-line bg-white/[0.03] px-3 text-sm font-semibold transition hover:border-brand-2/40"
                title="余额"
              >
                <Money value={me.balance} />
              </Link>
              <Link to="/create" className={buttonClass({ size: 'sm', className: 'hidden h-9 sm:inline-flex' })}>
                <Plus className="size-4" />
                创建市场
              </Link>
              <UserMenu />
            </>
          ) : (
            <>
              <Link to="/login" className={buttonClass({ variant: 'ghost', size: 'sm', className: 'h-9' })}>
                登录
              </Link>
              <Link to="/register" className={buttonClass({ size: 'sm', className: 'h-9' })}>
                注册
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}

/** Scrolling tape of the latest trades across all markets. */
function Ticker() {
  const { data } = useQuery({ queryKey: ['activity'], queryFn: () => api.activity(24), refetchInterval: 15_000 });
  if (!data || data.length === 0) return null;
  const items = data.map((t) => (
    <Link
      key={t.id}
      to={`/market/${t.marketId}`}
      className="flex shrink-0 items-center gap-2 px-5 text-xs text-dim transition hover:text-fg"
    >
      <span className="font-medium text-fg/80">{t.user.displayName}</span>
      <span className={t.side === 'buy' ? 'text-yes' : 'text-no'}>{t.side === 'buy' ? '买入' : '卖出'}</span>
      <span className="rounded bg-white/5 px-1.5 py-0.5 text-fg/80">{t.outcomeLabel}</span>
      <span className="max-w-56 truncate">{t.marketQuestion}</span>
      <Money value={t.amount} className="font-mono text-fg/80" />
      <span className="font-mono text-faint">@ {formatPct(t.priceAfter)}</span>
      <span className="text-line-strong">/</span>
    </Link>
  ));
  return (
    <div
      className="group relative overflow-hidden border-b border-line bg-panel/40"
      style={{ ['--marquee-duration' as string]: `${Math.max(30, data.length * 5)}s` }}
    >
      <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-16 bg-gradient-to-r from-canvas to-transparent" />
      <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-16 bg-gradient-to-l from-canvas to-transparent" />
      <div className="flex w-max animate-marquee py-2 group-hover:[animation-play-state:paused]">
        {items}
        <div className="flex" aria-hidden>
          {items}
        </div>
      </div>
    </div>
  );
}

function MobileNav() {
  const { me } = useMe();
  const items = [
    { to: '/', icon: LayoutGrid, label: '市场' },
    { to: '/leaderboard', icon: Trophy, label: '排行' },
    { to: me ? '/create' : '/login', icon: Plus, label: '创建', primary: true },
    { to: me ? '/portfolio' : '/login', icon: BarChart3, label: '持仓' },
    { to: me ? `/u/${me.id}` : '/login', icon: UserIcon, label: '我的' },
  ];
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-canvas/85 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl md:hidden">
      <div className="grid grid-cols-5">
        {items.map(({ to, icon: Icon, label, primary }) => (
          <NavLink
            key={label}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              clsx(
                'flex flex-col items-center gap-0.5 py-2 text-[11px] transition',
                isActive && !primary ? 'text-fg' : 'text-faint',
              )
            }
          >
            {primary ? (
              <span className="-mt-1 flex size-9 items-center justify-center rounded-xl bg-aurora text-white shadow-[0_0_20px_-4px_rgb(139_92_246)]">
                <Icon className="size-5" />
              </span>
            ) : (
              <Icon className="size-5" />
            )}
            {!primary && label}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}

function Background() {
  return (
    <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden" aria-hidden>
      <div className="absolute -top-[30%] -left-[10%] h-[70vh] w-[60vw] animate-drift rounded-full bg-[radial-gradient(closest-side,rgb(139_92_246/0.22),transparent)] blur-2xl" />
      <div className="absolute top-[10%] -right-[15%] h-[60vh] w-[55vw] animate-drift rounded-full bg-[radial-gradient(closest-side,rgb(34_211_238/0.14),transparent)] blur-2xl [animation-delay:-8s]" />
      <div className="absolute -bottom-[30%] left-[20%] h-[60vh] w-[60vw] animate-drift rounded-full bg-[radial-gradient(closest-side,rgb(236_72_153/0.10),transparent)] blur-2xl [animation-delay:-16s]" />
      <div
        className="absolute inset-0 opacity-[0.35]"
        style={{
          backgroundImage:
            'linear-gradient(rgb(255 255 255 / 0.035) 1px, transparent 1px), linear-gradient(90deg, rgb(255 255 255 / 0.035) 1px, transparent 1px)',
          backgroundSize: '56px 56px',
          maskImage: 'radial-gradient(ellipse 80% 60% at 50% 0%, #000 30%, transparent 75%)',
          WebkitMaskImage: 'radial-gradient(ellipse 80% 60% at 50% 0%, #000 30%, transparent 75%)',
        }}
      />
    </div>
  );
}

export function Layout() {
  const { pathname } = useLocation();
  const { me, loading } = useMe();
  const config = useConfig();
  useEffect(() => window.scrollTo(0, 0), [pathname]);
  if (config?.privateMode && !loading && !me && pathname !== '/login' && pathname !== '/register') {
    return <Navigate to={`/login?next=${encodeURIComponent(pathname)}`} replace />;
  }
  return (
    <div className="flex min-h-dvh flex-col">
      <Background />
      <Navbar />
      <Ticker />
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 pt-6 pb-28 md:pb-16">
        <Outlet />
      </main>
      <footer className="hidden border-t border-line py-6 text-center text-xs text-faint md:block">
        Watercooler · 仅供同事间娱乐，{CURRENCY_NAME}没有任何现实价值
      </footer>
      <MobileNav />
    </div>
  );
}
