//! Bounded HTTP transport. DOI redirects may only reach known metadata services.
use crate::{Error, ErrorCode, Provider, Result};
use reqwest::{StatusCode, Url, header};
use std::time::{Duration, Instant};
use tokio::sync::{Mutex, Semaphore};
const MAX_BODY: usize = 2 * 1024 * 1024;
pub(crate) const CSL: &str = "application/vnd.citationstyles.csl+json";
pub(crate) struct Http {
    client: reqwest::Client,
    doi_clock: Mutex<Option<Instant>>,
    crossref_clock: Mutex<Option<Instant>>,
    slots: Semaphore,
    #[cfg(test)]
    origin: Option<Url>,
}
impl Http {
    pub fn new() -> Result<Self> {
        Ok(Self {
            client: reqwest::Client::builder()
                .user_agent("Typstographe/0.1 (https://github.com/klutchnikoff/Typstographe)")
                .timeout(Duration::from_secs(12))
                .connect_timeout(Duration::from_secs(5))
                .redirect(reqwest::redirect::Policy::none())
                .build()
                .map_err(|_| Error::new(Provider::Doi, ErrorCode::Network))?,
            doi_clock: Mutex::new(None),
            crossref_clock: Mutex::new(None),
            slots: Semaphore::new(3),
            #[cfg(test)]
            origin: None,
        })
    }
    #[cfg(test)]
    pub fn testing(base: &str) -> Self {
        let mut http = Self::new().unwrap();
        http.client = reqwest::Client::builder()
            .no_proxy()
            .redirect(reqwest::redirect::Policy::none())
            .timeout(Duration::from_secs(3))
            .build()
            .unwrap();
        http.origin = Some(Url::parse(base).unwrap());
        http
    }
    pub async fn get(
        &self,
        provider: Provider,
        mut url: Url,
        accept: &str,
    ) -> Result<Option<String>> {
        // The public Crossref pool allows a single request at a time.
        let mut crossref = if provider == Provider::Crossref {
            Some(self.crossref_clock.lock().await)
        } else {
            None
        };
        let _permit = self.slots.acquire().await.unwrap();
        if let Some(last) = crossref.as_deref_mut() {
            pace(last, Duration::from_millis(250)).await;
        }
        if provider == Provider::Doi {
            let mut last = self.doi_clock.lock().await;
            pace(&mut last, Duration::from_millis(400)).await;
        }
        for hop in 0..=5 {
            let mut response = self
                .client
                .get(url.clone())
                .header(header::ACCEPT, accept)
                .send()
                .await
                .map_err(|e| network(provider, e))?;
            if response.status().is_redirection() {
                let next = response
                    .headers()
                    .get(header::LOCATION)
                    .and_then(|v| v.to_str().ok())
                    .filter(|v| v.len() <= 4096)
                    .and_then(|v| url.join(v).ok())
                    .ok_or_else(|| Error::new(provider, ErrorCode::InvalidResponse))?;
                if hop == 5 {
                    return Err(Error::new(provider, ErrorCode::InvalidResponse));
                }
                if !self.allowed(provider, &next) {
                    return Err(Error::new(provider, ErrorCode::UnsupportedResponse));
                }
                url = next;
                continue;
            }
            if matches!(
                response.status(),
                StatusCode::NOT_FOUND | StatusCode::GONE | StatusCode::NO_CONTENT
            ) {
                return Ok(None);
            }
            if response.status() == StatusCode::NOT_ACCEPTABLE {
                return Err(Error::new(provider, ErrorCode::UnsupportedResponse));
            }
            if response.status() == StatusCode::FORBIDDEN && accept == "text/html" {
                return Err(Error::new(provider, ErrorCode::IdentifierRequired));
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
            while let Some(chunk) = response.chunk().await.map_err(|e| network(provider, e))? {
                if bytes.len().saturating_add(chunk.len()) > MAX_BODY {
                    return Err(Error::new(provider, ErrorCode::TooLarge));
                }
                bytes.extend_from_slice(&chunk);
            }
            return String::from_utf8(bytes)
                .map(Some)
                .map_err(|_| Error::new(provider, ErrorCode::InvalidResponse));
        }
        unreachable!("redirect bound returns on the final hop")
    }
    fn allowed(&self, provider: Provider, url: &Url) -> bool {
        #[cfg(test)]
        if let Some(origin) = &self.origin {
            return url.origin() == origin.origin();
        }
        if url.scheme() != "https"
            || !url.username().is_empty()
            || url.password().is_some()
            || url.port().is_some()
        {
            return false;
        }
        match provider {
            Provider::Doi => doi_host(url),
            Provider::Cairn => crate::input::cairn_host(url),
            Provider::Zbmath => url.host_str() == Some("api.zbmath.org"),
            Provider::Crossref => url.host_str() == Some("api.crossref.org"),
        }
    }
}
async fn pace(last: &mut Option<Instant>, interval: Duration) {
    if let Some(previous) = *last {
        tokio::time::sleep(interval.saturating_sub(previous.elapsed())).await;
    }
    *last = Some(Instant::now());
}

pub(crate) fn doi_host(url: &Url) -> bool {
    url.scheme() == "https"
        && url.username().is_empty()
        && url.password().is_none()
        && url.port().is_none()
        && matches!(
            url.host_str(),
            Some(
                "doi.org"
                    | "dx.doi.org"
                    | "api.crossref.org"
                    | "data.crossref.org"
                    | "data.crosscite.org"
                    | "data.datacite.org"
                    | "data.medra.org"
                    | "api.japanlinkcenter.org"
            )
        )
}
fn network(provider: Provider, e: reqwest::Error) -> Error {
    Error::new(
        provider,
        if e.is_timeout() {
            ErrorCode::Timeout
        } else {
            ErrorCode::Network
        },
    )
}
