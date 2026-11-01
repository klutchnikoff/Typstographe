/** Typed content-contract failure, as serialized by the native layer (`{"code": "stale_revision", …}`). */
export type ContentError = { code: string } & Record<string, unknown>
/**
 * Rejection value of a native command: either a plain message (already localized when it
 * comes from a catalogue) or a typed payload carrying a machine-readable code.
 */
export type CommandError = string | ContentError

/** Machine-readable code of a typed command failure; plain messages and transport errors carry none. */
export function errorCode(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null || error instanceof Error) return undefined
  const code = (error as { code?: unknown }).code
  return typeof code === 'string' ? code : undefined
}

/** Text shown for any failure; a typed payload keeps its compact JSON form. */
export function errorText(error: unknown): string {
  return errorCode(error) === undefined ? String(error) : JSON.stringify(error)
}
