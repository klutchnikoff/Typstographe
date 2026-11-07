use crate::{Candidate, Error, ErrorCode, Provider, Result, Warning};
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use typstographe_bibliography::{Library, Record, RecordId, completeness, suggest_key, summarize};

pub(crate) fn candidate(
    provider: Provider,
    source_url: String,
    value: Value,
    mut warnings: Vec<Warning>,
) -> Result<Candidate> {
    let key = format!(
        "online-{}",
        Sha256::digest(serde_json::to_vec(&json!([provider, source_url, value])).unwrap())
            .iter()
            .map(|b| format!("{b:02x}"))
            .collect::<String>()
    );
    let record = Record::from_native(RecordId::new(key.clone()).unwrap(), "pending", value)
        .map_err(|_| Error::new(provider, ErrorCode::InvalidResponse))?;
    let record = record
        .renamed(
            &record.fingerprint(),
            &suggest_key(record.entry(), &Default::default()),
        )
        .map_err(|_| Error::new(provider, ErrorCode::InvalidResponse))?;
    if !completeness(&record).is_empty() {
        warnings.push(Warning::IncompleteMetadata);
    }
    warnings.sort_by_key(|w| format!("{w:?}"));
    warnings.dedup();
    let summary = summarize(record.entry());
    let native = record.native_value();
    let contents = Library::new(vec![record])
        .and_then(|l| l.to_hayagriva())
        .map_err(|_| Error::new(provider, ErrorCode::InvalidResponse))?;
    Ok(Candidate {
        id: key,
        provider,
        source_url,
        title: summary.title,
        authors: summary.authors,
        year: summary.year,
        doi: native
            .get("serial-number")
            .and_then(|v| v.get("doi"))
            .and_then(Value::as_str)
            .map(Into::into),
        entry: native,
        contents,
        warnings,
    })
}
pub(crate) fn text(value: &Value) -> String {
    match value {
        Value::String(s) => s.trim().to_string(),
        Value::Number(n) => n.to_string(),
        Value::Array(a) => a.first().map(text).unwrap_or_default(),
        _ => String::new(),
    }
}
pub(crate) fn put(value: &mut Value, key: &str, content: String) {
    if !content.is_empty() {
        value[key] = json!(content);
    }
}
pub(crate) fn people(value: &Value) -> Vec<Value> {
    value
        .as_array()
        .into_iter()
        .flatten()
        .filter_map(|person| {
            let family = text(&person["family"]);
            let given = text(&person["given"]);
            let name = if family.is_empty() {
                let literal = text(&person["literal"]);
                if literal.is_empty() {
                    text(&person["name"])
                } else {
                    literal
                }
            } else {
                family
            };
            if name.is_empty() {
                return None;
            }
            let mut person = json!({"name":name});
            put(&mut person, "given-name", given);
            Some(person)
        })
        .collect()
}
pub(crate) fn date(record: &Value) -> Option<String> {
    for key in ["published-print", "published-online", "published", "issued"] {
        if let Some(parts) = record[key]["date-parts"]
            .as_array()
            .and_then(|a| a.first())
            .and_then(Value::as_array)
        {
            let year = parts.first()?.as_i64()?;
            let mut result = format!("{year:04}");
            if let Some(month) = parts.get(1).and_then(Value::as_u64) {
                result.push_str(&format!("-{month:02}"));
                if let Some(day) = parts.get(2).and_then(Value::as_u64) {
                    result.push_str(&format!("-{day:02}"));
                }
            }
            return Some(result);
        }
    }
    None
}
