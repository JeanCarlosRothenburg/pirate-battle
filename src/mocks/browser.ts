import { setupWorker } from 'msw/browser'
import { browserStorage } from '../storage/localStore'
import { createMockApi } from './handlers'
import type { MockApi } from './handlers'
import { loadScenario } from './scenarios'

let active: MockApi | null = null

/**
 * Starts the mock ranking and history API in a service worker. It runs in development and
 * in the published build alike: the demo has no real backend. If service workers are
 * unavailable the game still starts, and the record panels show their error state.
 */
export async function startMockApi(): Promise<MockApi | null> {
  const storage = browserStorage()
  const api = createMockApi(storage, loadScenario(storage, window.location.search))
  try {
    await setupWorker(...api.handlers).start({
      onUnhandledRequest: 'bypass',
      quiet: true,
      serviceWorker: { url: `${import.meta.env.BASE_URL}mockServiceWorker.js` },
    })
    active = api
  } catch (error) {
    console.warn('Mock API unavailable; ranking and history will report errors.', error)
  }
  return active
}

export function getMockApi(): MockApi | null {
  return active
}
