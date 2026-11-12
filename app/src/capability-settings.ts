import type { Capability } from './commands'

export type Scalar = string | number | boolean
export interface Parameter {
  type?: string
  title?: string
  default?: Scalar
  enum?: Scalar[]
  minimum?: number
  maximum?: number
  minLength?: number
  maxLength?: number
  pattern?: string
  'x-editor'?: {
    placement?: 'body' | 'structure' | 'creation' | 'panel'
    storage?: 'structure' | 'attribute'
    attribute?: string
    prefix?: string
    control?: 'image'
    multiline?: boolean
    label_key?: string
    option_labels?: Record<string, string>
    label_visibility?: 'visible' | 'accessible'
  }
}
export interface Parameters {
  properties?: Record<string, Parameter>
  required?: string[]
}
export interface SettingField {
  name: string
  attribute: string
  label: string
  schema: Parameter
  required: boolean
  control: 'image' | 'text' | 'textarea' | 'number' | 'checkbox' | 'select'
}
export interface WidgetSettings {
  fields: SettingField[]
  conversions: Capability[]
  headerField?: SettingField
}
export const hasSettings = (settings: WidgetSettings) =>
  settings.fields.length > 0 || settings.conversions.length > 1

/** One derivation for the frame, command availability and the actual form. */
export function settingsForNode(node: string, capabilities: Capability[]): WidgetSettings {
  const capability = capabilities.find((entry) => entry.node === node || entry.mark === node)
  const fields: SettingField[] = []
  let headerField: SettingField | undefined
  for (const [name, schema] of Object.entries(capability?.parameters.properties || {})) {
    const hint = schema['x-editor'] || {}
    const required = capability!.parameters.required?.includes(name) || false
    if ((hint.placement || (required ? 'creation' : 'panel')) !== 'panel') continue
    const control =
      hint.control ||
      (schema.enum
        ? 'select'
        : schema.type === 'boolean'
          ? 'checkbox'
          : schema.type === 'number' || schema.type === 'integer'
            ? 'number'
            : schema.type === 'string'
              ? hint.multiline
                ? 'textarea'
                : 'text'
              : undefined)
    if (!control) throw new Error(`Unsupported settings field: ${capability!.id}.${name}`)
    const field: SettingField = {
      name,
      attribute: hint.attribute || name,
      label: schema.title || name,
      schema,
      required,
      control,
    }
    if (node === 'mathBlock' && field.attribute === 'alias') headerField = field
    else fields.push(field)
  }
  const group = capability?.editor?.conversion_group
  return {
    fields,
    headerField,
    conversions: group
      ? capabilities.filter((entry) => entry.editor?.conversion_group === group)
      : [],
  }
}
