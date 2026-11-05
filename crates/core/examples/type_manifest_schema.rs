//! Print the schema generated from the YAML/Serde contract, without application state.
fn main() {
    println!(
        "{}",
        serde_json::to_string_pretty(
            &typstographe_core::document_types::definition::manifest_schema()
        )
        .expect("manifest schema JSON")
    );
}
