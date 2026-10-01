import { QueryClientProvider } from '@tanstack/react-query'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { createQueryClient } from './api/queries'
import { startMockApi } from './mocks/browser'
import { App } from './ui/App'
import './ui/styles.css'

const container = document.getElementById('root')
if (container === null) throw new Error('Missing #root element')

const queryClient = createQueryClient()

// The mock API must be listening before the first request; the game itself never waits on
// it, and a failure to start leaves the record panels in their error state.
void startMockApi().finally(() => {
  createRoot(container).render(
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    </StrictMode>,
  )
})
