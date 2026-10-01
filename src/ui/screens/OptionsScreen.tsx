import { useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { SESSION_SECONDS_LIMITS, SPAWN_INTERVAL_LIMITS } from '../../game/config/limits'
import { DEFAULT_OPTIONS, PLAYER_NAME_MAX, optionsSchema } from '../../storage/options'
import type { PlayerOptions } from '../../storage/options'
import { useAppStore } from '../appStore'
import { MenuButton } from '../components/MenuButton'
import { useFocusOnMount } from '../useFocusOnMount'

type Field = keyof PlayerOptions
type Draft = Record<Field, string>
type Errors = Partial<Record<Field, string>>

const FIELD_ORDER: readonly Field[] = ['playerName', 'sessionSeconds', 'spawnIntervalSeconds']

function toDraft(options: PlayerOptions): Draft {
  return {
    playerName: options.playerName,
    sessionSeconds: String(options.sessionSeconds),
    spawnIntervalSeconds: String(options.spawnIntervalSeconds),
  }
}

/** Empty or non-numeric text becomes NaN, which the schema reports as "Enter a number". */
function toNumber(text: string): number {
  return text.trim() === '' ? Number.NaN : Number(text)
}

export function OptionsScreen() {
  const saved = useAppStore((s) => s.options)
  const saveOptions = useAppStore((s) => s.saveOptions)
  const goToMenu = useAppStore((s) => s.goToMenu)
  const heading = useFocusOnMount<HTMLHeadingElement>()

  const [draft, setDraft] = useState<Draft>(() => toDraft(saved))
  const [errors, setErrors] = useState<Errors>({})
  const [status, setStatus] = useState('')
  const inputs = useRef<Partial<Record<Field, HTMLInputElement | null>>>({})

  const update = (field: Field, value: string): void => {
    setDraft((current) => ({ ...current, [field]: value }))
    setStatus('')
  }

  const submit = (event: FormEvent): void => {
    event.preventDefault()
    const parsed = optionsSchema.safeParse({
      playerName: draft.playerName,
      sessionSeconds: toNumber(draft.sessionSeconds),
      spawnIntervalSeconds: toNumber(draft.spawnIntervalSeconds),
    })
    if (!parsed.success) {
      const found: Errors = {}
      for (const issue of parsed.error.issues) {
        const field = issue.path[0] as Field
        found[field] ??= issue.message
      }
      setErrors(found)
      setStatus('')
      const first = FIELD_ORDER.find((field) => found[field] !== undefined)
      if (first !== undefined) inputs.current[first]?.focus()
      return
    }
    setErrors({})
    setDraft(toDraft(parsed.data))
    setStatus(saveOptions(parsed.data) ? 'Options saved.' : 'Options applied, but this browser could not store them.')
  }

  const field = (
    id: Field,
    label: string,
    hint: string,
    props: { type: 'text' | 'number'; min?: number; max?: number; step?: number },
  ) => {
    const error = errors[id]
    return (
      <div className="form-field">
        <label htmlFor={id}>{label}</label>
        <input
          id={id}
          name={id}
          ref={(el) => {
            inputs.current[id] = el
          }}
          value={draft[id]}
          onChange={(event) => update(id, event.target.value)}
          aria-invalid={error !== undefined}
          aria-describedby={`${id}-hint${error !== undefined ? ` ${id}-error` : ''}`}
          inputMode={props.type === 'number' ? 'decimal' : undefined}
          {...props}
        />
        <p id={`${id}-hint`} className="form-hint">
          {hint}
        </p>
        {error !== undefined && (
          <p id={`${id}-error`} className="form-error">
            {error}
          </p>
        )}
      </div>
    )
  }

  const errorCount = Object.keys(errors).length

  return (
    <main className="menu-screen">
      <section className="panel options-panel" aria-labelledby="options-title">
        <h1 id="options-title" ref={heading} tabIndex={-1} className="panel-title">
          Options
        </h1>
        <form noValidate onSubmit={submit}>
          {errorCount > 0 && (
            <p role="alert" className="form-summary">
              {errorCount === 1 ? 'One field needs attention.' : `${errorCount} fields need attention.`}
            </p>
          )}
          {field('playerName', 'Player name', `Shown in the ranking. Up to ${PLAYER_NAME_MAX} characters.`, {
            type: 'text',
          })}
          {field(
            'sessionSeconds',
            'Game session time (seconds)',
            `Whole seconds from ${SESSION_SECONDS_LIMITS.min} to ${SESSION_SECONDS_LIMITS.max}.`,
            { type: 'number', min: SESSION_SECONDS_LIMITS.min, max: SESSION_SECONDS_LIMITS.max, step: 1 },
          )}
          {field(
            'spawnIntervalSeconds',
            'Enemy spawn time (seconds)',
            `Seconds between enemy spawns, from ${SPAWN_INTERVAL_LIMITS.min} to ${SPAWN_INTERVAL_LIMITS.max}.`,
            { type: 'number', min: SPAWN_INTERVAL_LIMITS.min, max: SPAWN_INTERVAL_LIMITS.max, step: 0.5 },
          )}
          <p role="status" className="form-status">
            {status}
          </p>
          <div className="form-actions">
            <MenuButton type="submit">Save</MenuButton>
            <MenuButton
              variant="secondary"
              onClick={() => {
                setDraft(toDraft(DEFAULT_OPTIONS))
                setErrors({})
                setStatus('Defaults restored. Save to keep them.')
              }}
            >
              Defaults
            </MenuButton>
            <MenuButton variant="secondary" sound="ui_back" onClick={goToMenu}>
              Back
            </MenuButton>
          </div>
        </form>
        <p className="form-note">Changes apply to the next match.</p>
      </section>
    </main>
  )
}
