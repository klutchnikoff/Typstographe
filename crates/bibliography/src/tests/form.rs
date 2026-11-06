use super::*;
use crate::form::{form_fields, form_patches};
fn record() -> Record {
    Record::from_native(id("r"),Genre::Book,"book",json!({"type":"book","title":{"value":{"value":"all LOWER","verbatim":true},"short":"Short"},"author":[{"name":"Doe","given-name":"Jane","prefix":"de","alias":"JD"}],"publisher":{"name":{"value":"PRESS","short":"P"},"location":"Paris"},"url":{"value":"https://example.org","date":"2025-02-03"},"serial-number":{"custom":"kept"},"note":"Unexposed"})).unwrap()
}
#[test]
fn form_edits_preserve_compound_metadata_and_unexposed_native_fields() {
    let record = record();
    let fields = form_fields(&record);
    let title = fields.iter().find(|f| f.path == "/title").unwrap();
    assert_eq!(title.value, "all LOWER");
    let values = std::collections::BTreeMap::from([
        ("/title".into(), json!("all LOWER revised")),
        ("/publisher/name".into(), json!("PRESS revised")),
        ("/url/value".into(), json!("https://new.example.org")),
        (
            "/author".into(),
            json!([{"id":"person-0","name":"Doe","given":"Janet"}]),
        ),
    ]);
    let patches = form_patches(&record, &values).unwrap();
    let edited = record.edited(&record.fingerprint(), &patches).unwrap();
    let native = edited.native_value();
    assert_eq!(native["note"], record.native_value()["note"]);
    assert_eq!(native["serial-number"]["custom"], "kept");
    assert_eq!(native["url"]["date"], "2025-02-03");
    assert_eq!(
        edited.entry().title().unwrap().short,
        record.entry().title().unwrap().short
    );
    assert_eq!(
        edited
            .entry()
            .title()
            .unwrap()
            .format_title_case(Default::default()),
        "all LOWER revised"
    );
    let author = &edited.entry().authors().unwrap()[0];
    assert_eq!(author.prefix.as_deref(), Some("de"));
    assert_eq!(author.alias.as_deref(), Some("JD"));
    assert_eq!(author.given_name.as_deref(), Some("Janet"));
    assert_eq!(
        record.entry().publisher().unwrap().name().unwrap().short,
        edited.entry().publisher().unwrap().name().unwrap().short
    );
}
#[test]
fn unmodified_form_is_a_noop_and_unknown_controls_or_person_ids_are_refused() {
    let record = record();
    let all = form_fields(&record)
        .into_iter()
        .map(|f| (f.path, f.value))
        .collect();
    assert!(form_patches(&record, &all).unwrap().is_empty());
    assert!(
        form_patches(
            &record,
            &std::collections::BTreeMap::from([("/invented".into(), json!("lost"))])
        )
        .is_err()
    );
    assert!(
        form_patches(
            &record,
            &std::collections::BTreeMap::from([(
                "/author".into(),
                json!([{"id":"person-99","name":"X","given":""}])
            )])
        )
        .is_err()
    );
}
#[test]
fn inherited_and_publication_fields_follow_actual_native_parents() {
    let record=Record::from_native(id("r"),Genre::JournalArticle,"article",json!({"type":"article","parent":[{"type":"repository","title":"Deposit"},{"type":"periodical","title":"Journal","author":"Doe, Jane","date":2026}]})).unwrap();
    let fields = form_fields(&record);
    assert!(
        fields
            .iter()
            .any(|f| f.path == "/parent/1/title" && f.value == "Journal")
    );
    assert!(fields.iter().any(|f| f.path == "/parent/1/author"));
    let patches = form_patches(
        &record,
        &std::collections::BTreeMap::from([("/parent/1/title".into(), json!("Revised journal"))]),
    )
    .unwrap();
    let edited = record.edited(&record.fingerprint(), &patches).unwrap();
    assert_eq!(
        edited.native_value()["parent"][0],
        record.native_value()["parent"][0]
    );
}
#[test]
fn adding_a_missing_publication_uses_native_defaults_without_replacing_other_fields() {
    let record = Record::from_native(
        id("r"),
        Genre::JournalArticle,
        "article",
        json!({"type":"article","title":"A study","note":"Keep"}),
    )
    .unwrap();
    let patches = form_patches(
        &record,
        &std::collections::BTreeMap::from([("/parent/0/title".into(), json!("A journal"))]),
    )
    .unwrap();
    assert_eq!(patches[0].path, "/parent/0/title");
    let edited = record.edited(&record.fingerprint(), &patches).unwrap();
    assert_eq!(edited.native_value()["parent"][0]["type"], "periodical");
    assert_eq!(edited.native_value()["note"], "Keep");
}
