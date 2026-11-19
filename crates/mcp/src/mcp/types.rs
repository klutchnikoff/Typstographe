use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use typstographe_core::content::contract::Guard;
#[derive(Clone, Debug, Deserialize, Serialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct DocumentRef {
    pub id: String,
    pub guard: Guard,
}

pub(super) enum DocumentReferencePolicy {
    Optional,
    RequiredWhenOpen,
    Required,
}

impl DocumentReferencePolicy {
    pub(super) fn for_tool(name: &str) -> Self {
        match name {
            "document.inspect"
            | "commands.list"
            | "document_types.list"
            | "document_types.describe"
            | "capabilities.describe"
            | "spelling.suggestions" => Self::Optional,
            "document.new" | "document.open" => Self::RequiredWhenOpen,
            _ => Self::Required,
        }
    }

    pub(super) fn required(&self, document_open: bool) -> bool {
        match self {
            Self::Optional => false,
            Self::RequiredWhenOpen => document_open,
            Self::Required => true,
        }
    }
}

pub struct Reply {
    pub value: serde_json::Value,
    pub png: Option<Vec<u8>>,
}
