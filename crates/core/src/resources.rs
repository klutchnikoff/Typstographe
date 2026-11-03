//! Typed internal image references. Host paths and private preferences stay outside the core.
use crate::{
    assets::{self, Assets},
    errors::{CoreError, StorageError},
};
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

/// Logical project path, serialized as a string; bytes belong to the immutable pool.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(transparent)]
pub struct ResourceReference(
    #[serde(deserialize_with = "read_path")]
    #[schemars(
        regex(pattern = r"^images/[A-Za-z0-9_-]+\.(png|jpg|svg)$"),
        length(max = 128)
    )]
    String,
);
impl ResourceReference {
    pub fn new(path: String) -> Result<Self, &'static str> {
        if assets::valid_path(&path) {
            Ok(Self(path))
        } else {
            Err("invalid internal image reference")
        }
    }
    pub fn path(&self) -> &str {
        &self.0
    }
}
impl std::ops::Deref for ResourceReference {
    type Target = str;
    fn deref(&self) -> &str {
        self.path()
    }
}
fn read_path<'de, D: serde::Deserializer<'de>>(d: D) -> Result<String, D::Error> {
    let value = String::deserialize(d)?;
    ResourceReference::new(value)
        .map(|r| r.0)
        .map_err(serde::de::Error::custom)
}
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "kebab-case")]
pub enum ResourceKind {
    Image,
}
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "kebab-case")]
pub enum ProfileDefault {
    Signature,
}
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct ResourceDescriptor {
    pub kind: ResourceKind,
    pub profile_default: Option<ProfileDefault>,
}

/// Archive boundaries validate byte pools; live edits reuse images validated at admission.
pub(crate) fn validate_pool(assets: &Assets) -> Result<(), CoreError> {
    let mut size = 0usize;
    for (path, bytes) in assets {
        if !assets::valid_path(path) {
            return Err(StorageError::UnexpectedEntry { name: path.clone() }.into());
        }
        size = size
            .checked_add(bytes.len())
            .filter(|n| *n <= assets::MAX_DOCUMENT_BYTES as usize)
            .ok_or(StorageError::ExpandedTooLarge)?;
        assets::decode(bytes, path.rsplit('.').next().unwrap_or(""))?;
    }
    Ok(())
}
pub(crate) fn validate_references(
    metadata: &crate::document_types::Metadata,
    assets: &Assets,
) -> Result<(), StorageError> {
    for path in metadata.resource_paths() {
        if !assets.contains_key(&path) {
            return Err(StorageError::ImageResourceMissing { path });
        }
    }
    Ok(())
}

#[cfg(test)]
#[cfg_attr(coverage_nightly, coverage(off))]
mod tests {
    use super::*;
    use serde_json::json;
    #[test]
    fn references_are_internal_typed_paths_and_nullable_values_have_no_profile_link() {
        for path in [
            "images/logo.png",
            "images/signature.svg",
            "images/portrait.jpg",
        ] {
            let reference: ResourceReference = serde_json::from_value(json!(path)).unwrap();
            assert_eq!(reference.path(), path);
            assert_eq!(serde_json::to_value(reference).unwrap(), json!(path));
        }
        for value in [
            json!("/Users/a/signature.svg"),
            json!("https://example.org/image.png"),
            json!("images/../x.png"),
            json!("images/x.pdf"),
            json!("images/x.jpeg"),
            json!("images/x\n.svg"),
            json!({"path":"images/x.svg"}),
        ] {
            assert!(serde_json::from_value::<ResourceReference>(value).is_err());
        }
        assert!(
            serde_json::from_value::<Option<ResourceReference>>(json!(null))
                .unwrap()
                .is_none()
        );
        let mut assets = Assets::default();
        assets.insert("images/broken.svg".into(), b"broken".as_slice().into());
        assert!(validate_pool(&assets).is_err());
        assets.clear();
        assets.insert(
            "../escape.svg".into(),
            include_bytes!("../../../fixtures/parc.svg")
                .as_slice()
                .into(),
        );
        assert!(validate_pool(&assets).is_err());
    }
}
