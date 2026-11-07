# Online acquisition fixtures

Public metadata, recorded on 6–7 November 2026. Automated tests are offline.

- `doi-cairn-chapter.json`: CSL-JSON requested through `doi.org` for
  `10.3917/dbu.jorro.2022.01.0155`. The registration agency supplied the book
  title in place of the chapter title: retain and flag this deposit defect.
- `doi-cairn-book.json`: CSL-JSON through `doi.org` for the containing book,
  `10.3917/dbu.jorro.2022.01`.
- `doi-datacite-report.json`: CSL-JSON through `doi.org` for
  `10.5284/1015681`, registered with DataCite. Abstract text is omitted.
- `cairn-chapter.xml`: Cairn OAI `GetRecord`, `oai_dc`, identifier
  `DBU_JORRO_2022_01_0155`. Its own title is “Émancipation”.
- `zbmath-wiles.json`: necessary metadata subset of zbMATH Open search for
  `10.2307/2118559`; review and abstract text are omitted.
- `cairn-results.json` and `doi-results.json`: converted acquisition results
  for browser recipes; these deliberately describe separate search outcomes,
  not two concurrent results of the new specialised-first strategy.

CSL-JSON was requested using `Accept: application/vnd.citationstyles.csl+json`.
Crossref can answer behind the DOI resolver, but there is no dedicated Crossref
search or ISBN catalogue lookup in the implementation.

These are third-party bibliographic metadata, not application code relicensed
under MIT. Source notices remain applicable:
[DOI negotiation documentation](https://citation.doi.org/docs.html),
[Crossref metadata documentation](https://www.crossref.org/documentation/retrieve-metadata/content-negotiation/),
[DataCite content negotiation](https://support.datacite.org/docs/datacite-content-resolver),
[Cairn public harvesting statement](https://oai.cairn.info/),
[zbMATH Open API terms](https://api.zbmath.org/).
