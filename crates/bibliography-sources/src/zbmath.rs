use crate::native::{candidate, put, text};
use crate::{Candidate, Error, ErrorCode, Provider, Result, Warning};
use serde_json::{Value, json};

pub(crate) fn parse(body: &str) -> Result<Vec<Candidate>> {
    let data: Value = serde_json::from_str(body)
        .map_err(|_| Error::new(Provider::Zbmath, ErrorCode::InvalidResponse))?;
    let records = data["result"]
        .as_array()
        .ok_or_else(|| Error::new(Provider::Zbmath, ErrorCode::InvalidResponse))?;
    records
        .iter()
        .map(|record| {
            let identifier = text(&record["identifier"]);
            if identifier.is_empty() {
                return Err(Error::new(Provider::Zbmath, ErrorCode::InvalidResponse));
            }
            let kind = text(&record["document_type"]["description"]).to_lowercase();
            let (child, parent) = match kind.as_str() {
                "journal article" => ("article", Some("periodical")),
                "book" => ("book", None),
                "collection article" | "book article" => ("chapter", Some("book")),
                "proceedings paper" => ("article", Some("proceedings")),
                "thesis" => ("thesis", None),
                _ => ("misc", None),
            };
            let mut value = json!({"type":child});
            put(&mut value, "title", text(&record["title"]["title"]));
            put(&mut value, "date", text(&record["year"]));
            put(&mut value, "page-range", text(&record["source"]["pages"]));
            let authors: Vec<Value> = record["contributors"]["authors"]
                .as_array()
                .into_iter()
                .flatten()
                .filter_map(|a| person(&text(&a["name"])))
                .collect();
            if !authors.is_empty() {
                value["author"] = json!(authors);
            }
            if let Some(links) = record["links"].as_array() {
                for link in links {
                    if link["type"] == "doi" {
                        value["serial-number"]["doi"] = json!(text(&link["identifier"]));
                    }
                }
            }
            let url = format!("https://zbmath.org/{identifier}");
            value["url"] = json!(url);
            if let Some(parent_kind) = parent {
                let source = &record["source"]["series"][0];
                let mut p = json!({"type":parent_kind});
                for (key, from) in [("title", "title"), ("volume", "volume"), ("issue", "issue")] {
                    put(&mut p, key, text(&source[from]));
                }
                let publisher = text(&source["publisher"]);
                if !publisher.is_empty() {
                    p["publisher"] = json!({"name":publisher});
                }
                if let Some(issn) = source["issn"].as_array().and_then(|a| a.first()) {
                    p["serial-number"]["issn"] = json!(text(&issn["number"]));
                }
                value["parent"] = json!([p]);
            }
            candidate(
                Provider::Zbmath,
                url,
                value,
                if child == "misc" {
                    vec![Warning::UnsupportedType]
                } else {
                    vec![]
                },
            )
        })
        .collect()
}
pub(crate) fn person(value: &str) -> Option<Value> {
    if value.trim().is_empty() {
        return None;
    }
    Some(if let Some((family, given)) = value.split_once(',') {
        json!({"name":family.trim(),"given-name":given.trim()})
    } else {
        json!({"name":value})
    })
}
