use typst::{
    layout::{Frame, FrameItem},
    syntax::Span,
};
use typst_layout::Page;
// Keep every paint-relevant field. Source spans, semantic tags and links do not
// paint; excluding them permits pixel reuse after source offsets move.
fn visual(frame: &Frame) -> Frame {
    let mut frame = frame.clone();
    frame.retain(|item| match item {
        FrameItem::Group(group) => {
            group.frame = visual(&group.frame);
            group.label = None;
            group.parent = None;
            true
        }
        FrameItem::Text(text) => {
            for glyph in &mut text.glyphs {
                glyph.span = (Span::detached(), 0)
            }
            true
        }
        FrameItem::Shape(_, span) | FrameItem::Image(_, _, span) => {
            *span = Span::detached();
            true
        }
        FrameItem::Tag(_) | FrameItem::Link(..) => false,
    });
    frame
}
pub fn page_key(page: &Page, options: &typst_render::RenderOptions) -> String {
    format!(
        "{:032x}",
        typst::utils::hash128(&(
            visual(&page.frame),
            page.fill_or_white(),
            page.bleed,
            options
        ))
    )
}

#[cfg(test)]
#[cfg_attr(coverage_nightly, coverage(off))]
mod tests {
    use super::*;
    use crate::{assets::Assets, document_types::DocumentType, rendering::TypstWorld};
    fn key(source: &str, assets: Assets, options: &typst_render::RenderOptions) -> String {
        let kind = DocumentType::Courrier;
        let mut world = TypstWorld::default();
        world.set_assets(&assets);
        let document = world
            .compile_with_model(
                source,
                &crate::document_types::Metadata::demo(kind),
                "#let courrier(body, ..options) = body",
                kind.default_model_manifest(),
            )
            .unwrap();
        page_key(&document.pages()[0], options)
    }
    #[test]
    fn visual_identity_covers_fonts_paint_dimensions_images_and_render_options() {
        let options = typst_render::RenderOptions::default();
        let text = "#set page(width: 100pt, height: 100pt, margin: 0pt)\nTexte";
        let baseline = key(text, Assets::default(), &options);
        assert_eq!(
            baseline,
            key(
                &format!("// shifted spans\n{text}"),
                Assets::default(),
                &options
            )
        );
        for source in [
            text.replace("100pt", "110pt"),
            format!("#set text(fill: red)\n{text}"),
            format!("#set text(weight: \"bold\")\n{text}"),
            format!("#set text(font: \"Noto Sans CJK JP\")\n{text}"),
            format!("{text}\n#rect(width: 2pt, height: 2pt, fill: red)"),
            text.replace("Texte", "Autre"),
        ] {
            assert_ne!(
                baseline,
                key(&source, Assets::default(), &options),
                "{source}"
            );
        }
        let mut other = options.clone();
        other.pixel_per_pt = 1.0.into();
        assert_ne!(baseline, key(text, Assets::default(), &other));
        let source = "#set page(width: 100pt, height: 100pt, margin: 0pt)\n#image(\"images/test.svg\", width: 10pt)";
        let assets = |color: &str| -> Assets {
            [("images/test.svg".into(), format!("<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"10\" height=\"10\"><rect width=\"10\" height=\"10\" fill=\"{color}\"/></svg>").into_bytes().into())].into_iter().collect()
        };
        assert_ne!(
            key(source, assets("red"), &options),
            key(source, assets("blue"), &options)
        );
    }
}
