import { mountAssistance } from './assistance'
import { mountCommandSurfaces } from './command-surfaces'
import type { Capability } from './commands'
import type { StructuredMetadata } from './metadata-records'
import { mountProofing } from './proofing'
import { registerInterfaceCommands, shellCommands } from './shell-commands'
import { createShellContext, type ShellOptions } from './shell-context'
import { shellDocuments } from './shell-documents'
import { mountShellLayout } from './shell-layout'
import {
  appendMenuCommands,
  installShortcuts,
  mountRailButtons,
  mountToolMenus,
} from './shell-menus'
import { shellMetadata } from './shell-metadata'
import { sidePanels } from './shell-panels'
import { shellPreferences } from './shell-preferences'
import { shellRecovered } from './shell-recovered'
import { shellRecovery } from './shell-recovery'
import { mountWindowEvents } from './shell-window'
import type { Settings } from './state'
export interface ModelPolicy {
  outline: boolean
  citation_styles: string[]
}
export interface Model {
  id: string
  label: string
  description: string
  source: string
  fixedPage: { paper: string; landscape: boolean } | null
  policy?: ModelPolicy
}
export interface Field {
  field: string
  parameter: string
  label: string
  value: unknown
  group: string
  multiline: boolean
  kind: string
  required_for_export: boolean
}
export interface MetadataGroup {
  id: string
  label: string
  sections: {
    id: string
    label: string
    fields: string[]
    layout?: 'editorial' | 'compact' | 'inline'
  }[]
}
export interface DocumentType {
  structured?: StructuredMetadata | null
  capabilities: string[]
  id: string
  label: string
  canCreate: boolean
  settingsHeading: string
  metadata: Settings['metadata']
  fields: Field[]
  groups: MetadataGroup[]
  models: Model[]
}
export interface Catalogue {
  messages: Record<string, string>
  locale: string
  types: DocumentType[]
  entries: Capability[]
  papers: { value: string; label: string }[]
  languages: { value: string; label: string }[]
}

/**
 * Composes the application shell around the editor. Each area lives in its own
 * controller sharing `ShellContext.state`; the steps below keep their original order
 * because command registration, DOM insertion and listeners are order-sensitive.
 */
export async function mountShell(s: ShellOptions) {
  const ctx = await createShellContext(s)
  const { editor, provider, transport, catalogue, commands, state } = ctx
  const layout = mountShellLayout({
    active: state.active,
    diagnostic: s.diagnostic,
    isTauri: s.isTauri,
  })
  const panels = sidePanels(ctx, layout)
  const metadata = shellMetadata(ctx, layout.context)
  const registrar = shellCommands(commands, () => state.active)
  const documents = shellDocuments(ctx, layout, panels, metadata)
  documents.register(registrar)
  const preferences = shellPreferences(ctx, panels)
  registerInterfaceCommands(ctx, registrar, panels, preferences, metadata)

  const commandSurfaces = mountCommandSurfaces({
    editor,
    commands,
    capabilities: catalogue.entries,
    requiresDocument: registrar.requiresDocument,
    active: () => state.active,
    native: s.isTauri ? transport : undefined,
    onError: ctx.reportError,
  })
  window.addEventListener('pagehide', () => commandSurfaces.destroy(), { once: true })
  mountToolMenus(layout.menu, commands)
  mountRailButtons(layout.side, commands)
  installShortcuts(commands)

  documents.bindWelcome()
  const recovery = shellRecovery(ctx, layout.welcome, panels, documents)
  recovery.registerList(registrar)
  const recovered = shellRecovered(ctx, layout.side, panels, metadata)
  recovered.register(registrar)
  recovered.noticeRecoveredDocument(layout.context)
  recovery.registerImport(registrar)
  appendMenuCommands(layout.menu, commands, ['recovery.list', 'recovery.import'])
  recovery.mountImportButton()
  await recovery.start()
  recovered.track()
  await recovery.refresh()
  if (provider.recoveredItems.length) recovered.show()

  documents.observeChanges()
  await mountWindowEvents(ctx, documents)
  preferences.apply()
  if (s.initialPath) ctx.guarded(() => documents.open(s.initialPath!))
  mountAssistance(provider, transport, editor, panels.show, s.message, s.isTauri)
  layout.side.append(panels.railMode.control)
  mountProofing(
    editor,
    s.bands,
    provider,
    transport,
    preferences.proofing,
    preferences.addPersonalWord,
    s.message,
  )
  metadata.render()
  documents.setActive(state.active)
}
