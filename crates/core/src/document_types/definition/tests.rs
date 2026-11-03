use super::*;
use serde_json::{Value, json};

const FIXTURE: &str = include_str!("../../../../../docs/proposals/b1/article-authorship.yaml");

fn raw() -> Value {
    serde_json::to_value(yaml_serde::from_str::<yaml_serde::Value>(FIXTURE).unwrap()).unwrap()
}

fn load(value: &Value) -> Result<LoadedDefinition, LoadError> {
    load_yaml(&serde_json::to_string(value).unwrap())
}

fn invalid(value: &Value, code: DiagnosticCode, path: &str) {
    let Err(LoadError::InvalidDefinition { diagnostics }) = load(value) else {
        panic!("expected semantic diagnostics for {value}");
    };
    assert!(
        diagnostics.iter().any(|d| d.code == code && d.path == path),
        "{diagnostics:?}"
    );
}

#[test]
fn authorship_fixture_preserves_relations_bindings_and_draft_defaults() {
    let loaded = load_yaml(FIXTURE).unwrap();
    assert_eq!(loaded.definition().id, "article");
    assert_eq!(
        loaded.defaults(),
        json!({"authors":[],"affiliations":[]})
            .as_object()
            .unwrap()
            .clone()
    );
    let author = loaded.record_defaults("authors").unwrap();
    assert_eq!(
        author,
        json!({"name":"","email":"","orcid":"","affiliation-ids":[],"corresponding":false})
            .as_object()
            .unwrap()
            .clone()
    );
    assert!(loaded.record_defaults("missing").is_none());
    let field = &loaded.definition().collections[1].fields[3];
    assert!(
        matches!(field, Field::RecordReferences {target_collection, on_target_remove: ReferenceRemoval::Restrict, ..} if target_collection == "affiliations")
    );
    assert!(loaded.definition().collections[1].fields[0].required_for_export());
    let yaml = yaml_serde::to_string(loaded.definition()).unwrap();
    assert_eq!(load_yaml(&yaml).unwrap(), loaded);
    let restored: Definition =
        serde_json::from_value(serde_json::to_value(loaded.definition()).unwrap()).unwrap();
    assert_eq!(restored.validate().unwrap(), loaded);
}

#[test]
fn source_errors_keep_locations_and_reject_multiple_documents() {
    for text in [
        "[unclosed",
        "contract-version: [",
        "",
        "---\nid: first\n---\nid: second",
    ] {
        assert!(
            matches!(load_yaml(text), Err(LoadError::Decode { .. })),
            "{text}"
        );
    }
    let Err(LoadError::Decode {
        line: Some(line),
        column: Some(column),
        ..
    }) = load_yaml("[unclosed")
    else {
        panic!("syntax error should keep line/column");
    };
    assert!(line > 0 && column > 0);
    assert!(matches!(
        load_yaml(&" ".repeat(MAX_SOURCE_BYTES + 1)),
        Err(LoadError::SourceTooLarge { .. })
    ));
}

#[test]
fn yaml_declarations_have_the_same_meaning_with_lf_and_crlf() {
    let lf = FIXTURE.replace("\r\n", "\n");
    let crlf = lf.replace('\n', "\r\n");
    assert_eq!(load_yaml(&lf).unwrap(), load_yaml(&crlf).unwrap());
}

#[test]
fn duplicate_yaml_keys_cannot_override_any_declaration_level() {
    for text in [
        format!("{FIXTURE}\nid: another\n"),
        FIXTURE.replace("default: false", "default: false\n        default: true"),
        FIXTURE.replace("kind: text", "kind: text\n        kind: boolean"),
        FIXTURE.replace("function: article", "function: article\n  function: other"),
    ] {
        let Err(LoadError::Decode { message, .. }) = load_yaml(&text) else {
            panic!("duplicate must fail")
        };
        assert!(message.contains("duplicate"), "{message}");
    }
}

#[test]
fn yaml_accepts_comments_and_aliases_but_not_merge_tags_or_non_json_keys() {
    assert!(
        load_yaml(
            &FIXTURE
                .replace(
                    "label-key: type-card-article",
                    "label-key: &label type-card-article"
                )
                .replace(
                    "description-key: type-card-article-description",
                    "description-key: *label"
                )
        )
        .is_ok()
    );
    for (text, construct) in [
        (
            format!("{FIXTURE}\n? [a, b]\n: value\n"),
            "non-string mapping key",
        ),
        (
            FIXTURE.replace("id: article", "id: !Custom article"),
            "custom tag",
        ),
        (format!("{FIXTURE}\n<<: {{id: other}}\n"), "merge key"),
        (format!("{FIXTURE}\ninvalid: .nan\n"), "non-finite number"),
    ] {
        assert!(
            matches!(load_yaml(&text), Err(LoadError::UnsupportedYaml {construct:c, ..}) if c == construct)
        );
    }
    // The maintained parser limits recursive alias expansion itself.
    assert!(matches!(
        load_yaml("id: &cycle [*cycle]"),
        Err(LoadError::Decode { .. })
    ));
}

#[test]
fn unknown_keys_variants_and_wrong_default_types_are_not_coerced() {
    let mutations = [
        ("/surprise", json!(true)),
        ("/collections/0/fields/0/typo", json!("value")),
        ("/collections/0/fields/0/default", json!(42)),
        ("/collections/1/fields/4/default", json!("false")),
        ("/collections/0/kind", json!("invented")),
        ("/collections/0/identity", json!("position")),
        ("/collections/1/fields/3/on-target-remove", json!("cascade")),
        ("/header/tabs/0/editing", json!("script")),
    ];
    for (path, replacement) in mutations {
        let mut value = raw();
        if let Some(field) = value.pointer_mut(path) {
            *field = replacement;
        } else {
            let (parent, key) = path.rsplit_once('/').unwrap();
            value.pointer_mut(parent).unwrap()[key] = replacement;
        }
        assert!(
            matches!(load(&value), Err(LoadError::Decode { .. })),
            "{path}"
        );
    }
    let mut value = raw();
    value["bindings"][0]["field"] = json!("also-a-field");
    assert!(matches!(load(&value), Err(LoadError::Decode { .. })));
}

#[test]
fn manifest_validation_checks_names_versions_limits_and_registered_capabilities() {
    for (path, replacement, code, diagnostic_path) in [
        (
            "/contract-version",
            json!(2),
            DiagnosticCode::UnsupportedVersion,
            "/contract-version",
        ),
        (
            "/id",
            json!("../article"),
            DiagnosticCode::InvalidIdentifier,
            "/id",
        ),
        (
            "/label-key",
            json!(""),
            DiagnosticCode::InvalidIdentifier,
            "/label-key",
        ),
        (
            "/composition/function",
            json!("article.with()"),
            DiagnosticCode::InvalidIdentifier,
            "/composition/function",
        ),
        (
            "/collections/0/max-items",
            json!(0),
            DiagnosticCode::InvalidLimit,
            "/collections/0",
        ),
        (
            "/collections/0/max-items",
            json!(101),
            DiagnosticCode::InvalidLimit,
            "/collections/0",
        ),
        (
            "/collections/0/fields/0/id",
            json!("id"),
            DiagnosticCode::ReservedIdentifier,
            "/collections/0/fields/0/id",
        ),
        (
            "/capabilities/0",
            json!("insert.math"),
            DiagnosticCode::UnsupportedCapability,
            "/capabilities/0",
        ),
        (
            "/capabilities/1",
            json!("block.paragraph"),
            DiagnosticCode::DuplicateIdentifier,
            "/capabilities/1",
        ),
    ] {
        let mut value = raw();
        *value.pointer_mut(path).unwrap() = replacement;
        invalid(&value, code, diagnostic_path);
    }
    let mut value = raw();
    value["collections"][1]["id"] = json!("affiliations");
    invalid(
        &value,
        DiagnosticCode::DuplicateIdentifier,
        "/collections/1/id",
    );
    let mut value = raw();
    value["collections"][0]["fields"] = json!([]);
    invalid(&value, DiagnosticCode::InvalidLimit, "/collections/0");
}

#[test]
fn references_defaults_and_explicit_removal_policy_are_checked_without_document_data() {
    for (key, value, code) in [
        (
            "target-collection",
            json!("missing"),
            DiagnosticCode::UnknownReference,
        ),
        (
            "default",
            json!(["assumed-record"]),
            DiagnosticCode::InvalidDefault,
        ),
        ("unique", json!(false), DiagnosticCode::UnsupportedPolicy),
    ] {
        let mut definition = raw();
        definition["collections"][1]["fields"][3][key] = value;
        invalid(&definition, code, &format!("/collections/1/fields/3/{key}"));
    }
    let mut value = raw();
    value["collections"][1]["fields"][1]["id"] = json!("name");
    invalid(
        &value,
        DiagnosticCode::DuplicateIdentifier,
        "/collections/1/fields/1/id",
    );
}

#[test]
fn bindings_reject_missing_sources_duplicate_parameters_and_code_injection() {
    let mut value = raw();
    value["bindings"][0]["collection"] = json!("absent");
    invalid(&value, DiagnosticCode::UnknownReference, "/bindings/0");
    invalid(&value, DiagnosticCode::MissingBinding, "/bindings");
    let mut value = raw();
    value["bindings"][1]["typst-parameter"] = json!("affiliations");
    invalid(&value, DiagnosticCode::DuplicateIdentifier, "/bindings/1");
    let mut value = raw();
    value["bindings"][0]["typst-parameter"] = json!("x: panic(\"oops\")");
    invalid(
        &value,
        DiagnosticCode::InvalidIdentifier,
        "/bindings/0/typst-parameter",
    );
    for keyword in ["if", "none", "let", "true"] {
        let mut value = raw();
        value["composition"]["function"] = json!(keyword);
        invalid(
            &value,
            DiagnosticCode::InvalidIdentifier,
            "/composition/function",
        );
        value = raw();
        value["bindings"][0]["typst-parameter"] = json!(keyword);
        invalid(
            &value,
            DiagnosticCode::InvalidIdentifier,
            "/bindings/0/typst-parameter",
        );
    }
}

#[test]
fn header_views_reference_existing_collections_and_cover_their_fields() {
    for (path, replacement, diagnostic_path) in [
        (
            "/header/tabs/0/collection",
            json!("missing"),
            "/header/tabs/0/collection",
        ),
        (
            "/header/tabs/0/summary-field",
            json!("missing"),
            "/header/tabs/0/summary-field",
        ),
    ] {
        let mut value = raw();
        *value.pointer_mut(path).unwrap() = replacement;
        invalid(&value, DiagnosticCode::UnknownReference, diagnostic_path);
    }
    let mut value = raw();
    value["header"]["tabs"][1]["fields"] = json!(["name"]);
    invalid(&value, DiagnosticCode::MissingView, "/header/tabs");
    value["header"]["tabs"].as_array_mut().unwrap().push(json!({
        "view":"record-cards", "id":"author-contact", "label-key":"field-email",
        "collection":"authors", "summary-field":"email", "editing":"dialog",
        "fields":["email","orcid","corresponding","affiliation-ids"]
    }));
    assert!(load(&value).is_ok());
    value["header"]["tabs"][2]["fields"][0] = json!("absent");
    invalid(
        &value,
        DiagnosticCode::UnknownReference,
        "/header/tabs/2/fields/0",
    );
}

fn scalar_fixture(fields: Value) -> Value {
    let fields = fields.as_array().unwrap();
    json!({
        "contract-version":1,"id":"test","label-key":"test","description-key":"test-description",
        "composition":{"function":"test"},"fields":fields,
        "bindings":fields.iter().map(|f|json!({"field":f["id"],"typst-parameter":f["id"]})).collect::<Vec<_>>(),
        "header":{"tabs":[{"id":"general","view":"form","label-key":"general",
            "sections":[{"id":"content","label-key":"content","fields":fields.iter().map(|f|f["id"].clone()).collect::<Vec<_>>()}]}]}
    })
}

#[test]
fn scalar_and_rich_fields_share_structural_schemas_and_explicit_defaults() {
    let value = scalar_fixture(json!([
        {"id":"style","label-key":"style","kind":"choice","choices":["apa","ieee"],"default":"apa"},
        {"id":"language","label-key":"language","kind":"language"},
        {"id":"keywords","label-key":"keywords","kind":"tokens","default":["étude"]},
        {"id":"abstract","label-key":"abstract","kind":"rich-text","profile":"rich-text"},
        {"id":"title","label-key":"title","kind":"rich-text","profile":"inline-text","required-for-export":true},
        {"id":"note","label-key":"note","kind":"text","multiline":true,"default":"First\nSecond"}
    ]));
    let loaded = load(&value).unwrap();
    let schema = loaded.values_schema();
    let validator = jsonschema::validator_for(&schema).unwrap();
    let defaults = Value::Object(loaded.defaults());
    let errors: Vec<_> = validator
        .iter_errors(&defaults)
        .map(|e| e.to_string())
        .collect();
    assert!(errors.is_empty(), "{errors:?}");
    assert_eq!(defaults["language"], "fr");
    assert_eq!(schema["properties"]["title"]["x-required-for-export"], true);
    let mut changed = defaults.clone();
    changed["language"] = json!("unknown");
    assert!(!validator.is_valid(&changed));
    changed = defaults.clone();
    changed["abstract"] = json!({"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"A real abstract"}]}]});
    assert!(validator.is_valid(&changed));
    changed["style"] = json!("not-an-option");
    assert!(!validator.is_valid(&changed));
    let manifest_validator = jsonschema::validator_for(&manifest_schema()).unwrap();
    assert!(manifest_validator.is_valid(&value));
    assert!(manifest_validator.is_valid(&serde_json::to_value(loaded.definition()).unwrap()));
}

#[test]
fn document_schema_preserves_empty_drafts_and_rejects_malformed_records() {
    let loaded = load_yaml(FIXTURE).unwrap();
    let schema = loaded.values_schema();
    let validator = jsonschema::validator_for(&schema).unwrap();
    let mut values = Value::Object(loaded.defaults());
    let mut author = loaded.record_defaults("authors").unwrap();
    author.insert("id".into(), json!("alice"));
    values["authors"] = json!([author]);
    // Name is required at export, not for a structurally valid saved draft.
    assert!(validator.is_valid(&values));
    values["authors"][0]["affiliation-ids"] = json!(["lab", "lab"]);
    assert!(!validator.is_valid(&values));
    values["authors"][0]["affiliation-ids"] = json!(["missing"]);
    // Existence is an engine rule, never falsely attributed to JSON Schema.
    assert!(validator.is_valid(&values));
    values["authors"][0]["unexpected"] = json!(true);
    assert!(!validator.is_valid(&values));
}

#[test]
fn invalid_defaults_and_compound_uniqueness_are_diagnosed() {
    for field in [
        json!({"id":"value","label-key":"value","kind":"choice","choices":["a"],"default":"b"}),
        json!({"id":"value","label-key":"value","kind":"tokens","default":["bad\nvalue"]}),
        json!({"id":"value","label-key":"value","kind":"text","default":"bad\nvalue"}),
        json!({"id":"value","label-key":"value","kind":"rich-text","profile":"inline-text","default":{"type":"doc","content":[{"type":"paragraph"},{"type":"paragraph"}]}}),
    ] {
        let value = scalar_fixture(json!([field]));
        let Err(LoadError::InvalidDefinition { diagnostics }) = load(&value) else {
            panic!("default should fail")
        };
        assert!(
            diagnostics
                .iter()
                .any(|d| d.code == DiagnosticCode::InvalidDefault)
        );
    }
    let mut value = raw();
    value["collections"][1]["unique-by"] = json!(["name", "corresponding"]);
    assert!(load(&value).is_ok());
    value["collections"][1]["unique-by"] = json!(["affiliation-ids"]);
    invalid(
        &value,
        DiagnosticCode::UnknownReference,
        "/collections/1/unique-by/0",
    );
}

#[test]
fn generated_manifest_schema_rejects_unknown_fields_and_field_default_types() {
    let validator = jsonschema::validator_for(&manifest_schema()).unwrap();
    assert!(validator.is_valid(&raw()));
    for (path, replacement) in [
        ("/collections/1/fields/4/default", json!("false")),
        ("/collections/0/max-items", json!(0)),
        ("/contract-version", json!(2)),
    ] {
        let mut value = raw();
        *value.pointer_mut(path).unwrap() = replacement;
        assert!(!validator.is_valid(&value), "{path}");
    }
    let mut value = raw();
    value["collections"][0]["fields"][0]["unknown"] = json!(true);
    assert!(!validator.is_valid(&value));
}

#[test]
fn loading_never_advertises_an_unimplemented_type_or_changes_the_live_registry() {
    let before = super::super::discovery::describe_all();
    let mut value = raw();
    value["id"] = json!("new-research-type");
    assert!(load(&value).is_ok());
    assert_eq!(super::super::discovery::describe_all(), before);
}

#[test]
fn published_manifest_schema_matches_the_serde_contract() {
    let published: Value = serde_json::from_str(include_str!(
        "../../../../../docs/schemas/type-definition.schema.json"
    ))
    .unwrap();
    assert_eq!(
        published,
        manifest_schema(),
        "regenerate the published schema with the type_manifest_schema example"
    );
}

#[test]
fn size_limits_use_utf8_bytes_and_schema_preserves_collection_bounds() {
    let text = "é".repeat(8001);
    let value = scalar_fixture(json!([{
        "id":"text", "label-key":"text", "kind":"text", "default":text
    }]));
    invalid(&value, DiagnosticCode::InvalidDefault, "/fields/0/default");
    let mut too_many = raw();
    too_many["collections"] = json!(vec![too_many["collections"][0].clone(); 65]);
    invalid(&too_many, DiagnosticCode::InvalidLimit, "/collections");
    let loaded = load_yaml(FIXTURE).unwrap();
    let schema = loaded.values_schema();
    let validator = jsonschema::validator_for(&schema).unwrap();
    let mut values = Value::Object(loaded.defaults());
    let mut author = loaded.record_defaults("authors").unwrap();
    author.insert("id".into(), json!("author"));
    values["authors"] = json!(vec![author; 101]);
    assert!(!validator.is_valid(&values));
}
