use super::*;

#[test]
fn supplied_declarations_match_domain_codecs_and_preserve_sources() {
    let expected: Vec<Value> = serde_json::from_str(include_str!(
        "../../../../../fixtures/document-types/source-contract.json"
    ))
    .unwrap();
    for fixture in expected {
        let kind: DocumentType = serde_json::from_value(fixture["kind"].clone()).unwrap();
        let blank = Metadata::blank(kind);
        assert_eq!(
            blank.main_source(),
            fixture["blank"].as_str().unwrap(),
            "blank {kind:?}"
        );
        assert_eq!(
            Metadata::demo(kind).main_source(),
            fixture["demo"].as_str().unwrap(),
            "demo {kind:?}"
        );
        blank.validate().unwrap();
        assert!(!blank.ready_for_export());
        Metadata::demo(kind).validate().unwrap();
        assert_eq!(
            kind.definition().definition().id,
            serde_json::to_value(kind).unwrap().as_str().unwrap()
        );
    }
}

#[test]
fn runtime_capabilities_and_frontmatter_come_from_the_loaded_declaration() {
    for kind in DocumentType::ALL {
        let declared = &kind.definition().definition().capabilities;
        let effective: Vec<_> = crate::content::catalogue::for_type(kind)
            .map(|c| c.id)
            .collect();
        assert_eq!(effective.len(), declared.len());
        assert!(declared.iter().all(|id| effective.contains(&id.as_str())));
        let groups = Metadata::blank(kind).editor_groups();
        assert_eq!(
            groups.iter().map(|g| g.id.as_str()).collect::<Vec<_>>(),
            kind.definition()
                .definition()
                .header
                .tabs
                .iter()
                .map(Tab::id)
                .collect::<Vec<_>>()
        );
    }
}
