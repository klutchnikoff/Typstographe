use crate::native::{candidate, date, people, put, text};
use crate::{Candidate, Error, ErrorCode, Provider, Result, Warning};
use serde_json::{Value, json};

/// No field is synthesized from a deposit timestamp or a search score.
pub(crate) fn entry(record: &Value) -> (Value, Vec<Warning>) {
    let mut warnings = vec![];
    let kind = text(&record["type"]);
    let (child, parent) = match kind.as_str() {
        "journal-article" => ("article", Some("periodical")),
        "book-chapter" | "reference-entry" | "book-section" => ("chapter", Some("book")),
        "proceedings-article" => ("article", Some("proceedings")),
        "book" | "monograph" | "edited-book" | "reference-book" => ("book", None),
        "dissertation" => ("thesis", None),
        "report" => ("report", None),
        "posted-content" => ("article", None),
        "dataset" => ("repository", None),
        _ => {
            warnings.push(Warning::UnsupportedType);
            ("misc", None)
        }
    };
    let mut value = json!({"type":child});
    let title = text(&record["title"]);
    let container = text(&record["container-title"]);
    if child == "chapter" && !title.is_empty() && title == container {
        warnings.push(Warning::ChapterTitleMatchesBook);
    }
    put(&mut value, "title", title);
    let authors = people(&record["author"]);
    if !authors.is_empty() {
        value["author"] = json!(authors);
    }
    let doi = text(&record["DOI"]);
    if !doi.is_empty() {
        value["serial-number"] = json!({"doi":doi});
    }
    put(
        &mut value,
        "page-range",
        text(&record["page"]).replace('–', "-"),
    );
    if let Some(date) = date(record) {
        value["date"] = json!(date);
    }
    let url = text(&record["resource"]["primary"]["URL"]);
    put(
        &mut value,
        "url",
        if url.is_empty() {
            text(&record["URL"])
        } else {
            url
        },
    );
    if let Some(parent_kind) = parent {
        let mut p = json!({"type":parent_kind});
        put(&mut p, "title", container);
        publication(&mut p, record);
        if let Some(date) = date(record) {
            p["date"] = json!(date);
        }
        value["parent"] = json!([p]);
    } else {
        publication(&mut value, record);
    }
    (value, warnings)
}
fn publication(value: &mut Value, record: &Value) {
    let publisher = text(&record["publisher"]);
    if !publisher.is_empty() {
        value["publisher"] = json!({"name":publisher});
    }
    for (native, remote) in [("volume", "volume"), ("issue", "issue")] {
        put(value, native, text(&record[remote]));
    }
    for (native, remote) in [("isbn", "ISBN"), ("issn", "ISSN")] {
        let value_text = text(&record[remote]);
        if !value_text.is_empty() {
            value["serial-number"][native] = json!(value_text);
        }
    }
    let editors = people(&record["editor"]);
    if !editors.is_empty() {
        value["editor"] = json!(editors);
    }
}
pub(crate) fn parse(body: &str) -> Result<Vec<Candidate>> {
    let data: Value = serde_json::from_str(body)
        .map_err(|_| Error::new(Provider::Crossref, ErrorCode::InvalidResponse))?;
    if data["status"] != "ok" {
        return Err(Error::new(Provider::Crossref, ErrorCode::InvalidResponse));
    }
    let records = data["message"]["items"]
        .as_array()
        .cloned()
        .unwrap_or_else(|| vec![data["message"].clone()]);
    records
        .iter()
        .map(|record| {
            let doi = crate::doi(&text(&record["DOI"]))
                .ok_or_else(|| Error::new(Provider::Crossref, ErrorCode::InvalidResponse))?;
            let (entry, warnings) = entry(record);
            candidate(
                Provider::Crossref,
                format!("https://doi.org/{doi}"),
                entry,
                warnings,
            )
        })
        .collect()
}
