use crate::{content::editorial::RichText, document::DocumentLanguage};
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use serde_json::Value;

// Keep common metadata flat in YAML without serde(flatten), which cannot be
// combined reliably with deny_unknown_fields. Each variant owns typed defaults.
macro_rules! fields {
    ($($variant:ident { $($members:tt)* }),* $(,)?) => {
        #[derive(Clone, Debug, PartialEq, Serialize, Deserialize, JsonSchema)]
        #[serde(tag = "kind", rename_all = "kebab-case", rename_all_fields = "kebab-case", deny_unknown_fields)]
        pub enum Field {
            $( $variant {
                id: String,
                label_key: String,
                #[serde(default)]
                required_for_export: bool,
                #[serde(default, skip_serializing_if = "Option::is_none")]
                control: Option<FieldControl>,
                #[serde(default, skip_serializing_if = "Option::is_none")]
                presentation: Option<crate::document_types::model_options::OptionId>,
                #[serde(default)]
                statistics: bool,
                $($members)*
            }, )*
        }
        impl Field {
            pub fn id(&self) -> &str {
                match self { $(Self::$variant {id, ..} => id,)* }
            }
            pub fn label_key(&self) -> &str {
                match self { $(Self::$variant {label_key, ..} => label_key,)* }
            }
            pub fn required_for_export(&self) -> bool {
                match self { $(Self::$variant {required_for_export, ..} => *required_for_export,)* }
            }
            pub fn control(&self) -> Option<FieldControl> {
                match self { $(Self::$variant {control, ..} => *control,)* }
            }
            pub fn presentation(&self) -> Option<crate::document_types::model_options::OptionId> {
                match self { $(Self::$variant {presentation, ..} => *presentation,)* }
            }
            pub fn statistics(&self) -> bool {
                match self { $(Self::$variant {statistics, ..} => *statistics,)* }
            }
            pub fn default_value(&self) -> Value {
                if self.presentation().is_some() { return Value::Null; }
                match self { $(Self::$variant {default, ..} => serde_json::to_value(default).expect("typed field default"),)* }
            }
        }
    }
}

fields! {
    Text {
        #[serde(default)]
        multiline: bool,
        #[serde(default)]
        default: String,
    },
    Date {
        #[serde(default)]
        default: Option<crate::dates::DateValue>,
    },
    ResourceReference {
        resource_kind: crate::resources::ResourceKind,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        profile_default: Option<crate::resources::ProfileDefault>,
        #[serde(default)]
        default: Option<crate::resources::ResourceReference>,
    },
    Boolean {
        #[serde(default)]
        default: bool,
    },
    Choice {
        choices: Vec<String>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        default: Option<String>,
    },
    Language {
        #[serde(default)]
        default: DocumentLanguage,
    },
    Tokens {
        #[serde(default)]
        default: Vec<String>,
    },
    RichText {
        profile: RichProfile,
        #[serde(default)]
        default: RichText,
    },
    RecordReferences {
        target_collection: String,
        unique: bool,
        on_target_remove: ReferenceRemoval,
        #[serde(default)]
        default: Vec<String>,
    },
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "kebab-case")]
pub enum RichProfile {
    InlineText,
    RichText,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "kebab-case")]
pub enum ReferenceRemoval {
    Restrict,
}

/// Registered controls change editing, not the stored value or Typst formatting.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "kebab-case")]
pub enum FieldControl {
    Outline,
}
