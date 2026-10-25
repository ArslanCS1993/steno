# Grammar model: inflection by part of speech

**The rule that prevents `whened` / `whening`:** a word may only carry the
inflection slots its **part of speech** actually has. `when` is a conjunction /
adverb of time — it has *no* inflection slots, so nothing should ever produce
`whened`, `whening` or `whens`.

## Two kinds of derived form — do not mix them

| | Lives in | Meaning | Example (root `walk`) |
|---|---|---|---|
| **Derivative** | `roots[chord].derivatives` | a *different* word built from a root via a real morpheme (prefix/suffix that changes meaning or lexical category) | `re-` → `rewalk`; `-er` → `walker` |
| **Inflection** | `roots[chord].inflections` | the *same* word in a different grammatical form. Numbered taps `1`–`4`. | `1` → `walked`, `2` → `walking` |

Infections must **never** be stored as derivatives. A derivative whose morpheme
is just `-ed` / `-ing` / `-s` is an inflection in the wrong slot — that is
exactly how `whened` got in.

## Inflection slots per part of speech

Taken from the labels already present in `data.json`.

| POS | Slot 1 | Slot 2 | Slot 3 | Slot 4 |
|---|---|---|---|---|
| **verb** | Past Tense `-ed` | Continuous `-ing` | 3rd Person `-s` | Past Participle `-en` |
| **noun** | Plural `-s` | Possessive `'s` | Plural Possessive `s'` | — |
| **adjective** | Comparative `-er` | Superlative `-est` | Adverb `-ly` | — |
| **pronoun** | Objective Case | Possessive Case | Reflexive Case | Possessive Pronoun |
| **adverb / conjunction / preposition / determiner / numeral / interjection** | — none — | | | |

Irregular verbs (`be`, `have`, `do`, `can`, `shall`, `will`, `go`) keep their
own labels: `be` → am / are / is / was / were / been / being, `can` → could.
These are legitimate exceptions, not errors.

Contractions (`can't`, `won't`) are their own single-slot case.

## Rules

1. **A root with no inflections is normal.** 243 of 319 roots have none — that
   includes every function word (`when`, `where`, `why`, `if`, `and`, `not`).
   Having no slots is the *correct* state for them, not a gap to fill.
2. **Never generate a form mechanically.** If a root has no slot for a tap, the
   tap must do nothing (the tutor already behaves this way:
   `tryApplyGrammarModifier` returns false when `entry.inflections[num]` is
   missing).
3. **A verb must be a real verb.** `not`, `when`, `every`, `now` are not verbs:
   they may not take `-ed` / `-ing`. If `noted` is wanted, it belongs to the
   root `note`.
4. **Spelling is part of the data.** A misspelled form (`hiting`, `requirment`,
   `shoud`, `etimologically`) is a bug in the same class as a wrong chord.
5. **A root lemma should be a base form** — not itself an inflected form
   (`wholed`, `enumerated`, `intended`, `created`, `copying` are not lemmas).
6. **No self-referential derivatives**: `pulse → pulse`, `should → should`.

## Current state (measured, before any cleanup)

| Detected POS | roots |
|---|---|
| verb | 42 |
| noun | 23 |
| pronoun | 8 |
| adjective | 2 |
| **no inflections at all (POS undecided)** | **243** |

Only 76 of 319 roots declare a POS. So the model above is not yet *enforceable*:
there is nothing to check a new form against for 243 roots.

### Violations found

| Class | Count | Genuine junk | Legitimate (false positives) |
|---|---|---|---|
| A. `-ed`/`-ing`/`-s` derivative on a root with no inflections | 32 | `when → whened`, `not → noted`, `hit → hiting` | `depend → depended`, `clear → cleared`, `box → boxing` (these really are verbs) |
| B. root lemma is itself an inflected form | 14 | `wholed`, `enumerated`, `intended`, `created`, `copying`, `aded` | `reading`, `meaning`, `working`, `following`, `something` (real nouns) |
| C. derivative morpheme equals the whole word (unlabelled) | 102 | `pulse → pulse`, `should → should`, `should → shoud`, `quire → requirment`, `etym → etimologically` | most are real compounds missing an affine label (`go → ongoing`, `get → forget`) |
| D. suspicious affix spelling | 5 | `hit → hitting [-ting]`, `not → notice [-ice]` | `now → right now [right-]` |

Note class A is mostly *false positives*: "root has no inflections" does not
mean "not a verb". `depend → depended` is correct. The real fix is to record the
POS (so `depend` is marked verb) rather than to delete the form.

## What is needed to enforce this

1. Add a `pos` field to every root (`verb`, `noun`, `adjective`, `pronoun`, or
   `function` for the never-inflecting class).
2. Extend `validate.js` with checks:
   - every root has a `pos`;
   - `inflections` only use the slots allowed for that `pos`;
   - no derivative morpheme is a bare inflection suffix (`-ed`, `-ing`, `-s`);
   - no self-referential derivative; no inflected-form lemma.
3. Fix the confirmed junk (`whened`, `hiting`, `wholed`, `…`) — not the 243
   function words, which are correct as they are.
