use super::{Session, content_error, decode, invalid};
use crate::{
    content::{
        commands::{TextTarget, TextZone},
        mapping::source_mapped_with_zones,
    },
    navigation::{PagePoint, RenderSync},
    protocol::{CommandError, ErrorCode},
};
use serde_json::{Value, json};
impl Session {
    pub(super) fn render_query(&mut self, id: &str, p: &Value) -> Result<Value, CommandError> {
        let archive = self.archive()?;
        let (source, map, ranges) =
            source_mapped_with_zones(&archive.document, &archive.assets, &archive.metadata)
                .map_err(|_| content_error(invalid("source_map")))?;
        self.world.set_assets(&archive.assets);
        self.world.set_dependencies(&archive.dependencies);
        let doc = self
            .world
            .compile_with_model(
                &source,
                &archive.metadata,
                &archive.template,
                &archive.model_manifest,
            )
            .map_err(|e| CommandError::with_cause(ErrorCode::Template, "export_compile", e))?;
        let sync = RenderSync::new(self.guard().unwrap().revision, self.world.clone(), doc, map);
        if let Some(target) = p.get("target") {
            let target: TextTarget = decode(target.clone())?;
            super::queries::text(self.state()?, Some(&target)).map_err(content_error)?;
            let start = ranges
                .iter()
                .find(
                    |range| matches!(&target.zone, TextZone::Body { path } if *path == range.path),
                )
                .map(|range| *range.positions.start())
                .ok_or_else(|| content_error(invalid("render_body_target")))?;
            if id == "render.selection_boxes" {
                return Ok(
                    json!({"guard":self.guard(),"boxes":sync.selection_highlights_exact(start+target.from as usize..start+target.to as usize)}),
                );
            }
            return Ok(
                json!({"guard":self.guard(),"point":sync.forward(start+target.from as usize)}),
            );
        }
        let point: PagePoint = decode(p["point"].clone())?;
        if point.point.iter().any(|n| !n.is_finite()) {
            return Err(content_error(invalid("point")));
        }
        let target = sync.backward(point).and_then(|pos| {
            ranges
                .iter()
                .find(|range| range.positions.contains(&pos))
                .map(|range| TextTarget {
                    zone: TextZone::Body {
                        path: range.path.clone(),
                    },
                    from: (pos - range.positions.start()) as u32,
                    to: (pos - range.positions.start()) as u32,
                })
        });
        Ok(json!({"guard":self.guard(),"target":target}))
    }
}
