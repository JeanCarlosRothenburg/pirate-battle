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

export type Screen = 'menu' | 'options' | 'records' | 'game' | 'result'
export type RecordsTab = 'ranking' | 'history'

/** Everything a match froze when it started (brief §3: later option changes do not apply). */
export interface MatchSetup {
  readonly matchId: string
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
  /** Which tab the Captain's Log opens on. */
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

export function createAppStore(storage: Storage | null = browserStorage()) {
  const lastResult = loadLastResult(storage)
  const initialScreen: Screen = loadView(storage) === 'result' && lastResult !== null ? 'result' : 'menu'

  return create<AppState>()((set, get) => {
    const go = (screen: Screen): void => {
      // Only the result screen survives a refresh; reloading mid-match abandons it.
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
