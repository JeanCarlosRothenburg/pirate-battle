import { QueryClientProvider } from '@tanstack/react-query'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { createQueryClient } from './api/queries'
import { startMockApi } from './mocks/browser'
import { App } from './ui/App'
import './ui/styles.css'

/**
 * Starts the mock API, then renders the app. The mocks must listen before the first request;
 * if they fail to start, the app still renders and only the record panels report errors.
 */
async function bootstrap(container: HTMLElement): Promise<void> {
  await startMockApi().catch(() => null)
  createRoot(container).render(
    <StrictMode>
      <QueryClientProvider client={createQueryClient()}>
        <App />
      </QueryClientProvider>
    </StrictMode>,
  )
}

const root = document.getElementById('root')
if (root === null) throw new Error('Missing #root element')
void bootstrap(root)
