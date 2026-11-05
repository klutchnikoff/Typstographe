use super::*;
use crate::content::api::{Call, Session};

fn policy() -> Manifest {
    load(DocumentType::Article.default_model_manifest()).unwrap()
}
fn encoded(manifest: &Manifest) -> String {
    yaml_serde::to_string(manifest).unwrap()
}
fn call(id: &str, params: Value) -> Call {
    Call {
        id: id.into(),
        params,
    }
}

#[test]
fn strict_manifests_reject_incomplete_domains_content_overrides_and_ambiguous_yaml() {
    let source = DocumentType::Article.default_model_manifest();
    for source in [
        format!("{source}\noptions: {{}}"),
        source.replace("regime: free", "regime: unknown"),
        source.replace("default: a4", "default: a0"),
        source.replace("paper:", "authors:"),
        source.replace("languages: [fr, en, de, es, it, pt, nl]", "languages: []"),
    ] {
        assert!(load(&source).is_err(), "{source}");
    }
    let mut manifest = policy();
    manifest.options.remove(&OptionId::Outline);
    assert!(load(&encoded(&manifest)).is_err());
    for (allowed, default) in [
        (vec![], json!("a4")),
        (vec![json!("a5")], json!("a4")),
        (vec![json!("a4"), json!("a4")], json!("a4")),
        (vec![json!("a0")], json!("a0")),
    ] {
        let mut manifest = policy();
        manifest
            .options
            .insert(OptionId::Paper, Policy::Restricted { allowed, default });
        assert!(load(&encoded(&manifest)).is_err());
    }
}

#[test]
fn automatic_explicit_substituted_and_imposed_values_never_rewrite_the_document() {
    let mut metadata = Metadata::demo(DocumentType::Article);
    let mut manifest = policy();
    manifest.options.insert(
        OptionId::Paper,
        Policy::Free {
            default: json!("a5"),
        },
    );
    assert_eq!(
        manifest.resolve(&metadata).unwrap().options[&OptionId::Paper].effective,
        json!("a5")
    );
    metadata.options_mut().paper = Some(PaperFormat::A3);
    let original = metadata.clone();
    assert_eq!(
        manifest.resolve(&metadata).unwrap().options[&OptionId::Paper].effective,
        json!("a3")
    );
    manifest.options.insert(
        OptionId::Paper,
        Policy::Restricted {
            allowed: vec![json!("a4"), json!("a5")],
            default: json!("a5"),
        },
    );
    let resolved = manifest.resolve(&metadata).unwrap();
    assert!(resolved.options[&OptionId::Paper].substituted);
    assert_eq!(resolved.options[&OptionId::Paper].choice, json!("a3"));
    assert_eq!(resolved.options[&OptionId::Paper].effective, json!("a5"));
    manifest.options.insert(
        OptionId::Paper,
        Policy::Imposed {
            value: json!("us-letter"),
        },
    );
    let resolved = manifest.resolve(&metadata).unwrap();
    assert_eq!(resolved.metadata.options().paper, Some(PaperFormat::Letter));
    assert!(!resolved.options[&OptionId::Paper].substituted);
    assert_eq!(metadata, original);
    assert_eq!(
        policy().resolve(&metadata).unwrap().options[&OptionId::Paper].effective,
        json!("a3")
    );
}

#[test]
fn new_writes_and_language_support_are_checked_without_silently_converting_data() {
    let mut manifest = policy();
    manifest.options.insert(
        OptionId::Paper,
        Policy::Restricted {
            allowed: vec![json!("a4")],
            default: json!("a4"),
        },
    );
    assert!(manifest.check_write(OptionId::Paper, &Value::Null).is_ok());
    assert!(manifest.check_write(OptionId::Paper, &json!("a3")).is_err());
    assert!(manifest.check_write(OptionId::Paper, &json!(true)).is_err());
    assert!(
        manifest
            .check_write(OptionId::BulletMarker, &Value::Null)
            .is_err()
    );
    manifest.languages = vec![DocumentLanguage::French];
    let mut metadata = Metadata::blank(DocumentType::Article);
    metadata.options_mut().language = DocumentLanguage::English;
    assert_eq!(
        manifest.resolve(&metadata).err().unwrap(),
        "model_language_unsupported"
    );
    assert_eq!(metadata.options().language, DocumentLanguage::English);
    assert!(
        manifest
            .resolve(&Metadata::blank(DocumentType::Courrier))
            .is_err()
    );
}

#[test]
fn model_switches_queries_history_archive_and_exports_share_the_same_resolution() {
    let dir = tempfile::tempdir().unwrap();
    let mut session = Session::new();
    session
        .execute(
            "document.new",
            json!({"type":"article","metadata":Metadata::demo(DocumentType::Article)}),
        )
        .unwrap();
    session.batch(&[
        call("metadata.set",json!({"target":{"kind":"option","name":"paper"},"value":"a3"})),
        call("metadata.set",json!({"target":{"kind":"metadata","field":"article.citation_style"},"value":"apa"}))
    ],None).unwrap();
    let before = session.state().unwrap().clone();
    assert!(session.batch(&[call("text.insert",json!({"target":{"zone":{"kind":"metadata","field":"article.citation_style"},"from":0,"to":3},"text":"ieee"}))],None).is_err());
    assert_eq!(session.state().unwrap(), &before);
    let versioned = crate::content::project::Project::new(session.archive().unwrap())
        .unwrap()
        .prepare_version(
            crate::content::project::SnapshotDetails {
                name: "Before model switch".into(),
                ..Default::default()
            },
            crate::content::project::SnapshotReason::Manual,
        )
        .unwrap();
    let version_id = versioned.versions()[0].id;
    let mut manifest = policy();
    manifest.options.insert(
        OptionId::Paper,
        Policy::Restricted {
            allowed: vec![json!("a5")],
            default: json!("a5"),
        },
    );
    manifest.options.insert(
        OptionId::CitationStyle,
        Policy::Imposed {
            value: json!("ieee"),
        },
    );
    let source = encoded(&manifest);
    session.batch(&[call("document.set_model",json!({"model_id":"article.constrained","source":before.settings.template,"manifest":source}))],None).unwrap();
    assert_eq!(
        session.state().unwrap().settings.metadata,
        before.settings.metadata
    );
    session.execute("edit.undo", json!({})).unwrap();
    assert_eq!(session.state().unwrap().settings, before.settings);
    session.execute("edit.redo", json!({})).unwrap();
    assert_eq!(session.state().unwrap().settings.model_manifest, source);

    let query = session.query("metadata.get", json!({})).unwrap();
    assert_eq!(
        query["model_options"]["options"]["citation-style"]["effective"],
        "ieee"
    );
    assert_eq!(
        query["model_options"]["options"]["citation-style"]["choice"],
        "apa"
    );
    assert_eq!(
        query["model_options"]["options"]["paper"]["substituted"],
        true
    );
    let unchanged = session.state().unwrap().clone();
    let versioned = versioned.with_current(session.archive().unwrap()).unwrap();
    let version_path = dir.path().join("with-version.typsto");
    versioned
        .save(&mut crate::DocumentLease::acquire(&version_path).unwrap())
        .unwrap();
    let historical = crate::content::project::Project::read(&version_path)
        .unwrap()
        .version(version_id)
        .unwrap();
    assert_eq!(historical.state().settings, before.settings);
    assert!(session.batch(&[call("metadata.set",json!({"target":{"kind":"metadata","field":"article.citation_style"},"value":"apa"}))],None).is_err());
    assert_eq!(session.state().unwrap(), &unchanged);
    let archive = dir.path().join("project.typsto");
    session.save_as(&archive).unwrap();
    session.execute("document.close", json!({})).unwrap();
    session
        .execute("document.open", json!({"path":archive}))
        .unwrap();
    assert_eq!(session.state().unwrap(), &unchanged);
    let export = dir.path().join("export");
    session
        .export(&export, crate::protocol::ExportFormat::Both, false)
        .unwrap();
    assert_eq!(
        std::fs::read_to_string(export.join("model.yaml")).unwrap(),
        source
    );
    let main = std::fs::read_to_string(export.join("main.typ")).unwrap();
    assert!(main.contains("citation-style: \"ieee\""));
    assert!(main.contains("paper: \"a5\""));
    session.batch(&[call("document.set_model",json!({"model_id":before.settings.model_id,"source":before.settings.template,"manifest":before.settings.model_manifest}))],None).unwrap();
    assert_eq!(session.state().unwrap().settings, before.settings);
    let query = session.query("metadata.get", json!({})).unwrap();
    assert_eq!(
        query["model_options"]["options"]["citation-style"]["effective"],
        "apa"
    );
    session
        .batch(
            &[call(
                "metadata.set",
                json!({"target":{"kind":"option","name":"paper"},"value":null}),
            )],
            None,
        )
        .unwrap();
    assert_eq!(
        session.state().unwrap().settings.metadata.options().paper,
        None
    );
}

#[test]
fn published_model_manifest_schema_matches_the_typed_loader() {
    let expected: Value = serde_json::from_str(include_str!(
        "../../../../../docs/schemas/model-manifest.schema.json"
    ))
    .unwrap();
    assert_eq!(expected, json!(schemars::schema_for!(Manifest)));
}
