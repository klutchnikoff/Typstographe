//! Preview labels for targets that have not yet been referenced in the text.
use super::{Reference, ResolvedReference, resolved_metadata, target_id};
use crate::rendering::{TypstWorld, file_id};
use comemo::Track;
use std::{collections::BTreeSet, ops::ControlFlow};
use typst::{
    World,
    engine::{Engine, Route, Sink, Traced},
    foundations::{Arg, Args, CONTEXT_RULE, Context, ContextElem, StyleChain, Value},
    introspection::Introspector,
    math::EquationElem,
    model::{FigureElem, HeadingElem},
    syntax::{Span, Spanned},
    utils::Protected,
};
use typst_layout::PagedDocument;

/// Evaluate the same Typst capability against the already laid-out document.
/// It returns metadata and a link, but neither is added to the layout or the source.
pub fn complete_preview(
    world: &TypstWorld,
    document: &PagedDocument,
    references: &mut Vec<ResolvedReference>,
) {
    let introspector = document.introspector();
    let mut targets = introspector
        .elements()
        .all()
        .filter_map(|element| {
            if !(element.is::<HeadingElem>()
                || element.is::<FigureElem>()
                || element.is::<EquationElem>())
            {
                return None;
            }
            let label = element.label()?;
            Some((
                label,
                target_id(label.resolve().as_str())?,
                element.location()?,
            ))
        })
        .peekable();
    if targets.peek().is_none() {
        return;
    }
    let Ok(source) = world.source(file_id("capabilities/cross-references.typ")) else {
        return;
    };
    let world = world as &dyn World;
    let traced = Traced::default();
    let mut sink = Sink::new();
    let route = Route::default();
    let Ok(module) = typst_eval::eval(
        world.track(),
        world.library(),
        traced.track(),
        sink.track_mut(),
        route.track(),
        &source,
    ) else {
        return;
    };
    let Some(Value::Func(capability)) = module.scope().get("cross-reference").map(|b| b.read())
    else {
        return;
    };
    let mut published: BTreeSet<_> = references
        .iter()
        .map(|entry| {
            let r = &entry.reference;
            (r.target.clone(), r.include_label, r.include_page)
        })
        .collect();
    let introspector = introspector.as_ref() as &dyn Introspector;
    let mut engine = Engine {
        world: world.track(),
        library: world.library(),
        introspector: Protected::new(introspector.track()),
        traced: traced.track(),
        sink: sink.track_mut(),
        route,
    };
    let span = Span::detached();
    for (label, id, location) in targets {
        let context = Context::new(Some(location), Some(StyleChain::default()));
        for (include_label, include_page) in [(true, false), (false, true), (true, true)] {
            if !published.insert((id.clone(), include_label, include_page)) {
                continue;
            }
            let mut args = Args::new(span, [label]);
            for (name, value) in [
                ("include-label", include_label),
                ("include-page", include_page),
            ] {
                args.items.push(Arg {
                    span,
                    name: Some(name.into()),
                    value: Spanned::new(Value::Bool(value), span),
                });
            }
            let Ok(Value::Content(deferred)) = capability.call(&mut engine, context.track(), args)
            else {
                continue;
            };
            let deferred = deferred.located(location);
            let Some(deferred) = deferred.to_packed::<ContextElem>() else {
                continue;
            };
            let Ok(content) = CONTEXT_RULE(deferred, &mut engine, StyleChain::default()) else {
                continue;
            };
            if let ControlFlow::Break(display) = content.traverse(&mut |content| {
                if let Some(reference) = resolved_metadata(&content) {
                    return ControlFlow::Break(reference.display);
                }
                ControlFlow::Continue(())
            }) {
                references.push(ResolvedReference {
                    reference: Reference {
                        target: id.clone(),
                        include_label,
                        include_page,
                    },
                    display,
                });
            }
        }
    }
}
