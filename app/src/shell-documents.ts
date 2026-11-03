import * as Y from 'yjs'
import type { Editor } from '@tiptap/core'
import { decideClose } from './close-decision'
import { historyFor } from './editing-history'
import { tr } from './i18n'
import { newDocumentDialog, newDocumentMetadata } from './new-document-dialog'
import { privateDrafts } from './private-drafts'
import { initialResources } from './metadata-resource'
import type { Provider, Resource } from './provider'
import { documentContent } from './shared-inline-marks'
import type { DocumentType, Model } from './shell'
import type { ShellCommands } from './shell-commands'
import type { ShellContext } from './shell-context'
import { byId, type ShellLayout } from './shell-layout'
import type { ShellMetadata } from './shell-metadata'
import type { SidePanels } from './shell-panels'
import { withCurrentSnapshot } from './snapshot-operation'
import { setDocument, settingsFor, type Settings } from './state'
import { versionsAPI } from './versions-api'
import { versionsPanel } from './versions-panel'

/** The name shown for a document: its file stem, its recovered name, or a placeholder. */
export function documentTitle(path: string | null, recoveredName?: string | null) {
  return (
    path
      ?.split(/[\\/]/)
      .at(-1)
      ?.replace(/\.typsto$/, '') ||
    recoveredName?.replace(/\.typsto$/, '') ||
    tr('Sans titre')
  )
}

/** Inputs not yet folded into the document, which closing would otherwise discard. */
export function pendingInputs(provider: Provider) {
  return (
    provider.recoveredItems.length +
    privateDrafts(provider)
      .snapshot()
      .filter((form) => !form.sourceId).length +
    ((provider.documentEdits?.draft?.() as unknown[] | undefined)?.length || 0) +
    (provider.rejected ? 1 : 0)
  )
}

export type ShellDocuments = ReturnType<typeof shellDocuments>

/** Document lifecycle: create, open, save, export, close, title and dirty state. */
export function shellDocuments(
  ctx: ShellContext,
  layout: ShellLayout,
  panels: SidePanels,
  metadata: ShellMetadata,
) {
  const { editor, provider, transport, catalogue, state, options } = ctx

  function updateTitle() {
    const title = documentTitle(state.path, provider.recoveredName)
    if (options.isTauri)
      void transport.invoke('set_window_title', {
        title: state.active ? `${title}${state.dirty ? ' *' : ''}` : 'typstOgraphe',
      })
    layout.header.dataset.document = title
  }
  function setActive(value: boolean) {
    panels.dismissVersions()
    state.active = value
    byId('synchronization').hidden = !value
    layout.welcome.hidden = value
    layout.workspace.hidden = !value
    if (value) layout.brand.finish()
    else layout.brand.play()
    if (value) {
      editor.commands.focus()
      options.schedule()
    }
    updateTitle()
    document.dispatchEvent(new Event('commands:refresh'))
  }
  /** Asks what to do with unsaved work, records the answer, then runs `next`. */
  function confirmDiscard(next: () => void, quitting = false) {
    ctx.guarded(async () => {
      const choice = await decideClose({
        dirty: state.active && (state.dirty || metadata.editor.dirty()),
        pending: state.active ? pendingInputs(provider) : 0,
        otherWindows: quitting
          ? Math.max(0, (provider.synchronization?.windows.length || 1) - 1)
          : 0,
        save: () => saveFile(),
        keep: async () => {
          await state.recovery?.force()
        },
        discard: async () => {},
      })
      if (!choice) return
      state.disposition = choice
      if (choice !== 'discard') await state.recovery?.force()
      next()
    })
  }
  async function saveFile(as = false) {
    await state.recovery?.flush()
    await provider.flush(false)
    if (!options.isTauri) {
      await options.save(false)
      state.dirty = false
      return true
    }
    const destination =
      as || !state.path
        ? await transport.invoke<string | null>('choose_file', {
            save: true,
            defaultName: provider.recoveredName
              ? `${provider.recoveredName.replace(/\.typsto$/, '')} — ${tr('récupéré')}.typsto`
              : null,
          })
        : state.path
    if (!destination) return false
    const persistedRevision = await withCurrentSnapshot(
      provider,
      () => ({
        snapshot: {
          revision: provider.revision,
          document: documentContent(editor.getJSON()),
          settings: settingsFor(provider),
        },
        update: Array.from(Y.encodeStateAsUpdate(provider.doc)),
      }),
      async (checkpoint) => {
        await transport.invoke('save_file', { path: destination, ...checkpoint })
        return checkpoint.snapshot.revision
      },
      false,
    )
    state.path = destination
    state.savedRevision = persistedRevision
    await remember(destination)
    state.dirty = provider.revision !== persistedRevision
    provider.recoveredName = null
    document.querySelector('.recovered-document-line')?.remove()
    updateTitle()
    options.message(tr('Document enregistré.'))
    return true
  }
  async function remember(file: string) {
    const { preferences } = state
    preferences.recent = [file, ...preferences.recent.filter((p) => p !== file)].slice(0, 12)
    await ctx.persistPreferences()
  }
  async function open(file?: string) {
    const selected = file || (await transport.invoke<string | null>('choose_file', { save: false }))
    if (!selected) return
    await state.recovery?.flush()
    await provider.flush(false)
    const opened = await ctx.switchDocument((revision) =>
      transport.invoke<{
        document: unknown
        settings: Settings
        resources: Resource[]
      }>('open_file', { path: selected, revision }),
    )
    if (options.isTauri || provider.nativeEditing) {
      await remember(selected)
      return
    }
    for (const resource of opened.resources) provider.addResource(resource)
    provider.doc.transact(() => {
      setDocument(provider, opened.settings)
      editor.commands.setContent(opened.document as Parameters<Editor['commands']['setContent']>[0])
    })
    state.path = selected
    state.dirty = false
    setActive(true)
    await remember(selected)
    historyFor(editor)?.clear()
    metadata.render()
  }
  function createDocument(t: DocumentType, m: Model) {
    const { preferences } = state
    const documentMetadata = newDocumentMetadata(t, preferences.profile)
    const resources = initialResources(t.fields, documentMetadata.fields, preferences.signature)
    if (options.isTauri || provider.nativeEditing) {
      ctx.guarded(async () => {
        await provider.flush(false)
        await state.recovery?.force()
        layout.overlay.close()
        await ctx.switchDocument((revision) =>
          transport.invoke('new_document', {
            settings: {
              metadata: documentMetadata,
              template: m.source,
              modelManifest: m.manifest,
              modelId: m.id,
            },
            resources,
            revision,
          }),
        )
      })
      return
    }
    provider.doc.transact(() => {
      setDocument(provider, {
        metadata: documentMetadata,
        template: m.source,
        modelManifest: m.manifest,
        modelId: m.id,
      })
      editor.commands.clearContent()
    })
    for (const resource of resources) provider.addResource(resource)
    state.path = null
    state.dirty = false
    historyFor(editor)?.clear()
    layout.overlay.close()
    setActive(true)
    metadata.render()
  }
  const thumbnails = new Map<string, Promise<string>>()
  const create = () =>
    newDocumentDialog(
      layout.overlay,
      catalogue,
      createDocument,
      (model) => {
        let preview = thumbnails.get(model.id)
        if (!preview) {
          preview = transport.invoke<string>('model_thumbnail', { modelId: model.id })
          thumbnails.set(model.id, preview)
          void preview.catch(() => thumbnails.delete(model.id))
        }
        return preview
      },
      () => (state.active ? editor.view.dom : byId('create-document')),
    )
  const openChosen = () => confirmDiscard(() => ctx.guarded(() => open()))
  const createChosen = () => confirmDiscard(create)

  /** Records a save made elsewhere (version, native editing) as the persisted revision. */
  function saved(result: { path: string; revision: number }) {
    state.path = result.path
    state.savedRevision = result.revision
    state.dirty = provider.revision !== result.revision
  }

  function register({ add }: ShellCommands) {
    add('document.new', tr('Nouveau document'), createChosen, 'Mod+N')
    add('document.open', tr('Ouvrir…'), openChosen, 'Mod+O')
    add('document.save', tr('Enregistrer'), () => ctx.guarded(() => saveFile()), 'Mod+S')
    add(
      'document.save_as',
      tr('Enregistrer sous…'),
      () => ctx.guarded(() => saveFile(true)),
      'Mod+Shift+S',
    )
    add('document.close', tr('Fermer le document'), () =>
      confirmDiscard(() => {
        if (options.isTauri || provider.nativeEditing) {
          ctx.guarded(async () => {
            await ctx.switchDocument((revision) => transport.invoke('close_document', { revision }))
          })
          return
        }
        setActive(false)
        state.dirty = false
      }),
    )
    if (options.isTauri)
      add(
        'app.quit',
        tr('Quitter'),
        () =>
          confirmDiscard(
            () =>
              ctx.guarded(async () => {
                await ctx.switchDocument(async () => {
                  if (state.disposition === 'discard')
                    await transport.invoke('work_abandon', { generation: provider.generation })
                  await transport.invoke('quit_app')
                })
              }),
            true,
          ),
        'Mod+Q',
      )
    add(
      'document.export',
      tr('Exporter'),
      () =>
        ctx.guarded(async () => {
          await provider.flush()
          const folder = options.isTauri
            ? await transport.invoke<string | null>('choose_export_folder')
            : undefined
          if (options.isTauri && !folder) return
          const destination = await withCurrentSnapshot(
            provider,
            () => ({
              revision: provider.revision,
              document: documentContent(editor.getJSON()),
              settings: settingsFor(provider),
            }),
            (snapshot) =>
              transport.invoke<string>('export_document', { destination: folder, snapshot }),
          )
          options.message(`PDF et sources Typst exportés · ${destination}`)
        }),
      'Mod+E',
    )
    provider.onSaved = (result) => {
      if (result.document !== provider.generation || result.revision < state.savedRevision) return
      const duplicate =
        state.path === result.path && state.savedRevision === result.revision && !state.dirty
      saved(result)
      updateTitle()
      if (!duplicate) {
        void remember(result.path).catch(ctx.reportError)
        if (result.warning) options.message(result.warning, true)
        else options.message(tr('Document enregistré.'))
      }
      panels.refreshVersions()
    }
    add('ui.versions', tr('Versions'), () => {
      const api = versionsAPI({
        creator: state.preferences.profile['sender.name'] || null,
        provider,
        transport,
        destination: async () =>
          state.path ? undefined : transport.invoke<string | null>('choose_file', { save: true }),
        saved: async (result) => {
          saved(result)
          provider.recoveredName = null
          updateTitle()
          try {
            await remember(result.path)
          } catch (error) {
            ctx.reportError(error)
            return
          }
          if (result.warning) options.message(result.warning, true)
          else options.message(tr('Versions enregistrées.'))
        },
      })
      panels.adoptVersions(
        versionsPanel(panels.show(tr('Versions'), 'ui.versions'), api, catalogue, ctx.reportError),
      )
    })
    void transport.listen<{ document: string; path: string; revision: number }>(
      'web-editor:versions',
      (event) => {
        if (event.document !== provider.generation) return
        saved(event)
        updateTitle()
        panels.refreshVersions()
      },
    )
  }

  /** Marks the document dirty and schedules recovery and preview on every change. */
  function observeChanges() {
    const scheduleRecovery = () => state.recovery?.changed()
    let metadataRefreshQueued = false
    document.addEventListener('metadata:draft', () => {
      scheduleRecovery()
      if (metadata.editor.dirty()) {
        state.dirty = true
        updateTitle()
      }
    })
    ctx.settings.observeDeep(() => {
      state.dirty = true
      scheduleRecovery()
      if (!metadataRefreshQueued) {
        metadataRefreshQueued = true
        queueMicrotask(() => {
          metadataRefreshQueued = false
          metadata.render()
        })
      }
      updateTitle()
      options.schedule()
    })
    editor.on('update', () => {
      scheduleRecovery()
      state.dirty = true
      updateTitle()
    })
  }

  return {
    updateTitle,
    setActive,
    confirmDiscard,
    open,
    register,
    observeChanges,
    /** Welcome screen buttons share the File menu commands. */
    bindWelcome() {
      byId('create-document').onclick = createChosen
      byId('open-document').onclick = openChosen
    },
  }
}
