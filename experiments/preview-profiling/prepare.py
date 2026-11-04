"""Instrument a disposable production checkout, preserving all normal application files."""
import io
import json
import subprocess
import tarfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
HERE = Path(__file__).resolve().parent
OUT = ROOT / 'output/preview-profiling'
SOURCE = OUT / 'source'
if SOURCE.exists():
    raise SystemExit(f'Refusing to replace {SOURCE}')
subprocess.run(['python3', str(HERE / 'corpus.py')], check=True)
base = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT, text=True).strip()
SOURCE.mkdir()
with tarfile.open(fileobj=io.BytesIO(subprocess.check_output(['git', 'archive', base], cwd=ROOT))) as tar:
    tar.extractall(SOURCE, filter='data')
(SOURCE / 'node_modules').symlink_to(ROOT / 'node_modules', target_is_directory=True)
(SOURCE / 'app/src/profile-corpora.json').write_bytes((OUT / 'corpora.json').read_bytes())
(SOURCE / 'app/src/preview-performance.ts').write_bytes((HERE / 'preview.ts').read_bytes())
(SOURCE / 'crates/core/src/preview_profile.rs').write_bytes((HERE / 'profile.rs').read_bytes())


def replace(path, old, new):
    file = SOURCE / path
    data = file.read_text()
    assert data.count(old) == 1, (path, old)
    file.write_text(data.replace(old, new))


with (SOURCE / 'crates/core/src/lib.rs').open('a') as stream:
    stream.write('\npub mod preview_profile;\n')
replace('app/src-tauri/Cargo.toml', 'name = "typstographe"', 'name = "typstographe-preview-profile"')
replace('Cargo.lock', 'name = "typstographe"\n', 'name = "typstographe-preview-profile"\n')
replace('app/src-tauri/src/main.rs', '    let bridge = Bridge {', '''    if diagnostic.as_deref() == Some("performance") {
        use typstographe_core::document_types::{DocumentType, Metadata};
        let kind = DocumentType::Article;
        session.settings = crate::settings::Settings {
            metadata: Metadata::demo(kind), template: kind.default_model(),
            model_manifest: kind.default_model_manifest().into(), model_id: "article.model.working".into(),
        };
        session.fixture = Some(serde_json::from_value(serde_json::json!({"type":"doc","content":[{"type":"paragraph"}]})).unwrap());
    }
    let bridge = Bridge {''')
replace('app/src-tauri/src/main.rs', '            menus::install(app.handle())?;', '''            menus::install(app.handle())?;
            if !global_session { if let Some(window) = app.get_webview_window("main") { window.show()?; window.set_focus()?; } }''')
replace('app/src-tauri/src/diagnostics.rs', '"guard":session.guard(),"state":value', '"guard":session.guard(),"state":value,"benchmark":{"language":std::env::var("TOG_PROFILE_LANGUAGE").unwrap(),"cache":std::env::var("TOG_PROFILE_CACHE").unwrap(),"corpus":std::env::var("TOG_PROFILE_CORPUS").unwrap()}')
replace('app/src-tauri/src/diagnostics.rs', '    report: serde_json::Value,', '    mut report: serde_json::Value,')
replace('app/src-tauri/src/diagnostics.rs', '    let session = state.session()?;', '    report["nativeProfiling"] = serde_json::json!(typstographe_core::preview_profile::take());\n    let session = state.session()?;')

# Track the actual worker and packet work, outside renderer.elapsed_ms.
replace('app/src-tauri/src/main.rs', '    let bytes = tauri::async_runtime::spawn_blocking(move || -> Result<Vec<u8>, CommandError> {', '''    let enqueued = std::time::Instant::now();
    let bytes = tauri::async_runtime::spawn_blocking(move || -> Result<Vec<u8>, CommandError> {
        use typstographe_core::preview_profile::{begin, ms, record};
        begin(snapshot.revision);
        let dispatch_wait = ms(enqueued);
        let worker_started = std::time::Instant::now();
        let lock_started = std::time::Instant::now();
        let locked = session.lock()?;
        let lock_wait = ms(lock_started);
        let snapshot_started = std::time::Instant::now();''')
# This snippet appears twice (legacy preview + binary). Limit to binary function.
main = SOURCE / 'app/src-tauri/src/main.rs'
text = main.read_text()
start = text.index('async fn preview_frame(')
prefix, body = text[:start], text[start:]
body = body.replace('session.lock()?.render_snapshot(&snapshot)?;', 'locked.render_snapshot(&snapshot)?;\n        drop(locked);\n        let snapshot_ms = ms(snapshot_started);\n        let map_started = std::time::Instant::now();', 1)
body = body.replace('let map = typstographe_core::content::source_mapped(&snapshot.document, &assets)?.1;', 'let map = typstographe_core::content::source_mapped(&snapshot.document, &assets)?.1;\n        let map_ms = ms(map_started);\n        let renderer_started = std::time::Instant::now();', 1)
body = body.replace('        Ok(bytes)', '''        let renderer_ms = ms(renderer_started);
        record(serde_json::json!({"stage":"preview-worker","dispatchWaitMs":dispatch_wait,"lockWaitMs":lock_wait,"snapshotMs":snapshot_ms,"mapMs":map_ms,"rendererMs":renderer_ms,"nativeMs":ms(worker_started),"bytes":bytes.len()}));
        Ok(bytes)''', 1)
main.write_text(prefix + body)

replace('app/src-tauri/src/rendering.rs', '    pub raster_ms: f64,', '    pub raster_ms: f64,\n    pub rgba_ms: f64,')
replace('app/src-tauri/src/rendering.rs', '            let rgba = pixmap.take_demultiplied();', '            let rgba_start = Instant::now();\n            let rgba = pixmap.take_demultiplied();\n            timings.rgba_ms += milliseconds(rgba_start);')
replace('app/src-tauri/src/rendering.rs', '''        self.render_output(
            source,
            assets,
            revision,
            None,
            Some(settings),
            Some(map),
            encoding,
        )?
        .packet(encoding)''', '''        let output = self.render_output(source, assets, revision, None, Some(settings), Some(map), encoding)?;
        let timings = output.preview.timings.clone();
        let packet_started = Instant::now();
        let bytes = output.packet(encoding)?;
        typstographe_core::preview_profile::record(serde_json::json!({"stage":"renderer","timings":timings,"packetMs":milliseconds(packet_started),"bytes":bytes.len()}));
        Ok(bytes)''')

# Empirical cache control: clear sources + memoization before each compilation.
replace('crates/core/src/rendering.rs', '        metadata.validate().map_err(CoreError::external)?;', '''        if crate::preview_profile::cold() { self.files.clear(); comemo::evict(0); }
        metadata.validate().map_err(CoreError::external)?;''')
replace('crates/core/src/rendering.rs', '        let result = typst::compile::<PagedDocument>(self);', '''        let compile_started = std::time::Instant::now();
        let result = typst::compile::<PagedDocument>(self);
        crate::preview_profile::record(serde_json::json!({"stage":"typst","engineMs":crate::preview_profile::ms(compile_started),"cold":crate::preview_profile::cold()}));''')
replace('crates/core/src/rendering.rs', '        let id = file_id(name);\n        self.files', '        let id = file_id(name);\n        let reused = self.files.contains_key(&id);\n        let unchanged = self.files.get(&id).is_some_and(|s| s.text() == text);\n        let started = std::time::Instant::now();\n        self.files')
replace('crates/core/src/rendering.rs', '            .or_insert_with(|| Source::new(id, text.to_owned()));', '            .or_insert_with(|| Source::new(id, text.to_owned()));\n        crate::preview_profile::record(serde_json::json!({"stage":"source","name":name,"reused":reused,"unchanged":unchanged,"ms":crate::preview_profile::ms(started)}));')

# Actual automatic frontend pipeline; records share the resulting revision.
replace('app/src/main.ts', 'let onPreview: ((revision: number) => void) | undefined', "let onPreview: ((revision: number, result: import('./preview-frame').Preview & { profiling?: Record<string, number> }) => void) | undefined")
replace('app/src/main.ts', '    await provider.flush()\n    if (localVersion !== version) return\n    const { result } = await requestPreview(host.transport, snapshot())', '''    const flushStarted = performance.now()
    await provider.flush()
    const flushMs = performance.now() - flushStarted
    if (localVersion !== version) return
    const snapshotStarted = performance.now()
    const currentSnapshot = snapshot()
    const snapshotMs = performance.now() - snapshotStarted
    const { result, requestMs, decodeMs, bytes } = await requestPreview(host.transport, currentSnapshot)
    const showStarted = performance.now()''')
replace('app/src/main.ts', '    onPreview?.(result.revision)', '''    const annotated = result as typeof result & { profiling?: Record<string, number> }
    annotated.profiling = { ...annotated.profiling, flushMs, snapshotMs, requestMs, decodeMs: decodeMs || 0, frameBytes: bytes, showAndPublishMs: performance.now() - showStarted }
    onPreview?.(result.revision, annotated)''')
replace('app/src/preview-frame.ts', '  const result = decodeFrame(buffer)', '  const decodeStarted = performance.now()\n  const result = decodeFrame(buffer)\n  const decodeMs = performance.now() - decodeStarted')
replace('app/src/preview-frame.ts', 'requestMs: received - started }', 'requestMs: received - started, decodeMs }')
replace('app/src/preview.ts', '      const images: HTMLImageElement[] = []', '''      const profile = { canvasAllocateMs: 0, putImageDataMs: 0, domPublishMs: 0 }
      const images: HTMLImageElement[] = []''')
replace('app/src/preview.ts', "            image = document.createElement('canvas')", "            const allocateStarted = performance.now()\n            image = document.createElement('canvas')")
replace('app/src/preview.ts', "            if (!context) throw new Error('Canvas indisponible.')", "            if (!context) throw new Error('Canvas indisponible.')\n            profile.canvasAllocateMs += performance.now() - allocateStarted\n            const putStarted = performance.now()")
replace('app/src/preview.ts', "            image.setAttribute('aria-label', `Page ${index + 1} du rendu Typst`)", "            profile.putImageDataMs += performance.now() - putStarted\n            image.setAttribute('aria-label', `Page ${index + 1} du rendu Typst`)")
replace('app/src/preview.ts', '      container.replaceChildren(...pages)', '      const publishStarted = performance.now()\n      container.replaceChildren(...pages)')
replace('app/src/preview.ts', '      container.scrollTop = scrollTop', '      container.scrollTop = scrollTop\n      profile.domPublishMs = performance.now() - publishStarted\n      ;(value as typeof value & { profiling?: unknown }).profiling = profile')

(OUT / 'manifest.json').write_text(json.dumps({'application_commit':base,'scope':'Disposable native Tauri profiling; warm cache vs explicit cold control; runtime MiTeX WASM vs builtin-only native Typst sources.'}, indent=2) + '\n')
print(SOURCE)
