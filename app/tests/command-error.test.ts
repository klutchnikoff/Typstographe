import { expect, it } from 'vitest'
import { errorCode, errorText } from '../src/command-error'

it('reads the code of typed native failures without guessing from text', () => {
  const stale = { code: 'stale_revision', expected: 1, actual: 2 }
  expect(errorCode(stale)).toBe('stale_revision')
  expect(errorText(stale)).toBe('{"code":"stale_revision","expected":1,"actual":2}')
  expect(errorCode('stale_revision')).toBeUndefined()
  expect(errorCode(new Error('stale_revision'))).toBeUndefined()
  expect(errorCode(null)).toBeUndefined()
  expect(errorCode({ code: 7 })).toBeUndefined()
})

it('keeps plain messages and exceptions as they were displayed before', () => {
  expect(errorText('Présence trop volumineuse.')).toBe('Présence trop volumineuse.')
  expect(errorText(new Error('Échec'))).toBe('Error: Échec')
  expect(errorText(undefined)).toBe('undefined')
})
