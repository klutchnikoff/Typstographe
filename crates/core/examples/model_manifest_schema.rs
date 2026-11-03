fn main() {
    println!(
        "{}",
        serde_json::to_string_pretty(&schemars::schema_for!(
            typstographe_core::document_types::model_options::Manifest
        ))
        .unwrap()
    );
}
