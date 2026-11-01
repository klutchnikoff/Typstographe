//! Ressources virtuelles uniquement ; aucun URI n’est converti en chemin disque.
use rmcp::model::Resource;

const RESOURCES: [(&str, &str, &str); 7] = [
    (
        "overview",
        "Start here",
        "Compact session overview, current document type and capabilities, rules and links to details.",
    ),
    (
        "content-capabilities",
        "Structured content contracts",
        "Compact semantic capability index; use capabilities.describe for one signature and its executable examples.",
    ),
    (
        "guide",
        "Usage guide",
        "Detailed editing rules and workflow. Read the compact overview first.",
    ),
    (
        "types",
        "Document types",
        "Compact type profiles and brief visual model cards. Use document_types.describe for fields and capabilities.",
    ),
    (
        "commands",
        "Documented command catalogue",
        "Compact operation index and adapter support. Use capabilities.describe for a schema; permissions are checked separately.",
    ),
    (
        "document",
        "Current document",
        "Coherent confirmed structured state, guard, metadata and zones. Includes the embedded model source as part of settings; no binary assets.",
    ),
    (
        "models",
        "Visual model catalogue",
        "Brief model cards for all types, with the active supplied model identified for the current type.",
    ),
];
pub fn list() -> Vec<Resource> {
    RESOURCES
        .into_iter()
        .map(|(id, name, description)| {
            Resource::new(format!("typstographe://{id}"), name)
                .with_description(description)
                .with_mime_type("application/json")
        })
        .collect()
}
pub fn known(uri: &str) -> bool {
    RESOURCES
        .iter()
        .any(|(id, _, _)| uri == format!("typstographe://{id}"))
}
