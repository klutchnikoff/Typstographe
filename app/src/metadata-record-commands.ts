import type { StructuredCommand } from './structured-commands'
import {
  recordIds,
  recordMap,
  type RecordStore,
  type RecordCollection,
  type StructuredMetadata,
} from './metadata-records'

/** Detachment is explicit and shares the final validation/undo of the deletion. */
export function removeRecordCommands(
  provider: RecordStore,
  schema: StructuredMetadata,
  definition: RecordCollection,
  id: string,
  detach = false,
) {
  const commands: StructuredCommand[] = []
  for (const collection of schema.collections)
    for (const field of collection.fields) {
      if (field.references !== definition.parameter) continue
      for (const key of recordIds(provider, collection)) {
        const selected = recordMap(provider, collection).get(key)!.get(field.key) as string[]
        if (!selected.includes(id)) continue
        if (!detach) return null
        commands.push({
          id: 'metadata.set',
          params: {
            target: { kind: 'record', collection: collection.parameter, id: key, field: field.key },
            value: selected.filter((key) => key !== id),
          },
        })
      }
    }
  commands.push({ id: 'record.remove', params: { collection: definition.parameter, id } })
  return commands
}
