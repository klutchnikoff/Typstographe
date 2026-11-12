use crate::http::{CSL, Http};
use crate::{Candidate, Error, ErrorCode, Provider, Result, Results, Search, Warning};
use futures_util::{StreamExt, stream};
use reqwest::Url;
use serde_json::Value;
use std::{collections::BTreeSet, time::Duration};

/// Text discovery and targeted resolution share the specialised notice collectors.
pub struct Client {
    http: Http,
    doi: String,
    zbmath: String,
    cairn: String,
    crossref: String,
}
impl Client {
    pub fn new() -> Result<Self> {
        Ok(Self {
            http: Http::new()?,
            doi: "https://doi.org/".into(),
            zbmath: "https://api.zbmath.org/v1/document/_search".into(),
            cairn: "https://oai.cairn.info/oai.php".into(),
            crossref: "https://api.crossref.org/works".into(),
        })
    }
    #[cfg(test)]
    pub(crate) fn testing(base: &str) -> Self {
        Self {
            http: Http::testing(base),
            doi: format!("{base}/doi/"),
            zbmath: format!("{base}/zbmath"),
            cairn: format!("{base}/cairn"),
            crossref: format!("{base}/crossref"),
        }
    }
    pub async fn search(&self, request: Search) -> Results {
        let mut query = request.query.trim().to_owned();
        if query.is_empty()
            || query.len() > 512
            || query.chars().any(char::is_control)
            || request.sources.is_empty()
            || request.sources.len() > 4
            || !(1..=20).contains(&request.limit)
        {
            return Results {
                candidates: vec![],
                issues: vec![Error::new(
                    request.sources.first().copied().unwrap_or(Provider::Doi),
                    ErrorCode::InvalidQuery,
                )],
            };
        }
        let sources: BTreeSet<_> = request.sources.into_iter().collect();
        let cairn_url = Url::parse(&query).ok().filter(crate::input::cairn_host);
        if let Some(url) = cairn_url
            && crate::cairn_identifier(&query).is_none()
        {
            if !sources.contains(&Provider::Cairn) {
                return Results {
                    candidates: vec![],
                    issues: vec![Error::new(Provider::Cairn, ErrorCode::IdentifierRequired)],
                };
            }
            match self
                .bounded(Provider::Cairn, async {
                    let mut url = url;
                    url.set_scheme("https").unwrap();
                    url.set_fragment(None);
                    let html = self
                        .http
                        .get(Provider::Cairn, url, "text/html")
                        .await?
                        .ok_or_else(|| {
                            Error::new(Provider::Cairn, ErrorCode::IdentifierRequired)
                        })?;
                    crate::cairn::page_doi(&html)
                        .ok_or_else(|| Error::new(Provider::Cairn, ErrorCode::IdentifierRequired))
                })
                .await
            {
                Ok(doi) => query = doi,
                Err(e) => {
                    return Results {
                        candidates: vec![],
                        issues: vec![e],
                    };
                }
            }
        }
        let exact = crate::doi(&query);
        let targeted = crate::cairn_identifier(&query).is_some();
        let run = async |provider| {
            if !sources.contains(&provider)
                || (provider == Provider::Cairn && !targeted)
                || (provider == Provider::Zbmath && targeted && exact.is_none())
            {
                return (vec![], None);
            }
            let result = self
                .bounded(provider, self.lookup(provider, &query, request.limit))
                .await;
            match result {
                Ok(mut candidates) => {
                    candidates.truncate(request.limit);
                    (candidates, None)
                }
                Err(error) => (vec![], Some(error)),
            }
        };
        let discover = async {
            if exact.is_none() && !targeted && sources.contains(&Provider::Crossref) {
                let provider = Provider::Crossref;
                let query = crate::crossref::Query::new(&query);
                self.bounded(provider, async {
                    let url = query.url(&self.crossref, request.limit);
                    match self.http.get(provider, url, "application/json").await? {
                        Some(body) => query.parse(&body),
                        None => Ok(vec![]),
                    }
                })
                .await
            } else {
                Ok(vec![])
            }
        };
        let (zbmath, cairn, crossref) =
            tokio::join!(run(Provider::Zbmath), run(Provider::Cairn), discover);
        let mut result = Results::default();
        let mut seen = BTreeSet::new();
        for (candidates, issue) in [zbmath, cairn] {
            let candidates = candidates
                .into_iter()
                .filter(|candidate| unique_doi(&mut seen, candidate));
            result.candidates.extend(candidates);
            result.issues.extend(issue);
        }
        match crossref {
            Ok(candidates) => {
                let candidates = candidates
                    .into_iter()
                    .filter(|candidate| unique_doi(&mut seen, candidate))
                    .take(request.limit.saturating_sub(result.candidates.len()));
                if sources.contains(&Provider::Cairn) {
                    let mut enriched = stream::iter(candidates)
                        .map(|candidate| self.prefer_cairn(candidate))
                        .buffered(3);
                    while let Some((candidate, issue)) = enriched.next().await {
                        result.candidates.push(candidate);
                        if let Some(issue) = issue
                            && !result.issues.contains(&issue)
                        {
                            result.issues.push(issue);
                        }
                    }
                } else {
                    result.candidates.extend(candidates);
                }
            }
            Err(error) => result.issues.push(error),
        }
        result.candidates.truncate(request.limit);
        if result.candidates.is_empty() {
            if let Some(doi) = exact {
                match self.bounded(Provider::Doi, self.resolve_doi(&doi)).await {
                    Ok(candidate) => result.candidates.extend(candidate),
                    Err(e) => result.issues.push(e),
                }
            } else if !targeted
                && !sources.contains(&Provider::Zbmath)
                && !sources.contains(&Provider::Crossref)
            {
                result
                    .issues
                    .push(Error::new(Provider::Cairn, ErrorCode::UnsupportedQuery));
            }
        }
        result
    }
    async fn bounded<T>(
        &self,
        provider: Provider,
        task: impl std::future::Future<Output = Result<T>>,
    ) -> Result<T> {
        tokio::time::timeout(Duration::from_secs(30), task)
            .await
            .unwrap_or_else(|_| Err(Error::new(provider, ErrorCode::Timeout)))
    }
    async fn lookup(
        &self,
        provider: Provider,
        query: &str,
        limit: usize,
    ) -> Result<Vec<Candidate>> {
        match provider {
            Provider::Zbmath => {
                let mut url = Url::parse(&self.zbmath).unwrap();
                let exact = crate::doi(query);
                let query = exact
                    .as_ref()
                    .map(|d| format!("doi:{d}"))
                    .unwrap_or_else(|| query.to_string());
                url.query_pairs_mut()
                    .append_pair("search_string", &query)
                    .append_pair("results_per_page", &limit.to_string())
                    .append_pair("page", "0");
                let Some(body) = self.http.get(provider, url, "application/json").await? else {
                    return Ok(vec![]);
                };
                let records = crate::zbmath::parse(&body)?;
                if let Some(expected) = exact
                    && records.iter().any(|r| {
                        r.doi
                            .as_deref()
                            .is_none_or(|d| !d.eq_ignore_ascii_case(&expected))
                    })
                {
                    return Err(Error::new(provider, ErrorCode::InvalidResponse));
                }
                Ok(records)
            }
            Provider::Cairn => self.cairn(query, None).await,
            Provider::Doi | Provider::Crossref => {
                unreachable!("only specialised providers use targeted lookup")
            }
        }
    }
    async fn prefer_cairn(&self, fallback: Candidate) -> (Candidate, Option<Error>) {
        let Some(doi) = fallback
            .doi
            .as_deref()
            .filter(|doi| crate::cairn_identifier(doi).is_some())
        else {
            return (fallback, None);
        };
        let provider = Provider::Cairn;
        // Keep interactive discovery responsive if the optional enrichment stalls.
        let notice = tokio::time::timeout(
            Duration::from_secs(3),
            self.cairn(doi, Some(&fallback.entry)),
        )
        .await
        .unwrap_or_else(|_| Err(Error::new(provider, ErrorCode::Timeout)));
        match notice {
            Ok(candidates) => (candidates.into_iter().next().unwrap_or(fallback), None),
            Err(error) => (fallback, Some(error)),
        }
    }
    async fn resolve_doi(&self, doi: &str) -> Result<Option<Candidate>> {
        let mut url = Url::parse(&self.doi).unwrap();
        url.path_segments_mut()
            .unwrap()
            .pop_if_empty()
            .extend(doi.split('/'));
        let Some(body) = self.http.get(Provider::Doi, url, CSL).await? else {
            return Ok(None);
        };
        crate::csl_json::parse(&body, doi).map(Some)
    }
    async fn cairn(&self, query: &str, publication_hint: Option<&Value>) -> Result<Vec<Candidate>> {
        let id = crate::cairn_identifier(query)
            .ok_or_else(|| Error::new(Provider::Cairn, ErrorCode::UnsupportedQuery))?;
        let mut url = Url::parse(&self.cairn).unwrap();
        url.query_pairs_mut()
            .append_pair("verb", "GetRecord")
            .append_pair("metadataPrefix", "oai_dc")
            .append_pair("identifier", &id);
        let Some(body) = self
            .http
            .get(Provider::Cairn, url, "application/xml")
            .await?
        else {
            return Ok(vec![]);
        };
        let Some(notice) = crate::cairn::parse(&body, &id)? else {
            return Ok(vec![]);
        };
        if let Some(expected) = crate::doi(query)
            && notice.entry["serial-number"]["doi"]
                .as_str()
                .is_none_or(|d| !d.eq_ignore_ascii_case(&expected))
        {
            return Err(Error::new(Provider::Cairn, ErrorCode::InvalidResponse));
        }
        let mut entry = serde_json::json!({"type":"misc"});
        let mut warnings = vec![];
        // Parent metadata is auxiliary. It never overwrites the OAI record's own fields.
        if let Some(publication) = publication_hint {
            entry["type"] = publication["type"].clone();
            if let Some(parent) = publication.get("parent") {
                entry["parent"] = parent.clone();
            }
        } else if let Some(parent) = &notice.parent_doi
            && let Ok(Some(publication)) = self.resolve_doi(parent).await
        {
            let p = publication.entry;
            let child = match p["type"].as_str() {
                Some("book") => Some("chapter"),
                Some("periodical" | "proceedings") => Some("article"),
                _ => None,
            };
            if let Some(child) = child {
                entry["type"] = serde_json::json!(child);
                entry["parent"] = serde_json::json!([p]);
            }
        }
        if entry.get("parent").is_none()
            && publication_hint.is_none()
            && let Some(doi) = notice.entry["serial-number"]["doi"].as_str()
            && let Ok(Some(publication)) = self.resolve_doi(doi).await
            && publication.entry.get("parent").is_some()
        {
            entry["type"] = publication.entry["type"].clone();
            entry["parent"] = publication.entry["parent"].clone();
        }
        if entry.get("parent").is_none()
            && matches!(entry["type"].as_str(), Some("article" | "chapter" | "misc"))
        {
            warnings.push(Warning::ParentUnavailable);
        }
        for (key, value) in notice.entry.as_object().unwrap() {
            if key != "type" {
                entry[key] = value.clone();
            }
        }
        entry["url"] = serde_json::json!(notice.source_url);
        Ok(vec![crate::native::candidate(
            Provider::Cairn,
            notice.source_url,
            entry,
            warnings,
        )?])
    }
}

fn unique_doi(seen: &mut BTreeSet<String>, candidate: &Candidate) -> bool {
    candidate
        .doi
        .as_deref()
        .and_then(crate::doi)
        .is_none_or(|doi| seen.insert(doi.to_ascii_lowercase()))
}
