use super::*;
use crate::{
    assets::Assets,
    content::{
        contract::{Guard, Settings, State},
        shared::{SharedDocument, SharedSession},
    },
};
fn node(v: Value) -> Node {
    serde_json::from_value(v).unwrap()
}
fn example() -> Node {
    node(json!({"type":"doc","content":[
        {"type":"heading","attrs":{"level":1,"anchor":"heading-first"},"content":[{"type":"text","text":"Méthode"}]},
        {"type":"paragraph","content":[{"type":"crossReference","attrs":{"target":"heading-first","include_label":true,"include_page":false}}]},
        {"type":"paragraph"}
    ]}))
}
#[test]
fn anchors_are_stable_hidden_and_copies_remap_only_their_own_references() {
    let mut document = example();
    assign(&mut document);
    let original = anchors(&document);
    assign(&mut document);
    assert_eq!(original, anchors(&document));
    document.content[0].content[0].text = Some("Autre titre".into());
    assert_eq!(targets(&document)[0].id, "heading-first");
    assert_eq!(targets(&document)[0].title, "Autre titre");
    let copies = prepare(&document.content[..2], &original);
    assert_ne!(anchor(&copies[0]), Some("heading-first"));
    assert_eq!(
        copies[1].content[0].attrs.as_ref().unwrap()["target"],
        anchor(&copies[0]).unwrap()
    );
    let reference_only = prepare(&document.content[1..2], &original);
    assert_eq!(
        reference_only[0].content[0].attrs.as_ref().unwrap()["target"],
        "heading-first"
    );
}
#[test]
fn dangling_duplicate_unsafe_and_empty_references_are_refused() {
    let original = example();
    validate(&original).unwrap();
    let mut missing = original.clone();
    missing.content.remove(0);
    assert_eq!(
        validate(&missing).unwrap_err(),
        "cross_reference_target_missing"
    );
    let mut duplicate = original.clone();
    duplicate.content.push(duplicate.content[0].clone());
    assert!(validate(&duplicate).is_err());
    for attrs in [
        json!({"target":"heading-first","include_label":false,"include_page":false}),
        json!({"target":"#panic()","include_label":true,"include_page":false}),
        json!({"target":"heading-first","include_label":true,"include_page":false,"source":"injection"}),
    ] {
        let mut bad = original.clone();
        bad.content[1].content[0].attrs = Some(attrs);
        assert!(validate(&bad).is_err());
    }
}
#[test]
fn referenced_targets_can_only_be_removed_with_their_references_atomically() {
    let state = State::new(example(), Settings::default());
    let guard = Guard {
        document: "test".into(),
        revision: 1,
    };
    let mut session = SharedSession::open(
        guard.clone(),
        &SharedDocument::from_state(&state).unwrap().update(),
        Assets::default(),
    )
    .unwrap();
    let before = session.update();
    let remove = serde_json::from_value(
        json!({"id":"block.remove","params":{"target":{"root":{"kind":"body"},"path":[0]}}}),
    )
    .unwrap();
    assert!(session.prepare_commands(&guard, &[remove]).is_err());
    assert_eq!(session.update(), before);
    let commands = serde_json::from_value::<Vec<crate::content::commands::Command>>(json!([
       {"id":"text.delete","params":{"target":{"zone":{"kind":"body","path":[1]},"from":0,"to":1}}},
       {"id":"block.remove","params":{"target":{"root":{"kind":"body"},"path":[0]}}}
    ]))
    .unwrap();
    let prepared = session.prepare_commands(&guard, &commands).unwrap();
    session.publish(prepared).unwrap();
    assert!(targets(&session.state().document).is_empty());
}
#[test]
fn native_typst_compiles_label_page_and_combined_forms_without_numbering_headings() {
    let mut document = example();
    document.content[1].content = vec![];
    for (label, page) in [(true, false), (false, true), (true, true)] {
        document.content[1].content.push(node(json!({"type":"crossReference","attrs":{"target":"heading-first","include_label":label,"include_page":page}})));
    }
    let assets = Assets::default();
    let source = crate::content::source(&document, &assets).unwrap();
    assert!(source.contains("#label(\"tog-heading-first\")"));
    let kind = crate::document_types::DocumentType::Article;
    let mut world = crate::rendering::TypstWorld::default();
    let rendered = world
        .compile_with_template(
            &source,
            &crate::document_types::Metadata::demo(kind),
            &kind.default_model(),
        )
        .unwrap();
    let entries = resolved(&rendered);
    assert_eq!(entries.len(), 3);
    assert_eq!(entries[0].display, "Méthode");
    assert!(entries[1].display.contains("page"));
    assert!(entries[2].display.contains("Méthode"));
}

#[test]
fn figure_counters_and_model_callbacks_define_both_the_pdf_and_the_badge_content() {
    let kind = crate::document_types::DocumentType::Article;
    let metadata = crate::document_types::Metadata::demo(kind);
    let document = node(json!({"type":"doc","content":[
      {"type":"tableFigure","attrs":{"anchor":"table-results"},"content":[
        {"type":"table","content":[{"type":"tableRow","content":[{"type":"tableCell","content":[{"type":"paragraph","content":[{"type":"text","text":"Été"}]}]}]}]},
        {"type":"tableCaption","content":[{"type":"text","text":"Résultats"}]}]},
      {"type":"paragraph","content":[{"type":"crossReference","attrs":{"target":"table-results","include_label":true,"include_page":true}}]}
    ]}));
    let source = crate::content::source(&document, &Assets::default()).unwrap();
    let mut world = crate::rendering::TypstWorld::default();
    let rendered = world
        .compile_with_template(&source, &metadata, &kind.default_model())
        .unwrap();
    let entries = resolved(&rendered);
    assert_eq!(entries.len(), 1);
    assert!(entries[0].display.contains('1'), "{:?}", entries);
    assert!(entries[0].display.contains("page"));
    let source = format!(
        "#import \"capabilities/cross-references.typ\": reference-style\n#reference-style(label: el => [Données], page: el => [p. I], combine: (label, page) => [#label — #page])\n{source}"
    );
    let rendered = world
        .compile_with_template(&source, &metadata, &kind.default_model())
        .unwrap();
    assert_eq!(resolved(&rendered)[0].display, "Données — p. I");
}

#[test]
fn uncaptioned_images_do_not_fabricate_a_figure_zero() {
    let mut assets = Assets::default();
    assets.insert("images/example.svg".into(),std::sync::Arc::from(br#"<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10"/></svg>"#.as_slice()));
    let document = node(json!({"type":"doc","content":[
      {"type":"figure","attrs":{"src":"images/example.svg","alt":"Schéma","anchor":"image-first"}},
      {"type":"paragraph","content":[{"type":"crossReference","attrs":{"target":"image-first","include_label":true,"include_page":true}}]}
    ]}));
    let mut world = crate::rendering::TypstWorld::default();
    world.set_assets(&assets);
    let kind = crate::document_types::DocumentType::Article;
    let rendered = world
        .compile_with_template(
            &crate::content::source(&document, &assets).unwrap(),
            &crate::document_types::Metadata::demo(kind),
            &kind.default_model(),
        )
        .unwrap();
    let labels = resolved(&rendered);
    assert_eq!(labels.len(), 1);
    assert!(!labels[0].display.contains('0'), "{:?}", labels);
    assert!(labels[0].display.contains("page"));
}
