import axios from 'axios'
import type { AxiosInstance } from 'axios'
import { ZodError } from 'zod'
import { PAGE_SIZE, historyPageSchema, rankingPageSchema, registerResponseSchema } from './contracts'
import type { HistoryPage, MatchRecord, RankingPage, RegisterResponse } from './contracts'

/** Requests slower than this fail as timeouts, which the UI reports and retries. */
export const API_TIMEOUT_MS = 5000

export interface ApiClient {
  fetchRanking(config: string, page: number, signal?: AbortSignal): Promise<RankingPage>
  fetchHistory(playerId: string, page: number, signal?: AbortSignal): Promise<HistoryPage>
  /** Idempotent: registering the same match again returns the existing record. */
  registerMatch(record: MatchRecord, signal?: AbortSignal): Promise<RegisterResponse>
}

export function createApiClient(baseURL: string, timeout = API_TIMEOUT_MS): ApiClient {
  const http: AxiosInstance = axios.create({ baseURL, timeout })
  return {
    async fetchRanking(config, page, signal) {
      const { data } = await http.get('/ranking', { params: { config, page, pageSize: PAGE_SIZE }, ...cancelWith(signal) })
      return rankingPageSchema.parse(data)
    },
    async fetchHistory(playerId, page, signal) {
      const { data } = await http.get(`/players/${encodeURIComponent(playerId)}/matches`, {
        params: { page, pageSize: PAGE_SIZE },
        ...cancelWith(signal),
      })
      return historyPageSchema.parse(data)
    },
    async registerMatch(record, signal) {
      const { data } = await http.put(`/matches/${encodeURIComponent(record.matchId)}`, record, cancelWith(signal))
      return registerResponseSchema.parse(data)
    },
  }
}

/** Lets TanStack Query abort a superseded request, so a stale response is never applied. */
function cancelWith(signal: AbortSignal | undefined): { signal?: AbortSignal } {
  return signal === undefined ? {} : { signal }
}

export const api = createApiClient('/api')

/**
 * Worth retrying: timeouts, connection failures and 5xx. Not worth it: 4xx (the request is
 * wrong and will stay wrong), cancellations, and responses that break the contract.
 */
export function isRetryable(error: unknown): boolean {
  if (error instanceof ZodError || axios.isCancel(error)) return false
  if (!axios.isAxiosError(error)) return false
  const status = error.response?.status
  return status === undefined || status >= 500
}

/** A short, human-readable reason for the UI. */
export function describeError(error: unknown): string {
  if (error instanceof ZodError) return 'The server sent an unexpected response.'
  if (axios.isAxiosError(error)) {
    if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') return 'The server took too long to respond.'
    const status = error.response?.status
    if (status === undefined) return 'Could not reach the server.'
    if (status >= 500) return `The server is unavailable (HTTP ${status}).`
    return `The request was rejected (HTTP ${status}).`
  }
  return 'Something went wrong.'
}
