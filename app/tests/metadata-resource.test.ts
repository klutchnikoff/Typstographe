import { expect, it } from 'vitest'
import { initialResources } from '../src/metadata-resource'
import type { Field } from '../src/shell'

it('copies only declared profile resources, without a document-type branch or a live preference link', () => {
  const field = (parameter: string, profile_default: 'signature' | null): Field => ({
    field: `header.${parameter}`,
    parameter,
    label: parameter,
    group: 'header',
    multiline: false,
    kind: 'resource-reference',
    required_for_export: false,
    value: null,
    resource: { kind: 'image', profile_default },
  })
  const fields = [field('first', 'signature'), field('second', 'signature'), field('logo', null)]
  const values = { first: null, second: null, logo: null }
  const signature = { path: 'images/a.svg', data: 'AA==' }
  const copied = initialResources(fields, values, signature)
  expect(copied).toEqual([signature])
  expect(copied[0]).not.toBe(signature)
  expect(values).toEqual({ first: 'images/a.svg', second: 'images/a.svg', logo: null })
  signature.data = 'changed'
  expect(copied[0].data).toBe('AA==')
  expect(initialResources(fields, values, { path: 'images/b.svg', data: 'BB==' })).toEqual([])
  expect(values.first).toBe('images/a.svg')
  expect(initialResources(fields, { first: null, second: null, logo: null }, null)).toEqual([])
})
