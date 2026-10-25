# Grammar model: inflection by part of speech

**The rule that prevents `whened` / `whening`:** a word may only carry the
inflection slots its **part of speech** actually has. `when` is a conjunction /
adverb of time — it has *no* inflection slots, so nothing may ever produce
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

Taken from the labels already used in `data.json`.

| POS | Slot 1 | Slot 2 | Slot 3 | Slot 4 |
|---|---|---|---|---|
| **verb** | Past Tense `-ed` | Continuous `-ing` | 3rd Person `-s` | Past Participle `-en` |
| **noun** | Plural `-s` | Possessive `'s` | Plural Possessive `s'` | — |
| **adjective** | Comparative `-er` | Superlative `-est` | Adverb `-ly` | — |
| **pronoun** | Objective Case | Possessive Case | Reflexive Case | Possessive Pronoun |
| **function · bound · chinese · junk** | — none — | | | |

Irregular verbs (`be`, `have`, `do`, `can`, `shall`, `will`, `go`) keep their own
labels: `be` → am / are / is / was / were / been / being, `can` → could. These
are legitimate exceptions, not errors. Contractions are a single-slot case.

## Rules

1. **A root with no inflections is normal.** 243 of 319 roots have none — that
   includes every function word (`when`, `where`, `why`, `if`, `and`, `not`).
   Having no slots is the *correct* state for them, not a gap to fill.
2. **Never generate a form mechanically.** If a root has no slot for a tap, the
   tap must do nothing (`tryApplyGrammarModifier` already returns false when
   `entry.inflections[num]` is missing).
3. **A verb must be a real verb.** `not`, `when`, `every`, `now` are not verbs:
   they may not take `-ed` / `-ing`. If `noted` is wanted, it belongs to `note`.
4. **Spelling is part of the data.** A misspelled form (`hiting`, `requirment`,
   `shoud`, `etimologically`) is a bug in the same class as a wrong chord.
5. **A root lemma should be a base form** — not itself an inflected form
   (`wholed`, `enumerated`, `intended`, `created`, `copying` are not lemmas).
6. **A derivative's morpheme is the affix**, not a copy of the word
   (`come → become` should carry morpheme `be-`, not `become`).

## Current state — enforced

Every one of the 319 roots now carries a `pos`, and `validate.js` checks it.

| pos | roots | may inflect? |
|---|---|---|
| noun | 93 | yes |
| verb | 84 | yes |
| function | 56 | **never** |
| adjective | 29 | yes |
| bound | 20 | **never** — Latin/Greek roots used only to build families (`cise` → concise, precise, decision) |
| junk | 18 | **never** — broken lemmas awaiting a decision |
| pronoun | 15 | yes |
| chinese | 4 | **never** |

### What `validate.js` now enforces

**Blocking** — a write is refused:

- every root has a `pos`, and it is a known one;
- `inflections` may only use the labels allowed for that `pos`; a `function`
  word carrying an inflection fails;
- **invented inflection** — a `function` / `bound` / `chinese` / `junk` root with
  a derivative whose morpheme is a verb suffix (`-ed`, `-ing`, `-d`, `-es`,
  `-en`) fails. *This is the `whened` rule.* `-s`, `-er`, `-est`, `-ly` stay
  warnings, because they also build real words (`to → towards`, `up → upper`).

**Warnings** — reported, non-blocking backlog:

| Class | Count |
|---|---|
| unlabelled derivative morpheme (label repeats the word: `come → become` should be `be-`) | 102 |
| inflection stored as a derivative (`forward → forwarded [-ed]`) | 57 |
| root lemma is itself an inflected form (`wholed`, `intended`) | 14 |
| roots flagged `junk` | 18 |

### Removed

`when → whened` and `not → noted` — both were function words carrying an
invented `-ed`. `noted` already exists correctly under the root `note`, as a
derivative and as its Past Tense slot.

### Outstanding, awaiting a decision (nothing deleted without one)

18 lemmas are flagged `pos: "junk"`; they are not words:

```
andlook  middles  strucuture  dirrect  doesn  t  pannel  wholed  copying
created  aded  enumerated  intended  given
have right   it was   we have   artificial intelligence
```

Misspellings still in the data: `hiting` (hit), `shoud` (shall), `requirment`
(quire), `etimologically` (etym), `dirrect`, `pannel`, `strucuture`.
