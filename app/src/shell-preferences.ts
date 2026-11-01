import { tr } from './i18n'
import { preferencesPanel } from './preferences-panel'
import type { ShellContext } from './shell-context'
import type { SidePanels } from './shell-panels'

export const editorFont = (font: string) =>
  font === 'sans' ? 'Inter' : font === 'mono' ? 'monospace' : 'Georgia'

export type ShellPreferences = ReturnType<typeof shellPreferences>

/** Applies, edits and persists the user preferences held in the shell state. */
export function shellPreferences(ctx: ShellContext, panels: SidePanels) {
  const { state, provider, options } = ctx
  function apply() {
    const { preferences } = state
    panels.railMode.update(preferences.sidebar_expanded !== false, preferences.sidebar_width ?? 320)
    document.dispatchEvent(
      new CustomEvent('editor:resize', { detail: (preferences.editor_fraction ?? 0.5) * 100 }),
    )
    document.dispatchEvent(new Event('proofing:changed'))
    if (!options.diagnostic)
      provider.presence.setUser({
        name: preferences.profile['sender.name'] || tr('Vous'),
        color: '#286b91',
      })
    document.documentElement.dataset.appearance = preferences.appearance
    document.documentElement.style.setProperty('--editor-font', editorFont(preferences.font))
    document.documentElement.style.setProperty('--editor-size', `${preferences.size}px`)
  }
  return {
    apply,
    show() {
      preferencesPanel(
        panels.show(tr('Préférences'), 'ui.preferences'),
        ctx.catalogue,
        state.preferences,
        ctx.transport,
        async (next) => {
          await ctx.persistPreferences({ ...state.preferences, ...next })
          apply()
          options.message(
            tr('Préférences enregistrées. Les documents existants conservent leurs données.'),
          )
        },
        ctx.reportError,
      )
    },
    toggleSidebarLabels() {
      ctx.guarded(async () => {
        state.preferences.sidebar_expanded = state.preferences.sidebar_expanded === false
        panels.railMode.update(
          state.preferences.sidebar_expanded,
          state.preferences.sidebar_width ?? 320,
        )
        await ctx.persistPreferences()
      })
    },
    toggleSpelling() {
      ctx.guarded(async () => {
        state.preferences.spelling_enabled = state.preferences.spelling_enabled === false
        await ctx.persistPreferences()
        apply()
      })
    },
    /** Persists the editor/preview split chosen with the resizable separator. */
    trackEditorWidth() {
      document.addEventListener('editor:width', (event) => {
        const fraction = (event as CustomEvent<number>).detail / 100
        if (state.preferences.editor_fraction === fraction) return
        state.preferences.editor_fraction = fraction
        ctx.guarded(() => ctx.persistPreferences())
      })
    },
    proofing: () => ({
      personal: state.preferences.personal || {},
      spelling_enabled: state.preferences.spelling_enabled !== false,
    }),
    async addPersonalWord(word: string, language: string) {
      state.preferences.personal ||= {}
      state.preferences.personal[language] = [
        ...new Set([...(state.preferences.personal[language] || []), word]),
      ]
      await ctx.persistPreferences()
    },
  }
}
