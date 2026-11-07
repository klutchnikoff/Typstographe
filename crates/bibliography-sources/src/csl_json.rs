use crate::native::{candidate, date, people, put, text};
use crate::{Candidate, Error, ErrorCode, Provider, Result, Warning};
use serde_json::{Value, json};

/// No field is synthesized from a deposit timestamp or a search score.
pub(crate) fn entry(record: &Value) -> (Value, Vec<Warning>) {
    let mut warnings = vec![];
    let kind = text(&record["type"]);
    let (child, parent) = match kind.as_str() {
        "article-journal" | "journal-article" | "article-magazine" | "article-newspaper" => {
            ("article", Some("periodical"))
        }
        "chapter" | "entry-dictionary" | "entry-encyclopedia" | "book-chapter"
        | "reference-entry" | "book-section" => ("chapter", Some("book")),
        "paper-conference" | "proceedings-article" => ("article", Some("proceedings")),
        "book" | "monograph" | "edited-book" | "reference-book" => ("book", None),
        "thesis" | "dissertation" => ("thesis", None),
        "report" => ("report", None),
        "periodical" | "journal" | "journal-issue" => ("periodical", None),
        "webpage" | "post-weblog" => ("web", None),
        "article" | "posted-content" => ("article", None),
        "dataset" | "software" => ("repository", None),
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
    put(&mut value, "url", text(&record["URL"]));
    for key in ["language", "edition", "version"] {
        put(&mut value, key, text(&record[key]));
    }
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
        let mut p = json!({"name":publisher});
        put(&mut p, "location", text(&record["publisher-place"]));
        value["publisher"] = p;
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
/// Read the single CSL-JSON item returned by the DOI content-negotiation service.
pub(crate) fn parse(body: &str, expected: &str) -> Result<Candidate> {
    let data: Value = serde_json::from_str(body)
        .map_err(|_| Error::new(Provider::Doi, ErrorCode::InvalidResponse))?;
    let record = if let Some(items) = data.as_array() {
        if items.len() != 1 {
            return Err(Error::new(Provider::Doi, ErrorCode::InvalidResponse));
        }
        &items[0]
    } else {
        &data
    };
    let doi = crate::doi(&text(&record["DOI"]))
        .or_else(|| crate::doi(&text(&record["id"])))
        .filter(|doi| doi.eq_ignore_ascii_case(expected))
        .ok_or_else(|| Error::new(Provider::Doi, ErrorCode::InvalidResponse))?;
    if !record["type"].is_string() {
        return Err(Error::new(Provider::Doi, ErrorCode::InvalidResponse));
    }
    let (mut entry, warnings) = entry(record);
    entry["serial-number"]["doi"] = json!(doi);
    candidate(
        Provider::Doi,
        format!("https://doi.org/{doi}"),
        entry,
        warnings,
    )
}
