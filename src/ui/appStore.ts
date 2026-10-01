import { create } from 'zustand'
import type { MatchOutcome } from '../game/bridge/mountGame'
import { configFingerprint } from '../game/config/gameConfig'
import type { GameConfig } from '../game/config/gameConfig'
import { browserStorage } from '../storage/localStore'
import { loadLastResult, loadView, saveLastResult, saveView } from '../storage/lastResult'
import type { MatchResult } from '../storage/lastResult'
import { gameConfigFor, loadOptions, saveOptions } from '../storage/options'
import type { PlayerOptions } from '../storage/options'
import { loadPlayerId, randomId } from '../storage/player'
import { readTestMode } from './testMode'
import type { TestMode } from './testMode'

export type Screen = 'menu' | 'options' | 'records' | 'game' | 'result'
export type RecordsTab = 'ranking' | 'history'

export interface MatchSetup {
  readonly matchId: string
  readonly seed: number
  readonly playerName: string
  readonly options: PlayerOptions
  readonly config: GameConfig
}

export interface AppState {
  readonly screen: Screen
  readonly options: PlayerOptions
  readonly playerId: string
  readonly lastResult: MatchResult | null
  readonly match: MatchSetup | null
  readonly recordsTab: RecordsTab

  /** Starts a new match with a snapshot of the current options. */
  play(): void
  openOptions(): void
  /** Opens the Captain's Log (ranking and match history) on the given tab. */
  openRecords(tab: RecordsTab): void
  /** Leaves any screen for the menu. From combat this abandons the match unrecorded. */
  goToMenu(): void
  saveOptions(options: PlayerOptions): boolean
  /**
   * Records the finished match as the last result and returns it, ready to register; the
   * result screen follows.
   */
  finishMatch(outcome: MatchOutcome, now?: Date): MatchResult | null
  showResult(): void
}

/**
 * The app's screen and session state. Play freezes the current options into the match setup
 * (brief §3: later option changes apply to the next match), with a new match id and seed.
 * Only the result screen survives a refresh; reloading mid-match abandons it unrecorded.
 */
export function createAppStore(storage: Storage | null = browserStorage(), testMode: TestMode = readTestMode()) {
  const lastResult = loadLastResult(storage)
  const initialScreen: Screen = loadView(storage) === 'result' && lastResult !== null ? 'result' : 'menu'

  return create<AppState>()((set, get) => {
    const go = (screen: Screen): void => {
      saveView(storage, screen === 'result' ? 'result' : 'menu')
      set({ screen })
    }

    return {
      screen: initialScreen,
      options: loadOptions(storage),
      playerId: loadPlayerId(storage),
      lastResult,
      match: null,
      recordsTab: 'ranking',

      play() {
        const options = get().options
        set({
          match: {
            matchId: randomId(),
            seed: testMode.matchSeed ?? randomSeed(),
            playerName: options.playerName,
            options,
            config: gameConfigFor(options),
          },
        })
        go('game')
      },

      openOptions() {
        go('options')
      },

      openRecords(tab) {
        set({ recordsTab: tab })
        go('records')
      },

      goToMenu() {
        set({ match: null })
        go('menu')
      },

      saveOptions(options) {
        set({ options })
        return saveOptions(storage, options)
      },

      finishMatch(outcome, now = new Date()) {
        const { match, playerId } = get()
        if (match === null) return null
        const result: MatchResult = {
          matchId: match.matchId,
          playerId,
          playerName: match.playerName,
          endedAt: now.toISOString(),
          score: outcome.score,
          durationSeconds: outcome.durationSeconds,
          endReason: outcome.endReason,
          config: {
            sessionSeconds: match.options.sessionSeconds,
            spawnIntervalSeconds: match.options.spawnIntervalSeconds,
            fingerprint: configFingerprint(match.config),
          },
        }
        saveLastResult(storage, result)
        set({ lastResult: result })
        return result
      },

      showResult() {
        if (get().lastResult === null) return
        set({ match: null })
        go('result')
      },
    }
  })
}

export const useAppStore = createAppStore()

function randomSeed(): number {
  return (Math.random() * 0x1_0000_0000) >>> 0
}
