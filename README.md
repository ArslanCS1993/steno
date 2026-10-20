# Steno Chording Academy & Sandbox

An interactive, chorded-keyboard tutor for standard QWERTY keyboards. Press multiple keys at once (a **chord**) to expand words, morpheme compounds, and grammar inflections — order-independent, with physical 10-finger constraints.

## Files

| File | Role |
|------|------|
| `data.json` | **Single source of truth** — roots, derivatives, inflections, chord map, translations, and word visuals |
| `steno_tutor.html` | The tutor app — loads `data.json` at runtime |

## Running

The tutor fetches `data.json` over HTTP, so serve the folder instead of double-clicking the file:

```bash
python3 -m http.server
# open http://localhost:8000/steno_tutor.html
```

…or push to GitHub Pages and open the Pages URL.

## Editing data

Edit `data.json`. The tutor picks up changes on reload — no build step, no sync script.

## Modes

1. **Training Mode** — guided lessons with real-time finger highlighting, streak tracking, and sound.
2. **Sandbox Mode** — dual-mode typing box (letter-by-letter or chorded) with SVG visuals, copy/paste, and grammar inflection (tap `1`–`4`).
3. **Finger Guide** — interactive 10-finger color map.
