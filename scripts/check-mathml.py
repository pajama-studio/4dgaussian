"""Verify the generated MathML structure with Python's standard XML parser."""
import json
import re
import unicodedata
import xml.etree.ElementTree as ET
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
html = (ROOT / 'public/math/index.html').read_text(encoding='utf-8')
expressions = re.findall(r'<math\b.*?</math>', html, re.S)
assert len(expressions) >= 280, len(expressions)
arity = {'mfrac': 2, 'msup': 2, 'msub': 2, 'msubsup': 3, 'mover': 2, 'munder': 2, 'munderover': 3}
for expression in expressions:
    root = ET.fromstring(expression)
    for node in root.iter():
        tag = node.tag.rsplit('}', 1)[-1]
        if tag in arity:
            assert len(node) == arity[tag], (tag, len(node), ET.tostring(node))
        if tag == 'mtable':
            rows = list(node)
            assert rows and all(len(row) == len(rows[0]) for row in rows)
        # The original formulas use native MathML Core; KaTeX additionally emits
        # semantic MathML (including mathvariant) beside its visual HTML.
        assert 'undefined' not in (node.text or '')

def readable(node):
    tag = node.tag.rsplit('}', 1)[-1]
    children = [readable(child) for child in node]
    if not children:
        return unicodedata.normalize('NFKC', node.text or '')
    if tag == 'mfrac':
        return f'({children[0]})/({children[1]})'
    if tag in ('msup', 'msub'):
        return children[0] + ('^' if tag == 'msup' else '_') + '{' + children[1] + '}'
    if tag == 'msqrt':
        return 'sqrt(' + ''.join(children) + ')'
    if tag in ('msubsup', 'munderover'):
        return f'{children[0]}_{{{children[1]}}}^{{{children[2]}}}'
    if tag == 'mtr':
        return ' | '.join(children)
    if tag == 'mtable':
        return ' / '.join(children)
    return ''.join(children)

equations = []
for match in re.finditer(r'<figure class="equation" id="eq-([^"]+)".*?(<math\b.*?</math>)', html, re.S):
    equations.append({'id': match[1], 'structure': readable(ET.fromstring(match[2]))})
assert len(equations) == 39
(ROOT / 'artifacts').mkdir(exist_ok=True)
(ROOT / 'artifacts/mathml-structure.json').write_text(json.dumps(equations, ensure_ascii=False, indent=2), encoding='utf-8')
print(f'PASS: {len(expressions)} valid MathML trees, script/fraction arities, rectangular matrices; {len(equations)} equation structures recorded.')
