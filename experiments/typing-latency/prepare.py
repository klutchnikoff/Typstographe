"""Unmodified production render path, isolated release input-latency recipe."""
import hashlib, io, json, os, re, shutil, subprocess, sys, tarfile, uuid
from pathlib import Path
ROOT = Path(__file__).resolve().parents[2]
HERE = Path(__file__).resolve().parent
variant, ref = sys.argv[1:]
assert variant in ['before', 'dom', 'after']
series = os.environ.get('TOG_TYPING_SERIES', 'typing-latency')
assert re.fullmatch(r'[a-z0-9-]+', series), 'Invalid series name'
out = ROOT / f'output/{series}-{variant}'
source = out / 'source'
assert not source.exists(), f'Refusing to replace {source}'
out.mkdir(exist_ok=True)
commit = subprocess.check_output(['git','rev-parse',ref],cwd=ROOT,text=True).strip()
with tarfile.open(fileobj=io.BytesIO(subprocess.check_output(['git','archive',commit],cwd=ROOT))) as tar:
    tar.extractall(source,filter='data')
(source/'node_modules').symlink_to(ROOT/'node_modules',target_is_directory=True)
def digest(paths):
    h=hashlib.sha256()
    for p in sorted(paths):
        h.update(str(p.relative_to(source)).encode());h.update(p.read_bytes())
    return h.hexdigest()
core = digest((source/'crates/core/src').rglob('*.rs'))
frontend = digest((source/'app/src').rglob('*.ts'))
recipe = hashlib.sha256((HERE/'recipe.ts').read_bytes() + (HERE/'probe.ts').read_bytes()).hexdigest()
with (source/'crates/core/src/lib.rs').open('a') as f:
    f.write(f'\npub const TYPING_BUILD_FINGERPRINT: &str = "{core}";\n')
def replace(path,old,new):
    p=source/path;s=p.read_text();assert s.count(old)==1,(path,old);p.write_text(s.replace(old,new))
name=f'typstographe-{series}-{variant}'
replace('app/src-tauri/Cargo.toml','name = "typstographe"',f'name = "{name}"')
replace('Cargo.lock','name = "typstographe"\n',f'name = "{name}"\n')
replace('app/src-tauri/src/main.rs','    let bridge = Bridge {','''    if diagnostic.as_deref() == Some("performance") {
        use typstographe_core::document_types::{DocumentType, Metadata};
        let kind = DocumentType::Article;
        session.settings = crate::settings::Settings {
            metadata: Metadata::demo(kind), template: kind.default_model(),
            model_manifest: kind.default_model_manifest().into(), model_id: "article.model.working".into(),
        };
        session.fixture = Some(serde_json::from_value(serde_json::json!({"type":"doc","content":[{"type":"paragraph"}]})).unwrap());
    }
    let bridge = Bridge {''')
replace('app/src-tauri/src/main.rs','            menus::install(app.handle())?;','''            menus::install(app.handle())?;
            if !global_session { if let Some(window) = app.get_webview_window("main") { window.show()?; window.set_always_on_top(true)?; window.set_focus()?; } }''')
replace('app/src-tauri/src/diagnostics.rs','"guard":session.guard(),"state":value','"guard":session.guard(),"state":value,"benchmark":{"corpus":std::env::var("TOG_TYPING_CORPUS").unwrap(),"preview":std::env::var("TOG_TYPING_PREVIEW").unwrap()}')
replace('app/src-tauri/src/diagnostics.rs','    report: serde_json::Value,','    mut report: serde_json::Value,')
replace('app/src-tauri/src/diagnostics.rs','    let session = state.session()?;','    report["coreFingerprint"] = serde_json::json!(typstographe_core::TYPING_BUILD_FINGERPRINT);\n    let session = state.session()?;')
replace('app/src-tauri/tauri.conf.json', "default-src 'self';", "default-src 'self'; worker-src 'self' blob:;")
# Use the exact prior deterministic inputs. No personal project is opened.
subprocess.run(['python3',str(ROOT/'experiments/preview-profiling/corpus.py')],check=True)
corpora=json.loads((ROOT/'output/preview-profiling/corpora.json').read_text())
for corpus in corpora:
    def visit(n,path):
        if n['type'] in ['paragraph','heading','mathBlock']:
            n.setdefault('attrs',{}).setdefault('anchor',str(uuid.uuid5(uuid.NAMESPACE_URL,'typstographe-benchmark/'+corpus['name']+'/'+path)))
        for i,c in enumerate(n.get('content',[])):visit(c,path+'/'+str(i))
    visit(corpus['document'],'root')
(source/'app/src/typing-corpora.json').write_text(json.dumps(corpora,ensure_ascii=False))
shutil.copyfile(HERE/'recipe.ts',source/'app/src/preview-performance.ts')
shutil.copyfile(HERE/'probe.ts',source/'app/src/typing-probe.ts')
replace('app/src/preview-performance.ts','const FRONTEND = "prepared";',f'const FRONTEND = "{frontend}";')
replace('app/src/preview-performance.ts','const RECIPE = "prepared";',f'const RECIPE = "{recipe}";')
replace('app/src/main.ts','let onPreview: ((revision: number) => void) | undefined',"let onPreview: ((revision: number, result: import('./preview-frame').Preview) => void) | undefined")
replace('app/src/main.ts','    onPreview?.(result.revision)','    onPreview?.(result.revision, result)')
replace('app/src/main.ts','function updateInterface() {','function updateInterface() { return typingSpan("ui.refresh", updateInterfaceImpl) }\nfunction updateInterfaceImpl() {')
replace('app/src/main.ts','function snapshot() {','function snapshot() { return typingSpan("preview.snapshot", snapshotImpl) }\nfunction snapshotImpl() {')
p=source/'app/src/main.ts';p.write_text('import { typingSpan } from "./typing-probe"\n'+p.read_text())
(out/'manifest.json').write_text(json.dumps(dict(application_commit=commit,core_fingerprint=core,frontend_fingerprint=frontend,recipe_fingerprint=recipe,scope='Production preview (full RGBA or differential RGBA, according to commit); continuous WebKit native editing; worker-clock stimulus'),indent=2)+'\n')
print(source)
