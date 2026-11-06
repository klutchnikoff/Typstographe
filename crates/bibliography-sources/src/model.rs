use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(
    Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize, JsonSchema,
)]
#[serde(rename_all = "snake_case")]
pub enum Provider {
    Crossref,
    Zbmath,
    Cairn,
}
impl Provider {
    pub fn label(self) -> &'static str {
        match self {
            Self::Crossref => "Crossref",
            Self::Zbmath => "zbMATH Open",
            Self::Cairn => "Cairn.info",
        }
    }
}
#[derive(Clone, Debug, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct Search {
    pub query: String,
    pub sources: Vec<Provider>,
    #[serde(default = "default_limit")]
    pub limit: usize,
}
fn default_limit() -> usize {
    8
}
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum Warning {
    ChapterTitleMatchesBook,
    IncompleteMetadata,
    UnsupportedType,
    ParentUnavailable,
}
#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
pub struct Candidate {
    pub id: String,
    pub provider: Provider,
    pub source_url: String,
    pub title: String,
    pub authors: String,
    pub year: Option<i32>,
    pub doi: Option<String>,
    /// Native values for verification; never HTML to be rendered directly.
    pub entry: Value,
    /// Converted acquisition snapshot, not the provider's original JSON/XML.
    pub contents: String,
    pub warnings: Vec<Warning>,
}
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum ErrorCode {
    InvalidQuery,
    UnsupportedQuery,
    Network,
    Timeout,
    RateLimited,
    Unavailable,
    InvalidResponse,
    TooLarge,
}
#[derive(Clone, Debug, PartialEq, Eq, thiserror::Error, Serialize, Deserialize, JsonSchema)]
#[error("{provider:?}: {code:?}")]
pub struct Error {
    pub provider: Provider,
    pub code: ErrorCode,
    pub retry_after: Option<u64>,
}
impl Error {
    pub(crate) fn new(provider: Provider, code: ErrorCode) -> Self {
        Self {
            provider,
            code,
            retry_after: None,
        }
    }
}
#[derive(Clone, Debug, Default, Serialize, JsonSchema)]
pub struct Results {
    pub candidates: Vec<Candidate>,
    pub issues: Vec<Error>,
}
pub type Result<T> = std::result::Result<T, Error>;
