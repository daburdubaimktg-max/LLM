import { QueryClient } from '@tanstack/react-query';
export const queryClient = new QueryClient({ defaultOptions: { queries: { staleTime: 15_000, retry: 1, refetchOnWindowFocus: true } } });
/** Query keys, kept in one place so mutations can invalidate precisely. */
export const keys = {
  marketplace: ['marketplace'] as const, round: (id: string) => ['round', id] as const, myTesting: ['my-testing'] as const,
  assignment: (id: string) => ['assignment', id] as const, session: (id: string) => ['session', id] as const, bug: (id: string) => ['bug', id] as const,
  creatorHome: ['creator-home'] as const, product: (id: string) => ['product', id] as const, creatorRound: (id: string) => ['creator-round', id] as const,
  report: (id: string) => ['report', id] as const, profile: ['profile'] as const, notifications: ['notifications'] as const, templates: ['templates'] as const,
};
