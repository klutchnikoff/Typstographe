import { tr } from './i18n'
import type { Catalogue, DocumentType, ModelPolicy } from './shell'
import type { Settings } from './state'
import type { MetadataCommands } from './metadata-commands'
import { bindMetadataInput } from './metadata-input'
import { modelOptionControl } from './model-option-control'

/** General settings expose only options the active model lets the author change. */
export function documentOptions(
  parent: HTMLElement,
  kind: DocumentType,
  catalogue: Catalogue,
  settings: Settings,
  binding: { commands: MetadataCommands; read: () => Settings },
  policy: () => ModelPolicy | undefined = () => undefined,
) {
  const root = document.createElement('div')
  root.className = 'document-options'
  const left = document.createElement('div'),
    right = document.createElement('div')
  left.className = right.className = 'document-options-column'
  root.append(left, right)
  const choice = (
    column: HTMLElement,
    name: string,
    label: string,
    items: { value: string; label: string }[],
  ) => {
    const title = document.createElement('label')
    title.htmlFor = `document-option-${name}`
    title.textContent = label
    const control = document.createElement('div')
    control.className = 'document-option-control'
    const select = document.createElement('select')
    select.id = title.htmlFor
    for (const item of items) select.add(new Option(item.label, item.value))
    control.append(select)
    const field = document.createElement('div')
    field.className = 'field'
    field.style.display = 'contents'
    field.append(title, control)
    column.append(field)
    return { select, control, title }
  }
  const model = choice(
    left,
    'model',
    tr('Modèle'),
    kind.models.map((model) => ({ value: model.id, label: model.label })),
  )
  const option = (
    column: HTMLElement,
    id: 'paper' | 'landscape' | 'bullet-marker' | 'outline',
    label: string,
    items: { value: string; label: string }[],
    name: 'paper' | 'landscape' | 'bullet_marker' | null,
    boolean = false,
  ) =>
    modelOptionControl(
      column,
      id,
      label,
      items,
      name
        ? { kind: 'option', name }
        : { kind: 'metadata', field: kind.structured!.outline!.field },
      binding.commands,
      () =>
        name
          ? binding.read().metadata.fields.options[name]
          : binding.read().metadata.fields[kind.structured!.outline!.parameter],
      policy,
      boolean,
    )
  const paper = option(left, 'paper', tr('Format'), catalogue.papers, 'paper')
  const orientation = option(
    left,
    'landscape',
    tr('Orientation'),
    [
      { value: 'false', label: tr('Portrait') },
      { value: 'true', label: tr('Paysage') },
    ],
    'landscape',
    true,
  )
  const language = choice(right, 'language', tr('Langue du document'), catalogue.languages)
  const marker = option(
    right,
    'bullet-marker',
    tr('Puces des listes'),
    [
      { value: 'auto', label: tr('Automatique (modèle)') },
      ...['—', '•', '◦', '▪', '–', '-'].map((value) => ({ value, label: value })),
    ],
    'bullet_marker',
  )
  const outline = kind.structured?.outline
    ? option(
        right,
        'outline',
        tr('Afficher le sommaire'),
        [
          { value: 'false', label: tr('Non') },
          { value: 'true', label: tr('Oui') },
        ],
        null,
        true,
      )
    : undefined
  const warning = document.createElement('p')
  warning.role = 'status'
  warning.style.gridColumn = '1 / -1'
  root.append(warning)
  parent.append(root)
  const optionBindings = [
    bindMetadataInput(
      model.select,
      binding.commands,
      { kind: 'model' },
      () => ({
        model_id: binding.read().modelId,
        source: binding.read().template,
        manifest: binding.read().modelManifest,
      }),
      () => {
        const selected = kind.models.find((m) => m.id === model.select.value)!
        return { model_id: selected.id, source: selected.source, manifest: selected.manifest }
      },
      (value) => {
        const selected = value as { model_id: string; source: string; manifest: string }
        return (
          kind.models.find(
            (m) =>
              m.id === selected.model_id &&
              m.source === selected.source &&
              m.manifest === selected.manifest,
          )?.id || 'embedded'
        )
      },
    ),
    bindMetadataInput(
      language.select,
      binding.commands,
      { kind: 'option', name: 'language' },
      () => binding.read().metadata.fields.options.language,
    ),
  ]
  const update = (current: Settings) => {
    // A saved project keeps its own model, even after the bundled model changes.
    const bundled = kind.models.find(
      (model) =>
        model.id === current.modelId &&
        model.source === current.template &&
        model.manifest === current.modelManifest,
    )
    const embedded = [...model.select.options].find((option) => option.value === 'embedded')
    if (!bundled && !embedded) {
      const option = new Option(tr('Modèle embarqué'), 'embedded')
      option.disabled = true
      model.select.add(option)
    } else if (bundled) embedded?.remove()
    for (const control of [paper, orientation, marker, outline]) control?.refresh()
    const languages = catalogue.languages.filter(
      (item) => !policy() || policy()!.languages.includes(item.value),
    )
    if (
      JSON.stringify([...language.select.options].map((item) => item.value)) !==
      JSON.stringify(languages.map((item) => item.value))
    )
      language.select.replaceChildren(
        ...languages.map((item) => new Option(item.label, item.value)),
      )
    warning.hidden = !Object.values(policy()?.options || {}).some((option) => option?.substituted)
    warning.textContent = warning.hidden
      ? ''
      : tr('Le modèle utilise son défaut pour certains réglages. Vos choix sont conservés.')
    for (const binding of optionBindings) binding.refresh()
  }
  update(settings)
  return {
    update,
    destroy: () => {
      for (const control of [paper, orientation, marker, outline]) control?.destroy()
      for (const binding of optionBindings) binding.destroy()
    },
  }
}
