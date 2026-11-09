use crate::native::put;
use crate::{Error, ErrorCode, Provider, Result};
use regex::Regex;
use serde_json::{Value, json};

pub(crate) struct Notice {
    pub entry: Value,
    pub parent_doi: Option<String>,
    pub source_url: String,
}
pub(crate) fn parse(body: &str, identifier: &str) -> Result<Option<Notice>> {
    let xml = roxmltree::Document::parse_with_options(
        body,
        roxmltree::ParsingOptions {
            nodes_limit: 20_000,
            ..Default::default()
        },
    )
    .map_err(|_| Error::new(Provider::Cairn, ErrorCode::InvalidResponse))?;
    let oai = "http://www.openarchives.org/OAI/2.0/";
    if let Some(error) = xml.descendants().find(|n| n.has_tag_name((oai, "error"))) {
        return if error.attribute("code") == Some("idDoesNotExist") {
            Ok(None)
        } else {
            Err(Error::new(Provider::Cairn, ErrorCode::InvalidResponse))
        };
    }
    let record = xml
        .descendants()
        .find(|n| n.has_tag_name((oai, "record")))
        .ok_or_else(|| Error::new(Provider::Cairn, ErrorCode::InvalidResponse))?;
    let expected = format!("oai:cairn.info:{identifier}");
    if !record
        .descendants()
        .any(|n| n.has_tag_name((oai, "identifier")) && n.text() == Some(&expected))
    {
        return Err(Error::new(Provider::Cairn, ErrorCode::InvalidResponse));
    }
    if record
        .descendants()
        .any(|n| n.has_tag_name((oai, "header")) && n.attribute("status") == Some("deleted"))
    {
        return Ok(None);
    }
    let values = |tag| {
        record
            .descendants()
            .filter(move |n| n.has_tag_name(("http://purl.org/dc/elements/1.1/", tag)))
            .filter_map(|n| n.text())
            .map(str::trim)
            .filter(|v| !v.is_empty())
            .collect::<Vec<_>>()
    };
    let identifiers = values("identifier");
    let doi = identifiers.iter().find_map(|v| crate::doi(v));
    let source_url = identifiers.iter().find(|v| v.starts_with("https://") && !v.contains("doi.org")).map(|v| v.to_string()).unwrap_or_else(|| format!("https://oai.cairn.info/oai.php?verb=GetRecord&metadataPrefix=oai_dc&identifier={identifier}"));
    let mut entry = json!({"type":"misc"});
    if let Some(title) = values("title").first() {
        put(&mut entry, "title", title.to_string());
    }
    let authors: Vec<_> = values("creator")
        .iter()
        .filter_map(|v| crate::zbmath::person(v))
        .collect();
    if !authors.is_empty() {
        entry["author"] = json!(authors);
    }
    if let Some(doi) = doi {
        entry["serial-number"] = json!({"doi":doi});
    }
    if let Some(date) = values("date").first() {
        put(&mut entry, "date", date.to_string());
    }
    if let Some(language) = values("language").first() {
        let language = match *language {
            "fre" | "fra" => "fr",
            "eng" => "en",
            other => other,
        };
        put(&mut entry, "language", language.to_owned());
    }
    let source = values("source").join(" ");
    let pages = Regex::new(r"p\.\s*(\d+)\s*[-–]\s*(\d+)").unwrap();
    if let Some(parts) = pages.captures(&source) {
        entry["page-range"] = json!(format!("{}-{}", &parts[1], &parts[2]));
    }
    let parent_doi = record
        .descendants()
        .filter(|n| {
            n.has_tag_name(("http://purl.org/dc/terms/", "isPartOf"))
                || n.has_tag_name(("http://purl.org/dc/elements/1.1/", "isPartOf"))
        })
        .filter_map(|n| n.text())
        .find_map(crate::doi);
    Ok(Some(Notice {
        entry,
        parent_doi,
        source_url,
    }))
}

/// Only explicit bibliographic meta tags identify an article; never guess from page text.
pub(crate) fn page_doi(html: &str) -> Option<String> {
    let tags = Regex::new(r"(?is)<meta\s+[^>]{0,8192}>").unwrap();
    let attrs = Regex::new(r#"(?i)([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')"#).unwrap();
    let mut dois = std::collections::BTreeSet::new();
    for tag in tags.find_iter(html) {
        let values: std::collections::BTreeMap<_, _> = attrs
            .captures_iter(tag.as_str())
            .map(|a| {
                (
                    a[1].to_ascii_lowercase(),
                    a.get(2).or_else(|| a.get(3)).unwrap().as_str().to_string(),
                )
            })
            .collect();
        let name = values.get("name").or_else(|| values.get("property"));
        if name.is_some_and(|n| {
            n.eq_ignore_ascii_case("citation_doi") || n.eq_ignore_ascii_case("dc.identifier")
        }) && let Some(doi) = values.get("content").and_then(|v| crate::doi(v))
        {
            dois.insert(doi.to_ascii_lowercase());
        }
    }
    if dois.len() == 1 {
        dois.into_iter().next()
    } else {
        None
    }
}
