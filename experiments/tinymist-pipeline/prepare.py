"""Reuse the native candidate instrumentation; add scalar common-pipeline timers."""
from pathlib import Path
import shutil,json
ROOT=Path(__file__).resolve().parents[2]
HERE=Path(__file__).resolve().parent
OUT=ROOT/'output/tinymist-pipeline'
for name in ['release-source','frontend']:
 p=OUT/name
 if not p.exists():p.symlink_to(ROOT/'output/preview-renderers'/name,target_is_directory=True)
prior=ROOT/'experiments/preview-renderers/prepare.py'
code=prior.read_text().replace('output/preview-renderers','output/tinymist-pipeline').replace('typstographe-renderer-comparison','typstographe-tinymist-pipeline')
exec(compile(code,str(prior),'exec'),{'__file__':str(prior),'__name__':'__main__'})
SOURCE=OUT/'source'
# Stable invisible identities: the exact Typst source must match across hosts.
import uuid
corpora=json.loads((OUT/'corpora.json').read_text())
for corpus in corpora:
 def visit(node,path):
  if node['type'] in ['paragraph','heading','mathBlock']:
   node.setdefault('attrs',{}).setdefault('anchor',str(uuid.uuid5(uuid.NAMESPACE_URL,'typstographe-benchmark/'+corpus['name']+'/'+path)))
  for i,child in enumerate(node.get('content',[])):visit(child,path+'/'+str(i))
 visit(corpus['document'],'root')
(OUT/'corpora.json').write_text(json.dumps(corpora,ensure_ascii=False,indent=2)+'\n')
shutil.copyfile(OUT/'corpora.json',SOURCE/'app/src/profile-corpora.json')
p=SOURCE/'Cargo.lock' ;p.write_text(p.read_text().replace('name = "typstographe-renderer-comparison"','name = "typstographe-tinymist-pipeline"'))
shutil.copyfile(HERE/'pipeline-profile.ts',SOURCE/'app/src/pipeline-profile.ts')
def replace(path,old,new):
 p=SOURCE/path;s=p.read_text();assert s.count(old)==1,(path,old);p.write_text(s.replace(old,new))
p=SOURCE/'app/src/main.ts';p.write_text('import { span, mark } from "./pipeline-profile"\n'+p.read_text())
# Time executed UI work, including checkouts that batch requests in a microtask.
refresh='updateInterface' if 'function updateInterface() {' in p.read_text() else 'refresh'
replace('app/src/main.ts',f'function {refresh}() {{',f'function {refresh}() {{ return span("ui.refresh", refreshImpl) }}\nfunction refreshImpl() {{')
replace('app/src/main.ts','async function render() {','async function render() {\n  mark("render.enter")')
replace('app/src/main.ts','    const flushMs = performance.now() - flushStarted','    const flushMs = performance.now() - flushStarted\n    mark("render.flushed")')
replace('app/src/main.ts','    const showStarted = performance.now()','    mark("render.response")\n    const showStarted = performance.now()')
replace('app/src/main.ts','    setResolvedReferences(editor, result.references || [])','    span("references.publish",()=>setResolvedReferences(editor, result.references || []))\n    mark("render.published")')
replace('app/src/main.ts','function schedule() {','function schedule() {\n  mark("render.scheduled")')
p=SOURCE/'app/src/preview-performance.ts'
s=p.read_text();s='import {beginEdit, mark, span, finishEdit} from "./pipeline-profile";\n'+s
s=s.replace('    const { benchmark: config }', '''    const originalDispatch=editor.view.props.dispatchTransaction!;
    editor.view.setProps({dispatchTransaction:(tr)=>span("editor.dispatch",()=>originalDispatch.call(editor.view,tr))});
    const originalUpdate=editor.view.updateState.bind(editor.view);
    editor.view.updateState=(state)=>span("editor.viewUpdate",()=>originalUpdate(state));
    const { benchmark: config }''')
assert s.count('      edit();')==1
s=s.replace('      edit();','      beginEdit();\n      edit();\n      mark("command.returned");')
s=s.replace('      const publishedMs = performance.now() - start;','      const publishedMs = performance.now() - start;\n      const pipeline=finishEdit();')
s=s.replace('        publishedMs,','        publishedMs,\n        pipeline,')
# Match the exact exported Typst source for every measured document state.
s=s.replace('      const pixels = await hashes();','      const pixels = await hashes();\n      const sourceSha=Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(result.source))),x=>x.toString(16).padStart(2,"0")).join("");')
s=s.replace('        pixels,','        pixels,\n        sourceSha,')
p.write_text(s)
m=json.loads((OUT/'manifest.json').read_text());m['scope']='Native common pipeline scalar profiling and real VS Code Tinymist comparison';m['variants']=['rgba-delta','reflexo','vscode-partial','vscode-full'];(OUT/'manifest.json').write_text(json.dumps(m,indent=2)+'\n')
print(SOURCE)
