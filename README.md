# Python Steno Typing Engine

A lightweight, order-independent stenography / chorded keyboard engine for standard QWERTY keyboards.

Instead of typing letters sequentially, this system lets you press multiple keys at the same time (a chord). When the keys are released, the engine recognizes the combination and expands it into full words.

---

## Features

- **Order-Independent Chording:** Physical key combinations are sorted alphabetically in memory, meaning the exact order of key contact doesn't matter.
- **Physical 10-Finger Constraints:** Each finger can press at most one key per chord. Words are parsed using a first-come, first-served finger allocation algorithm.
- **Single-Letter & Anagram Collision Resolution:** Single-letter words and collisions automatically integrate numerical modifiers (e.g., `i` $\rightarrow$ `1i`, `file` $\rightarrow$ `efil`, `life` $\rightarrow$ `1efil`).
- **Normal Typing Bypass:** Hold the **Spacebar** at any time to type single letters normally without triggering chords.
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

## Installation

Requires Python 3.8+ on Windows.

```bash
pip install keyboard
```

---

## Usage

### 1. Run the Typing Listener
Start the background engine:
```bash
python main.py
```
Keep the terminal window open. Switch to any application (Notepad, browser, editor) and press chords (e.g., `c + a + n` for `can `).

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
├── main.py       # Core engine, keyboard listener & CLI tool
├── data.json     # Dictionary storing chord-to-word mappings
├── .gitignore    # Standard git ignore rules
└── README.md     # Documentation
```
