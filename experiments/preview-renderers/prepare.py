"""Disposable native renderer comparison. All transformations are confined to output/."""
import json
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
HERE = Path(__file__).resolve().parent
OUT = ROOT / 'output/preview-renderers'
SOURCE = OUT / 'source'
UPSTREAM = OUT / 'release-source'
REV = 'e1974e566ba63dcf8ecdd6730cff25de26c7dbd2'
# Reuse the prior exact native profiling instrumentation, not the prior results.
prior = ROOT / 'experiments/preview-profiling/prepare.py'
code = prior.read_text().replace("OUT = ROOT / 'output/preview-profiling'", "OUT = ROOT / 'output/preview-renderers'")
code = code.replace("subprocess.run(['python3', str(HERE / 'corpus.py')], check=True)", "subprocess.run(['python3', str(HERE / 'corpus.py')], check=True)\nshutil.copyfile(ROOT / 'output/preview-profiling/corpora.json', OUT / 'corpora.json')")
code = code.replace('import io', 'import io\nimport shutil').replace('typstographe-preview-profile', 'typstographe-renderer-comparison')
exec(compile(code, str(prior), 'exec'), {'__file__': str(prior), '__name__': '__main__'})

def replace(path, old, new):
    p = SOURCE / path
    s = p.read_text()
    assert s.count(old) == 1, (path, old)
    p.write_text(s.replace(old, new))

# The published JS/WASM and Rust format are pinned to the same commit.
import subprocess
assert subprocess.check_output(['git', '-C', str(UPSTREAM), 'rev-parse', 'HEAD'], text=True).strip() == REV
# Upstream assumes two PDF APIs provided only by its patched Typst. Do NOT silently
# rasterize/omit them: this limited candidate rejects imported PDFs explicitly.
p = UPSTREAM / 'crates/conversion/typst2vec/src/convert.rs'
s = p.read_text()
s = s.replace('use typst_svg::pdf_to_svg;', '// Official Typst: PDF images excluded from this experiment.')
s = s.replace('typst::visualize::ImageKind::Pdf(pdf_image) => pdf_image.document().data(),', 'typst::visualize::ImageKind::Pdf(_) => panic!("PDF images excluded from official-Typst Reflexo experiment"),')
s = s.replace('ImageKind::Pdf(pdf) => pdf_to_svg(pdf).as_bytes().into(),', 'ImageKind::Pdf(_) => panic!("PDF images excluded from official-Typst Reflexo experiment"),')
p.write_text(s)
replace('app/src-tauri/Cargo.toml', '[dev-dependencies]', '''typst = "=0.15.1"
typst-layout = "=0.15.1"
reflexo = { path = "../../../release-source/crates/reflexo", default-features = false, features = ["typst", "flat-vector"] }
reflexo-vec2svg = { path = "../../../release-source/crates/conversion/vec2svg", default-features = false, features = ["no-content-hint"] }

[dev-dependencies]''')
# rkyv's PartialEq implementations expose an otherwise implicit coercion.
replace('app/src-tauri/src/comparisons/staging.rs', 'Some(&prepared.parent)', 'Some(prepared.parent.as_str())')
replace('app/src-tauri/src/main.rs', 'mod rendering;', 'mod rendering;\nmod renderer_candidate;')
replace('app/src-tauri/src/main.rs', '    encoding: rendering::Encoding,\n) -> Result<tauri::ipc::Response', '    encoding: rendering::Encoding,\n    base_revision: Option<u64>,\n) -> Result<tauri::ipc::Response')
replace('app/src-tauri/src/main.rs', '        begin(snapshot.revision);', '        begin(snapshot.revision);\n        crate::renderer_candidate::set_base(base_revision);')
replace('app/src-tauri/src/diagnostics.rs', '"benchmark":{"language"', '"benchmark":{"renderer":std::env::var("TOG_RENDERER").unwrap(),"language"')
replace('app/src-tauri/src/rendering.rs', '    pub page_sizes: Vec<[f32; 2]>,', '    pub page_sizes: Vec<[f32; 2]>,\n    pub candidate: Option<crate::renderer_candidate::Metadata>,')
replace('app/src-tauri/src/rendering.rs', '    pub svg_ms: f64,', '    pub svg_ms: f64,\n    pub candidate_ms: f64,')
replace('app/src-tauri/src/rendering.rs', '    pub Mutex<Option<typstographe_core::navigation::RenderSync>>,', '    pub Mutex<Option<typstographe_core::navigation::RenderSync>>,\n    pub Mutex<crate::renderer_candidate::Cache>,')
replace('app/src-tauri/src/rendering.rs', '        for page in document.pages() {', '''        let candidate_start = Instant::now();
        let candidate = if matches!(encoding, Encoding::Rgba) {
            Some(self.2.lock()?.render(&document, revision, &mut buffers, &mut dimensions))
        } else { None };
        timings.candidate_ms = milliseconds(candidate_start);
        for page in document.pages().iter().filter(|_| candidate.is_none()) {''')
replace('app/src-tauri/src/rendering.rs', '                page_sizes,', '                page_sizes,\n                candidate,')
replace('app/src/preview-frame.ts', '  revision: number\n', '  revision: number\n  candidate?: import("./renderer-candidate").Candidate\n')
replace('app/src/preview-frame.ts', '    value.pageSizes.length !== header.pages.length ||', '    (!value.candidate && value.pageSizes.length !== header.pages.length) ||')
replace('app/src/preview-frame.ts', "(page.encoding === 'rgba' &&", "(!value.candidate && page.encoding === 'rgba' &&")
replace('app/src/preview-frame.ts', "{ snapshot, encoding })", "{ snapshot, encoding, baseRevision: publishedBase() })")
p = SOURCE / 'app/src/preview-frame.ts'
p.write_text('import { publishedBase } from "./renderer-candidate"\n' + p.read_text())
replace('app/src/main.ts', '    const count = result.pages.length', '    const count = result.pageSizes?.length || result.pages.length')
replace('app/src/main.ts', "    element('render-status').classList.add('error')", "    element('render-status').classList.add('error')\n    ;(window as any).__rendererError = error instanceof Error ? error.stack : String(error)")
replace('app/src-tauri/tauri.conf.json', "connect-src ipc:", "connect-src 'self' ipc:")
replace('app/src-tauri/tauri.conf.json', "default-src 'self';", "default-src 'self'; script-src 'self' 'wasm-unsafe-eval';")
# Replace only the canvas construction/publication; leave all native sync handlers.
replace('app/src/preview.ts', "import type { Editor }", 'import { candidatePages, publishBase } from "./renderer-candidate"\nimport type { Editor }')
replace('app/src/preview.ts', '  revision: number\n', '  revision: number\n  candidate?: import("./renderer-candidate").Candidate\n')
replace('app/src/preview.ts', '        pages = value.pages.map((src, index) => {', '''        const candidates = value.candidate ? await candidatePages(value, container, current) : undefined
        pages = (candidates || value.pages).map((src, index) => {''')
replace('app/src/preview.ts', "          const page = document.createElement('div')", "          const page = src instanceof HTMLElement ? src : document.createElement('div')")
replace('app/src/preview.ts', "          if (typeof src !== 'string' && src.encoding === 'rgba') {", "          if (src instanceof HTMLElement) { image = src.querySelector('canvas')! } else if (typeof src !== 'string' && src.encoding === 'rgba') {")
replace('app/src/preview.ts', "          page.append(image, svg)", "          if (!(src instanceof HTMLElement)) page.append(image, svg)")
replace('app/src/preview.ts', '      container.replaceChildren(...pages)', '''      // Keyed reconciliation retains unchanged page elements and their canvas.
      for (let index = 0; index < pages.length; index++) {
        if (container.children[index] !== pages[index]) container.insertBefore(pages[index], container.children[index] || null)
      }
      while (container.children.length > pages.length) container.lastElementChild!.remove()
      publishBase(value.revision)''')
# Output packet dimensions can encode arbitrary vector bytes. The candidate client
# interprets them, while PNG/SVG/export paths retain production code.
for name in ['renderer_candidate.rs', 'renderer-candidate.ts', 'preview.ts']:
    target = 'app/src-tauri/src/renderer_candidate.rs' if name.endswith('.rs') else ('app/src/preview-performance.ts' if name == 'preview.ts' else 'app/src/renderer-candidate.ts')
    shutil.copyfile(HERE / name, SOURCE / target)
vendor = SOURCE / 'app/src/renderer-vendor'
vendor.mkdir()
pkg = OUT / 'frontend/node_modules/@myriaddreamin/typst-ts-renderer/pkg'
for name in ['typst_ts_renderer.mjs', 'typst_ts_renderer.d.ts', 'typst_ts_renderer_bg.wasm']:
    shutil.copyfile(pkg / name, vendor / name)
shutil.copyfile(pkg / 'typst_ts_renderer.d.ts', vendor / 'typst_ts_renderer.d.mts')
manifest = json.loads((OUT / 'manifest.json').read_text())
manifest.update(reflexo_commit=REV, renderer_version='0.8.0-rc3', typst='0.15.1', variants=['rgba-full','rgba-delta','reflexo'], scope='Native renderer comparison with original structured editor, compiler, and RenderSync')
(OUT / 'manifest.json').write_text(json.dumps(manifest, indent=2)+'\n')
if (HERE / 'dependencies/Cargo.lock').exists():
    shutil.copyfile(HERE / 'dependencies/Cargo.lock', SOURCE / 'Cargo.lock')
print('Prepared renderer candidates:', SOURCE)
