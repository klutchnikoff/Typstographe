# Online acquisition fixtures

Public metadata retrieved on 6 November 2026. Tests read these files locally;
no online service is required for the automated suite.

- `crossref-cairn-chapter.json`: Crossref `/works/10.3917/dbu.jorro.2022.01.0155`.
  The deposited chapter title repeats the book title: retain and flag that defect.
- `crossref-cairn-book.json`: Crossref `/works/10.3917/dbu.jorro.2022.01`.
- `crossref-cairn-isbn.json`: Crossref `/works`, filtered by ISBN 9782807340534,
  selecting DOI, page and resource. Resolves a modern Cairn URL by exact path/page.
- `cairn-chapter.xml`: Cairn OAI `GetRecord`, `oai_dc`,
  identifier `DBU_JORRO_2022_01_0155`. The chapter title is “Émancipation”.
- `zbmath-wiles.json`: necessary metadata subset of zbMATH Open search for
  DOI `10.2307/2118559`; review/abstract text is not included.

These are third-party bibliographic metadata, not application code relicensed
under MIT. Source notices remain applicable: [Crossref metadata documentation](https://www.crossref.org/documentation/retrieve-metadata/rest-api/),
[Cairn public harvesting statement](https://oai.cairn.info/),
[zbMATH Open API terms](https://api.zbmath.org/).
