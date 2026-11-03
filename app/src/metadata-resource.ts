import { tr } from './i18n'
import type { Provider, Resource, Transport } from './provider'
import type { Field } from './shell'
import type { MetadataCommands } from './metadata-commands'
import { bindMetadataInput } from './metadata-input'
import { prepareImage } from './resource-commands'

export type ResourceContext = {
  provider: Provider
  transport: Transport
  profile: () => Resource | null | undefined
  guarded: (operation: () => Promise<unknown>) => void
}
type Binding = {
  commands: MetadataCommands
  read: (field: Field) => unknown
  resources?: ResourceContext
}
const controls = new WeakMap<
  HTMLElement,
  { refresh: (value: unknown) => void; destroy: () => void }
>()

/** One image-reference field, driven by its declared kind and optional profile source. */
export function metadataResource(
  definition: Field,
  value: unknown,
  change: (field: string, value: unknown) => void,
  binding?: Binding,
) {
  const root = document.createElement('div')
  root.className = 'metadata-resource-controls'
  root.dataset.metadataResource = definition.parameter
  const preview = document.createElement('img')
  preview.className = 'metadata-resource-preview'
  preview.alt = definition.label
  const input = document.createElement('input')
  input.id = `metadata-field-${definition.field}`
  input.type = 'file'
  input.accept = 'image/png,image/jpeg,image/svg+xml'
  input.disabled = !binding?.resources
  const actions = document.createElement('div')
  actions.className = 'panel-actions'
  const clear = document.createElement('button')
  clear.type = 'button'
  clear.textContent = tr(
    definition.resource?.profile_default === 'signature' ? 'Sans signature' : 'Supprimer l’image',
  )
  const target = { kind: 'metadata', field: definition.field } as const
  const read = () => binding!.read(definition)
  let current: unknown = value
  const set = (value: unknown, resources: Resource[] = []) => {
    if (binding) binding.commands.set(target, value, read, resources)
    else change(definition.field, value)
  }
  clear.onclick = () => set(null)
  actions.append(clear)
  let profile: HTMLButtonElement | undefined
  if (definition.resource?.profile_default === 'signature') {
    profile = document.createElement('button')
    profile.type = 'button'
    profile.textContent = tr('Signature des préférences')
    profile.onclick = () => {
      const resource = binding?.resources?.profile()
      if (resource) set(resource.path, [resource])
    }
    actions.append(profile)
  }
  root.append(preview, input, actions)
  const format = (value: unknown) => {
    current = value
    clear.disabled = value == null
    if (profile) profile.disabled = !binding?.resources?.profile()
    const resource =
      binding?.commands.pendingResources(target).find((r) => r.path === value) ||
      (typeof value === 'string' ? binding?.resources?.provider.resources.get(value) : undefined)
    preview.hidden = !resource
    if (resource) {
      const mime = resource.path.endsWith('.svg')
        ? 'image/svg+xml'
        : resource.path.endsWith('.png')
          ? 'image/png'
          : 'image/jpeg'
      const url = `data:${mime};base64,${resource.data}`
      if (preview.src !== url) preview.src = url
    } else preview.removeAttribute('src')
    return '' // Browsers prohibit assigning a file input's value. The reference has its own typed value.
  }
  input.onchange = () => {
    const file = input.files?.[0],
      context = binding?.resources
    if (file && context)
      context.guarded(() =>
        binding!.commands.prepareResource(target, read, () =>
          prepareImage(context.provider, context.transport, file),
        ),
      )
  }
  let native: ReturnType<typeof bindMetadataInput> | undefined
  format(value)
  controls.set(root, {
    refresh(value) {
      if (native) native.refresh()
      else format(value)
    },
    destroy() {
      native?.destroy()
      controls.delete(root)
    },
  })
  return {
    controls: root,
    input,
    bind() {
      if (binding)
        native = bindMetadataInput(input, binding.commands, target, read, () => current, format)
    },
  }
}
export const metadataResourceControl = (root: HTMLElement) => controls.get(root)

/** Copy only declared defaults; the global profile is never linked into the project. */
export function initialResources(
  fields: Field[],
  values: Record<string, unknown>,
  signature: Resource | null | undefined,
) {
  const resources = new Map<string, Resource>()
  for (const field of fields) {
    if (
      field.resource?.profile_default === 'signature' &&
      signature &&
      values[field.parameter] == null
    ) {
      values[field.parameter] = signature.path
      resources.set(signature.path, structuredClone(signature))
    }
  }
  return [...resources.values()]
}
