import type { Me } from '@watercooler/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './api';

export function useMe() {
  const query = useQuery({ queryKey: ['me'], queryFn: api.me, staleTime: 30_000 });
  return { me: query.data?.user ?? null, loading: query.isPending };
}

export function useConfig() {
  return useQuery({ queryKey: ['config'], queryFn: api.config, staleTime: Infinity }).data;
}

/** Update the cached user in place (e.g. after a trade changed the balance). */
export function useSetMe() {
  const qc = useQueryClient();
  return (update: (me: Me) => Me) =>
    qc.setQueryData<{ user: Me | null }>(['me'], (old) => (old?.user ? { user: update(old.user) } : old));
}
