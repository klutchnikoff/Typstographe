#![cfg_attr(coverage_nightly, feature(coverage_attribute))]
#![cfg_attr(coverage_nightly, coverage(off))]
mod support;
use serde_json::json;
use support::*;
use typstographe_core::content::api::Session;

#[test]
fn cli_can_prepare_notices_under_an_active_writer_without_touching_the_file() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("article.typsto");
    let mut owner = Session::new();
    owner
        .execute("document.new", json!({"type":"article"}))
        .unwrap();
    owner.save_as(&path).unwrap();
    let original = std::fs::read(&path).unwrap();
    let cases = [
        ("bibliography.genres", json!({})),
        (
            "bibliography.prepare_record",
            json!({"id":"new-record","genre":"book","entry":{"title":"Un ouvrage","author":"Durand, Élise"}}),
        ),
        (
            "bibliography.prepare_import",
            json!({"id":"source","name":"in.yaml","format":"hayagriva","contents":"k: {type: book, title: An example}"}),
        ),
    ];
    for (operation, params) in cases {
        let actual = response(
            cli()
                .args(["query", operation])
                .arg(&path)
                .args(["--params", &params.to_string()]),
            0,
        );
        let expected = owner.query(operation, params).unwrap();
        assert_eq!(actual["outcome"], expected);
        if operation != "bibliography.genres" {
            assert_eq!(actual["outcome"]["active"], false);
        }
        assert_eq!(std::fs::read(&path).unwrap(), original);
    }
    assert!(!owner.dirty());
}

#[test]
fn cli_reports_invalid_native_field_data_without_publishing_or_losing_its_path() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("article.typsto");
    let mut owner = Session::new();
    owner
        .execute("document.new", json!({"type":"article"}))
        .unwrap();
    owner.save_as(&path).unwrap();
    let original = std::fs::read(&path).unwrap();
    let result = response(
        cli()
            .args(["query", "bibliography.prepare_record"])
            .arg(&path)
            .args([
                "--params",
                r#"{"id":"new","genre":"book","entry":{"unknown":"lost"}}"#,
            ]),
        1,
    );
    let text = serde_json::to_string(&result).unwrap();
    assert!(text.contains("unsupported_field"));
    assert!(text.contains("/unknown"));
    assert_eq!(std::fs::read(path).unwrap(), original);
}
