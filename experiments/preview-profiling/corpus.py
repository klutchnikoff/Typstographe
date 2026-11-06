"""Prepare equivalent native Typst sources once, outside all timed paths."""
import copy
import json
import re
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'output/preview-profiling'
OUT.mkdir(parents=True, exist_ok=True)
subprocess.run(['node', str(ROOT / 'experiments/mitex-comparison/corpus.mjs'), str(OUT / 'latex.json')], check=True)
query = OUT / 'convert.typ'
query.write_text('#import "/crates/core/templates/packages/mitex-0.2.7/lib.typ": mitex-convert\n#metadata(json("/output/preview-profiling/latex.json").map(c => (name: c.name, formulas: c.formulas.map(s => mitex-convert(s)))))\n')
converted = json.loads(subprocess.check_output(['typst', 'query', '--root', str(ROOT), str(query), 'metadata', '--field', 'value'], text=True))[0]


def builtin(source):
    source = source.replace('pmatrix(', 'mat(delim: "(", ')
    source = re.sub(r'mitexmathbf\(([^()]*)\)', r'bold(upright(\1))', source)
    if source.startswith('aligned('):
        assert source.endswith(')')
        source = '#pad(y: 0.2em, block(math.op(math.display($' + source[len('aligned('):-1] + '$))))'
    assert not any(s in source for s in ['mitex', 'pmatrix(', 'aligned(', 'import', 'plugin'])
    return source


corpora = []
for latex, typst in zip(json.loads((OUT / 'latex.json').read_text()), converted):
    assert latex['name'] == typst['name']
    latex['language'] = 'latex'
    corpora.append(latex)
    native = copy.deepcopy(latex)
    native['language'] = 'typst'
    native['formulas'] = [builtin(s) for s in typst['formulas']]
    index = 0

    def visit(node):
        global index
        if node['type'] in ['mathInline', 'mathBlock']:
            node['attrs']['language'] = 'typst'
            node['content'] = [{'type': 'text', 'text': native['formulas'][index]}]
            index += 1
        for child in node.get('content', []):
            visit(child)
    visit(native['document'])
    assert index == len(native['formulas'])
    corpora.append(native)
(OUT / 'corpora.json').write_text(json.dumps(corpora, ensure_ascii=False, indent=2) + '\n')
print('Prepared six documents; native Typst uses only builtins, no MiTeX imports or conversion at runtime.')
