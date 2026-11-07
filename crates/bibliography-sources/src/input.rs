use reqwest::Url;

pub fn doi(query: &str) -> Option<String> {
    let value = query.trim();
    let value = if value.starts_with("http://") || value.starts_with("https://") {
        let url = Url::parse(value).ok()?;
        if !matches!(url.host_str(), Some("doi.org" | "dx.doi.org"))
            || url.query().is_some()
            || url.fragment().is_some()
        {
            return None;
        }
        url.path().strip_prefix('/')?.to_string()
    } else {
        value
            .strip_prefix("doi:")
            .unwrap_or(value)
            .trim()
            .to_string()
    };
    let (prefix, suffix) = value.split_once('/')?;
    if prefix.strip_prefix("10.")?.len() < 4
        || !prefix[3..].bytes().all(|c| c.is_ascii_digit())
        || suffix.is_empty()
        || value.len() > 240
        || value.chars().any(|c| c.is_whitespace() || c.is_control())
    {
        return None;
    }
    Some(value)
}
fn identifier(value: &str) -> Option<String> {
    let value = value
        .trim()
        .strip_prefix("oai:cairn.info:")
        .unwrap_or(value.trim());
    if value.is_empty()
        || value.len() > 180
        || !value.chars().all(|c| c.is_ascii_alphanumeric() || c == '_')
        || !value.contains('_')
    {
        return None;
    }
    Some(value.to_ascii_uppercase())
}
pub fn cairn_identifier(query: &str) -> Option<String> {
    if let Some(doi) = doi(query) {
        let suffix = doi.strip_prefix("10.3917/")?;
        return identifier(&suffix.replace('.', "_"));
    }
    if let Some(id) = identifier(query) {
        return Some(id);
    }
    if let Ok(url) = Url::parse(query) {
        if !cairn_host(&url) {
            return None;
        }
        for (key, value) in url.query_pairs() {
            if matches!(key.as_ref(), "identifier" | "ID_ARTICLE" | "id_article")
                && let Some(id) = identifier(&value)
            {
                return Some(id);
            }
        }
        return url
            .path()
            .strip_prefix("/article/")
            .and_then(|p| p.split('/').next())
            .and_then(identifier);
    }
    identifier(query)
}
pub(crate) fn cairn_host(url: &Url) -> bool {
    matches!(url.scheme(), "http" | "https")
        && matches!(
            url.host_str(),
            Some(
                "cairn.info"
                    | "www.cairn.info"
                    | "shs.cairn.info"
                    | "stm.cairn.info"
                    | "droit.cairn.info"
                    | "oai.cairn.info"
            )
        )
        && url.username().is_empty()
        && url.password().is_none()
        && url.port().is_none()
}
