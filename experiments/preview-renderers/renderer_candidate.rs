//! Experiment only. Original compiled frames remain intact for RenderSync.
use serde::Serialize;
use std::{cell::Cell, sync::Arc, time::Instant};
use typst::{
    layout::{Frame, FrameItem},
    syntax::Span,
};
use typst_layout::PagedDocument;
thread_local! { static BASE: Cell<Option<u64>> = const { Cell::new(None) }; }
pub fn set_base(base: Option<u64>) {
    BASE.set(base);
}
#[derive(Default)]
pub struct Cache {
    revision: Option<u64>,
    keys: Vec<String>,
    vector: reflexo_vec2svg::IncrSvgDocServer,
}
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Metadata {
    mode: String,
    base: Option<u64>,
    reset: bool,
    keys: Vec<String>,
    changed: Vec<usize>,
    key_ms: f64,
    raster_ms: f64,
    rgba_ms: f64,
    vector_ms: f64,
}
fn ms(start: Instant) -> f64 {
    start.elapsed().as_secs_f64() * 1000.0
}
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
                glyph.span = (Span::detached(), 0);
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
impl Cache {
    pub fn render(
        &mut self,
        document: &PagedDocument,
        revision: u64,
        buffers: &mut Vec<Vec<u8>>,
        dimensions: &mut Vec<[u32; 2]>,
    ) -> Metadata {
        let mode = std::env::var("TOG_RENDERER").unwrap_or_else(|_| "rgba-full".into());
        let base = BASE.get();
        let reset = base.is_none() || base != self.revision;
        let start = Instant::now();
        let keys: Vec<_> = document
            .pages()
            .iter()
            .map(|page| {
                format!(
                    "{:032x}",
                    typst::utils::hash128(&(
                        visual(&page.frame),
                        page.fill_or_white(),
                        page.bleed,
                        2u32
                    ))
                )
            })
            .collect();
        let mut info = Metadata {
            mode: mode.clone(),
            base,
            reset,
            keys: keys.clone(),
            changed: Vec::new(),
            key_ms: ms(start),
            raster_ms: 0.0,
            rgba_ms: 0.0,
            vector_ms: 0.0,
        };
        info.changed = keys
            .iter()
            .enumerate()
            .filter(|(i, key)| mode == "rgba-full" || reset || self.keys.get(*i) != Some(*key))
            .map(|(i, _)| i)
            .collect();
        if mode == "reflexo" {
            let start = Instant::now();
            if reset {
                self.vector = Default::default();
            }
            // Span debugging is unnecessary: original RenderSync is retained.
            self.vector.set_should_attach_debug_info(false);
            let bytes = self
                .vector
                .pack_delta(&reflexo::typst::TypstDocument::Paged(Arc::new(
                    document.clone(),
                )));
            assert!(bytes.starts_with(b"diff-v1,"));
            buffers.push(bytes[8..].to_vec());
            dimensions.push([0, 0]);
            info.vector_ms = ms(start);
        } else {
            for &index in &info.changed {
                let start = Instant::now();
                let pixmap = typst_render::render(&document.pages()[index], &Default::default());
                info.raster_ms += ms(start);
                dimensions.push([pixmap.width(), pixmap.height()]);
                let start = Instant::now();
                buffers.push(pixmap.take_demultiplied());
                info.rgba_ms += ms(start);
            }
        }
        self.keys = keys;
        self.revision = Some(revision);
        info
    }
}
