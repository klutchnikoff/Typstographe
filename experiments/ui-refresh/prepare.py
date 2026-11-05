"""Build the same isolated native pipeline from explicit before/after Git states."""
import os
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
variant = sys.argv[1]
assert variant in ['before', 'after']
os.environ['TOG_PROFILE_REF'] = sys.argv[2]
out = ROOT / f'output/ui-refresh-{variant}'
out.mkdir(exist_ok=True)
prior = ROOT / 'experiments/tinymist-pipeline/prepare.py'
code = prior.read_text().replace('output/tinymist-pipeline', f'output/ui-refresh-{variant}')
code = code.replace('typstographe-tinymist-pipeline', f'typstographe-ui-refresh-{variant}')
exec(compile(code, str(prior), 'exec'), {'__file__': str(prior), '__name__': '__main__'})
# Separate actual reference transactions from calls that now skip unchanged values.
p = out / 'source/app/src/preview-performance.ts'
s = p.read_text()
old = '()=>originalDispatch.call(editor.view,tr)'
assert s.count(old) == 1
s = s.replace(old, '()=>tr.getMeta("cross-reference-index") ? span("references.transaction",()=>originalDispatch.call(editor.view,tr)) : originalDispatch.call(editor.view,tr)')
p.write_text(s)
m = json.loads((out / 'manifest.json').read_text())
m.update(scope='Native before/after UI refresh and reference publication', variant=variant,
         variants=['rgba-full', 'rgba-delta'])
(out / 'manifest.json').write_text(json.dumps(m, indent=2) + '\n')
