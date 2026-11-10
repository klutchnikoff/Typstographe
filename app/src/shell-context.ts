import * as Y from 'yjs'
import type { Editor } from '@tiptap/core'
import type { BandHost } from './band-layout'
import type { ObjectMenu } from './object-menu'
import type { CloseChoice } from './close-decision'
import type { Registry } from './commands'
import type { Preferences } from './preferences-panel'
import { preferencesWriter } from './preferences-writer'
import type { privateRecovery } from './private-recovery'
import type { Provider, Transport } from './provider'
import { recoveryError } from './recovery-errors'
import type { recoveryTransitions } from './recovery-transition'
import type { Catalogue } from './shell'

export interface ShellOptions {
  bands: BandHost
  objectMenu: ObjectMenu
  closeReferenceSelector: () => void
  editor: Editor
  provider: Provider
  transport: Transport
  catalogue: Catalogue
  commands: Registry
  save: (includeDocumentEdits?: boolean) => Promise<void>
  schedule: () => void
  refresh?: () => void
  message: (s: string, error?: boolean) => void
  isTauri: boolean
  hasRecovery?: boolean
  opened?: boolean
  filePath?: string | null
  initialPath?: string | null
  diagnostic: boolean
}

/** Mutable session state shared by the shell controllers, read at use time. */
export interface ShellState {
  /** A document is shown (rather than the welcome screen). */
  active: boolean
  /** The document has changes since it was last persisted to its file. */
  dirty: boolean
  path: string | null
  savedRevision: number
  /** The answer to the last close decision, consulted while switching documents. */
  disposition: CloseChoice | null
  preferences: Preferences
  recovery?: ReturnType<typeof privateRecovery>
  transitions?: Awaited<ReturnType<typeof recoveryTransitions>>
}

export interface ShellContext {
  options: ShellOptions
  editor: Editor
  provider: Provider
  transport: Transport
  catalogue: Catalogue
  commands: Registry
  settings: Y.Map<unknown>
  state: ShellState
  /** Runs a task and reports any synchronous or asynchronous failure. */
  guarded: (task: () => Promise<unknown> | void) => void
  reportError: (error: unknown) => void
  persistPreferences: (next?: Preferences) => Promise<void>
  switchDocument: <T>(task: (revision: number) => Promise<T>) => Promise<T>
}

export const defaultPreferences = (): Preferences => ({
  appearance: 'system',
  font: 'serif',
  size: 18,
  profile: {},
  signature: null,
  recent: [],
  personal: {},
  editor_fraction: 0.5,
  spelling_enabled: true,
})

export function guardedRunner(report: (error: unknown) => void) {
  return (task: () => Promise<unknown> | void) => {
    try {
      const result = task()
      if (result instanceof Promise) void result.catch(report)
    } catch (e) {
      report(e)
    }
  }
}

export async function createShellContext(options: ShellOptions): Promise<ShellContext> {
  const { editor, provider, transport, catalogue, commands } = options
  const state: ShellState = {
    active: !!(options.opened || options.diagnostic),
    dirty: !!provider.recoveredName,
    path: options.filePath || null,
    savedRevision: provider.revision,
    disposition: null,
    preferences: (await transport
      .invoke('preferences_load')
      .catch(() => defaultPreferences())) as Preferences,
  }
  const writePreferences = preferencesWriter(transport)
  const reportError = (error: unknown) => options.message(recoveryError(error), true)
  return {
    options,
    editor,
    provider,
    transport,
    catalogue,
    commands,
    settings: provider.doc.getMap('settings'),
    state,
    guarded: guardedRunner(reportError),
    reportError,
    async persistPreferences(next: Preferences = state.preferences) {
      // Other producers (width, recent projects, dictionary) must see the new settings
      // while their disk write is pending, rather than composing a stale snapshot.
      state.preferences = next
      await writePreferences(next)
    },
    switchDocument: <T>(task: (revision: number) => Promise<T>) =>
      state.transitions
        ? state.transitions.run(task, state.disposition === 'discard')
        : task(provider.revision),
  }
}
