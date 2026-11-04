"""Create an instrumented, disposable checkout; never patch the application tree."""
import io
import json
import subprocess
import tarfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
HERE = Path(__file__).resolve().parent
OUT = ROOT / 'output/mitex-benchmark'
SOURCE = OUT / 'source'
UPSTREAM = OUT / 'upstream'
REVISION = '51f7210e026ab05d037125247e92d4d023d8a80d'
assert subprocess.check_output(['git', '-C', str(UPSTREAM), 'rev-parse', 'HEAD'], text=True).strip() == REVISION
if SOURCE.exists():
    raise SystemExit(f'Refusing to replace {SOURCE}; choose a fresh benchmark directory.')
SOURCE.mkdir(parents=True)
base = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT, text=True).strip()
archive = subprocess.check_output(['git', 'archive', base], cwd=ROOT)
with tarfile.open(fileobj=io.BytesIO(archive)) as tar:
    tar.extractall(SOURCE, filter='data')
(SOURCE / 'node_modules').symlink_to(ROOT / 'node_modules', target_is_directory=True)
if (HERE / 'Cargo.lock').exists():
    (SOURCE / 'Cargo.lock').write_bytes((HERE / 'Cargo.lock').read_bytes())
subprocess.run(['node', str(HERE / 'corpus.mjs'), str(OUT / 'corpora.json')], check=True)
(SOURCE / 'app/src/mitex-corpora.json').write_bytes((OUT / 'corpora.json').read_bytes())
(SOURCE / 'app/src/preview-performance.ts').write_bytes((HERE / 'preview.ts').read_bytes())
(SOURCE / 'crates/core/src/mitex_benchmark.rs').write_bytes((HERE / 'native.rs').read_bytes())


def replace(path, old, new):
    file = SOURCE / path
    text = file.read_text()
    assert text.count(old) == 1, (path, old)
    file.write_text(text.replace(old, new))


with (SOURCE / 'crates/core/src/lib.rs').open('a') as stream:
    stream.write('\npub mod mitex_benchmark;\n')
replace('crates/core/Cargo.toml', '[dependencies]', '[dependencies]\nmitex = { path = ' + json.dumps(str(UPSTREAM / 'crates/mitex')) + ' }\nmitex-spec-gen = { path = ' + json.dumps(str(UPSTREAM / 'crates/mitex-spec-gen')) + ', features = ["prebuilt"] }')
replace('app/src-tauri/Cargo.toml', 'name = "typstographe"', 'name = "typstographe-mitex-benchmark"')
replace('crates/core/src/content/mathematics.rs', '    Ok(format!(\n', '''    let (source, language) = if language == "latex" && crate::mitex_benchmark::native() {
        (crate::mitex_benchmark::convert(&source)?, "converted")
    } else { (source, language) };
    Ok(format!(
''')
replace('crates/core/templates/capabilities/mathematics.typ', 'language in ("typst", "latex")', 'language in ("typst", "latex", "converted")')
replace('crates/core/templates/capabilities/mathematics.typ', '    else {\n', '''    else if language == "converted" {
      import "../packages/mitex-0.2.7/specs/mod.typ": mitex-scope
      eval(source, mode: "math", scope: mitex-scope)
    }
    else {
''')
replace('app/src-tauri/src/main.rs', 'fn main() {', '''fn main() {
    if std::env::args().nth(1).as_deref() == Some("--mitex-probe") {
        let result = typstographe_core::mitex_benchmark::probe(&std::env::args().nth(2).expect("corpus path"));
        match result {
            Ok(value) => println!("{}", serde_json::to_string_pretty(&value).unwrap()),
            Err(error) => { eprintln!("{error}"); std::process::exit(1); }
        }
        return;
    }
''')
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
            if !global_session {
                if let Some(window) = app.get_webview_window("main") {
                    window.show()?;
                    window.set_focus()?;
                }
            }''')
replace('app/src-tauri/src/diagnostics.rs', '"guard":session.guard(),"state":value', '"guard":session.guard(),"state":value,"benchmark":{"engine":std::env::var("TOG_MITEX_ENGINE").unwrap(),"corpus":std::env::var("TOG_MITEX_CORPUS").unwrap()}')
replace('app/src/main.ts', 'let onPreview: ((revision: number) => void) | undefined', "let onPreview: ((revision: number, result: import('./preview-frame').Preview) => void) | undefined")
replace('app/src/main.ts', 'onPreview?.(result.revision)', 'onPreview?.(result.revision, result)')

manifest = {
    'application_commit': base,
    'mitex_git': REVISION,
    'mitex_artifacts': subprocess.check_output(['git', '-C', str(UPSTREAM / 'crates/mitex-spec-gen/assets/artifacts'), 'rev-parse', 'HEAD'], text=True).strip(),
    'scope': 'Disposable checkout; native conversion in the existing source projection; unchanged Tauri preview, validation, render, sync, RGBA IPC and canvas publication.',
}
(OUT / 'build-manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
print(SOURCE)
