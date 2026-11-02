// MCP catalogue equivalence for the closure recipe.
//
// commands.list is a compact index since progressive discovery (docs/mcp-discovery.md):
// it carries IDs and adapter support, never schemas. Effective schemas are read
// through capabilities.describe, one ID at a time, and compared with the CLI
// catalogue after removing only what the MCP adapter adds (the document reference).
import assert from 'node:assert/strict'

const DOCUMENT_REF = { $ref: '#/$defs/DocumentRef' }

function references(value, found) {
  if (Array.isArray(value)) for (const item of value) references(item, found)
  else if (value && typeof value === 'object') {
    const reference = value.$ref
    if (typeof reference === 'string' && reference.startsWith('#/$defs/'))
      found.add(
        reference
          .slice('#/$defs/'.length)
          .split('/')[0]
          .replaceAll('~1', '/')
          .replaceAll('~0', '~'),
      )
    for (const [key, item] of Object.entries(value)) if (key !== '$defs') references(item, found)
  }
}

/// Keep the transitive closure of referenced `$defs`, recursion included. Dropping
/// unreferenced definitions changes neither accepted inputs nor reference names.
export function pruneSchema(schema) {
  if (Array.isArray(schema)) for (const item of schema) pruneSchema(item)
  if (!schema || typeof schema !== 'object' || Array.isArray(schema)) return schema
  for (const item of Object.values(schema)) pruneSchema(item)
  if (!('$defs' in schema)) return schema
  const definitions = schema.$defs
  delete schema.$defs
  if (!definitions || typeof definitions !== 'object' || Array.isArray(definitions)) return schema
  const needed = new Set()
  for (const item of Object.values(schema)) references(item, needed)
  const queue = [...needed],
    retained = {}
  while (queue.length) {
    const name = queue.pop()
    if (Object.hasOwn(retained, name) || !Object.hasOwn(definitions, name)) continue
    retained[name] = definitions[name]
    const more = new Set()
    references(definitions[name], more)
    queue.push(...more)
  }
  if (Object.keys(retained).length) schema.$defs = retained
  return schema
}

// An absent and an empty `required`/`properties` accept the same inputs.
function normalize(schema) {
  const value = pruneSchema(structuredClone(schema ?? {}))
  if (Array.isArray(value.required) && value.required.length === 0) delete value.required
  if (
    value.properties &&
    typeof value.properties === 'object' &&
    Object.keys(value.properties).length === 0
  )
    delete value.properties
  return value
}

// The MCP tool adds a `document` reference to the core parameters. It must be
// exactly that reference; everything else must be the core schema.
function withoutDocumentReference(id, schema) {
  const value = structuredClone(schema)
  assert.deepEqual(value.properties?.document, DOCUMENT_REF, `${id}: document reference`)
  assert.ok(value.$defs?.DocumentRef, `${id}: DocumentRef definition`)
  delete value.properties.document
  delete value.$defs.DocumentRef
  if (Array.isArray(value.required))
    value.required = value.required.filter((name) => name !== 'document')
  return value
}

/// Compare the MCP catalogue with the CLI reference catalogue: same IDs in the
/// compact index, and the same effective parameter schema for every ID.
export async function assertMcpCatalogue({ request, call }, catalogue, adapterIds = []) {
  const tools = new Map((await request('tools/list')).tools.map((t) => [t.name, t.inputSchema]))
  const index = (await call('commands.list')).outcome.entries
  const ids = catalogue.entries.map((entry) => entry.id).sort()
  assert.deepEqual(
    index
      .filter((entry) => entry.family !== 'mcp')
      .map((entry) => entry.id)
      .sort(),
    ids,
    'MCP index and CLI catalogue IDs differ',
  )
  assert.deepEqual(
    index
      .filter((entry) => entry.family === 'mcp')
      .map((entry) => entry.id)
      .sort(),
    [...adapterIds].sort(),
    'Unexpected MCP-only entries',
  )
  for (const entry of index)
    assert.ok(!('params_schema' in entry), `${entry.id}: the index must stay compact`)
  let direct = 0
  for (const reference of catalogue.entries) {
    const { id } = reference
    const detail = (await call('capabilities.describe', { id })).outcome
    assert.equal(detail.id, id)
    assert.equal(detail.execution?.direct_tool, tools.has(id), `${id}: direct tool support`)
    let effective = detail.params_schema
    if (tools.has(id)) {
      direct++
      // docs/mcp-discovery.md: for an exposed tool, the described schema is
      // exactly its MCP input schema.
      assert.deepEqual(effective, tools.get(id), `${id}: described and tools/list schemas differ`)
      effective = withoutDocumentReference(id, effective)
    }
    assert.deepEqual(
      normalize(effective),
      normalize(reference.params_schema),
      `${id}: MCP and CLI effective schemas differ`,
    )
  }
  for (const id of adapterIds) {
    assert.ok(tools.has(id), `${id}: adapter entry without tool`)
    const detail = (await call('capabilities.describe', { id })).outcome
    assert.deepEqual(detail.params_schema, tools.get(id), `${id}: adapter schema`)
  }
  return { entries: ids.length, direct, adapter: adapterIds.length }
}
