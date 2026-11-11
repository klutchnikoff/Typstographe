use super::*;

#[test]
fn partial_conflicts_are_never_published_and_skip_rechecks_the_remaining_group() {
    let base = Library::new(vec![record(
        "base",
        "existing",
        json!({"type":"article","title":"A study","author":"Doe, Jane","date":2020}),
    )])
    .unwrap();
    let candidates = vec![
        record(
            "a",
            "first",
            json!({"type":"article","title":"A study","author":"Doe, Jane","date":2020,"serial-number":{"doi":"10.5555/one"}}),
        ),
        record(
            "b",
            "second",
            json!({"type":"article","title":"A study","author":"Doe, Jane","date":2020,"serial-number":{"doi":"10.5555/two"}}),
        ),
        record(
            "c",
            "unrelated",
            json!({"type":"book","title":"Other work","author":"Roe, Richard"}),
        ),
    ];
    let plan = ImportPlan::prepare(&base, &candidates).unwrap();
    assert_eq!(
        plan.apply(&base).unwrap_err().code,
        Code::UnresolvedConflict
    );
    assert_eq!(base.records().len(), 1);
    let resolved = plan
        .resolve(&[Decision::Skip { incoming: id("b") }])
        .unwrap();
    assert!(plan.blocked());
    let result = resolved.apply(&base).unwrap();
    assert_eq!(result.records().len(), 2);
    assert_eq!(
        result.get(&id("base")).unwrap().entry().doi(),
        Some("10.5555/one")
    );
    assert!(result.get(&id("b")).is_none());
    assert!(result.get(&id("c")).is_some());
}

#[test]
fn stale_plan_or_invalid_decisions_do_not_modify_the_library() {
    let original = record(
        "base",
        "existing",
        json!({"type":"article","title":"A study","author":"Doe, Jane","date":2020}),
    );
    let base = Library::new(vec![original.clone()]).unwrap();
    let candidates = vec![record(
        "a",
        "new",
        json!({"type":"book","title":"Unrelated work","author":"Other, Alice"}),
    )];
    let plan = ImportPlan::prepare(&base, &candidates).unwrap();
    let updated = original
        .edited(
            &original.fingerprint(),
            &[FieldPatch {
                path: "/note".into(),
                value: Some(json!("Concurrent edit")),
            }],
        )
        .unwrap();
    let changed = Library::new(vec![updated]).unwrap();
    assert_eq!(plan.apply(&changed).unwrap_err().code, Code::StaleBase);
    for decision in [
        Decision::Skip {
            incoming: id("absent"),
        },
        Decision::Same {
            incoming: id("a"),
            target: id("base"),
        },
        Decision::Same {
            incoming: id("a"),
            target: id("absent"),
        },
        Decision::Same {
            incoming: id("a"),
            target: id("a"),
        },
    ] {
        assert_eq!(
            plan.resolve(&[decision]).unwrap_err().code,
            Code::InvalidDecision
        );
    }
    assert_eq!(base.records(), &[original]);
}

#[test]
fn same_decisions_between_incoming_records_support_forward_targets_but_refuse_cycles() {
    let entries = vec![
        record(
            "a",
            "one",
            json!({"type":"article","title":"A study","author":"Doe, Jane","date":2020,"serial-number":{"doi":"10.5555/one"}}),
        ),
        record(
            "b",
            "two",
            json!({"type":"article","title":"A study","author":"Doe, Jane","date":2020,"serial-number":{"doi":"10.5555/two"}}),
        ),
    ];
    let base = Library::default();
    let plan = ImportPlan::prepare(&base, &entries).unwrap();
    let resolved = plan
        .resolve(&[
            Decision::Same {
                incoming: id("a"),
                target: id("b"),
            },
            Decision::Distinct {
                incoming: id("b"),
                key: "retained".into(),
            },
        ])
        .unwrap();
    let result = resolved.apply(&base).unwrap();
    assert_eq!(result.records().len(), 1);
    assert_eq!(result.get(&id("b")).unwrap().key(), "retained");
    assert_eq!(
        result.get(&id("b")).unwrap().entry().doi(),
        Some("10.5555/two")
    );
    assert_eq!(
        plan.resolve(&[
            Decision::Same {
                incoming: id("a"),
                target: id("b")
            },
            Decision::Same {
                incoming: id("b"),
                target: id("a")
            }
        ])
        .unwrap_err()
        .code,
        Code::InvalidDecision
    );
}

#[test]
fn reordered_candidates_keep_the_same_groups_and_composition() {
    let one = record(
        "a",
        "one",
        json!({"type":"article","title":"A study","author":"Doe, Jane","date":2020}),
    );
    let two = record(
        "b",
        "two",
        json!({"type":"article","title":"A study","author":"Doe, Jane","date":2020,"volume":12}),
    );
    let three = record(
        "c",
        "three",
        json!({"type":"book","title":"Other work","author":"Roe, Richard"}),
    );
    let a = vec![one.clone(), two.clone(), three.clone()];
    let b = vec![three, two, one];
    let base = Library::default();
    assert_eq!(candidate_groups(&a).unwrap(), candidate_groups(&b).unwrap());
    assert_eq!(
        ImportPlan::prepare(&base, &a)
            .unwrap()
            .apply(&base)
            .unwrap(),
        ImportPlan::prepare(&base, &b)
            .unwrap()
            .apply(&base)
            .unwrap()
    );
}

#[test]
fn repeated_import_is_noop_even_when_source_and_record_ids_are_fresh() {
    let text = "k: {type: article, title: A study, author: 'Doe, Jane', date: 2020}";
    let prepared = import(text, ImportFormat::Hayagriva);
    let base = Library::default();
    let first = ImportPlan::prepare(&base, &prepared.records)
        .unwrap()
        .apply(&base)
        .unwrap();
    let source = ImportSource::new(
        id("different-source-id"),
        "renamed.yaml",
        ImportFormat::Hayagriva,
        text.into(),
    )
    .unwrap();
    let again = prepare_import(source, |_| id("fresh-record-id")).unwrap();
    let second = ImportPlan::prepare(&first, &again.records)
        .unwrap()
        .apply(&first)
        .unwrap();
    assert_eq!(first, second);
}

#[test]
fn identifiers_are_normalized_only_for_matching_not_for_storage() {
    assert_eq!(
        normalize_doi(" https://doi.org/10.5555/Example ").as_deref(),
        Some("10.5555/example")
    );
    for value in [
        "arXiv:2108.06507v2",
        "https://arxiv.org/pdf/2108.06507v3.pdf",
        "10.48550/arXiv.2108.06507",
    ] {
        assert_eq!(normalize_arxiv(value).as_deref(), Some("2108.06507"));
    }
    assert_eq!(
        normalize_arxiv("math.ST/0503083").as_deref(),
        Some("math.st/0503083")
    );
    assert!(normalize_arxiv("hal-01234567").is_none());
    assert!(normalize_arxiv("10.1214/aos/1176350258").is_none());
    let a = record(
        "a",
        "a",
        json!({"type":"article","serial-number":{"arxiv":"2108.06507"}}),
    );
    let b = record(
        "b",
        "b",
        json!({"type":"article","url":"https://arxiv.org/abs/2108.06507"}),
    );
    assert_eq!(evidence(&a, &b).contradictions, vec![]);
    assert_eq!(a.entry().arxiv(), Some("2108.06507"));
}

#[test]
fn comparing_a_match_keeps_its_identity_available_for_each_decision() {
    let existing = record(
        "existing",
        "study",
        json!({"type":"article","title":"A study","date":2020,"serial-number":{"doi":"10.5555/study"}}),
    );
    let base = Library::new(vec![existing.clone()]).unwrap();
    let incoming = import(
        "study: {type: article, title: A study, date: 2021, page-range: 15-20, serial-number: {doi: 10.5555/study}}",
        ImportFormat::Hayagriva,
    )
    .records;
    let incoming_id = incoming[0].id().clone();
    let plan = ImportPlan::prepare(&base, &incoming).unwrap();
    let matches = &plan.items()[0].matches;
    assert_eq!(matches.len(), 1);
    assert_eq!(matches[0].target, id("existing"));
    assert!(matches[0].in_project);
    assert!(matches[0].signals.contains(&Signal::Doi));
    assert_eq!(matches[0].added_fields, ["/page-range"]);
    assert_eq!(matches[0].differing_fields, ["/date"]);

    let kept = plan
        .resolve(&[Decision::Keep {
            incoming: incoming_id.clone(),
            target: id("existing"),
        }])
        .unwrap();
    assert_eq!(kept.items()[0].target, Some(id("existing")));
    assert_eq!(kept.items()[0].matches, *matches);
    assert_eq!(kept.apply(&base).unwrap(), base);

    let enriched = plan
        .resolve(&[Decision::Same {
            incoming: incoming_id.clone(),
            target: id("existing"),
        }])
        .unwrap()
        .apply(&base)
        .unwrap();
    let entry = enriched.get(&id("existing")).unwrap();
    assert_eq!(
        entry.native_value()["date"],
        existing.native_value()["date"]
    );
    assert_eq!(
        entry.native_value()["page-range"],
        incoming[0].native_value()["page-range"]
    );
    assert!(!entry.provenance().is_empty());

    let separate = plan
        .resolve(&[Decision::Distinct {
            incoming: incoming_id.clone(),
            key: "study2".into(),
        }])
        .unwrap()
        .apply(&base)
        .unwrap();
    assert_eq!(separate.get(&id("existing")), Some(&existing));
    assert_eq!(separate.get(&incoming_id).unwrap().key(), "study2");
}

#[test]
fn a_shared_key_alone_identifies_the_collision_without_proposing_enrichment() {
    let existing = record(
        "existing",
        "shared",
        json!({"type":"book","title":"First work"}),
    );
    let base = Library::new(vec![existing]).unwrap();
    let incoming = record(
        "incoming",
        "shared",
        json!({"type":"article","title":"Second work","date":2021}),
    );
    let plan = ImportPlan::prepare(&base, &[incoming]).unwrap();
    assert!(plan.blocked());
    assert_eq!(plan.items()[0].conflicts, [ConflictReason::KeyCollision]);
    let matches = &plan.items()[0].matches;
    assert_eq!(matches.len(), 1);
    assert_eq!(matches[0].target, id("existing"));
    assert!(matches[0].signals.is_empty());
    assert!(matches[0].added_fields.is_empty());
    let kept = plan
        .resolve(&[Decision::Keep {
            incoming: id("incoming"),
            target: id("existing"),
        }])
        .unwrap();
    assert_eq!(kept.apply(&base).unwrap(), base);
}

#[test]
fn exact_project_duplicates_reuse_the_key_and_do_not_import_provenance() {
    let base = Library::new(vec![record(
        "project",
        "project_key",
        json!({"type":"article","title":"A study","date":2020,"serial-number":{"doi":"10.5555/study"}}),
    )]).unwrap();
    let prepared = import(
        "other_key: {type: article, title: A study, date: 2020, serial-number: {doi: 10.5555/study}}",
        ImportFormat::Hayagriva,
    );
    let plan = ImportPlan::prepare(&base, &prepared.records).unwrap();
    let item = &plan.items()[0];
    assert_eq!(item.action, Action::Duplicate);
    assert_eq!(item.target, Some(id("project")));
    assert!(item.matches[0].identical);
    assert_eq!(plan.apply(&base).unwrap(), base);

    let conflicting_project = record(
        "also_in_project",
        "second_project_key",
        base.records()[0].native_value(),
    );
    let ambiguous = Library::new(vec![base.records()[0].clone(), conflicting_project]).unwrap();
    let plan = ImportPlan::prepare(&ambiguous, &prepared.records).unwrap();
    assert!(plan.blocked());
    assert_eq!(plan.items()[0].conflicts, [ConflictReason::AmbiguousTarget]);
}
