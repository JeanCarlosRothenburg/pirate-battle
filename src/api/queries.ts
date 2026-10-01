import { QueryClient, keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, isRetryable } from './client'
import type { ApiClient } from './client'
import type { MatchRecord } from './contracts'

export const queryKeys = {
  ranking: (config: string, page: number) => ['ranking', config, page] as const,
  history: (playerId: string, page: number) => ['history', playerId, page] as const,
}

/** At most two retries, only for failures that a retry can fix, with exponential backoff. */
const retry = (failureCount: number, error: unknown): boolean => failureCount < 2 && isRetryable(error)
const retryDelay = (attempt: number): number => Math.min(500 * 2 ** attempt, 4000)

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry,
        retryDelay,
        staleTime: 10_000,
        gcTime: 5 * 60_000,
        refetchOnWindowFocus: true,
      },
      mutations: { retry, retryDelay },
    },
  })
}

/**
 * Each panel refetches when it is shown again (`refetchOnMount: 'always'`). TanStack Query
 * passes an AbortSignal and cancels a superseded request for the same key, and every page
 * has its own key, so a slow, older response can never overwrite newer data.
 */
export function useRanking(config: string, page: number, client: ApiClient = api) {
  return useQuery({
    queryKey: queryKeys.ranking(config, page),
    queryFn: ({ signal }) => client.fetchRanking(config, page, signal),
    placeholderData: keepPreviousData,
    refetchOnMount: 'always',
  })
}

export function useHistory(playerId: string, page: number, client: ApiClient = api) {
  return useQuery({
    queryKey: queryKeys.history(playerId, page),
    queryFn: ({ signal }) => client.fetchHistory(playerId, page, signal),
    placeholderData: keepPreviousData,
    refetchOnMount: 'always',
  })
}

/** Registers a match, then refreshes both tabs so the new record shows up in each. */
export function useRegisterMatch(client: ApiClient = api) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationKey: ['registerMatch'],
    mutationFn: (record: MatchRecord) => client.registerMatch(record),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['ranking'] }),
        queryClient.invalidateQueries({ queryKey: ['history'] }),
      ])
    },
  })
}
