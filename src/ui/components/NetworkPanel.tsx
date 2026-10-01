import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { getMockApi } from '../../mocks/browser'
import { DEFAULT_SCENARIO, SCENARIOS, SCENARIO_IDS, clearScenario, saveScenario } from '../../mocks/scenarios'
import type { ScenarioId } from '../../mocks/scenarios'
import { browserStorage } from '../../storage/localStore'

/**
 * Demo control for the simulated network (brief §6): pick a scenario, or restore the
 * initial state. Also selectable with `?scenario=<id>&seed=<n>` in the URL.
 */
export function NetworkPanel() {
  const queryClient = useQueryClient()
  const api = getMockApi()
  const [scenario, setScenario] = useState<ScenarioId>(api?.scenario.scenario ?? DEFAULT_SCENARIO.scenario)
  const [status, setStatus] = useState('')

  if (api === null) return null

  const refresh = (): void => void queryClient.invalidateQueries()

  return (
    <details className="network-panel">
      <summary>Simulated network</summary>
      <div className="form-field">
        <label htmlFor="network-scenario">Scenario</label>
        <select
          id="network-scenario"
          value={scenario}
          onChange={(event) => {
            const next = { scenario: event.target.value as ScenarioId, seed: api.scenario.seed }
            api.setScenario(next)
            saveScenario(browserStorage(), next)
            setScenario(next.scenario)
            setStatus(`Scenario: ${SCENARIOS[next.scenario]}.`)
            refresh()
          }}
        >
          {SCENARIO_IDS.map((id) => (
            <option key={id} value={id}>
              {SCENARIOS[id]}
            </option>
          ))}
        </select>
      </div>
      <button
        type="button"
        className="page-button"
        onClick={() => {
          api.reset(DEFAULT_SCENARIO)
          clearScenario(browserStorage())
          setScenario(DEFAULT_SCENARIO.scenario)
          setStatus('Mock data and scenario restored to their initial state.')
          refresh()
        }}
      >
        Restore initial state
      </button>
      <p role="status" className="form-hint">
        {status}
      </p>
    </details>
  )
}
