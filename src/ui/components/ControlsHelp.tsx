const CONTROLS: readonly (readonly [string, string])[] = [
  ['Mouse', 'Steer toward the pointer'],
  ['W / ↑', 'Sail forward'],
  ['A / D, ← / →', 'Turn (overrides the mouse)'],
  ['Space', 'Bow gun'],
  ['Q / E', 'Port / starboard broadside'],
  ['P / Esc', 'Pause'],
  ['M', 'Mute'],
  ['Touch', 'Buttons on screen; drag on the sea to steer. Play in landscape.'],
]

interface ControlsHelpProps {
  readonly headingLevel?: 2 | 3
  /** Keep the heading for screen readers only, when a visible label already exists. */
  readonly headingHidden?: boolean
}

export function ControlsHelp({ headingLevel = 2, headingHidden = false }: ControlsHelpProps) {
  const Heading = headingLevel === 2 ? 'h2' : 'h3'
  return (
    <section className="controls-help" aria-labelledby="controls-heading">
      <Heading id="controls-heading" className={headingHidden ? 'visually-hidden' : 'panel-heading'}>
        Controls
      </Heading>
      <dl>
        {CONTROLS.map(([keys, action]) => (
          <div key={keys} className="controls-row">
            <dt>{keys}</dt>
            <dd>{action}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}
