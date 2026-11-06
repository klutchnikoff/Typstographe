use crate::{Candidate, Error, ErrorCode, Provider, Result, Results, Search, Warning};
use reqwest::{StatusCode, Url};
use std::{
    collections::BTreeSet,
    time::{Duration, Instant},
};
use tokio::sync::{Mutex, Semaphore};

const MAX_BODY: usize = 2 * 1024 * 1024;
/// One reusable HTTPS client, with bounded requests and independent provider failures.
pub struct Client {
    http: reqwest::Client,
    crossref: String,
    zbmath: String,
    cairn: String,
    crossref_clock: Mutex<Option<Instant>>,
    slots: Semaphore,
}
impl Client {
    pub fn new() -> Result<Self> {
        let http = reqwest::Client::builder()
            .user_agent("typstOgraphe/0.1 (https://github.com/klutchnikoff/typstOgraphe)")
            .timeout(Duration::from_secs(12))
            .connect_timeout(Duration::from_secs(5))
            .redirect(reqwest::redirect::Policy::none())
            .build()
            .map_err(|_| Error::new(Provider::Crossref, ErrorCode::Network))?;
        Ok(Self {
            http,
            crossref: "https://api.crossref.org/works".into(),
            zbmath: "https://api.zbmath.org/v1/document/_search".into(),
            cairn: "https://oai.cairn.info/oai.php".into(),
            crossref_clock: Mutex::new(None),
            slots: Semaphore::new(3),
        })
    }
    #[cfg(test)]
    pub(crate) fn testing(base: &str) -> Self {
        let mut client = Self::new().unwrap();
        client.http = reqwest::Client::builder()
            .no_proxy()
            .timeout(Duration::from_secs(3))
            .build()
            .unwrap();
        client.crossref = format!("{base}/crossref");
        client.zbmath = format!("{base}/zbmath");
        client.cairn = format!("{base}/cairn");
        client
    }
    pub async fn search(&self, request: Search) -> Results {
        let query = request.query.trim();
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
                    request
                        .sources
                        .first()
                        .copied()
                        .unwrap_or(Provider::Crossref),
                    ErrorCode::InvalidQuery,
                )],
            };
        }
        let sources: BTreeSet<_> = request.sources.into_iter().collect();
        let run = async |provider| {
            if !sources.contains(&provider)
                || (provider == Provider::Cairn
                    && sources.len() > 1
                    && crate::cairn_identifier(query).is_none()
                    && crate::input::cairn_page(query).is_none())
            {
                return (vec![], None);
            }
            let future = self.lookup(provider, query, request.limit);
            let result = tokio::time::timeout(Duration::from_secs(30), future)
                .await
                .unwrap_or_else(|_| Err(Error::new(provider, ErrorCode::Timeout)));
            match result {
                Ok(mut candidates) => {
                    candidates.truncate(request.limit);
                    (candidates, None)
                }
                Err(error) => (vec![], Some(error)),
            }
        };
        let (a, b, c) = tokio::join!(
            run(Provider::Crossref),
            run(Provider::Zbmath),
            run(Provider::Cairn)
        );
        let mut result = Results::default();
        for (candidates, issue) in [a, b, c] {
            result.candidates.extend(candidates);
            result.issues.extend(issue);
        }
        result
    }
    async fn lookup(
        &self,
        provider: Provider,
        query: &str,
        limit: usize,
    ) -> Result<Vec<Candidate>> {
        match provider {
            Provider::Crossref => {
                let mut url = Url::parse(&self.crossref).unwrap();
                let exact = crate::doi(query);
                if let Some(doi) = &exact {
                    url.path_segments_mut().unwrap().push(doi);
                } else {
                    url.query_pairs_mut()
                        .append_pair("query.bibliographic", query)
                        .append_pair("rows", &limit.to_string());
                }
                let Some(body) = self.get(provider, url).await? else {
                    return Ok(vec![]);
                };
                let records = crate::crossref::parse(&body)?;
                if let Some(doi) = exact
                    && records.iter().any(|r| {
                        r.doi
                            .as_deref()
                            .is_none_or(|d| !d.eq_ignore_ascii_case(&doi))
                    })
                {
                    return Err(Error::new(provider, ErrorCode::InvalidResponse));
                }
                Ok(records)
            }
            Provider::Zbmath => {
                let mut url = Url::parse(&self.zbmath).unwrap();
                let query = crate::doi(query)
                    .map(|d| format!("doi:{d}"))
                    .unwrap_or_else(|| query.to_string());
                url.query_pairs_mut()
                    .append_pair("search_string", &query)
                    .append_pair("results_per_page", &limit.to_string())
                    .append_pair("page", "0");
                let Some(body) = self.get(provider, url).await? else {
                    return Ok(vec![]);
                };
                crate::zbmath::parse(&body)
            }
            Provider::Cairn => self.cairn(query).await,
        }
    }
    async fn get(&self, provider: Provider, url: Url) -> Result<Option<String>> {
        let _permit = self.slots.acquire().await.unwrap();
        if provider == Provider::Crossref {
            let mut last = self.crossref_clock.lock().await;
            if let Some(previous) = *last {
                tokio::time::sleep(Duration::from_millis(400).saturating_sub(previous.elapsed()))
                    .await;
            }
            *last = Some(Instant::now());
        }
        let mut response = self.http.get(url).send().await.map_err(|e| {
            Error::new(
                provider,
                if e.is_timeout() {
                    ErrorCode::Timeout
                } else {
                    ErrorCode::Network
                },
            )
        })?;
        if response.status() == StatusCode::NOT_FOUND {
            return Ok(None);
        }
        if response.status() == StatusCode::TOO_MANY_REQUESTS {
            return Err(Error {
                provider,
                code: ErrorCode::RateLimited,
                retry_after: response
                    .headers()
                    .get("retry-after")
                    .and_then(|s| s.to_str().ok())
                    .and_then(|s| s.parse().ok()),
            });
        }
        if !response.status().is_success() {
            return Err(Error::new(provider, ErrorCode::Unavailable));
        }
        if response
            .content_length()
            .is_some_and(|size| size > MAX_BODY as u64)
        {
            return Err(Error::new(provider, ErrorCode::TooLarge));
        }
        let mut bytes = vec![];
        while let Some(chunk) = response.chunk().await.map_err(|e| {
            Error::new(
                provider,
                if e.is_timeout() {
                    ErrorCode::Timeout
                } else {
                    ErrorCode::Network
                },
            )
        })? {
            if bytes.len().saturating_add(chunk.len()) > MAX_BODY {
                return Err(Error::new(provider, ErrorCode::TooLarge));
            }
            bytes.extend_from_slice(&chunk);
        }
        String::from_utf8(bytes)
            .map(Some)
            .map_err(|_| Error::new(provider, ErrorCode::InvalidResponse))
    }
    async fn cairn(&self, query: &str) -> Result<Vec<Candidate>> {
        let id = if let Some(id) = crate::cairn_identifier(query) {
            id
        } else if let Some((isbn, page)) = crate::input::cairn_page(query) {
            let mut url = Url::parse(&self.crossref).unwrap();
            url.query_pairs_mut()
                .append_pair("filter", &format!("isbn:{isbn}"))
                .append_pair("select", "DOI,page,resource")
                .append_pair("rows", "300");
            let Some(body) = self.get(Provider::Crossref, url).await? else {
                return Ok(vec![]);
            };
            resolve_page(&body, query, &page)?
        } else {
            return Err(Error::new(Provider::Cairn, ErrorCode::UnsupportedQuery));
        };
        let mut url = Url::parse(&self.cairn).unwrap();
        url.query_pairs_mut()
            .append_pair("verb", "GetRecord")
            .append_pair("metadataPrefix", "oai_dc")
            .append_pair("identifier", &id);
        let Some(body) = self.get(Provider::Cairn, url).await? else {
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
        let mut warnings = vec![];
        let mut entry = serde_json::json!({"type":"misc"});
        // Cairn DC supplies the chapter's own title; Crossref supplies optional
        // container metadata. A failure of that auxiliary source keeps the Cairn result usable.
        let mut parent_found = false;
        if let Some(doi) = notice.entry["serial-number"]["doi"].as_str() {
            let mut url = Url::parse(&self.crossref).unwrap();
            url.path_segments_mut().unwrap().push(doi);
            if let Ok(Some(body)) = self.get(Provider::Crossref, url).await
                && let Ok(data) = serde_json::from_str::<serde_json::Value>(&body)
                && data["message"]["DOI"]
                    .as_str()
                    .is_some_and(|d| d.eq_ignore_ascii_case(doi))
            {
                entry = crate::crossref::entry(&data["message"]).0;
                parent_found = entry.get("parent").is_some();
            }
        }
        if !parent_found && let Some(parent) = &notice.parent_doi {
            let mut url = Url::parse(&self.crossref).unwrap();
            url.path_segments_mut().unwrap().push(parent);
            if let Ok(Some(body)) = self.get(Provider::Crossref, url).await
                && let Ok(data) = serde_json::from_str::<serde_json::Value>(&body)
                && data["message"]["DOI"]
                    .as_str()
                    .is_some_and(|d| d.eq_ignore_ascii_case(parent))
            {
                let p = crate::crossref::entry(&data["message"]).0;
                if p["type"] == "book" {
                    entry["type"] = serde_json::json!("chapter");
                    entry["parent"] = serde_json::json!([p]);
                    parent_found = true;
                }
            }
        }
        if !parent_found {
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
pub(crate) fn resolve_page(body: &str, query: &str, page: &str) -> Result<String> {
    let data: serde_json::Value = serde_json::from_str(body)
        .map_err(|_| Error::new(Provider::Cairn, ErrorCode::InvalidResponse))?;
    let path = Url::parse(query)
        .map_err(|_| Error::new(Provider::Cairn, ErrorCode::InvalidQuery))?
        .path()
        .to_string();
    let ids: BTreeSet<_> = data["message"]["items"]
        .as_array()
        .into_iter()
        .flatten()
        .filter(|r| {
            r["page"].as_str().and_then(|p| p.split('-').next()) == Some(page)
                && r["resource"]["primary"]["URL"]
                    .as_str()
                    .and_then(|u| Url::parse(u).ok())
                    .is_some_and(|u| crate::input::cairn_host(&u) && u.path() == path)
        })
        .filter_map(|r| r["DOI"].as_str())
        .filter_map(crate::cairn_identifier)
        .collect();
    if ids.len() == 1 {
        Ok(ids.into_iter().next().unwrap())
    } else {
        Err(Error::new(Provider::Cairn, ErrorCode::UnsupportedQuery))
    }
}
