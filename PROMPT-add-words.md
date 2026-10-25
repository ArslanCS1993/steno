# Prompt: turn a word list into Steno chord entries

Copy everything below the line into an AI chatbot, replacing `<<<WORD LIST>>>`
with your words. The app's **Unmapped Words Tracker** (Alt+U to copy) produces
exactly the right list.

---

You are generating entries for **Steno Chording Academy**, a chorded-keyboard
tutor for ordinary QWERTY keyboards. A **chord** is several keys pressed at once
and the result is **order-independent** (the chord is sorted). I will give you a
list of words; return the chord assignment and metadata for each.

## Finger map (English scheme — one key per finger, thumbs idle)

| Finger | Keys |
|---|---|
| Left pinky | `1 q a z` |
| Left ring | `2 w s x` |
| Left middle | `3 e d c` |
| Left index | `4 5 r f v t g b` |
| Right index | `6 7 y h u j m n` |
| Right middle | `8 i k ,` |
| Right ring | `9 o l .` |
| Right pinky | `0 p ; / '` |

## Rules you must follow

1. **Derive the chord from the word's letters, in word order, first-come.**
   Walk the letters left to right. A finger may hold **at most one key** in a
   chord, so a letter whose finger is already claimed is **dropped**.
2. **Sort the surviving letters.** Press order is irrelevant, so `think` and
   `kniht` must produce the same chord.
3. **At least 2 keys.** A single letter is not a valid chord.
4. **Collisions get a disambiguating digit** appended on a still-free finger
   (prefer `1`…`0`, then a spare letter). Example: if `hit` is taken, use `1hit`.
5. **Mirror keys** (right hand folded onto the left) are canonicalised before
   sorting.
6. **A chord may never use two keys on the same finger.** `thnk` and `thin` are
   **invalid** because `h` and `n` are both on the right index. If a natural
   chord is impossible, say so explicitly instead of inventing one.

## Output format

Return a markdown table first:

| word | chord | keys used | dropped letters (reason) | note |
|------|-------|-----------|--------------------------|------|

Then return **only** the entries that changed, as a JSON block matching the
project's `data.json` shapes exactly:

```json
{
  "chord_map":         { "<chord>": "<word> " },
  "flat_chords":       { "<chord>": "<word> " },
  "steno_dictionary":  [
    { "word": "<word>", "chord": "<chord>", "keys": "<letters>", "note": "<why>" }
  ],
  "word_visuals":      {
    "<word>": { "emoji": "<one emoji>", "bg": "#rrggbb",
                "glow": "rgba(r,g,b,0.4)", "label": "<WORD UPPERCASE>" }
  },
  "english_to_chinese": { "<word>": "<Chinese gloss>" }
}
```

Notes on the JSON:
- `chord_map` / `flat_chords` values keep a **trailing space**.
- `glow` must be the `bg` colour at **0.4** alpha.
- Omit `word_visuals` / `english_to_chinese` entries you cannot supply with
  confidence. Use exactly **one** emoji per word.
- **Never** invent a chord that reuses a finger, and never reuse an existing
  chord — call the conflict out instead.

## Constraints

- Do **not** add inflections (`-ed`, `-ing`, `-s`) as separate words; those are
  numbered taps `1`–`4` on an armed root.
- Flag any word whose derived chord would be too short, impossible, or already
  taken rather than guessing.
- If a word is better stored as a **root with derivatives**, say so.

## The list

<<<WORD LIST>>>
