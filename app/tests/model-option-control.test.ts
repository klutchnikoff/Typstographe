import { afterEach, expect, it, vi } from 'vitest'
import { modelOptionControl } from '../src/model-option-control'
import type { MetadataCommands } from '../src/metadata-commands'
import type { ModelPolicy } from '../src/shell'

afterEach(() => document.body.replaceChildren())
it('a free finite domain comes from the common contract, including newly declared choices', () => {
  const root = document.createElement('div')
  document.body.append(root)
  const set = vi.fn(),
    commands = {
      set,
      value: (_target: unknown, current: unknown) => current,
      error: () => undefined,
      recovering: () => false,
      watch: () => () => {},
      composing: () => {},
    } as unknown as MetadataCommands
  let policy: ModelPolicy = {
    languages: ['fr'],
    options: {
      'citation-style': {
        regime: 'free',
        default: 'new-style',
        domain: ['apa', 'new-style'],
        choice: null,
        effective: 'new-style',
        substituted: false,
      },
    },
  }
  const view = modelOptionControl(
    root,
    'citation-style',
    'Style',
    [{ value: 'apa', label: 'APA' }],
    { kind: 'metadata', field: 'article.citation_style' },
    commands,
    () => null,
    () => policy,
  )
  expect([...view.select.options].map((item) => item.value)).toEqual(['', 'apa', 'new-style'])
  expect(view.select.options[0].text).toContain('new-style')
  view.select.value = 'new-style'
  view.select.dispatchEvent(new Event('input'))
  expect(set).toHaveBeenLastCalledWith(
    { kind: 'metadata', field: 'article.citation_style' },
    'new-style',
    expect.any(Function),
  )
  policy = {
    languages: ['fr'],
    options: {
      'citation-style': {
        regime: 'restricted',
        default: 'apa',
        allowed: ['apa'],
        domain: ['apa', 'new-style'],
        choice: 'new-style',
        effective: 'apa',
        substituted: true,
      },
    },
  }
  view.refresh()
  expect([...view.select.options].map((item) => item.value)).toEqual(['', 'apa'])
  view.destroy()
})

it('an excluded retained choice can be explicitly replaced by Follow the model', () => {
  const root = document.createElement('div')
  document.body.append(root)
  const set = vi.fn(),
    commands = {
      set,
      value: (_target: unknown, current: unknown) => current,
      error: () => undefined,
      recovering: () => false,
      watch: () => () => {},
      composing: () => {},
    } as unknown as MetadataCommands
  const policy: ModelPolicy = {
    languages: ['fr'],
    options: {
      paper: {
        regime: 'restricted',
        default: 'a5',
        allowed: ['a5'],
        domain: ['a3', 'a4', 'a5'],
        choice: 'a3',
        effective: 'a5',
        substituted: true,
      },
    },
  }
  const view = modelOptionControl(
    root,
    'paper',
    'Format',
    [
      { value: 'a3', label: 'A3' },
      { value: 'a5', label: 'A5' },
    ],
    { kind: 'option', name: 'paper' },
    commands,
    () => 'a3',
    () => policy,
  )
  expect(view.select.value).toBe('a3')
  expect(view.select.selectedOptions[0].disabled).toBe(true)
  view.select.value = ''
  view.select.dispatchEvent(new Event('input'))
  expect(set).toHaveBeenLastCalledWith(
    { kind: 'option', name: 'paper' },
    null,
    expect.any(Function),
  )
  view.destroy()
})
