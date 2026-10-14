# Python Steno Typing Engine & Interactive Academy

A lightweight, order-independent stenography / chorded keyboard engine and interactive web tutor for standard QWERTY keyboards.

Instead of typing letters sequentially, this system lets you press multiple keys at the same time (a chord). When the keys are released, the engine recognizes the combination and expands it into full words, morpheme compounds, or grammar inflections.

---

## Features

- **Order-Independent Chording:** Physical key combinations are sorted alphabetically in memory, meaning the exact order of physical key contact doesn't matter.
- **Physical 10-Finger Constraints:** Each finger can press at most one key per chord (Rule 1). Words are parsed using a first-come, first-served finger allocation algorithm.
- **2-Step Derivational Morpheme Engine:** Strike a root chord (e.g. `take`), and derivative morphemes arm dynamically (e.g. `in-` $\rightarrow$ `intake`, `over-` $\rightarrow$ `overtake`). Pressing Space commits the root as a separate word, and Backspace intelligently splits compound words back into separate roots.
- **Part-of-Speech Grammar Inflections:** Tap numbers `1-4` to inflect the last chorded word based on its part of speech (verbs: past tense, continuous, 3rd person; nouns: plural, possessive).
- **SVG Visual Inheritance:** Grammar-inflected words (e.g. `took`, `intakes`, `functions`) inherit the visual icon and artwork of their base lemma rather than falling back to generic placeholders.
- **Smart Dual-Mode Typing in Sandbox:** Type letter-by-letter (`c-a-t`) or strike multi-key chords in the exact same input box without mode collisions.
- **Rich Copy & Paste Shortcuts:** Press `Ctrl+C` or click **Copy** to copy clean lettered words to your clipboard—even when in **SVG Only** mode, all grammar is preserved and raw SVG tags/emojis are omitted. Press `Ctrl+V` to paste text back into the sandbox.
- **Single-Letter & Anagram Collision Resolution:** Single-letter words and collisions automatically integrate numerical modifiers (e.g., `i` $\rightarrow$ `1i`, `file` $\rightarrow$ `efil`, `life` $\rightarrow$ `1efil`).
- **Normal Typing Bypass:** Tap or hold the **Spacebar** to disarm roots, commit words, and type normally.
- **High Performance & Stability:** Multi-threaded expansion with `<0.1ms` hook latency prevents Windows hook timeouts.

---

## 10-Finger Key Mapping

| Finger | Hand | Keys |
| :--- | :--- | :--- |
| **Pinky** | Left | `1`, `q`, `a`, `z` |
| **Ring** | Left | `2`, `w`, `s`, `x` |
| **Middle** | Left | `3`, `e`, `d`, `c` |
| **Index** | Left | `4`, `5`, `r`, `f`, `v`, `t`, `g` |
| **Thumb** | Left | `b` |
| **Thumb** | Right | `n` |
| **Index** | Right | `6`, `7`, `y`, `h`, `u`, `j`, `m` |
| **Middle** | Right | `8`, `i`, `k`, `,` |
| **Ring** | Right | `9`, `o`, `l`, `.` |
| **Pinky** | Right | `0`, `p`, `;`, `/`, `'` |

---

## Interactive Web Academy (`steno_tutor.html`)

Open [`steno_tutor.html`](steno_tutor.html) directly in any web browser. It is 100% self-contained and offline (zero external CDNs or web fonts).

### Modes:
1. **Training Mode:** Step-by-step guided lessons with real-time finger highlighting on dual hands, key-by-key breakdown, streak tracking, and sound feedback.
2. **Sandbox Mode:** Free typing sandbox supporting:
   - Simultaneous steno chords
   - Sequential letter-by-letter typing
   - Visual output selector (**Words**, **SVG Only**, or **Combo**)
   - Real-time Morpheme Root Tree explorer
   - Interactive Grammar Inflection bar (numbers `1-4`)
   - `Ctrl+C` / `Ctrl+V` copy-paste preserving lettered words
3. **Finger Guide:** Interactive 10-finger color scheme map and layout reference.

---

## Chinese Pinyin Strokes & Chording (Roadmap & Design)

We are integrating Chinese Pinyin chords and Hanzi character output for vocabulary words.

### 1. Concept Examples
- `4zhe` $\rightarrow$ **这** (zhè, tone 4)
- `4shi` $\rightarrow$ **是** (shì, tone 4)
- `1ta`  $\rightarrow$ **他** (tā, tone 1)
- `2na`  $\rightarrow$ **拿** (ná, tone 2, "take")
- `3gou` $\rightarrow$ **狗** (gǒu, tone 3, "dog")

### 2. Data Structure Integration
Each vocabulary entry in `data.json` supports a Chinese mapping object, alongside a fast lookup dictionary:
```json
{
  "word": "take",
  "chord": "aekt",
  "chinese": {
    "char": "拿",
    "pinyin": "ná",
    "tone": 2,
    "pinyin_chord": "2na"
  }
}
```

```json
"chinese_chords": {
  "4zhe": { "char": "这", "pinyin": "zhè", "english": "this" },
  "4shi": { "char": "是", "pinyin": "shì", "english": "is/be" },
  "1ta":  { "char": "他", "pinyin": "tā",  "english": "he/him" },
  "2na":  { "char": "拿", "pinyin": "ná",  "english": "take" }
}
```

### 3. Finger Collision Solutions for Pinyin Chords
While syllables like `4zhe` and `4shi` use 4 distinct fingers with zero conflict, syllables like `1ta` share the Left Pinky (`1` and `a`). Three design options are available:
- **Option 1 (Dual-Hand Tone Keys):** Tones on both hands (Left: `1, 2, 3, 4`; Right: `7, 8, 9, 0`). When letters are on the left hand, the tone is struck on the right hand to prevent finger collisions.
- **Option 2 (Yawei Chinese Steno Style):** Left hand chords the initial consonant (声母: `zh`, `sh`, `t`, etc.), right hand chords the final vowel + tone (韵母 + 声调). Guarantees zero collisions for all Chinese syllables.
- **Option 3 (Sequential Tone Tap):** Chord the pinyin letters together, then tap the tone number `1-4` to trigger the character.

---

## Installation & CLI Usage

Requires Python 3.8+ on Windows.

```bash
pip install keyboard
```

### 1. Run the Background Typing Listener
```bash
python main.py
```
Switch to any application (Notepad, browser, editor) and strike chords (e.g., `c + a + n` for `can `).

### 2. Add New Words to Dictionary
Automatically calculate fingers, resolve collisions, and save to `data.json`:
```bash
python main.py --add "yourword"
```

### 3. Preview Chord Generation
Inspect finger allocations and conflicts without saving:
```bash
python main.py --generate "yourword"
```

### 4. List All Current Chords
```bash
python main.py --list
```

---

## Project Structure

```text
├── main.py          # Core engine, keyboard listener & CLI tool
├── data.json        # Dictionary storing chords, morpheme roots & grammar rules
├── steno_tutor.html # Standalone interactive web academy & sandbox tutor
├── .gitignore       # Standard git ignore rules
└── README.md        # Comprehensive documentation & Chinese roadmap
```
