//! Raw mathematical source, shared by Tauri, CLI and MCP. No UI or formula whitelist.
use super::Node;
use crate::document::typst_string;
pub fn is_math(kind: &str) -> bool {
    matches!(kind, "mathInline" | "mathBlock")
}
pub fn source(node: &Node) -> Result<String, String> {
    if node
        .content
        .iter()
        .any(|n| n.kind != "text" || !n.marks.is_empty())
    {
        return Err("invalid_math_content".into());
    }
    for key in ["language", "alt", "alias"] {
        if let Some(value) = node.attrs.as_ref().and_then(|a| a.get(key))
            && !value.is_string()
        {
            return Err("invalid_math_attributes".into());
        }
    }
    let source = text(node);
    if node.kind == "mathInline" && source.contains(['\n', '\r']) {
        return Err("inline_math_multiline".into());
    }
    let language = node
        .attrs
        .as_ref()
        .and_then(|a| a["language"].as_str())
        .unwrap_or("typst");
    if !matches!(language, "typst" | "latex") {
        return Err("invalid_math_language".into());
    }
    let alt = node
        .attrs
        .as_ref()
        .and_then(|a| a["alt"].as_str())
        .unwrap_or("");
    if let Some(alias) = node.attrs.as_ref().and_then(|a| a.get("alias")) {
        let value = alias.as_str().ok_or("invalid_equation_alias")?;
        if value.chars().count() > 128
            || value
                .chars()
                .any(|c| c.is_whitespace() || c.is_control() || matches!(c, ':' | '$'))
        {
            return Err("invalid_equation_alias".into());
        }
    }
    Ok(format!(
        "#math-formula({}, language: {}, block: {}, alt: {})",
        typst_string(&source),
        typst_string(language),
        node.kind == "mathBlock",
        typst_string(alt)
    ))
}
pub fn text(node: &Node) -> String {
    node.content
        .iter()
        .filter_map(|n| n.text.as_deref())
        .collect()
}
pub fn alias(node: &Node) -> Option<&str> {
    node.attrs
        .as_ref()?
        .get("alias")?
        .as_str()
        .filter(|s| !s.is_empty())
}
pub fn validate(node: &Node) -> Result<(), String> {
    fn visit(node: &Node, aliases: &mut std::collections::BTreeSet<String>) -> Result<(), String> {
        if is_math(&node.kind) {
            source(node)?;
        }
        if node.kind == "mathBlock"
            && let Some(alias) = alias(node)
            && !aliases.insert(alias.into())
        {
            return Err("duplicate_equation_alias".into());
        }
        for child in &node.content {
            visit(child, aliases)?;
        }
        Ok(())
    }
    visit(node, &mut Default::default())
}

/// Alias transfers are dependent decisions: applying only half can duplicate a name.
pub(super) fn dependent_aliases(before: &Node, after: &Node) -> bool {
    fn owners(node: &Node, path: &str, out: &mut std::collections::BTreeMap<String, String>) {
        if node.kind == "mathBlock"
            && let Some(name) = alias(node)
        {
            out.insert(
                name.into(),
                super::references::anchor(node).unwrap_or(path).into(),
            );
        }
        for (i, child) in node.content.iter().enumerate() {
            owners(child, &format!("{path}/{i}"), out);
        }
    }
    let mut a = Default::default();
    let mut b = Default::default();
    owners(before, "", &mut a);
    owners(after, "", &mut b);
    a.iter()
        .any(|(name, owner)| b.get(name).is_some_and(|next| next != owner))
}

#[cfg(test)]
#[cfg_attr(coverage_nightly, coverage(off))]
mod tests {
    use super::*;
    use crate::content::references;
    use serde_json::json;
    fn doc(language: &str, source: &str) -> Node {
        serde_json::from_value(json!({"type":"doc","content":[
   {"type":"mathBlock","attrs":{"language":language,"alias":"pythagoras","anchor":"equation-first","alt":"Pythagorean identity"},"content":[{"type":"text","text":source}]},
   {"type":"paragraph","content":[{"type":"crossReference","attrs":{"target":"equation-first","include_label":true,"include_page":false}}]},
   {"type":"paragraph"}
 ]})).unwrap()
    }
    #[test]
    fn native_typst_and_vendored_latex_share_the_real_equation_counter_and_reference() {
        let kind = crate::document_types::DocumentType::Article;
        let template = kind.default_model();
        let mut world = crate::rendering::TypstWorld::default();
        world.set_dependencies(&crate::packages::for_template(&template));
        for (lang, code) in [
            ("typst", "a^2 + b^2 = c^2"),
            ("latex", r"\frac{a}{b} = \cos(x)"),
            ("latex", r"\begin{pmatrix}1 & 2 \\ 3 & 4\end{pmatrix}"),
            ("typst", "cases(x & x > 0, -x & x < 0)"),
        ] {
            let mut document = doc(lang, code);
            // Inline expressions must not consume the model's block-equation counter.
            let mut inline = document.content[0].clone();
            inline.kind = "mathInline".into();
            inline
                .attrs
                .as_mut()
                .unwrap()
                .as_object_mut()
                .unwrap()
                .remove("anchor");
            inline
                .attrs
                .as_mut()
                .unwrap()
                .as_object_mut()
                .unwrap()
                .remove("alias");
            let paragraph =
                serde_json::from_value(json!({"type":"paragraph","content":[inline]})).unwrap();
            document.content.insert(0, paragraph);
            let source = crate::content::source(&document, &Default::default()).unwrap();
            world.set_dependencies(&crate::packages::including_source(
                &crate::packages::for_template(&template),
                &source,
            ));
            let rendered = world
                .compile_with_template(
                    &source,
                    &crate::document_types::Metadata::blank(kind),
                    &template,
                )
                .unwrap_or_else(|e| panic!("{lang} {code}: {e}"));
            let r = references::resolved(&rendered);
            assert_eq!(r.len(), 1);
            assert_eq!(r[0].display, "(1)");
            let (_, map) = crate::content::source_mapped(&document, &Default::default()).unwrap();
            assert!(map.characters.len() > code.encode_utf16().count());
        }
    }
    #[test]
    fn accessible_descriptions_reach_real_pdf_ua_equations_in_both_languages() {
        use typst_pdf::{PdfOptions, PdfStandard, PdfStandards};
        let kind = crate::document_types::DocumentType::Courrier;
        let template = "#let courrier(body, ..options) = { set document(title: \"Equation\"); set text(lang: \"fr\"); body }";
        for language in ["typst", "latex"] {
            for alt in ["", "a au carré"] {
                let node: Node = serde_json::from_value(json!({"type":"doc","content":[{"type":"mathBlock","attrs":{"language":language,"alt":alt},"content":[{"type":"text","text":"a^2"}]}]})).unwrap();
                let source = crate::content::source(&node, &Default::default()).unwrap();
                let mut world = crate::rendering::TypstWorld::default();
                world.set_dependencies(&crate::packages::including_source(
                    &crate::packages::for_template(template),
                    &source,
                ));
                let document = world
                    .compile_with_template(
                        &source,
                        &crate::document_types::Metadata::demo(kind),
                        template,
                    )
                    .unwrap();
                let options = PdfOptions {
                    standards: PdfStandards::new(&[PdfStandard::Ua_1]).unwrap(),
                    ..Default::default()
                };
                let result = typst_pdf::pdf(&document, &options);
                if alt.is_empty() {
                    let errors = result.unwrap_err();
                    assert!(
                        errors
                            .iter()
                            .any(|e| e.message.to_lowercase().contains("missing alt text")),
                        "{errors:?}"
                    );
                } else {
                    assert!(result.is_ok(), "{language}: {result:?}");
                }
            }
        }
    }
    #[test]
    fn aliases_are_optional_unique_and_independent_of_internal_anchors() {
        let mut d = doc("typst", "x");
        let target = references::targets(&d).pop().unwrap();
        assert_eq!(target.id, "equation-first");
        assert!(target.title.starts_with("eq:pythagoras"));
        d.content.insert(1, d.content[0].clone());
        d.content[1].attrs.as_mut().unwrap()["anchor"] = json!("equation-second");
        assert_eq!(validate(&d).unwrap_err(), "duplicate_equation_alias");
        d.content[1].attrs.as_mut().unwrap()["alias"] = json!("");
        validate(&d).unwrap();
        for invalid in ["eq:bad", "a b", "$"] {
            d.content[1].attrs.as_mut().unwrap()["alias"] = json!(invalid);
            assert!(validate(&d).is_err());
        }
    }
    #[test]
    fn typed_edits_preserve_source_whitespace_and_parent_offsets_and_reject_prose_styles() {
        use crate::content::{
            commands::Command,
            contract::{Guard, Settings, State},
            shared::{SharedDocument, SharedSession},
        };
        let kind = crate::document_types::DocumentType::Article;
        let inline:Node=serde_json::from_value(json!({"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"A"},{"type":"mathInline","attrs":{"language":"latex","alt":""},"content":[{"type":"text","text":"x  y"}]},{"type":"text","text":"B"}]},{"type":"paragraph"}]})).unwrap();
        let settings = Settings {
            metadata: crate::document_types::Metadata::blank(kind),
            template: kind.default_model(),
            model_manifest: kind.default_model_manifest().into(),
            model_id: "article.model.working".into(),
        };
        let state = State::new(inline, settings);
        let guard = Guard {
            document: "math-test".into(),
            revision: 0,
        };
        let mut session = SharedSession::open(
            guard.clone(),
            &SharedDocument::from_state(&state).unwrap().update(),
            Default::default(),
        )
        .unwrap();
        let commands:Vec<Command>=serde_json::from_value(json!([
   {"id":"text.insert","params":{"target":{"zone":{"kind":"body","path":[0,1]},"from":4,"to":4},"text":"  z"}},
   {"id":"text.insert","params":{"target":{"zone":{"kind":"body","path":[0]},"from":10,"to":11},"text":"C"}}
  ])).unwrap();
        let prepared = session.prepare_commands(&guard, &commands).unwrap();
        session.publish(prepared).unwrap();
        assert_eq!(
            text(&session.state().document.content[0].content[1]),
            "x  y  z"
        );
        assert_eq!(
            session.state().document.content[0]
                .content
                .last()
                .unwrap()
                .text
                .as_deref(),
            Some("C")
        );
        let next = session.guard().clone();
        let mark:Command=serde_json::from_value(json!({"id":"text.bold","params":{"target":{"zone":{"kind":"body","path":[0,1]},"from":0,"to":1},"value":"on"}})).unwrap();
        assert!(session.prepare_commands(&next, &[mark]).is_err());
        // Language is bound at creation, not a mutable public setting.
        let before = session.state().clone();
        let switch: Command = serde_json::from_value(json!({"id":"node.set_attrs","params":{"target":{"root":{"kind":"body"},"path":[0,1]},"attrs":{"language":"typst"}}})).unwrap();
        assert!(session.prepare_commands(&next, &[switch]).is_err());
        assert_eq!(session.state(), &before);
        let alt: Command = serde_json::from_value(json!({"id":"node.set_attrs","params":{"target":{"root":{"kind":"body"},"path":[0,1]},"attrs":{"alt":"Une formule accessible"}}})).unwrap();
        let prepared = session.prepare_commands(&next, &[alt]).unwrap();
        session.publish(prepared).unwrap();
        assert_eq!(
            session.state().document.content[0].content[1]
                .attrs
                .as_ref()
                .unwrap()["alt"],
            "Une formule accessible"
        );
    }
    #[test]
    fn derived_source_selects_offline_libraries_even_without_a_model_import() {
        let kind = crate::document_types::DocumentType::Article;
        let template = kind.default_model().replace(
            "#import \"capabilities/mathematics.typ\": math-formula\n",
            "",
        );
        let document = doc("latex", r"\frac{1}{2}");
        let source = crate::content::source(&document, &Default::default()).unwrap();
        let base = crate::packages::for_template(&template);
        assert!(!base.contains_key("capabilities/mathematics.typ"));
        let dependencies = crate::packages::including_source(&base, &source);
        crate::packages::validate(&template, &dependencies).unwrap();
        assert!(dependencies.contains_key("packages/mitex-0.2.7/mitex.wasm"));
        let mut world = crate::rendering::TypstWorld::default();
        world.set_dependencies(&dependencies);
        world
            .compile_with_template(
                &source,
                &crate::document_types::Metadata::blank(kind),
                &template,
            )
            .unwrap();
    }
    #[test]
    fn incomplete_formula_is_preserved_in_an_autonomous_saved_project() {
        use crate::content::{archive::Archive, project::Project};
        let kind = crate::document_types::DocumentType::Article;
        let template = kind.default_model();
        let document = doc("typst", "frac(");
        let archive = Archive {
            document: document.clone(),
            metadata: crate::document_types::Metadata::blank(kind),
            dependencies: crate::packages::for_template(&template),
            template: template.clone(),
            model_manifest: kind.default_model_manifest().into(),
            model_id: "article.model.working".into(),
            assets: Default::default(),
            yjs: vec![],
        };
        let project = Project::new(archive).unwrap();
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("unfinished.typsto");
        project
            .save(&mut crate::DocumentLease::acquire(&path).unwrap())
            .unwrap();
        let saved = Project::read(&path).unwrap();
        assert_eq!(saved.current().document, document);
        let mut world = crate::rendering::TypstWorld::default();
        world.set_dependencies(&saved.current().dependencies);
        let source = crate::content::source(&document, &Default::default()).unwrap();
        assert!(
            world
                .compile_with_template(&source, &saved.current().metadata, &template)
                .is_err()
        );
    }
    #[test]
    fn alias_swaps_remain_one_comparison_decision_but_source_edits_do_not() {
        let before = doc("typst", "x");
        let mut after = before.clone();
        after.content[0].content[0].text = Some("y".into());
        assert!(!dependent_aliases(&before, &after));
        let mut pair = before.clone();
        let mut second = pair.content[0].clone();
        second.attrs.as_mut().unwrap()["anchor"] = json!("equation-second");
        second.attrs.as_mut().unwrap()["alias"] = json!("another");
        pair.content.insert(1, second);
        let mut swapped = pair.clone();
        swapped.content[0].attrs.as_mut().unwrap()["alias"] = json!("another");
        swapped.content[1].attrs.as_mut().unwrap()["alias"] = json!("pythagoras");
        validate(&swapped).unwrap();
        assert!(crate::content::references::dependent_changes(
            &pair, &swapped
        ));
    }
}
