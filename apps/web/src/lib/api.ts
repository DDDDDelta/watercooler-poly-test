import type {
  AdminUser,
  AppConfig,
  Comment,
  CreateMarketInput,
  Holder,
  LeaderboardEntry,
  LedgerEntry,
  MarketDetail,
  MarketDetailResponse,
  MarketSummary,
  Me,
  Portfolio,
  PricePoint,
  SiteStats,
  Trade,
  TradeInput,
  TradeResult,
  UserProfile,
} from '@watercooler/shared';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method,
    credentials: 'same-origin',
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data = (await res.json().catch(() => null)) as (T & { error?: string }) | null;
  if (!res.ok) throw new ApiError(res.status, data?.error ?? `请求失败（${res.status}）`);
  return data as T;
}

const get = <T>(path: string) => request<T>('GET', path);
const post = <T>(path: string, body: unknown = {}) => request<T>('POST', path, body);

export type MarketFilter = 'active' | 'closed' | 'resolved' | 'all';
export type MarketSort = 'trending' | 'volume' | 'new' | 'closing';
export type HistoryRange = '1d' | '1w' | '1m' | 'all';
export type LeaderboardSort = 'profit' | 'netWorth' | 'volume';

function qs(params: Record<string, string | number | undefined>): string {
  const s = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== '') s.set(k, String(v));
  const str = s.toString();
  return str ? `?${str}` : '';
}

export const api = {
  config: () => get<AppConfig>('/config'),
  me: () => get<{ user: Me | null }>('/auth/me'),
  login: (username: string, password: string) => post<{ user: Me }>('/auth/login', { username, password }),
  register: (input: { username: string; displayName: string; password: string; inviteCode?: string }) =>
    post<{ user: Me }>('/auth/register', input),
  logout: () => post<{ ok: true }>('/auth/logout'),
  changePassword: (oldPassword: string, newPassword: string) => post('/auth/password', { oldPassword, newPassword }),
  updateProfile: (displayName: string) => post<{ user: Me }>('/me/profile', { displayName }),
  claimBonus: () => post<{ balance: number; amount: number }>('/me/bonus'),

  stats: () => get<SiteStats>('/stats'),
  activity: (limit = 30) => get<Trade[]>(`/activity${qs({ limit })}`),
  markets: (p: { filter?: MarketFilter; sort?: MarketSort; category?: string; q?: string; limit?: number } = {}) =>
    get<MarketSummary[]>(`/markets${qs(p)}`),
  market: (id: number) => get<MarketDetailResponse>(`/markets/${id}`),
  history: (id: number, range: HistoryRange) => get<PricePoint[]>(`/markets/${id}/history${qs({ range })}`),
  marketTrades: (id: number) => get<Trade[]>(`/markets/${id}/trades`),
  holders: (id: number) => get<Holder[]>(`/markets/${id}/holders`),
  comments: (id: number) => get<Comment[]>(`/markets/${id}/comments`),
  addComment: (id: number, body: string) => post<Comment>(`/markets/${id}/comments`, { body }),
  deleteComment: (id: number) => request<{ ok: true }>('DELETE', `/comments/${id}`),
  createMarket: (input: CreateMarketInput) => post<{ id: number }>('/markets', input),
  trade: (id: number, input: TradeInput) => post<TradeResult>(`/markets/${id}/trade`, input),
  resolve: (id: number, outcomeId: number, note?: string) =>
    post<MarketDetail>(`/markets/${id}/resolve`, { outcomeId, note }),
  cancel: (id: number, note?: string) => post<MarketDetail>(`/markets/${id}/cancel`, { note }),

  portfolio: () => get<Portfolio>('/portfolio'),
  ledger: (before?: number) => get<LedgerEntry[]>(`/portfolio/ledger${qs({ before })}`),
  leaderboard: (sort: LeaderboardSort) => get<LeaderboardEntry[]>(`/leaderboard${qs({ sort })}`),
  user: (id: number) => get<UserProfile>(`/users/${id}`),

  adminUsers: () => get<AdminUser[]>('/admin/users'),
  grant: (id: number, amount: number, note?: string) =>
    post<{ balance: number }>(`/admin/users/${id}/grant`, { amount, note }),
  setRole: (id: number, role: 'user' | 'admin') => post(`/admin/users/${id}/role`, { role }),
  resetPassword: (id: number, newPassword: string) => post(`/admin/users/${id}/password`, { newPassword }),
};

export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : '出错了，请稍后再试';
}
