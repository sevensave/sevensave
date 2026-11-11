import { create } from 'zustand'
import type { LauncherState } from '../../preload/api'

interface UiState {
  launcher: LauncherState | null
  /** id выбранной игры или 'settings'. */
  view: string | null
  select(view: string): void
}

export const useUi = create<UiState>((set) => ({
  launcher: null,
  view: null,
  select: (view) => set({ view }),
}))

export function connect() {
  const apply = (s: LauncherState) =>
    useUi.setState((u) => ({ launcher: s, view: u.view ?? s.games[0]?.id ?? 'settings' }))
  void window.sevensave.state().then(apply)
  window.sevensave.onState(apply)
}
