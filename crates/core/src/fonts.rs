//! Catalogue embarqué, commun à l’éditeur et au rendu. Aucun accès aux polices
//! de la machine : un document garde les mêmes secours sur les trois systèmes.
use std::{collections::BTreeSet, path::Path, sync::OnceLock};
use typst::{foundations::Bytes, layout::FrameItem, text::Font};

struct FontFace {
    name: &'static str,
    data: &'static [u8],
}

struct FontFamily {
    faces: &'static [FontFace],
    license_name: &'static str,
    license: &'static [u8],
}

const CJK: [FontFace; 2] = [
    FontFace {
        name: "NotoSansCJKjp-Regular.otf",
        data: include_bytes!("../assets/fonts/noto-cjk/NotoSansCJKjp-Regular.otf"),
    },
    FontFace {
        name: "NotoSansCJKjp-Bold.otf",
        data: include_bytes!("../assets/fonts/noto-cjk/NotoSansCJKjp-Bold.otf"),
    },
];
const STIX: [FontFace; 4] = [
    FontFace {
        name: "STIXTwoText-Regular.otf",
        data: include_bytes!("../assets/fonts/stix-two/STIXTwoText-Regular.otf"),
    },
    FontFace {
        name: "STIXTwoText-Italic.otf",
        data: include_bytes!("../assets/fonts/stix-two/STIXTwoText-Italic.otf"),
    },
    FontFace {
        name: "STIXTwoText-Bold.otf",
        data: include_bytes!("../assets/fonts/stix-two/STIXTwoText-Bold.otf"),
    },
    FontFace {
        name: "STIXTwoText-BoldItalic.otf",
        data: include_bytes!("../assets/fonts/stix-two/STIXTwoText-BoldItalic.otf"),
    },
];
const FAMILIES: [FontFamily; 2] = [
    FontFamily {
        faces: &CJK,
        license_name: "LICENSE-Noto-CJK.txt",
        license: include_bytes!("../assets/fonts/noto-cjk/LICENSE"),
    },
    FontFamily {
        faces: &STIX,
        license_name: "LICENSE-STIX-Two.txt",
        license: include_bytes!("../assets/fonts/stix-two/OFL.txt"),
    },
];

pub fn typst_fonts() -> Vec<Font> {
    static FONTS: OnceLock<Vec<Font>> = OnceLock::new();
    FONTS
        .get_or_init(|| {
            typst_assets::fonts()
                .chain(
                    FAMILIES
                        .iter()
                        .flat_map(|family| family.faces.iter().map(|font| font.data)),
                )
                .flat_map(|data| Font::iter(Bytes::new(data)))
                .collect()
        })
        .clone()
}

/// Exporter les faces supplémentaires utilisées pour recompiler les sources.
pub fn export_used(document: &typst_layout::PagedDocument, root: &Path) -> std::io::Result<()> {
    fn collect(frame: &typst::layout::Frame, used: &mut BTreeSet<(usize, usize)>) {
        for (_, item) in frame.items() {
            match item {
                FrameItem::Group(group) => collect(&group.frame, used),
                FrameItem::Text(text) => {
                    for (family_index, family) in FAMILIES.iter().enumerate() {
                        for (face_index, face) in family.faces.iter().enumerate() {
                            if text.font.data().as_slice() == face.data {
                                used.insert((family_index, face_index));
                            }
                        }
                    }
                }
                _ => {}
            }
        }
    }
    let mut used = BTreeSet::new();
    for page in document.pages() {
        collect(&page.frame, &mut used);
    }
    if used.is_empty() {
        return Ok(());
    }
    let directory = root.join("fonts");
    std::fs::create_dir(&directory)?;
    let mut licenses = BTreeSet::new();
    for (family_index, face_index) in used {
        let family = &FAMILIES[family_index];
        let face = &family.faces[face_index];
        std::fs::write(directory.join(face.name), face.data)?;
        if licenses.insert(family_index) {
            std::fs::write(directory.join(family.license_name), family.license)?;
        }
    }
    std::fs::write(
        directory.join("README.txt"),
        "Compile from the export directory using the included fonts:\n\n\
         typst compile --font-path fonts main.typ\n\n\
         Upstream Noto Sans CJK: https://github.com/notofonts/noto-cjk/releases/tag/Sans2.004\n\
         Upstream STIX Two Text: https://github.com/stipub/stixfonts/releases/tag/v2.13b171\n",
    )
}

#[cfg(test)]
#[cfg_attr(coverage_nightly, coverage(off))]
mod tests {
    use super::*;

    #[test]
    fn cjk_source_exports_include_only_used_faces_and_the_license() {
        use crate::{
            document_types::{DocumentType, Metadata},
            rendering,
        };
        for (source, expected) in [
            ("Bonjour", vec![]),
            ("日本", vec![0]),
            ("#strong[日本]", vec![1]),
            ("日本 #strong[中国]", vec![0, 1]),
        ] {
            let root = tempfile::tempdir().unwrap();
            let directory = root.path().join("export");
            let mut world = rendering::TypstWorld::default();
            let template = "#let courrier(..args, body) = body";
            let request = rendering::RenderRequest {
                source: source.into(),

                metadata: Metadata::demo(DocumentType::Courrier),
                template: template.into(),
                model_manifest: DocumentType::Courrier.default_model_manifest().into(),
                assets: Default::default(),
                dependencies: crate::packages::for_template(template),
            };
            let document = world
                .compile_with_template(source, &request.metadata, template)
                .unwrap();
            crate::exporting::write_document(
                &document,
                &request,
                &directory,
                crate::protocol::ExportFormat::Both,
                true,
            )
            .unwrap();
            assert!(directory.join("courrier.pdf").exists());
            assert!(directory.join("main.typ").exists());
            assert_eq!(directory.join("fonts").exists(), !expected.is_empty());
            for (index, font) in CJK.iter().enumerate() {
                let path = directory.join("fonts").join(font.name);
                assert_eq!(path.exists(), expected.contains(&index), "{source}");
                if path.exists() {
                    assert!(std::fs::read(path).unwrap() == font.data);
                }
            }
            if !expected.is_empty() {
                assert!(
                    std::fs::read(directory.join("fonts/LICENSE-Noto-CJK.txt")).unwrap()
                        == FAMILIES[0].license
                );
                assert!(
                    std::fs::read_to_string(directory.join("fonts/README.txt"))
                        .unwrap()
                        .contains("--font-path fonts main.typ")
                );
            }
        }
    }
}
