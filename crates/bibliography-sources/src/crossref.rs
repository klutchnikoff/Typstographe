use crate::native::{candidate, text};
use crate::{Candidate, Error, ErrorCode, Provider, Result};
use reqwest::Url;
use serde_json::{Value, json};
use typstographe_bibliography::normalize_text;

pub(crate) struct Query<'a> {
    terms: &'a str,
    year: Option<u16>,
    author_hint: bool,
}

impl<'a> Query<'a> {
    pub(crate) fn new(query: &'a str) -> Self {
        let (before, last) = query
            .rsplit_once(char::is_whitespace)
            .unwrap_or(("", query));
        let year = last
            .parse::<u16>()
            .ok()
            .filter(|year| last.len() == 4 && (1000..=2099).contains(year));
        let terms = if year.is_some() {
            before.trim_end()
        } else {
            query
        };
        let words = terms.split_whitespace();
        // Crossref combines query scores. A short name-like query benefits from
        // author matching while the bibliographic query still admits short titles.
        let author_hint = !terms.is_empty()
            && words.clone().count() <= 4
            && words
                .flat_map(str::chars)
                .all(|c| c.is_alphabetic() || matches!(c, '-' | '\'' | '’' | '.'));
        Self {
            terms,
            year,
            author_hint,
        }
    }

    pub(crate) fn url(&self, endpoint: &str, limit: usize) -> Url {
        let mut url = Url::parse(endpoint).unwrap();
        let mut params = url.query_pairs_mut();
        params.append_pair("rows", &limit.to_string()).append_pair(
            "select",
            "DOI,type,title,subtitle,author,editor,published-print,published-online,published,issued,container-title,volume,issue,page,publisher,ISBN,ISSN",
        );
        if !self.terms.is_empty() {
            params.append_pair("query.bibliographic", self.terms);
        }
        if self.author_hint {
            params.append_pair("query.author", self.terms);
        }
        if let Some(year) = self.year {
            params.append_pair(
                "filter",
                &format!("from-pub-date:{year}-01-01,until-pub-date:{year}-12-31"),
            );
        }
        drop(params);
        url
    }

    pub(crate) fn parse(&self, body: &str) -> Result<Vec<Candidate>> {
        let invalid = || Error::new(Provider::Crossref, ErrorCode::InvalidResponse);
        let data: Value = serde_json::from_str(body).map_err(|_| invalid())?;
        let items = data["message"]["items"].as_array().ok_or_else(invalid)?;
        let query = self.author_hint.then(|| name_words(self.terms));
        let mut candidates: Vec<_> = items
            .iter()
            .filter_map(|item| {
                let candidate = parse_record(item)?;
                let matches_author = query.as_ref().is_some_and(|query| {
                    item["author"].as_array().is_some_and(|authors| {
                        authors.iter().any(|author| {
                            let family = text(&author["family"]);
                            let given = text(&author["given"]);
                            *query == name_words(&format!("{given} {family}"))
                                || *query == name_words(&family)
                        })
                    })
                });
                Some((!matches_author, candidate))
            })
            .collect();
        if candidates.is_empty() && !items.is_empty() {
            return Err(invalid());
        }
        candidates.sort_by_key(|(rank, _)| *rank);
        Ok(candidates
            .into_iter()
            .map(|(_, candidate)| candidate)
            .collect())
    }
}

fn name_words(value: &str) -> Vec<String> {
    let value = normalize_text(value);
    let mut words: Vec<_> = value.split_whitespace().map(str::to_owned).collect();
    words.sort_unstable();
    words
}

fn parse_record(record: &Value) -> Option<Candidate> {
    let doi = crate::doi(&text(&record["DOI"]))?;
    let (mut entry, warnings) = crate::csl_json::entry(record);
    let title = text(&entry["title"]);
    let subtitle = text(&record["subtitle"]);
    if !title.is_empty() && !subtitle.is_empty() && !title.ends_with(&subtitle) {
        entry["title"] = json!(format!("{title}: {subtitle}"));
    }
    let url = format!("https://doi.org/{doi}");
    entry["serial-number"]["doi"] = json!(doi);
    entry["url"] = json!(url);
    candidate(Provider::Crossref, url, entry, warnings).ok()
}
