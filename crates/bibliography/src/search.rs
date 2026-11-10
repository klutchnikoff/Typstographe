use crate::{Record, RecordId};
use hayagriva::Entry;
use serde::{Deserialize, Serialize};
use unicode_normalization::{UnicodeNormalization, char::is_combining_mark};

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct EntrySummary {
    pub key: String,
    pub title: String,
    pub authors: String,
    pub year: Option<i32>,
    /// Compact names, independent of final citation style and localized "no date".
    pub names: String,
}

pub fn summarize(entry: &Entry) -> EntrySummary {
    let title = entry
        .title()
        .map(|v| v.value.to_string())
        .unwrap_or_default();
    let people = entry.authors().or_else(|| entry.editors()).unwrap_or(&[]);
    let authors = people
        .iter()
        .map(|p| p.name_first(false, false))
        .collect::<Vec<_>>()
        .join(", ");
    let names = match people {
        [] if title.is_empty() => entry.key().into(),
        [] => title.clone(),
        [a] => a.name.clone(),
        [a, b] => format!("{} & {}", a.name, b.name),
        [a, ..] => format!("{} et al.", a.name),
    };
    EntrySummary {
        key: entry.key().into(),
        title,
        authors,
        names,
        year: entry.date_any().map(|d| d.year),
    }
}

pub fn normalize_text(value: &str) -> String {
    value
        .nfd()
        .filter(|c| !is_combining_mark(*c))
        .flat_map(char::to_lowercase)
        .collect()
}

/// Normalize query tokens once per search, including for source-based callers.
pub struct SearchQuery {
    tokens: Option<Vec<String>>,
}

impl SearchQuery {
    pub fn new(query: &str) -> Self {
        Self {
            tokens: (query.len() <= 512).then(|| {
                normalize_text(query)
                    .split_whitespace()
                    .map(Into::into)
                    .collect()
            }),
        }
    }
    pub fn score(&self, title: &str, authors: &str) -> Option<f64> {
        let text = normalize_text(&format!("{title} {authors}"));
        self.score_tokens(|token| text_score(&text, token))
    }

    /// Citation discovery adds the public key and both forms of a known year.
    pub fn score_citation(&self, title: &str, authors: &str, key: &str, year: &str) -> Option<f64> {
        let prose = normalize_text(&format!("{title} {authors}"));
        let key = normalize_text(key);
        let short_year = year
            .parse::<i32>()
            .ok()
            .map(|value| format!("{:02}", value.unsigned_abs() % 100));
        self.score_tokens(|token| {
            if token == key
                || short_year
                    .as_deref()
                    .is_some_and(|short| token == short || token == year)
            {
                return 1.25;
            }
            text_score(&prose, token).max(text_score(&key, token))
        })
    }

    fn score_tokens(&self, mut score: impl FnMut(&str) -> f64) -> Option<f64> {
        self.tokens
            .as_ref()?
            .iter()
            .map(|token| {
                let best = score(token);
                (best >= 0.84).then_some(best)
            })
            .sum()
    }
}

fn text_score(text: &str, token: &str) -> f64 {
    if text.contains(token) {
        1.0
    } else {
        text.split(|c: char| !c.is_alphanumeric())
            .map(|word| strsim::jaro_winkler(token, word))
            .fold(0.0, f64::max)
    }
}

/// Fuzzy search is a discovery aid, never evidence permitting a merge.
pub fn search(records: &[Record], query: &str, limit: usize) -> Vec<RecordId> {
    let query = SearchQuery::new(query);
    let mut scored = records
        .iter()
        .filter_map(|record| {
            let summary = summarize(record.entry());
            query
                .score(&summary.title, &summary.authors)
                .map(|score| (score, record.id(), summary))
        })
        .collect::<Vec<_>>();
    scored.sort_by(|a, b| {
        b.0.total_cmp(&a.0)
            .then_with(|| a.2.title.cmp(&b.2.title))
            .then_with(|| a.1.cmp(b.1))
    });
    scored
        .into_iter()
        .take(limit)
        .map(|(_, id, _)| id.clone())
        .collect()
}
