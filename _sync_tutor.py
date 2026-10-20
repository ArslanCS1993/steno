#!/usr/bin/env python3
"""Regenerate steno_tutor.html's embedded MORPHEME_ROOTS_TREE from data.json.

Idempotent: safe to run repeatedly. Only the tree is regenerated — the
INFLECTION_LOOKUP / INFLECTION_TO_LEMMA tables are built from that tree at
runtime inside the HTML, so they update automatically.
"""
import json
import os
import re

ROOT = os.path.dirname(os.path.abspath(__file__))
html_path = os.path.join(ROOT, 'steno_tutor.html')

with open(html_path, encoding='utf-8') as f:
    html = f.read()
orig_len = len(html)

with open(os.path.join(ROOT, 'data.json'), encoding='utf-8') as f:
    roots = json.load(f)['roots']

# Indent the JSON body 8 spaces so it nests under the 8-space `const` line.
tree_json = json.dumps(roots, ensure_ascii=False, indent=2).replace('</', '<\\/')
lines = tree_json.split('\n')
new_tree = '        const MORPHEME_ROOTS_TREE = ' + lines[0] + '\n'
new_tree += '\n'.join('        ' + l for l in lines[1:]) + ';'

tree_anchor = 'const MORPHEME_ROOTS_TREE = {'
end_anchor = 'const INFLECTION_LOOKUP = {};'

i1 = html.index(tree_anchor)
line_start = html.rfind('\n', 0, i1) + 1           # start of the tree's const line
i2 = html.index(end_anchor)
line_start_end = html.rfind('\n', 0, i2) + 1       # start of INFLECTION_LOOKUP's line

html = html[:line_start] + new_tree + '\n\n' + html[line_start_end:]

with open(html_path, 'w', encoding='utf-8') as f:
    f.write(html)

# --- Verification ---
print(f'bytes: {orig_len} -> {len(html)}')
m = re.search(r'const MORPHEME_ROOTS_TREE = (\{.*?\});', html, re.S)
if m:
    try:
        parsed = json.loads(m.group(1).replace('<\\/', '</'))
        print(f'embedded tree JSON OK: {len(parsed)} roots (data.json has {len(roots)})')
        if len(parsed) != len(roots):
            print('WARNING: root count mismatch!')
    except Exception as e:
        print('embedded tree JSON parse FAILED:', e)
        raise
else:
    print('FAILED: could not locate embedded tree')
    raise SystemExit(1)
