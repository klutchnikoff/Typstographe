export type OnlineProvider = 'crossref' | 'zbmath' | 'cairn'
export interface OnlineCandidate {
  id: string
  provider: OnlineProvider
  source_url: string
  title: string
  authors: string
  year: number | null
  doi: string | null
  entry: Record<string, unknown>
  contents: string
  warnings: string[]
}
export interface OnlineIssue {
  provider: OnlineProvider
  code: string
  retry_after: number | null
}
export interface OnlineResults {
  candidates: OnlineCandidate[]
  issues: OnlineIssue[]
}
export const providerLabel = (provider: OnlineProvider) =>
  ({ crossref: 'Crossref', zbmath: 'zbMATH Open', cairn: 'Cairn.info' })[provider]
