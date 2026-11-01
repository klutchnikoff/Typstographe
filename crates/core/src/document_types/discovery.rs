//! Product profiles share discovery across adapters without inventing executable types.
use super::DocumentType;
use serde::{Deserialize, Serialize};
use std::sync::OnceLock;

#[derive(Debug, Deserialize, Serialize)]
pub struct Group {
    pub name: String,
    pub id: String,
    pub label_key: String,
}
#[derive(Debug, Deserialize, Serialize)]
pub struct Profile {
    pub name: String,
    pub description: String,
    pub id: String,
    pub label_key: String,
    pub description_key: String,
    pub groups: Vec<String>,
    pub runtime_type: Option<DocumentType>,
    pub information: Vec<String>,
    pub capability_needs: Vec<String>,
    pub first_model: String,
    pub open_questions: Vec<String>,
    pub profile: String,
}
impl Profile {
    /// Availability follows the actual model registry, never a second manual flag.
    pub fn can_create(&self) -> bool {
        self.runtime_type.is_some_and(DocumentType::can_create)
    }
    pub fn status(&self) -> &'static str {
        if self.can_create() {
            "available"
        } else {
            "planned"
        }
    }
}
#[derive(Debug, Deserialize, Serialize)]
pub struct Catalogue {
    pub groups: Vec<Group>,
    pub types: Vec<Profile>,
}
pub fn catalogue() -> &'static Catalogue {
    static CATALOGUE: OnceLock<Catalogue> = OnceLock::new();
    CATALOGUE.get_or_init(|| {
        serde_json::from_str(include_str!("catalogue.json")).expect("built-in type profiles")
    })
}
pub fn find(id: &str) -> Option<&'static Profile> {
    catalogue().types.iter().find(|profile| profile.id == id)
}
pub fn describe(profile: &Profile) -> serde_json::Value {
    let mut result = serde_json::to_value(profile).expect("type profile");
    result["can_create"] = profile.can_create().into();
    result["status"] = profile.status().into();
    result
}
pub fn summary(profile: &Profile) -> serde_json::Value {
    serde_json::json!({
        "id": profile.id, "name": profile.name, "description": profile.description,
        "groups": profile.groups, "runtime_type": profile.runtime_type,
        "can_create": profile.can_create(), "status": profile.status()
    })
}
pub fn describe_all() -> serde_json::Value {
    serde_json::json!({
        "groups": catalogue().groups,
        "types": catalogue().types.iter().map(summary).collect::<Vec<_>>(),
        "scope": "Product profiles describe intended uses. Planned information and capability needs are not executable contracts; read each runtime type for actual metadata, capabilities and models."
    })
}

#[cfg(test)]
#[cfg_attr(coverage_nightly, coverage(off))]
mod tests {
    use super::*;
    use std::collections::BTreeSet;
    #[test]
    fn discovery_is_complete_unique_and_cannot_claim_unavailable_types() {
        let data = catalogue();
        let groups: BTreeSet<_> = data.groups.iter().map(|g| &g.id).collect();
        assert_eq!(groups.len(), data.groups.len());
        let mut ids = BTreeSet::new();
        let mut runtime = BTreeSet::new();
        for card in &data.types {
            assert!(ids.insert(&card.id));
            assert!(!card.groups.is_empty());
            assert!(card.groups.iter().all(|group| groups.contains(group)));
            assert!(!card.information.is_empty() && !card.capability_needs.is_empty());
            assert!(!card.first_model.is_empty() && !card.open_questions.is_empty());
            assert!(
                std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
                    .join("../..")
                    .join(&card.profile)
                    .is_file()
            );
            if let Some(kind) = card.runtime_type {
                assert!(runtime.insert(serde_json::to_string(&kind).unwrap()));
                assert_eq!(card.can_create(), kind.can_create());
            } else {
                assert!(!card.can_create());
            }
        }
        assert_eq!(runtime.len(), DocumentType::ALL.len());
        assert_eq!(
            data.types
                .iter()
                .filter(|c| c.can_create())
                .map(|c| c.id.as_str())
                .collect::<Vec<_>>(),
            ["courrier", "article"]
        );
        assert!(!find("thesis").unwrap().can_create());
        assert!(find("cover-letter").is_none());
        assert!(find("unknown").is_none());
    }
}
