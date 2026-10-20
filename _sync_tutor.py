import json

ROOT = '/root/steno_advanced'
html_path = ROOT + '/steno_tutor.html'

html = open(html_path, encoding='utf-8').read()
orig_len = len(html)

data = json.load(open(ROOT + '/data.json', encoding='utf-8'))
roots = data['roots']

# --- 1. Regenerate MORPHEME_ROOTS_TREE from data.json (superset with inflections) ---
#    Indent the JSON body 8 spaces so it nests under the 8-space `const` line.
tree_json = json.dumps(roots, ensure_ascii=False, indent=2).replace('</', '<\\/')
lines = tree_json.split('\n')
new_tree = '        const MORPHEME_ROOTS_TREE = ' + lines[0] + '\n'
new_tree += '\n'.join('        ' + l for l in lines[1:]) + ';'

tree_anchor = 'const MORPHEME_ROOTS_TREE = {'
gr_anchor = 'const GRAMMAR_RULES = {'
i1 = html.index(tree_anchor)
line_start = html.rfind('\n', 0, i1) + 1          # start of line holding the const
i2 = html.index(gr_anchor)
line_start_gr = html.rfind('\n', 0, i2) + 1
indent_gr = html[line_start_gr:i2]                # leading whitespace before 'const GRAMMAR_RULES'

html = html[:line_start] + new_tree + '\n\n' + indent_gr + html[i2:]

# --- 2. Remove GRAMMAR_RULES + GRAMMAR_DATA + old getWordGrammar + INFLECTION_TO_LEMMA, insert new ---
gr_anchor2 = 'const GRAMMAR_RULES = {'
class_anchor = 'class StenoTutorApp {'
j1 = html.index(gr_anchor2)
j2 = html.index(class_anchor)

new_code = '''        // Inflection lookup built from the roots tree: word -> { lemma, inflections }
        const INFLECTION_LOOKUP = {};
        (function buildInflectionLookup() {
            for (const [rootChord, root] of Object.entries(MORPHEME_ROOTS_TREE)) {
                if (root && root.inflections) {
                    INFLECTION_LOOKUP[root.lemma.toLowerCase().trim()] = { lemma: root.lemma, inflections: root.inflections };
                }
                for (const [dChord, deriv] of Object.entries(root.derivatives || {})) {
                    if (deriv && deriv.inflections) {
                        INFLECTION_LOOKUP[deriv.word.toLowerCase().trim()] = { lemma: deriv.word, inflections: deriv.inflections };
                    }
                }
            }
        })();

        // Reverse map: inflected form -> base lemma (for SVG/visual inheritance)
        const INFLECTION_TO_LEMMA = {};
        for (const [word, entry] of Object.entries(INFLECTION_LOOKUP)) {
            for (const [num, infl] of Object.entries(entry.inflections || {})) {
                if (infl && infl.word) {
                    INFLECTION_TO_LEMMA[infl.word.toLowerCase().trim()] = entry.lemma.toLowerCase().trim();
                }
            }
        }

        function getWordInflections(word) {
            if (!word) return null;
            const lower = word.toLowerCase().trim();
            if (INFLECTION_LOOKUP[lower]) return INFLECTION_LOOKUP[lower];

            // Smart regular fallback for words not present in the roots tree
            const endsE = lower.endsWith('e');
            const endsY = lower.endsWith('y') && !/[aeiou]y$/.test(lower);
            const rootY = endsY ? lower.slice(0, -1) : lower;
            const mk = (w, m) => ({ word: w, morpheme: m });
            return {
                lemma: lower,
                inflections: {
                    '1': mk(endsY ? rootY + 'ied' : (endsE ? lower + 'd' : lower + 'ed'), 'Past Tense (-ed)'),
                    '2': mk(endsE ? lower.slice(0, -1) + 'ing' : lower + 'ing', 'Continuous (-ing)'),
                    '3': mk(endsY ? rootY + 'ies' : ((lower.endsWith('s') || lower.endsWith('sh') || lower.endsWith('ch') || lower.endsWith('x')) ? lower + 'es' : lower + 's'), '3rd Person (-s)'),
                    '4': mk(endsY ? rootY + 'ied' : (endsE ? lower + 'd' : lower + 'ed'), 'Past Participle (-en)')
                }
            };
        }

'''
html = html[:j1] + new_code + html[j2:]

# --- 3. Rewrite tryApplyGrammarModifier to read from the roots tree ---
old_method = '''            tryApplyGrammarModifier(num) {
                const prec = this.getPrecedingWord();
                if (!prec || !prec.word) return false;

                const originalWord = prec.word.toLowerCase().trim();
                const baseLemma = this.activeGrammarLemma || INFLECTION_TO_LEMMA[originalWord] || originalWord;
                const grammar = getWordGrammar(baseLemma) || getWordGrammar(originalWord);

                if (!grammar || !grammar.forms || !grammar.forms[num]) return false;

                const newWord = grammar.forms[num];
                if (newWord.toLowerCase() === originalWord) return false;

                if (prec.type === 'chord') {
                    prec.element.remove();
                    this.insertChordOutput(newWord);
                } else if (prec.type === 'typed') {
                    const beforeWord = prec.fullText.slice(0, prec.matchIndex);
                    prec.element.textContent = beforeWord;
                    if (prec.element.textContent.length === 0) {
                        prec.element.remove();
                    }
                    this.insertChordOutput(newWord);
                }

                this.activeGrammarWord = newWord;
                this.activeGrammarLemma = baseLemma;
                this.activeGrammar = grammar;

                sound.playSuccess();
                const pos = grammar.pos || 'verb';
                const ruleName = (GRAMMAR_RULES[pos] && GRAMMAR_RULES[pos][num]) ? GRAMMAR_RULES[pos][num].name : `form ${num}`;
                const toast = document.getElementById('sandbox-toast');
                if (toast) {
                    toast.innerText = `✨ [Grammar Morph] "${originalWord.toUpperCase()}" + ${num} ➔ "${newWord.toUpperCase()}" (${ruleName})`;
                    toast.className = "text-xs md:text-sm font-bold text-emerald-300 bg-emerald-500/20 border border-emerald-500/40 px-6 py-2 rounded-xl text-center shadow-lg";
                }

                this.updateCaret();
                return true;
            }'''

new_method = '''            tryApplyGrammarModifier(num) {
                const prec = this.getPrecedingWord();
                if (!prec || !prec.word) return false;

                const originalWord = prec.word.toLowerCase().trim();
                const baseLemma = this.activeGrammarLemma || INFLECTION_TO_LEMMA[originalWord] || originalWord;
                const entry = getWordInflections(baseLemma) || getWordInflections(originalWord);

                if (!entry || !entry.inflections || !entry.inflections[num]) return false;

                const infl = entry.inflections[num];
                const newWord = infl.word;
                if (!newWord || newWord.toLowerCase() === originalWord) return false;

                if (prec.type === 'chord') {
                    prec.element.remove();
                    this.insertChordOutput(newWord);
                } else if (prec.type === 'typed') {
                    const beforeWord = prec.fullText.slice(0, prec.matchIndex);
                    prec.element.textContent = beforeWord;
                    if (prec.element.textContent.length === 0) {
                        prec.element.remove();
                    }
                    this.insertChordOutput(newWord);
                }

                this.activeGrammarWord = newWord;
                this.activeGrammarLemma = baseLemma;
                this.activeGrammar = entry;

                sound.playSuccess();
                const ruleName = infl.morpheme || `form ${num}`;
                const toast = document.getElementById('sandbox-toast');
                if (toast) {
                    toast.innerText = `✨ [Inflect] "${originalWord.toUpperCase()}" + ${num} ➔ "${newWord.toUpperCase()}" (${ruleName})`;
                    toast.className = "text-xs md:text-sm font-bold text-emerald-300 bg-emerald-500/20 border border-emerald-500/40 px-6 py-2 rounded-xl text-center shadow-lg";
                }

                this.updateCaret();
                return true;
            }'''

assert old_method in html, 'old tryApplyGrammarModifier not found'
html = html.replace(old_method, new_method, 1)

# --- 4. Update onChordRelease grammar reference ---
old_ref = '''                        this.activeGrammarWord = matchedWord;
                        this.activeGrammarLemma = INFLECTION_TO_LEMMA[matchedWord.toLowerCase().trim()] || matchedWord.toLowerCase().trim();
                        this.activeGrammar = getWordGrammar(this.activeGrammarLemma);'''
new_ref = '''                        this.activeGrammarWord = matchedWord;
                        this.activeGrammarLemma = INFLECTION_TO_LEMMA[matchedWord.toLowerCase().trim()] || matchedWord.toLowerCase().trim();
                        this.activeGrammar = getWordInflections(this.activeGrammarLemma);'''
assert old_ref in html, 'old onChordRelease grammar ref not found'
html = html.replace(old_ref, new_ref, 1)

# --- 5. getKnownWordsSet: replace stale GRAMMAR_DATA loop with INFLECTION_LOOKUP ---
old_known = '''                // 2. All grammar inflections
                if (typeof GRAMMAR_DATA !== 'undefined') {
                    for (const [lemma, forms] of Object.entries(GRAMMAR_DATA)) {
                        known.add(lemma.toLowerCase().trim());
                        if (Array.isArray(forms)) {
                            for (const f of forms) {
                                if (f.form) known.add(f.form.toLowerCase().trim());
                            }
                        }
                    }
                }'''
new_known = '''                // 2. All root/derivative lemmas that carry inflections
                if (typeof INFLECTION_LOOKUP !== 'undefined') {
                    for (const w of Object.keys(INFLECTION_LOOKUP)) {
                        known.add(w.toLowerCase().trim());
                    }
                }'''
assert old_known in html, 'old getKnownWordsSet grammar block not found'
html = html.replace(old_known, new_known, 1)

# --- 6. paste: GRAMMAR_DATA -> INFLECTION_LOOKUP ---
old_paste = 'const isKnown = WORD_VISUALS[clean] || GRAMMAR_DATA[clean] || INFLECTION_TO_LEMMA[clean];'
new_paste = 'const isKnown = WORD_VISUALS[clean] || INFLECTION_LOOKUP[clean] || INFLECTION_TO_LEMMA[clean];'
assert old_paste in html, 'old paste isKnown line not found'
html = html.replace(old_paste, new_paste, 1)

# --- Write back ---
open(html_path, 'w', encoding='utf-8').write(html)

# --- Verification ---
print('orig bytes:', orig_len, '-> new bytes:', len(html))
for token in ['getWordGrammar', 'GRAMMAR_DATA', 'GRAMMAR_RULES']:
    print(token, 'remaining:', html.count(token))
for token in ['getWordInflections', 'INFLECTION_LOOKUP', 'MORPHEME_ROOTS_TREE']:
    print(token, 'occurrences:', html.count(token))
print('"inflections" occurrences:', html.count('"inflections"'))

import re
m = re.search(r'const MORPHEME_ROOTS_TREE = (\{.*?\});', html, re.S)
if m:
    try:
        parsed = json.loads(m.group(1).replace('<\\/', '</'))
        print('embedded tree JSON parses OK, roots =', len(parsed))
    except Exception as e:
        print('embedded tree JSON parse FAILED:', e)
