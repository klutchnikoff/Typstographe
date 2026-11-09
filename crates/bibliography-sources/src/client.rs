use crate::http::{CSL, Http};
use crate::{Candidate, Error, ErrorCode, Provider, Result, Results, Search, Warning};
use reqwest::Url;
use std::{collections::BTreeSet, time::Duration};

/// Specialised discovery first; DOI negotiation only recovers an otherwise missing record.
pub struct Client {
    http: Http,
    doi: String,
    zbmath: String,
    cairn: String,
}
impl Client {
    pub fn new() -> Result<Self> {
        Ok(Self {
            http: Http::new()?,
            doi: "https://doi.org/".into(),
            zbmath: "https://api.zbmath.org/v1/document/_search".into(),
            cairn: "https://oai.cairn.info/oai.php".into(),
        })
    }
    #[cfg(test)]
    pub(crate) fn testing(base: &str) -> Self {
        Self {
            http: Http::testing(base),
            doi: format!("{base}/doi/"),
            zbmath: format!("{base}/zbmath"),
            cairn: format!("{base}/cairn"),
        }
    }
    pub async fn search(&self, request: Search) -> Results {
        let mut query = request.query.trim().to_owned();
        if query.is_empty()
            || query.len() > 512
            || query.chars().any(char::is_control)
            || request.sources.is_empty()
            || request.sources.len() > 3
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
        let (a, b) = tokio::join!(run(Provider::Cairn), run(Provider::Zbmath));
        let mut result = Results::default();
        for (candidates, issue) in [a, b] {
            result.candidates.extend(candidates);
            result.issues.extend(issue);
        }
        if result.candidates.is_empty() {
            if let Some(doi) = exact {
                match self.bounded(Provider::Doi, self.resolve_doi(&doi)).await {
                    Ok(candidate) => result.candidates.extend(candidate),
                    Err(e) => result.issues.push(e),
                }
            } else if !targeted && !sources.contains(&Provider::Zbmath) {
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
            Provider::Cairn => self.cairn(query).await,
            Provider::Doi => {
                unreachable!("generic resolution is a fallback, not a search provider")
            }
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
    async fn cairn(&self, query: &str) -> Result<Vec<Candidate>> {
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
        if let Some(parent) = &notice.parent_doi
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
            && let Some(doi) = notice.entry["serial-number"]["doi"].as_str()
            && let Ok(Some(publication)) = self.resolve_doi(doi).await
            && publication.entry.get("parent").is_some()
        {
            entry["type"] = publication.entry["type"].clone();
            entry["parent"] = publication.entry["parent"].clone();
        }
        if entry.get("parent").is_none() {
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
