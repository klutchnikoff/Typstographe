//! Exact benchmark sources exported by the application core; no user projects.
use serde_json::json;
use std::{path::PathBuf, time::Instant};
use typstographe_core::{
    assets::Assets,
    content::{Node, source_mapped},
    document_types::{DocumentType, Metadata},
    rendering::{RenderRequest, TypstWorld},
};
fn main() {
    let root = PathBuf::from(std::env::args().nth(1).expect("corpora.json"));
    let output = PathBuf::from(std::env::args().nth(2).expect("output"));
    std::fs::create_dir_all(&output).unwrap();
    let corpora: serde_json::Value = serde_json::from_slice(&std::fs::read(root).unwrap()).unwrap();
    for corpus in corpora
        .as_array()
        .unwrap()
        .iter()
        .filter(|c| c["language"] == "latex")
    {
        let mut node: Node = serde_json::from_value(corpus["document"].clone()).unwrap();
        let kind = DocumentType::Article;
        let metadata = Metadata::demo(kind);
        let template = kind.default_model();
        let manifest = kind.default_model_manifest();
        let assets = Assets::default();
        let mut world = TypstWorld::default();
        let path = output.join(corpus["name"].as_str().unwrap());
        let source = source_mapped(&node, &assets).unwrap().0;
        let dependencies = typstographe_core::packages::including_source(
            &typstographe_core::packages::for_template(&template),
            &source,
        );
        world.set_dependencies(&dependencies);
        let document = world
            .compile_with_model(&source, &metadata, &template, manifest)
            .unwrap();
        let pages = document.pages().len();
        typstographe_core::exporting::write_document(
            &document,
            &RenderRequest {
                source: source.clone(),
                assets: assets.clone(),
                dependencies,
                metadata: metadata.clone(),
                template: template.clone(),
                model_manifest: manifest.into(),
            },
            &path,
            typstographe_core::protocol::ExportFormat::Typst,
            false,
        )
        .unwrap();
        let mut states = vec![json!({"phase":"initial","round":0,"source":source})];
        for phase in ["prose-edit", "formula-edit"] {
            for round in 0..16 {
                if phase == "prose-edit" {
                    node.content[0].content[0]
                        .text
                        .as_mut()
                        .unwrap()
                        .insert(0, (b'a' + round as u8) as char)
                } else {
                    let math = node
                        .content
                        .iter_mut()
                        .find(|n| n.kind == "mathBlock")
                        .unwrap();
                    math.content[0].text.as_mut().unwrap().push_str(" + 1");
                }
                let start = Instant::now();
                let source = source_mapped(&node, &assets).unwrap().0;
                let projection_ms = start.elapsed().as_secs_f64() * 1000.;
                states.push(json!({"phase":phase,"round":round,"source":source,"projectionMs":projection_ms}));
            }
        }
        std::fs::write(
            path.join("states.json"),
            serde_json::to_vec_pretty(
                &json!({"name":corpus["name"],"pages":pages,"states":states}),
            )
            .unwrap(),
        )
        .unwrap();
        println!("Exported {} ({pages} pages)", path.display());
    }
}
