//! Documentary anchors and cross-references. IDs never encode titles, numbering or positions.
use super::Node;
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use std::collections::{BTreeMap, BTreeSet};

pub const ANCHOR_KINDS: &[&str] = &[
    "paragraph",
    "heading",
    "figure",
    "tableFigure",
    "quote",
    "bulletList",
    "orderedList",
    "descriptionList",
    "postscript",
    "attachment",
    "mathBlock",
];
pub fn anchor(node: &Node) -> Option<&str> {
    node.attrs.as_ref()?.get("anchor")?.as_str()
}
pub fn valid_id(id: &str) -> bool {
    !id.is_empty() && id.len() <= 128 && id.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'-')
}
pub fn label(id: &str) -> String {
    format!("tog-{id}")
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, schemars::JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct Reference {
    pub target: String,
    pub include_label: bool,
    pub include_page: bool,
}
impl Reference {
    pub fn validate(&self) -> Result<(), String> {
        if !valid_id(&self.target) || !(self.include_label || self.include_page) {
            return Err("invalid_cross_reference".into());
        }
        Ok(())
    }
}
#[derive(Clone, Debug, Serialize)]
pub struct Target {
    pub id: String,
    pub kind: String,
    pub title: String,
    pub path: Vec<usize>,
}

#[derive(Clone, Debug, Serialize)]
pub struct ResolvedReference {
    #[serde(flatten)]
    pub reference: Reference,
    pub display: String,
}
mod preview;
pub use preview::complete_preview;

fn target_id(label: &str) -> Option<String> {
    let id = label.trim_matches(['<', '>']).strip_prefix("tog-")?;
    valid_id(id).then(|| id.to_owned())
}
fn resolved_metadata(content: &typst::foundations::Content) -> Option<ResolvedReference> {
    use typst::{foundations::Value as TypstValue, introspection::MetadataElem};
    let TypstValue::Dict(value) = &content.to_packed::<MetadataElem>()?.value else {
        return None;
    };
    let TypstValue::Str(id) = value.get("typstographe-reference").ok()? else {
        return None;
    };
    let TypstValue::Bool(include_label) = value.get("include-label").ok()? else {
        return None;
    };
    let TypstValue::Bool(include_page) = value.get("include-page").ok()? else {
        return None;
    };
    let display = match value.get("display").ok()? {
        TypstValue::Content(c) => c.plain_text().to_string(),
        TypstValue::Str(s) => s.to_string(),
        _ => return None,
    };
    Some(ResolvedReference {
        reference: Reference {
            target: target_id(id.as_str())?,
            include_label: *include_label,
            include_page: *include_page,
        },
        display,
    })
}
/// Read the rendered labels from the existing Typst introspector.
pub fn resolved(document: &typst_layout::PagedDocument) -> Vec<ResolvedReference> {
    use typst::foundations::{NativeElement, Selector};
    use typst::introspection::{Introspector, MetadataElem};
    document
        .introspector()
        .query(&Selector::Elem(MetadataElem::ELEM, None))
        .iter()
        .filter_map(resolved_metadata)
        .collect()
}
fn title(node: &Node) -> String {
    if node.kind == "text" {
        return node.text.clone().unwrap_or_default();
    }
    if matches!(node.kind.as_str(), "softBreak" | "hardBreak") {
        return " ".into();
    }
    node.content.iter().map(title).collect()
}
pub fn targets(document: &Node) -> Vec<Target> {
    fn walk(node: &Node, path: &mut Vec<usize>, out: &mut Vec<Target>) {
        if matches!(
            node.kind.as_str(),
            "heading" | "figure" | "tableFigure" | "mathBlock"
        ) && let Some(id) = anchor(node)
        {
            let content = if node.kind == "tableFigure" {
                node.content.last().unwrap_or(node)
            } else {
                node
            };
            let mut text = if node.kind == "mathBlock" {
                let code = super::mathematics::text(node);
                super::mathematics::alias(node).map_or(code.clone(), |a| format!("eq:{a} · {code}"))
            } else {
                title(content)
            };
            if text.trim().is_empty() && node.kind == "figure" {
                text = node
                    .attrs
                    .as_ref()
                    .and_then(|a| a["alt"].as_str())
                    .unwrap_or("")
                    .into();
            }
            out.push(Target {
                id: id.into(),
                kind: node.kind.clone(),
                title: text,
                path: path.clone(),
            });
        }
        for (i, child) in node.content.iter().enumerate() {
            path.push(i);
            walk(child, path, out);
            path.pop();
        }
    }
    let mut out = vec![];
    walk(document, &mut vec![], &mut out);
    out
}
pub fn validate(document: &Node) -> Result<(), String> {
    fn walk(
        node: &Node,
        ids: &mut BTreeSet<String>,
        target_ids: &mut BTreeSet<String>,
        refs: &mut Vec<Reference>,
    ) -> Result<(), String> {
        if let Some(value) = node.attrs.as_ref().and_then(|a| a.get("anchor"))
            && !value.is_null()
        {
            let id = value
                .as_str()
                .filter(|id| valid_id(id))
                .ok_or("invalid_document_anchor")?;
            if !ANCHOR_KINDS.contains(&node.kind.as_str()) || !ids.insert(id.into()) {
                return Err("duplicate_or_invalid_document_anchor".into());
            }
            if matches!(
                node.kind.as_str(),
                "heading" | "figure" | "tableFigure" | "mathBlock"
            ) {
                target_ids.insert(id.into());
            }
        }
        if node.kind == "crossReference" {
            let mut attrs = node.attrs.clone().unwrap_or(Value::Null);
            if let Some(a) = attrs.as_object_mut() {
                a.remove("_mapping");
            }
            let reference: Reference =
                serde_json::from_value(attrs).map_err(|_| "invalid_cross_reference")?;
            reference.validate()?;
            refs.push(reference);
        }
        for child in &node.content {
            walk(child, ids, target_ids, refs)?;
        }
        Ok(())
    }
    let mut ids = BTreeSet::new();
    let mut refs = vec![];
    walk(document, &mut BTreeSet::new(), &mut ids, &mut refs)?;
    if refs.iter().any(|r| !ids.contains(&r.target)) {
        return Err("cross_reference_target_missing".into());
    }
    Ok(())
}
/// Allocate missing identities once. Existing anchors are always preserved.
pub fn assign(node: &mut Node) {
    if ANCHOR_KINDS.contains(&node.kind.as_str()) && anchor(node).is_none() {
        let attrs = node.attrs.get_or_insert_with(|| json!({}));
        if let Some(attrs) = attrs.as_object_mut() {
            attrs.insert("anchor".into(), json!(uuid::Uuid::new_v4().to_string()));
        }
    }
    node.content.iter_mut().for_each(assign);
}
/// Copy a forest into an occupied document. References to copied targets follow their copies.
pub fn prepare(nodes: &[Node], occupied: &BTreeSet<String>) -> Vec<Node> {
    fn renew(
        node: &mut Node,
        occupied: &BTreeSet<String>,
        replacements: &mut BTreeMap<String, String>,
    ) {
        if let Some(id) = anchor(node)
            .filter(|id| occupied.contains(*id))
            .map(str::to_owned)
        {
            let next = replacements
                .entry(id)
                .or_insert_with(|| uuid::Uuid::new_v4().to_string())
                .clone();
            node.attrs.as_mut().unwrap()["anchor"] = json!(next);
            if node.kind == "mathBlock" {
                node.attrs.as_mut().unwrap()["alias"] = json!("");
            }
        }
        node.content
            .iter_mut()
            .for_each(|n| renew(n, occupied, replacements));
    }
    fn remap(node: &mut Node, replacements: &BTreeMap<String, String>) {
        if node.kind == "crossReference"
            && let Some(next) = node
                .attrs
                .as_ref()
                .and_then(|a| a["target"].as_str())
                .and_then(|id| replacements.get(id))
        {
            node.attrs.as_mut().unwrap()["target"] = json!(next);
        }
        node.content.iter_mut().for_each(|n| remap(n, replacements));
    }
    let mut nodes = nodes.to_vec();
    let mut replacements = BTreeMap::new();
    for n in &mut nodes {
        renew(n, occupied, &mut replacements);
        assign(n);
    }
    for n in &mut nodes {
        remap(n, &replacements);
    }
    nodes
}
pub fn anchors(document: &Node) -> BTreeSet<String> {
    let mut out = BTreeSet::new();
    fn visit(n: &Node, out: &mut BTreeSet<String>) {
        if let Some(id) = anchor(n) {
            out.insert(id.into());
        }
        for c in &n.content {
            visit(c, out);
        }
    }
    visit(document, &mut out);
    out
}

/// A target appearing/disappearing together with its uses is one dependent comparison unit.
pub(super) fn dependent_changes(before: &Node, after: &Node) -> bool {
    let a: BTreeSet<_> = targets(before).into_iter().map(|t| t.id).collect();
    let b: BTreeSet<_> = targets(after).into_iter().map(|t| t.id).collect();
    let changed: BTreeSet<_> = a.symmetric_difference(&b).collect();
    fn uses(node: &Node, changed: &BTreeSet<&String>) -> bool {
        (node.kind == "crossReference"
            && node
                .attrs
                .as_ref()
                .and_then(|a| a["target"].as_str())
                .is_some_and(|id| changed.iter().any(|s| s.as_str() == id)))
            || node.content.iter().any(|n| uses(n, changed))
    }
    uses(before, &changed)
        || uses(after, &changed)
        || super::mathematics::dependent_aliases(before, after)
}

#[cfg(test)]
#[cfg_attr(coverage_nightly, coverage(off))]
mod tests;
