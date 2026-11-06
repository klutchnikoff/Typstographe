#![cfg_attr(coverage_nightly, feature(coverage_attribute))]
#![cfg_attr(coverage_nightly, coverage(off))]
mod support;
use serde_json::json;
use support::*;

#[test]
fn anchors_discovery_renaming_protected_deletion_and_offline_export_share_the_cli_contract() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("references.typsto");
    fixture(&path, "Voir ");
    let insert = json!({"parent":{"root":{"kind":"body"}},"index":1,"node":{"type":"heading","attrs":{"level":1},"content":[{"type":"text","text":"Méthode"}]}});
    response(
        cli().args(["run", "block.insert"]).arg(&path).args([
            "--params",
            &insert.to_string(),
            "--save",
        ]),
        0,
    );
    let entries = response(cli().args(["query", "references.list"]).arg(&path), 0);
    let id = entries["outcome"]["targets"][0]["id"].as_str().unwrap();
    assert_eq!(entries["outcome"]["targets"][0]["title"], "Méthode");
    let reference = json!({"target":{"zone":{"kind":"body","path":[0]},"from":5,"to":5},"node":{"type":"crossReference","attrs":{"target":id,"include_label":true,"include_page":true}}});
    response(
        cli().args(["run", "inline.replace"]).arg(&path).args([
            "--params",
            &reference.to_string(),
            "--save",
        ]),
        0,
    );
    let rename =
        json!({"target":{"zone":{"kind":"body","path":[1]},"from":0,"to":7},"text":"Résultats"});
    response(
        cli().args(["run", "text.insert"]).arg(&path).args([
            "--params",
            &rename.to_string(),
            "--save",
        ]),
        0,
    );
    let entries = response(cli().args(["query", "references.list"]).arg(&path), 0);
    assert_eq!(entries["outcome"]["targets"][0]["id"], id);
    assert_eq!(entries["outcome"]["targets"][0]["title"], "Résultats");
    let before = std::fs::read(&path).unwrap();
    response(
        cli().args(["run", "block.remove"]).arg(&path).args([
            "--params",
            r#"{"target":{"root":{"kind":"body"},"path":[1]}}"#,
            "--save",
        ]),
        1,
    );
    assert_eq!(std::fs::read(&path).unwrap(), before);
    let mut session = writer(&path);
    let destination = dir.path().join("export");
    session
        .execute(
            "document.export",
            json!({"directory":destination,"format":"both"}),
        )
        .unwrap();
    assert!(
        destination
            .join("capabilities/cross-references.typ")
            .exists()
    );
    assert!(destination.join("courrier.pdf").exists());
}
