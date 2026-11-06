use super::{Session, check_params, describe, error_value};
use serde_json::{Value, json};

fn article() -> Session {
    let mut session = Session::new();
    session
        .execute("document.new", json!({"type":"article"}))
        .unwrap();
    session
}
fn validates(id: &str, value: &Value) {
    let description = describe(id).unwrap();
    jsonschema::validator_for(&description["result_schema"])
        .unwrap()
        .validate(value)
        .unwrap();
}

#[test]
fn preparation_is_repeatable_and_does_not_publish_change_history_or_dirty_the_project() {
    let mut session = article();
    let guard = session.guard().unwrap().clone();
    let bytes = session.archive().unwrap().yjs;
    let context = session.query("context.get", json!({})).unwrap();
    let dirty = session.dirty();
    let params = json!({"id":"source-1","name":"native.yaml","format":"hayagriva",
        "contents":include_str!("../../../../../fixtures/bibliography/native.yaml")});
    let result = session
        .query("bibliography.prepare_import", params.clone())
        .unwrap();
    validates("bibliography.prepare_import", &result);
    assert_eq!(result["active"], false);
    assert_eq!(result["records"].as_array().unwrap().len(), 6);
    assert!(result["source"].get("contents").is_none());
    assert_eq!(result["source"]["id"], "source-1");
    assert!(!result["diagnostics"].as_array().unwrap().is_empty());
    assert_eq!(
        session
            .query("bibliography.prepare_import", params.clone())
            .unwrap(),
        result
    );
    let mut changed = params;
    changed["contents"] = json!("other: {type: book}");
    let other = session
        .query("bibliography.prepare_import", changed)
        .unwrap();
    assert_ne!(other["fingerprint"], result["fingerprint"]);
    assert_eq!(
        session
            .query("bibliography.search", json!({"query":""}))
            .unwrap()["entries"],
        json!([])
    );
    assert_eq!(session.archive().unwrap().yjs, bytes);
    assert_eq!(session.guard().unwrap(), &guard);
    assert_eq!(session.query("context.get", json!({})).unwrap(), context);
    assert_eq!(session.dirty(), dirty);
    let rejected = session.batch(&[super::Call{id:"inline.replace".into(),params:json!({
        "target":{"zone":{"kind":"body","path":[0]},"from":0,"to":0},
        "node":{"type":"citation","attrs":{"form":"normal","items":[{"record_id":result["records"][0]["id"],"supplement":""}]}}
    })}],None);
    assert!(rejected.is_err());
    assert_eq!(session.archive().unwrap().yjs, bytes);
}

#[test]
fn genres_and_new_notices_have_the_same_machine_readable_types_as_the_crate() {
    let mut session = article();
    let kinds = session.query("bibliography.genres", json!({})).unwrap();
    validates("bibliography.genres", &kinds);
    assert_eq!(kinds["genres"], json!(typstographe_bibliography::genres()));
    for (i, genre) in kinds["genres"].as_array().unwrap().iter().enumerate() {
        let result = session
            .query(
                "bibliography.prepare_record",
                json!({"id":format!("draft-{i}"),"genre":genre["genre"]}),
            )
            .unwrap();
        validates("bibliography.prepare_record", &result);
        assert_eq!(result["active"], false);
        assert_eq!(result["record"]["genre"], genre["genre"]);
        assert!(!result["diagnostics"].as_array().unwrap().is_empty());
        assert_eq!(result["record"]["key"], "anonymous_untitled_nd");
    }
}

#[test]
fn preparation_preserves_compound_fields_and_uses_available_names_without_renaming_existing_entries()
 {
    let mut session = article();
    session.execute("record.add",json!({"collection":"references","id":"source","values":{
        "name":"existing.yaml","contents":"durand_une_2025: {type: article, title: Existing work}"}})).unwrap();
    let before = session.archive().unwrap().yjs;
    let params = json!({"id":"proposal","genre":"journal_article","entry":{
        "title":{"value":"Une étude","short":"Étude","verbatim":true},
        "author":{"name":"Durand","given-name":"Élise"},"date":2025,
        "parent":{"type":"periodical","title":"Revue","publisher":{"name":"Press","location":"Paris"}},
        "serial-number":{"custom":"preserved"}}});
    let result = session
        .query("bibliography.prepare_record", params.clone())
        .unwrap();
    validates("bibliography.prepare_record", &result);
    assert_eq!(result["record"]["key"], "durand_une_2025_1");
    let entry = &result["record"]["entry"];
    assert_eq!(entry["title"]["short"], params["entry"]["title"]["short"]);
    let native: typstographe_bibliography::Record =
        serde_json::from_value(result["record"].clone()).unwrap();
    assert_eq!(
        native
            .entry()
            .title()
            .unwrap()
            .format_title_case(Default::default()),
        "Une étude"
    );
    assert_eq!(
        native.entry().parents()[0]
            .title()
            .unwrap()
            .value
            .to_string(),
        "Revue"
    );
    assert_eq!(
        native.entry().serial_number().unwrap().0["custom"],
        "preserved"
    );
    let mut occupied = params;
    occupied["key"] = json!("durand_une_2025");
    let error = error_value(
        &session
            .query("bibliography.prepare_record", occupied)
            .unwrap_err(),
    );
    assert_eq!(error["code"], "bibliography");
    assert_eq!(error["error"]["code"], "duplicate_key");
    assert_eq!(error["error"]["key"], "durand_une_2025");
    assert_eq!(session.archive().unwrap().yjs, before);
}

#[test]
fn invalid_sources_fields_and_bounds_return_structured_diagnostics_without_mutation() {
    let mut session = article();
    let before = session.archive().unwrap().yjs;
    let error = error_value(
        &session
            .query(
                "bibliography.prepare_record",
                json!({"id":"r","genre":"book","entry":{"custom":"would disappear"}}),
            )
            .unwrap_err(),
    );
    assert_eq!(error["error"]["code"], "unsupported_field");
    assert_eq!(error["error"]["field"], "/custom");
    for contents in [
        "@book{broken".to_owned(),
        "x".repeat(typstographe_bibliography::MAX_SOURCE_BYTES + 1),
    ] {
        let error = error_value(
            &session
                .query(
                    "bibliography.prepare_import",
                    json!({"id":"src","name":"in.bib","format":"biblatex","contents":contents}),
                )
                .unwrap_err(),
        );
        assert_eq!(error["code"], "bibliography");
        assert!(
            ["invalid_syntax", "limit_exceeded"]
                .contains(&error["error"]["code"].as_str().unwrap())
        );
    }
    assert_eq!(session.archive().unwrap().yjs, before);
}

#[test]
fn preparation_schemas_refuse_paths_unknown_fields_and_invalid_identities_and_types() {
    for params in [
        json!({"id":"../../escape","name":"in.bib","format":"biblatex","contents":""}),
        json!({"id":"src","name":"in.bib","format":"biblatex","contents":"","path":"/tmp/input.bib"}),
        json!({"id":"src","name":"in.bib","format":"other","contents":""}),
    ] {
        assert!(
            check_params("bibliography.prepare_import", &params).is_err(),
            "{params}"
        );
    }
    for params in [
        json!({"id":"bad id","genre":"book"}),
        json!({"id":"r","genre":"invented"}),
        json!({"id":"r","genre":"book","entry":"not an object"}),
        json!({"id":"r","genre":"book","publish":true}),
    ] {
        assert!(
            check_params("bibliography.prepare_record", &params).is_err(),
            "{params}"
        );
    }
    assert!(check_params("bibliography.genres", &json!({"publish":true})).is_err());
}

#[test]
fn bibliography_preparation_does_not_grant_unsupported_types_a_new_capability() {
    let mut session = Session::new();
    assert!(session.query("bibliography.genres", json!({})).is_err());
    session
        .execute("document.new", json!({"type":"courrier"}))
        .unwrap();
    let error = error_value(
        &session
            .query(
                "bibliography.prepare_record",
                json!({"id":"r","genre":"book"}),
            )
            .unwrap_err(),
    );
    assert_eq!(error["code"], "command_unavailable");
    assert_eq!(error["reason"], "unsupported_document_type");
}
