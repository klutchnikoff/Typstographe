//! Copied ONLY into the disposable benchmark checkout, never the application.
use serde_json::{Value, json};
use std::{
    collections::HashMap,
    sync::{Mutex, OnceLock},
    time::Instant,
};

static CACHE: OnceLock<Mutex<HashMap<String, String>>> = OnceLock::new();
pub fn convert(source: &str) -> Result<String, String> {
    let mut cache = CACHE.get_or_init(Default::default).lock().unwrap();
    if let Some(result) = cache.get(source) {
        return Ok(result.clone());
    }
    let result = mitex::convert_math(source, None)?;
    cache.insert(source.into(), result.clone());
    Ok(result)
}
pub fn native() -> bool {
    static ENGINE: OnceLock<bool> = OnceLock::new();
    *ENGINE.get_or_init(|| std::env::var("TOG_MITEX_ENGINE").as_deref() == Ok("native"))
}

/// Typst's actual PluginFunc and WASM runtime, not a different WebAssembly host.
pub fn probe(path: &str) -> Result<Value, String> {
    use comemo::Track;
    use typst::syntax::{FileId, RootedPath, Source, VirtualPath, VirtualRoot};
    use typst::{
        World,
        engine::{Route, Sink, Traced},
        foundations::Bytes,
    };
    let world = crate::rendering::TypstWorld::default();
    let source = Source::new(
        FileId::new(RootedPath::new(
            VirtualRoot::Project,
            VirtualPath::new("/probe.typ").unwrap(),
        )),
        "#let convert = plugin(\"/packages/mitex-0.2.7/mitex.wasm\").convert_math".into(),
    );
    let started = Instant::now();
    let module = typst_eval::eval(
        (&world as &dyn World).track(),
        world.library(),
        Traced::default().track(),
        Sink::new().track_mut(),
        Route::default().track(),
        &source,
    )
    .map_err(|e| format!("{e:?}"))?;
    let load_ms = started.elapsed().as_secs_f64() * 1000.;
    let function = module
        .scope()
        .get("convert")
        .unwrap()
        .read()
        .clone()
        .cast::<typst::foundations::Func>()
        .map_err(|e| format!("{e:?}"))?;
    let plugin = function.to_plugin().ok_or("not a plugin")?;
    let corpora: Vec<Value> =
        serde_json::from_slice(&std::fs::read(path).map_err(|e| e.to_string())?)
            .map_err(|e| e.to_string())?;
    let mut samples = Vec::new();
    for (corpus_index, corpus) in corpora.into_iter().enumerate() {
        let formulas: Vec<&str> = corpus["formulas"]
            .as_array()
            .unwrap()
            .iter()
            .map(|s| s.as_str().unwrap())
            .collect();
        for round in 0..21 {
            // Unique whitespace suffix prevents memoized calls from disguising
            // actual conversion. Both engines receive byte-identical input.
            let inputs: Vec<String> = formulas
                .iter()
                .map(|s| format!("{s}{}", " ".repeat(round + corpus_index * 25)))
                .collect();
            let mut native_result = Vec::new();
            let mut wasm_result = Vec::new();
            let mut native_ms = 0.;
            let mut wasm_ms = 0.;
            for engine in if round % 2 == 0 {
                ["native", "wasm"]
            } else {
                ["wasm", "native"]
            } {
                let start = Instant::now();
                if engine == "native" {
                    native_result = inputs
                        .iter()
                        .map(|s| mitex::convert_math(s, None))
                        .collect::<Result<Vec<_>, _>>()?;
                    native_ms = start.elapsed().as_secs_f64() * 1000.;
                } else {
                    wasm_result = inputs
                        .iter()
                        .map(|s| {
                            plugin
                                .call(vec![Bytes::new(s.as_bytes().to_vec()), Bytes::new(vec![])])
                                .map(|b| String::from_utf8(b.as_slice().to_vec()).unwrap())
                                .map_err(|e| e.to_string())
                        })
                        .collect::<Result<Vec<_>, _>>()?;
                    wasm_ms = start.elapsed().as_secs_f64() * 1000.;
                }
            }
            if native_result != wasm_result {
                return Err(format!(
                    "conversion mismatch: {} round {round}: {:?} vs {:?}",
                    corpus["name"], native_result, wasm_result
                ));
            }
            // Warm calls include each path's lookup and returned-string copying.
            for input in &inputs {
                convert(input)?;
            }
            let start = Instant::now();
            for input in &inputs {
                std::hint::black_box(convert(input)?);
            }
            let native_cached_ms = start.elapsed().as_secs_f64() * 1000.;
            let start = Instant::now();
            for input in &inputs {
                std::hint::black_box(
                    plugin
                        .call(vec![
                            Bytes::new(input.as_bytes().to_vec()),
                            Bytes::new(vec![]),
                        ])
                        .map_err(|e| e.to_string())?,
                );
            }
            let wasm_cached_ms = start.elapsed().as_secs_f64() * 1000.;
            samples.push(json!({"corpus":corpus["name"],"round":round,"count":inputs.len(),"nativeMs":native_ms,"wasmMs":wasm_ms,"nativeCachedMs":native_cached_ms,"wasmCachedMs":wasm_cached_ms,"equal":true}));
        }
    }
    Ok(json!({"pluginLoadMs":load_ms,"samples":samples}))
}
