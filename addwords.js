#!/usr/bin/env node
/**
 * addwords.js — add vocabulary to data.json with generated, physically-valid chords.
 *
 * A chord is derived with the same rule the rest of the project uses:
 *   - one key per finger, letters claim fingers left-to-right (first-come)
 *   - duplicate/conflicting letters are dropped
 *   - mirrored keys fold right-hand -> left-hand
 *   - the result is sorted, so press order never matters
 *   - collisions gain a digit on a free finger (1fmo, 2ad, ...)
 *
 * Each word is registered in:
 *   chord_map          (the runtime lookup - required)
 *   flat_chords        (legacy mirror of chord_map, kept in sync)
 *   steno_dictionary   (the Training Mode list)
 *   word_visuals       (emoji card, if META/--emoji supplied)
 *   english_to_chinese (translation, if META/--zh supplied)
 *
 * Usage:
 *   node addwords.js develop global know            # dry run
 *   node addwords.js develop global know --write    # apply (timestamped backup)
 *
 * Fill META below to give new words their Chinese gloss, emoji and colour.
 */

const fs = require("fs");
const path = require("path");

const DATA_FILE = path.join(__dirname, "data.json");
const WRITE = process.argv.includes("--write");
const words = process.argv.slice(2).filter(a => !a.startsWith("--"));

// Optional presentation metadata: word -> { zh, emoji, bg }
const META = {
  "constitutes": { zh: "构成", emoji: "🧩", bg: "#7c3aed" },
  "develop":     { zh: "发展", emoji: "🌱", bg: "#22c55e" },
  "global":      { zh: "全球", emoji: "🌐", bg: "#0284c7" },
  "include":     { zh: "包括", emoji: "➕", bg: "#f59e0b" },
  "know":        { zh: "知道", emoji: "🧠", bg: "#a855f7" },
  "supply":      { zh: "供应", emoji: "📦", bg: "#14b8a6" },
  "towards":     { zh: "朝向", emoji: "➡️", bg: "#ef4444" },
  "use":         { zh: "使用", emoji: "🛠️", bg: "#6366f1" },
};

// ---------------------------------------------------------------- finger map
const FINGER_MAP = {
  "left-pinky": "1qaz", "left-ring": "2wsx", "left-middle": "3edc", "left-index": "45rfvtgb",
  "right-index": "67yhujmn", "right-middle": "8ik,", "right-ring": "9ol.", "right-pinky": "0p;/'",
};
const K2F = {};
for (const [f, ks] of Object.entries(FINGER_MAP)) for (const k of ks) K2F[k] = f;

const MIRROR_KEYS = { 0: "1", 9: "2", 8: "3", 7: "4", ";": "a", "/": "z", l: "s" };
const DIGITS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"];
const SPARE = "etaoinshrdlucmfwypvbgkjqxz".split("");

const canon = c => [...c].sort().join("");
const physical = c => { const s = new Set(); for (const ch of c) { const f = K2F[ch]; if (!f || s.has(f)) return false; s.add(f); } return true; };

function usedOf(chord) { const o = {}; for (const ch of chord) o[K2F[ch]] = ch; return o; }

function hexToGlow(hex) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, 0.4)`;
}

// -------------------------------------------------------------------- main
if (!words.length) {
  console.log("usage: node addwords.js <word> [word...] [--write]");
  process.exit(0);
}

const raw = fs.readFileSync(DATA_FILE, "utf8");
const d = JSON.parse(raw);

// every chord already spoken for
const taken = new Map();
for (const [name, obj] of [["chord_map", d.chord_map], ["flat_chords", d.flat_chords],
  ["chinese_chords", d.chinese_chords], ["roots", d.roots]]) {
  for (const c of Object.keys(obj || {})) if (!taken.has(c)) taken.set(c, name);
}
// every word already known
const known = new Set();
for (const [c, v] of Object.entries(d.chord_map || {})) known.add(String(v).trim().toLowerCase());
for (const e of d.steno_dictionary || []) known.add(String(e.word).trim().toLowerCase());

function derive(word) {
  const used = {}; const keys = []; const skipped = [];
  for (const ch of word.toLowerCase()) {
    if (!K2F[ch]) { skipped.push(ch); continue; }
    const f = K2F[ch];
    if (f in used) { skipped.push(ch + " (" + f + " used by " + used[f] + ")"); continue; }
    used[f] = ch; keys.push(ch);
  }
  return { keys, base: canon(keys.join("")), skipped };
}

function makeUnique(base) {
  let c = canon(base);
  if (physical(c) && !taken.has(c)) return c;
  const used = usedOf(c);
  for (const dg of DIGITS) {
    if (K2F[dg] in used) continue;
    const t = canon(c + dg);
    if (physical(t) && !taken.has(t)) return t;
  }
  for (const l of SPARE) {
    if (K2F[l] in used) continue;
    const t = canon(c + l);
    if (physical(t) && !taken.has(t)) return t;
  }
  return null;
}

const results = [];
for (const w of words) {
  const key = w.toLowerCase();
  if (known.has(key)) { results.push({ w, error: "already present" }); continue; }
  const { keys, base, skipped } = derive(key);
  if (keys.length < 2) { results.push({ w, error: "too few usable letters (" + keys.join("") + ")" }); continue; }
  const chord = makeUnique(base);
  if (!chord) { results.push({ w, error: "no free chord found" }); continue; }
  taken.set(chord, "NEW:" + key);
  known.add(key);

  const meta = META[key] || {};
  const changed = chord !== base;

  // chord_map + flat_chords
  d.chord_map[chord] = key + " ";
  d.flat_chords[chord] = key + " ";

  // steno_dictionary (Training Mode)
  d.steno_dictionary.push({
    word: key,
    chord,
    keys: keys.join(""),   // stored as a display string, matching existing entries
    note: changed ? "derived from " + base + "; disambiguated" : "Clean " + keys.length + "-finger match",
  });

  // word_visuals
  if (meta.emoji) {
    const bg = meta.bg || "#6366f1";
    d.word_visuals[key] = { emoji: meta.emoji, bg, glow: hexToGlow(bg), label: key.toUpperCase() };
  }

  // english_to_chinese
  if (meta.zh) d.english_to_chinese[key] = meta.zh;

  results.push({ w: key, chord, base, changed, keys, skipped, meta });
}

console.log("=== addwords " + (WRITE ? "(WRITE)" : "(dry run)") + " ===");
console.log("word".padEnd(14) + "chord".padEnd(9) + "keys".padEnd(6) + "notes");
for (const r of results) {
  if (r.error) { console.log(r.w.padEnd(14) + "-".padEnd(9) + "-".padEnd(6) + "SKIP: " + r.error); continue; }
  const notes = [
    r.changed ? "was " + r.base + " (taken -> " + r.chord + ")" : "free",
    r.meta.zh ? "zh=" + r.meta.zh : "no translation",
    r.meta.emoji ? "emoji=" + r.meta.emoji : "no emoji",
    r.skipped.length ? "dropped: " + r.skipped.join(", ") : "",
  ].filter(Boolean).join(" | ");
  console.log(r.w.padEnd(14) + r.chord.padEnd(9) + String(r.keys.length).padEnd(6) + notes);
}

// validation -- separate our new words from pre-existing breakage
const newProblems = [], oldProblems = [];
const seen = new Map();
const check = (c, w, where, bucket) => {
  if (!physical(c)) bucket.push("IMPOSSIBLE " + where + " [" + c + "] " + w);
  const k = String(w).trim().toLowerCase();
  if (seen.has(c) && seen.get(c) !== k) bucket.push("COLLISION " + c + " -> " + seen.get(c) + " / " + k);
  else seen.set(c, k);
};
const newSet = new Set(results.filter(r => !r.error).map(r => r.chord));
for (const r of results) if (!r.error) check(r.chord, r.w, "new", newProblems);
for (const [c, v] of Object.entries(d.chord_map)) {
  check(c, v, "chord_map", newSet.has(c) ? newProblems : oldProblems);
}
console.log("\nNEW words      - validation issues: " + newProblems.length);
newProblems.forEach(p => console.log("  " + p));
console.log("PRE-EXISTING   - validation issues: " + oldProblems.length +
  "  (run 'node chordgen.js' to rebuild these)");
console.log("counts: chord_map=" + Object.keys(d.chord_map).length +
  " flat_chords=" + Object.keys(d.flat_chords).length +
  " dict=" + d.steno_dictionary.length +
  " word_visuals=" + Object.keys(d.word_visuals).length +
  " english_to_chinese=" + Object.keys(d.english_to_chinese).length);

if (WRITE) {
  // Never write a file that breaks an invariant. validate() checks the
  // IN-MEMORY result, so a bad change is caught before it reaches disk.
  const { validate } = require("./validate");
  const v = validate(d);
  if (v.problems.length) {
    console.log("\nREFUSING TO WRITE - " + v.problems.length + " validation problem(s):");
    v.problems.slice(0, 15).forEach(p => console.log("  ! " + p));
    process.exit(1);
  }
  console.log("\nvalidate.js: PASS (0 problems)");

  // deterministic ordering, so two runs produce a byte-identical file
  const sortKeys = o => { const s = {}; for (const k of Object.keys(o).sort()) s[k] = o[k]; return s; };
  d.chord_map = sortKeys(d.chord_map);
  d.flat_chords = sortKeys(d.flat_chords);

  const backup = DATA_FILE + ".bak-" + Date.now();
  fs.copyFileSync(DATA_FILE, backup);
  // preserve the file's CRLF line endings exactly
  fs.writeFileSync(DATA_FILE, JSON.stringify(d, null, 2).replace(/\n/g, "\r\n"), "utf8");
  console.log("WROTE " + DATA_FILE + "\nbackup: " + backup);
} else {
  console.log("\n(dry run - nothing written. add --write to apply)");
}
