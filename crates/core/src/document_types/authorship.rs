//! Shared authorship value codecs. Fields, relations and views live in the YAML structure.
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize, Deserialize, schemars::JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct Author {
    pub id: String,
    pub name: String,
    #[serde(rename = "affiliation-ids")]
    pub affiliation_ids: Vec<String>,
    pub email: String,
    pub orcid: String,
    pub corresponding: bool,
}
#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize, Deserialize, schemars::JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct Affiliation {
    pub id: String,
    pub text: String,
    #[serde(default, skip_serializing_if = "String::is_empty")]
    pub department: String,
    #[serde(default, skip_serializing_if = "String::is_empty")]
    pub institution: String,
    #[serde(default, skip_serializing_if = "String::is_empty")]
    pub location: String,
}
