//! Progressive MCP views derived from the shared registries, never a second contract.
use serde_json::{Value, json};
use std::collections::{BTreeMap, BTreeSet};
use typstographe_core::{
    content::{api, catalogue},
    document_types::{DocumentType, discovery as profiles},
};

fn model_cards(kind: DocumentType) -> Vec<Value> {
    kind.models()
        .map(|model| {
            json!({
                "id":model.model.id(), "name":model.name,
                "description":model.description, "keywords":model.keywords
            })
        })
        .collect()
}

pub fn types() -> Value {
    json!({"types":DocumentType::ALL.map(|kind| {
        let profile = profiles::catalogue().types.iter().find(|p|p.runtime_type==Some(kind));
        json!({"id":kind,"name":profile.map(|p|p.name.as_str()),
            "description":profile.map(|p|p.description.as_str()),"can_create":kind.can_create(),
            "capability_count":catalogue::for_type(kind).count(),"models":model_cards(kind)})
    }), "discovery":profiles::describe_all(),
    "details":"Use document_types.describe with a type ID for fields and capability summaries; capabilities.describe with one capability ID for signatures, constraints and examples."})
}

pub fn capabilities(kind: Option<DocumentType>) -> Value {
    let entries: Vec<_> = catalogue::ALL
        .iter()
        .filter(|cap| {
            kind.is_none_or(|kind| catalogue::for_type(kind).any(|item| item.id == cap.id))
        })
        .map(|cap| json!({"id":cap.id,"group":cap.group,"description":cap.description}))
        .collect();
    json!({"document_type":kind,"entries":entries,
        "details":"Use capabilities.describe with one ID. Type capabilities do not grant adapter permissions or guarantee that a particular edit is currently available."})
}

pub fn describe_type(id: &str) -> Option<Value> {
    let mut value = api::describe_type(id)?;
    if let Some(kind) = profiles::find(id)?.runtime_type {
        value["capabilities"] = capabilities(Some(kind))["entries"].clone();
    }
    value["details"] = json!(
        "Use capabilities.describe for one capability's signature and executable examples. Models are interchangeable visual presentations."
    );
    Some(value)
}

fn execution(id: &str, attached: bool, batch_step: bool) -> Value {
    json!({"direct_tool":!attached || crate::attached_support(id),
        "proposal_step":attached && batch_step && crate::attached_id(id)})
}

pub fn commands(attached: bool) -> Value {
    let mut index = api::catalogue();
    for entry in index["entries"].as_array_mut().unwrap() {
        entry.as_object_mut().unwrap().remove("params_schema");
        entry["execution"] = execution(
            entry["id"].as_str().unwrap(),
            attached,
            entry["batch_step"] == true,
        );
    }
    let entries = index["entries"].as_array_mut().unwrap();
    for tool in crate::tools(attached) {
        if !entries
            .iter()
            .any(|entry| entry["id"] == tool.name.as_ref())
        {
            entries.push(json!({"id":tool.name,"family":"mcp","batch_step":false,
                "description":tool.description,"execution":{"direct_tool":true,"proposal_step":false}}));
        }
    }
    entries.sort_by(|a, b| a["id"].as_str().cmp(&b["id"].as_str()));
    index["details"] = json!(
        "Use capabilities.describe with one ID for its schema and examples. execution describes adapter support, not current permissions or edit availability."
    );
    index
}

pub fn describe(id: &str, attached: bool) -> Option<Value> {
    let tool = crate::tools(attached)
        .into_iter()
        .find(|tool| tool.name == id);
    let mut value = api::describe(id).or_else(|| {
        tool.as_ref().map(|tool|json!({
        "id":id,"family":"mcp","batch_step":false,"description":tool.description,"examples":[]
    }))
    })?;
    value["id"] = json!(id);
    // Semantic IDs describe a feature, not an invocable operation. Their
    // canonical examples point to the operation IDs whose support can be read.
    if value.get("family").is_some() {
        let mut support = execution(id, attached, value["batch_step"] == true);
        support["direct_tool"] = json!(tool.is_some());
        value["execution"] = support;
    }
    if let Some(tool) = tool {
        value["params_schema"] = json!(tool.input_schema);
    }
    for key in ["params_schema", "parameters"] {
        if let Some(schema) = value.get_mut(key) {
            prune_schema(schema);
        }
    }
    Some(value)
}

pub fn overview(attached: bool, kind: Option<DocumentType>) -> Value {
    json!({"mode":if attached {"attached"}else{"autonomous"},
        "purpose":"Write structured documents without Typst code; the visual model controls presentation.",
        "document_open":kind.is_some(),"document_type":kind,
        "capabilities":kind.map(|kind|capabilities(Some(kind))["entries"].clone()),
        "rules":if attached {
            "Read published content. Submit body edits as proposals; only the human can decide. Metadata, resources and files are read-only. Use the outer permissions and latest document reference."
        } else {
            "Edits stay in memory until explicit save. Files require configured read/write roots. Export is separate. Use the outer permissions and latest document reference."
        },
        "next":{"types":"document_types.list","type_details":{"tool":"document_types.describe","argument":"type"},
            "capability_details":{"tool":"capabilities.describe","argument":"id"},
            "operations":"commands.list","editing_guide":"typstographe://guide",
            "content":"document.inspect"}})
}

/// Retain the transitive closure of referenced definitions, including recursion.
/// This changes neither accepted inputs nor the schemas' reference identities.
pub fn prune_schema(schema: &mut Value) {
    match schema {
        Value::Array(items) => {
            for item in items {
                prune_schema(item);
            }
        }
        Value::Object(map) => {
            for value in map.values_mut() {
                prune_schema(value);
            }
            let Some(Value::Object(definitions)) = map.remove("$defs") else {
                return;
            };
            fn references(value: &Value, found: &mut BTreeSet<String>) {
                match value {
                    Value::Array(items) => {
                        for item in items {
                            references(item, found);
                        }
                    }
                    Value::Object(map) => {
                        if let Some(name) = map
                            .get("$ref")
                            .and_then(Value::as_str)
                            .and_then(|reference| reference.strip_prefix("#/$defs/"))
                        {
                            found.insert(
                                name.split('/')
                                    .next()
                                    .unwrap()
                                    .replace("~1", "/")
                                    .replace("~0", "~"),
                            );
                        }
                        for (key, value) in map {
                            if key != "$defs" {
                                references(value, found);
                            }
                        }
                    }
                    _ => {}
                }
            }
            let mut needed = BTreeSet::new();
            for value in map.values() {
                references(value, &mut needed);
            }
            let mut retained = BTreeMap::new();
            while let Some(name) = needed.pop_first() {
                if retained.contains_key(&name) {
                    continue;
                }
                if let Some(definition) = definitions.get(&name) {
                    references(definition, &mut needed);
                    retained.insert(name, definition.clone());
                }
            }
            if !retained.is_empty() {
                map.insert("$defs".into(), json!(retained));
            }
        }
        _ => {}
    }
}
