use super::Node;
use serde_json::{Map, Value, json};

const PLACEMENT: [(&str, &str); 5] = [
    ("model", "web-follow-model"),
    ("in-flow", "web-figure-in-flow"),
    ("auto", "web-figure-float-auto"),
    ("top", "web-figure-float-top"),
    ("bottom", "web-figure-float-bottom"),
];
const WIDTH: [(&str, &str); 3] = [
    ("model", "web-follow-model"),
    ("column", "web-figure-column"),
    ("full", "web-figure-full-width"),
];

pub(super) fn parameters(properties: &mut Value) {
    for (name, label, choices) in [
        ("placement", "web-figure-placement", &PLACEMENT[..]),
        ("width", "web-figure-width", &WIDTH[..]),
    ] {
        properties[name] = json!({
            "type": "string", "default": "model",
            "enum": choices.iter().map(|(value, _)| value).collect::<Vec<_>>(),
            "x-editor": {
                "label_key": label,
                "option_label_keys": choices.iter().map(|(value, key)| (value.to_string(), json!(key))).collect::<Map<_, _>>()
            }
        });
    }
}

pub(super) fn options(node: &Node, arguments: &mut String) -> Result<&'static str, String> {
    let setting = |name: &str, choices: &[(&'static str, &'static str)]| {
        let value = node.attrs.as_ref().and_then(|attrs| attrs.get(name));
        match value {
            None => Ok("model"),
            Some(value) => choices
                .iter()
                .find(|(choice, _)| value.as_str() == Some(*choice))
                .map(|(choice, _)| *choice)
                .ok_or_else(|| format!("invalid_figure_{name}")),
        }
    };
    match setting("placement", &PLACEMENT)? {
        "model" => (),
        "in-flow" => arguments.push_str(", placement: none"),
        placement => arguments.push_str(&format!(", placement: {placement}")),
    }
    Ok(match setting("width", &WIDTH)? {
        "full" => "#metadata((typstographe-full-width: true))\n",
        "column" => {
            arguments.push_str(", scope: \"column\"");
            ""
        }
        _ => "",
    })
}

#[cfg(test)]
mod tests {
    use crate::{
        assets::Assets,
        content::{Node, source, tables},
        document_types::{DocumentType, Metadata},
        rendering::TypstWorld,
    };
    use serde_json::json;
    use typst::{
        foundations::Value,
        layout::{Frame, FrameItem},
        model::FigureElem,
    };

    fn table(rows: u32, anchor: &str) -> Node {
        let mut table = tables::create(rows, 2, true, false).unwrap();
        table.attrs = Some(json!({"anchor": anchor, "width": "full", "placement": "top"}));
        for (index, row) in table.content[0].content.iter_mut().enumerate() {
            let text = if index == 0 {
                "COLHEADER".to_owned()
            } else {
                format!("{anchor}{index:03}")
            };
            row.content[0].content[0].content =
                vec![serde_json::from_value(json!({"type": "text", "text": text})).unwrap()];
        }
        table
    }

    fn collect_text(frame: &Frame, text: &mut String) {
        for (_, item) in frame.items() {
            match item {
                FrameItem::Group(group) => collect_text(&group.frame, text),
                FrameItem::Text(run) => text.push_str(&run.text),
                _ => {}
            }
        }
    }

    #[test]
    fn full_width_floats_keep_their_anchors_and_long_tables_paginate() {
        let document = serde_json::from_value(json!({
            "type": "doc",
            "content": [
                {"type": "paragraph", "content": [{"type": "text", "text": "Avant"}]},
                table(3, "short"),
                table(36, "long"),
                {"type": "paragraph", "content": [{"type": "text", "text": "Apres"}]}
            ]
        }))
        .unwrap();
        let body = source(&document, &Assets::default()).unwrap();
        let model = r#"
          #import "capabilities/figures.typ": layout-figures
          #let article(..args, body) = {
            set page(width: 300pt, height: 230pt, margin: 20pt)
            layout-figures(body, column-count: 2)
          }
        "#;
        let mut world = TypstWorld::default();
        world.set_dependencies(&crate::packages::for_template(model));
        let result = world
            .compile_with_template(&body, &Metadata::blank(DocumentType::Article), model)
            .unwrap();
        let figures: Vec<_> = result
            .introspector()
            .elements()
            .all()
            .filter(|element| element.is::<FigureElem>())
            .collect();
        let figure = |anchor: &str| {
            figures
                .iter()
                .find(|element| element.label().unwrap().resolve().as_str() == anchor)
                .unwrap()
        };
        assert_eq!(figures.len(), 2);
        assert_eq!(
            figure("tog-short").get_by_name("scope").unwrap(),
            Value::Str("parent".into())
        );
        assert_eq!(
            figure("tog-long").get_by_name("placement").unwrap(),
            Value::None
        );
        let pages: Vec<_> = result
            .pages()
            .iter()
            .map(|page| {
                let mut text = String::new();
                collect_text(&page.frame, &mut text);
                text
            })
            .collect();
        let table_pages: Vec<_> = pages.iter().filter(|text| text.contains("long0")).collect();
        assert!(table_pages.len() > 1);
        assert!(table_pages.iter().all(|text| text.contains("COLHEADER")));
        let text = pages.concat();
        for index in 1..36 {
            assert_eq!(text.matches(&format!("long{index:03}")).count(), 1);
        }
        assert!(text.find("long035").unwrap() < text.find("Apres").unwrap());
    }
}
