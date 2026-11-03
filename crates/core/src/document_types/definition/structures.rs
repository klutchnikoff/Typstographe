//! Registered data fragments are expanded once, before ordinary type validation.
use super::{Binding, Collection, Definition, Diagnostic, DiagnosticCode, Header, LoadError, Tab};
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use std::{collections::BTreeSet, sync::OnceLock};

#[derive(
    Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize, JsonSchema,
)]
#[serde(rename_all = "kebab-case")]
pub enum HeaderStructure {
    Authorship,
}
impl HeaderStructure {
    pub fn id(self) -> &'static str {
        match self {
            Self::Authorship => "authorship",
        }
    }
    fn fragment(self) -> Result<&'static Fragment, &'static LoadError> {
        static AUTHORSHIP: OnceLock<Result<Fragment, LoadError>> = OnceLock::new();
        match self {
            Self::Authorship => AUTHORSHIP
                .get_or_init(|| {
                    super::loader::decode_yaml(include_str!("../../../structures/authorship.yaml"))
                })
                .as_ref(),
        }
    }
}

/// Exact permutations, not filters or overrides. Empty lists retain assembly order.
#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct AssemblyOrder {
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub collections: Vec<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub bindings: Vec<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub tabs: Vec<String>,
}
impl AssemblyOrder {
    pub fn is_empty(&self) -> bool {
        self.collections.is_empty() && self.bindings.is_empty() && self.tabs.is_empty()
    }
}

// Fragments cannot import fragments, provide executable rules or override type
// identity, capabilities and model policy. Their fields use the ordinary contract.
#[derive(Clone, Debug, Deserialize)]
#[serde(deny_unknown_fields)]
struct Fragment {
    id: HeaderStructure,
    collections: Vec<Collection>,
    bindings: Vec<Binding>,
    header: Header,
}

pub(super) fn expand(mut definition: Definition) -> Result<Definition, Vec<Diagnostic>> {
    let mut seen = BTreeSet::new();
    let mut collections = Vec::new();
    let mut bindings = Vec::new();
    let mut tabs = Vec::new();
    for (i, id) in std::mem::take(&mut definition.structures)
        .into_iter()
        .enumerate()
    {
        let path = format!("/structures/{i}");
        if !seen.insert(id) {
            return Err(vec![diagnostic(
                DiagnosticCode::DuplicateIdentifier,
                &path,
                id.id(),
            )]);
        }
        let fragment = id.fragment().map_err(|e| {
            vec![diagnostic(
                DiagnosticCode::InvalidStructure,
                &path,
                &e.to_string(),
            )]
        })?;
        if fragment.id != id {
            return Err(vec![diagnostic(
                DiagnosticCode::InvalidStructure,
                &path,
                "registered fragment identity mismatch",
            )]);
        }
        collections.extend(fragment.collections.clone());
        bindings.extend(fragment.bindings.clone());
        tabs.extend(fragment.header.tabs.clone());
    }
    collections.append(&mut definition.collections);
    bindings.append(&mut definition.bindings);
    tabs.append(&mut definition.header.tabs);
    let order = std::mem::take(&mut definition.order);
    reorder(
        &mut collections,
        &order.collections,
        |c| &c.id,
        "/order/collections",
    )?;
    reorder(
        &mut bindings,
        &order.bindings,
        Binding::source,
        "/order/bindings",
    )?;
    reorder(&mut tabs, &order.tabs, Tab::id, "/order/tabs")?;
    definition.collections = collections;
    definition.bindings = bindings;
    definition.header.tabs = tabs;
    Ok(definition)
}

fn diagnostic(code: DiagnosticCode, path: &str, detail: &str) -> Diagnostic {
    Diagnostic {
        code,
        path: path.into(),
        detail: detail.into(),
    }
}
fn reorder<T>(
    values: &mut [T],
    order: &[String],
    key: impl Fn(&T) -> &str,
    path: &str,
) -> Result<(), Vec<Diagnostic>> {
    if order.is_empty() {
        return Ok(());
    }
    let names: BTreeSet<_> = values.iter().map(&key).collect();
    let requested: BTreeSet<_> = order.iter().map(String::as_str).collect();
    if names.len() != values.len() || requested.len() != order.len() || requested != names {
        return Err(vec![diagnostic(
            DiagnosticCode::InvalidOrder,
            path,
            "order must list every resolved identity exactly once; it cannot hide or redefine entries",
        )]);
    }
    // Positions are guaranteed to exist after the exact-permutation check above.
    values.sort_by_cached_key(|v| order.iter().position(|name| name == key(v)).unwrap());
    Ok(())
}

#[cfg(test)]
#[cfg_attr(coverage_nightly, coverage(off))]
mod tests;
