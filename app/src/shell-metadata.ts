import { bibliographyPanel } from './bibliography-panel'
import { documentOptions } from './document-options'
import { tr } from './i18n'
import { actionRow, keyboardScope, navigationGroup } from './keyboard-navigation'
import { metadataCollections } from './metadata-collections'
import { metadataCommands } from './metadata-commands'
import {
  destroyMetadataFields,
  metadataFields,
  metadataSection,
  refreshMetadataFields,
} from './metadata-fields'
import type { RecoveredItem } from './recovered-work'
import { prepareImage, resourceCommand } from './resource-commands'
import type { ModelPolicy } from './shell'
import type { ShellContext } from './shell-context'
import { byId } from './shell-layout'
import { documentType, settingsFor, type Settings } from './state'

interface RecordPanel {
  refresh: () => void
  destroy: () => void
  resume?: (item: RecoveredItem) => boolean
}

export type ShellMetadata = ReturnType<typeof shellMetadata>

/**
 * The document settings band: one tab for general options, one per metadata group,
 * structured record collection or bibliography of the current document type.
 */
export function shellMetadata(ctx: ShellContext, context: HTMLElement) {
  const { editor, provider, transport, catalogue, settings } = ctx
  let tab: string | null = null
  let generalOptions: ReturnType<typeof documentOptions> | undefined
  let recordPanel: RecordPanel | undefined
  const metadataEditor = metadataCommands(editor, provider)
  const policies = new Map<string, ModelPolicy>(),
    loadingPolicies = new Set<string>()
  const currentPolicy = (): ModelPolicy | undefined => {
    const current = settingsFor(provider),
      kind = documentType(provider)
    const bundled = kind.models.find(
      (model) => model.id === current.modelId && model.source === current.template,
    )
    if (bundled?.policy) return bundled.policy
    if (!policies.has(current.template) && !loadingPolicies.has(current.template)) {
      loadingPolicies.add(current.template)
      void transport
        .invoke<ModelPolicy>('model_policy', { template: current.template })
        .then((policy) => {
          policies.set(current.template, policy)
          render()
        })
        .catch(() => {})
    }
    return policies.get(current.template)
  }

  function render() {
    if (!settings.has('document')) return
    const kind = documentType(provider),
      current = settingsFor(provider)
    // Native text services and accessibility follow the document language;
    // menus and other interface controls keep the Fluent language on <html>.
    editor.view.dom.lang = String(current.metadata.fields.options.language)
    if (tab !== 'general' && !kind.groups.some((group) => group.id === tab)) tab = null
    byId('document-type-label').textContent = kind.settingsHeading
    const tabs = byId('metadata-tabs')
    const groups = [{ id: 'general', label: tr('Général') }, ...kind.groups]
    if (
      tabs.children.length !== groups.length ||
      groups.some((group, index) => tabs.children[index]?.id !== `metadata-tab-${group.id}`)
    )
      tabs.replaceChildren()
    for (const group of groups) {
      const button =
        tabs.querySelector<HTMLButtonElement>(`#metadata-tab-${group.id}`) ||
        document.createElement('button')
      button.textContent = group.label
      button.id = `metadata-tab-${group.id}`
      button.setAttribute('aria-pressed', String(tab === group.id))
      button.onclick = () => {
        tab = tab === group.id ? null : group.id
        render()
      }
      if (!button.parentElement) tabs.append(button)
    }
    const content = byId('metadata-content')
    content.hidden = tab === null
    const identity = String(settings.get('identity') || '')
    const samePanel =
      content.dataset.documentType === kind.id &&
      content.dataset.tab === tab &&
      content.dataset.identity === identity
    if (samePanel && tab === 'general' && generalOptions) {
      generalOptions.update(current)
      return
    }
    if (samePanel && recordPanel) {
      recordPanel.refresh()
      return
    }
    if (samePanel && content.contains(document.activeElement)) {
      refreshMetadataFields(content, current.metadata.fields)
      return
    }
    generalOptions?.destroy()
    generalOptions = undefined
    recordPanel?.destroy()
    recordPanel = undefined
    destroyMetadataFields(content)
    content.dataset.identity = identity
    content.dataset.documentType = kind.id
    content.dataset.tab = tab || ''
    content.replaceChildren()
    if (!tab) return
    if (tab === 'general') {
      generalOptions = documentOptions(
        content,
        kind,
        catalogue,
        current,
        { commands: metadataEditor, read: () => settingsFor(provider) },
        currentPolicy,
      )
    } else if (kind.structured?.bibliography?.tab === tab) {
      recordPanel = bibliographyPanel(content, provider, editor, transport, kind, currentPolicy)
    } else if (kind.structured?.panels?.some((panel) => panel.id === tab)) {
      recordPanel = metadataCollections(
        content,
        provider,
        kind.structured,
        kind.structured.panels.find((panel) => panel.id === tab)!,
        catalogue,
        editor,
        () =>
          String(
            settings.get('options.language') ??
              (settings.get('document') as Settings).metadata.fields.options.language,
          ),
      )
    } else {
      const group = kind.groups.find((group) => group.id === tab)
      if (group)
        metadataFields(
          content,
          group,
          kind.fields,
          current.metadata.fields,
          (field, value) =>
            metadataEditor.set(
              { kind: 'metadata', field },
              value,
              () =>
                settingsFor(provider).metadata.fields[
                  kind.fields.find((item) => item.field === field)!.parameter
                ],
            ),
          {
            commands: metadataEditor,
            read: (field) => settingsFor(provider).metadata.fields[field.parameter],
          },
        )
    }
    if (tab === 'sender') content.append(signatureSection(ctx, metadataEditor))
  }

  keyboardScope(context, {
    close: () => {
      const previous = tab
      tab = null
      render()
      document.getElementById(`metadata-tab-${previous}`)?.focus()
    },
    active: () => tab !== null,
    priority: 5,
    tab: true,
  })
  navigationGroup(byId('metadata-tabs'), {
    axis: 'horizontal',
    roving: true,
    activateOnMove: true,
  })

  return {
    /** Metadata edits go through the document command pipeline and its draft tracking. */
    editor: metadataEditor,
    render,
    get tab() {
      return tab
    },
    /** Selects a tab without rendering; callers render once their own checks pass. */
    set tab(next: string | null) {
      tab = next
    },
    /** Toggles the general settings tab (`ui.information`). */
    toggleInformation() {
      tab = tab ? null : 'general'
      render()
    },
    /** Hands a recovered form to the record panel currently shown, if it accepts it. */
    resumeRecord: (item: RecoveredItem) => recordPanel?.resume?.(item) || false,
  }
}

/** The signature controls of the sender tab, applied through the metadata commands. */
function signatureSection(ctx: ShellContext, metadataEditor: ReturnType<typeof metadataCommands>) {
  const { provider, transport, state } = ctx
  const actions = actionRow()
  for (const [label, useDefault] of [
    [tr('Sans signature'), false],
    [tr('Signature des préférences'), true],
  ] as const) {
    const button = document.createElement('button')
    button.textContent = label
    button.onclick = () => {
      const { preferences } = state
      const value = useDefault ? preferences.signature?.path || null : null
      const before = settingsFor(provider).metadata.fields.signature
      ctx.guarded(() =>
        metadataEditor.run(
          [
            ...(value && preferences.signature ? [resourceCommand(preferences.signature)] : []),
            { id: 'document.set_signature', params: { path: value } },
          ],
          () => settingsFor(provider).metadata.fields.signature === before,
        ),
      )
    }
    actions.append(button)
  }
  const image = document.createElement('input')
  image.type = 'file'
  image.accept = 'image/png,image/jpeg,image/svg+xml'
  image.setAttribute('aria-label', tr('Signature du document'))
  image.onchange = () =>
    ctx.guarded(async () => {
      const file = image.files?.[0]
      if (!file) return
      const before = settingsFor(provider).metadata.fields.signature
      const resource = await prepareImage(provider, transport, file)
      await metadataEditor.run(
        [
          resourceCommand(resource),
          { id: 'document.set_signature', params: { path: resource.path } },
        ],
        () => settingsFor(provider).metadata.fields.signature === before,
      )
      image.value = ''
    })
  const signature = metadataSection({
    id: 'signature',
    label: tr('Signature du document'),
    layout: 'editorial',
  })
  signature.root.classList.add('metadata-signature')
  signature.content.classList.add('metadata-signature-controls')
  signature.content.append(image, actions)
  return signature.root
}
