#!/usr/bin/env node
/**
 * chordgen.js — Steno chord generator (replaces the lost main.py logic)
 *
 * Rebuilds every chord in data.json from one physical model:
 *   - 8 active fingers. Thumbs are idle (b -> Left Index, n -> Right Index).
 *   - A finger presses AT MOST ONE key per chord.
 *   - Letters claim fingers in word order (first-come, first-served).
 *   - Mirrored keys (right hand -> left hand) are canonicalized.
 *   - Chords are order-independent (sorted).
 *   - A chord needs >= 2 keys; a lone letter gains a digit on a free finger.
 *   - Cross-word collisions gain a digit on a free finger, then a spare letter.
 *
 * Chinese: chord = <tone digit> + <pinyin letters>, tone digit falling back to
 * its mirrored partner when that finger is taken (whichever keeps more letters).
 *
 * All metadata (char / emoji / note / morpheme / translations) is preserved.
 * Inflection taps ("1".."4") are NOT chords -- they stay untouched.
 *
 * Usage:
 *   node chordgen.js                 # dry run: rebuild everything, report only
 *   node chordgen.js --preserve      # keep existing chords that are still legal
 *   node chordgen.js --write         # apply (writes a timestamped backup first)
 *   node chordgen.js --preserve --write
 */

const fs = require("fs");
const path = require("path");

const DATA_FILE = path.join(__dirname, "data.json");
const WRITE = process.argv.includes("--write");
const PRESERVE = process.argv.includes("--preserve");

// ---------------------------------------------------------------- finger map
const FINGER_MAP = {
  "left-pinky": "1qaz",
  "left-ring": "2wsx",
  "left-middle": "3edc",
  "left-index": "45rfvtgb",   // b moved here
  "right-index": "67yhujmn",  // n moved here
  "right-middle": "8ik,",
  "right-ring": "9ol.",
  "right-pinky": "0p;/'",
};
const ACTIVE_FINGERS = Object.keys(FINGER_MAP).length; // 8

const KEY_TO_FINGER = {};
for (const [finger, keys] of Object.entries(FINGER_MAP))
  for (const key of keys) KEY_TO_FINGER[key] = finger;

const ALLOWED = new Set(Object.keys(KEY_TO_FINGER));
const DIGITS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"];
const SPARE_LETTERS = "etaoinshrdlucmfwypvbgkjqxz".split("");

// TRACE=<text> node chordgen.js  ->  logs every decision mentioning <text>
const TRACE = process.env.TRACE || "";
const trace = (...a) => { if (TRACE && a.join(" ").includes(TRACE)) console.error("[trace]", ...a); };

const NO_DIGIT_MIRROR = process.argv.includes("--no-mirror-digits");
// Digit mirrors (0->1, 9->2, 8->3, 7->4) let a chord be typed on either hand,
// BUT they defeat the partner-tone escape used by the Chinese chords, because
// the partner digit immediately folds back onto the digit that just clashed.
const MIRROR_KEYS = NO_DIGIT_MIRROR
  ? { ";": "a", "/": "z", l: "s" }
  : { 0: "1", 9: "2", 8: "3", 7: "4", ";": "a", "/": "z", l: "s" };
const TONE_PARTNER = { "1": "0", "0": "1", "2": "9", "9": "2", "3": "8", "8": "3", "4": "7", "7": "4", "5": "6", "6": "5" };

// ------------------------------------------------------------------ helpers
function usedFingers(chord) {
  const out = {};
  for (const ch of chord) if (KEY_TO_FINGER[ch]) out[KEY_TO_FINGER[ch]] = ch;
  return out;
}

function isPhysical(chord) {
  if (!chord || chord.length > ACTIVE_FINGERS) return false;
  const seen = new Set();
  for (const ch of chord) {
    const f = KEY_TO_FINGER[ch];
    if (!f || seen.has(f)) return false;
    seen.add(f);
  }
  return true;
}

/** Fold mirrors; if folding creates a same-finger clash the left-hand key wins. */
function canonicalize(chord) {
  const mapped = [...chord].map(k => MIRROR_KEYS[k] || k).sort();
  const used = {};
  const out = [];
  for (const k of mapped) {
    const f = KEY_TO_FINGER[k];
    if (f && !(f in used)) { used[f] = k; out.push(k); }
  }
  return out.sort().join("");
}

const normalizePinyin = p =>
  String(p).normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/ü/g, "u").replace(/[^a-zA-Z]/g, "").toLowerCase();

const isChinese = s => /[\u4e00-\u9fff]/.test(String(s));

function claimLetters(letters) {
  const used = {};
  const keys = [];
  for (const ch of letters) {
    if (!ALLOWED.has(ch)) continue;
    const f = KEY_TO_FINGER[ch];
    if (f in used) continue;
    used[f] = ch;
    keys.push(ch);
  }
  return keys;
}

function ensureMultiKey(keys, protectedFingers = {}) {
  if (keys.length > 1) return keys;
  const used = { ...usedFingers(keys.join("")), ...protectedFingers };
  for (const d of DIGITS) if (!(KEY_TO_FINGER[d] in used)) return [...keys, d];
  return keys;
}

/**
 * Find a globally unique, physical chord near `base`.
 * If the chord already saturates all 8 fingers, free one by dropping a letter
 * and refill that same finger with a distinguishing key.
 */
function makeUnique(base, taken, protectedFingers = {}) {
  let cand = canonicalize(base);
  if (isPhysical(cand) && !taken.has(cand)) return cand;

  const tryFill = c => {
    const used = { ...usedFingers(c), ...protectedFingers };
    for (const d of DIGITS) {
      if (KEY_TO_FINGER[d] in used) continue;
      const next = canonicalize(c + d);
      if (isPhysical(next) && !taken.has(next)) return next;
    }
    for (const l of SPARE_LETTERS) {
      if (KEY_TO_FINGER[l] in used) continue;
      const next = canonicalize(c + l);
      if (isPhysical(next) && !taken.has(next)) return next;
    }
    return null;
  };

  let hit = tryFill(cand);
  if (hit) return hit;

  // Saturated: drop a letter from the tail, then refill that freed finger.
  for (let i = cand.length - 1; i >= 0; i--) {
    const trimmed = cand.slice(0, i) + cand.slice(i + 1);
    const used = { ...usedFingers(trimmed), ...protectedFingers };
    for (const d of DIGITS) {
      if (KEY_TO_FINGER[d] in used) continue;
      const next = canonicalize(trimmed + d);
      if (isPhysical(next) && !taken.has(next)) return next;
    }
  }
  return null;
}

// ------------------------------------------------------------- assignments
const taken = new Set();
const chordOfWord = new Map(); // lowercase word -> chord (for per-word validation)
const report = { changed: [], failures: [], notes: [], kept: 0 };

function register(chord, word) {
  taken.add(chord);
  if (word) chordOfWord.set(String(word).toLowerCase().trim(), chord);
}

function assignEnglish(word, label) {
  const letters = [...String(word).toLowerCase()].filter(c => ALLOWED.has(c));
  if (!letters.length) { report.failures.push(label + ":" + word + " (no usable letters)"); return null; }
  const chord = makeUnique(ensureMultiKey(claimLetters(letters)).join(""), taken);
  if (!chord) { report.failures.push(label + ":" + word); return null; }
  register(chord, word);
  return chord;
}

/** Chinese single character -> tone digit + pinyin letters */
/** English assignment honoring --preserve (keeps an existing legal chord). */
function englishChord(word, oldChord, label) {
  if (PRESERVE && oldChord && isPhysical(oldChord) && !taken.has(oldChord)) {
    register(oldChord, word);
    report.kept++;
    return oldChord;
  }
  return assignEnglish(word, label);
}

function assignChinese(char, pinyin, tone, label) {
  const py = normalizePinyin(pinyin);
  if (!py) { report.failures.push(label + ":" + char + " (no pinyin)"); return null; }
  const toneStr = String(tone || 5);

  // Evaluate both the tone digit and its mirrored partner; prefer more letters.
  const candidates = [];
  for (const t of [...new Set([toneStr, TONE_PARTNER[toneStr]])]) {
    if (!ALLOWED.has(t)) continue;
    const merged = [t, ...claimLetters(py)];
    const used = {};
    const keys = [];
    for (const k of merged) {
      const f = KEY_TO_FINGER[k];
      if (f in used) continue;
      used[f] = k; keys.push(k);
    }
    const chord = canonicalize(keys.join(""));
    if (isPhysical(chord) && chord.length >= 2) candidates.push(chord);
  }
  candidates.sort((a, b) => b.length - a.length);

  trace("assignChinese", char, "tone=" + tone, "candidates=" + JSON.stringify(candidates), "taken=" + candidates.map(c => taken.has(c)).join(","));
  for (const chord of candidates) {
    if (!taken.has(chord)) { register(chord, char); return chord; }
    const unique = makeUnique(chord, taken);
    if (unique) { register(unique, char); return unique; }
  }
  report.failures.push(label + ":" + char + "(" + pinyin + ")");
  return null;
}

// -------------------------------------------------------------------- main
const original = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
const out = JSON.parse(JSON.stringify(original));

// Pinyin for chars that never made it into chinese_chords. Extend freely.
const PINYIN_FALLBACK = {
  "电": { pinyin: "dian", tone: 4 }, "生": { pinyin: "sheng", tone: 1 },
  "话": { pinyin: "hua", tone: 4 }, "脑": { pinyin: "nao", tone: 3 },
  "日": { pinyin: "ri", tone: 4 }, "命": { pinyin: "ming", tone: 4 },
  "产": { pinyin: "chan", tone: 3 }, "人": { pinyin: "ren", tone: 2 },
  "家": { pinyin: "jia", tone: 1 }, "学": { pinyin: "xue", tone: 2 },
  "小": { pinyin: "xiao", tone: 3 }, "拿": { pinyin: "na", tone: 2 },
  "出": { pinyin: "chu", tone: 1 }, "所": { pinyin: "suo", tone: 3 },
  "有": { pinyin: "you", tone: 3 }, "情": { pinyin: "qing", tone: 2 },
  "况": { pinyin: "kuang", tone: 4 },
};

// char -> {pinyin, tone} harvested from the existing Chinese store
const CHAR_INFO = { ...PINYIN_FALLBACK };
for (const e of Object.values(original.chinese_chords || {}))
  if (e && e.char && !CHAR_INFO[e.char]) CHAR_INFO[e.char] = { pinyin: e.pinyin, tone: e.tone };

// ---- 1. Chinese first: fixed rule, least flexible, reserves its chords
const newChinese = {};
const zhChord = {};
for (const [oldChord, entry] of Object.entries(original.chinese_chords || {})) {
  if (zhChord[entry.char]) { report.notes.push("duplicate char merged: " + entry.char + " (" + oldChord + ")"); continue; }
  let chord = null;
  if (isPhysical(oldChord) && !taken.has(oldChord)) { chord = oldChord; report.kept++; }
  else chord = assignChinese(entry.char, entry.pinyin, entry.tone, "chinese");
  if (!chord) continue;
  register(chord, entry.char);   // always reserve, even when we kept the old chord
  zhChord[entry.char] = chord;
  newChinese[chord] = { ...entry, keys: String(entry.tone) + normalizePinyin(entry.pinyin) };
  if (chord !== oldChord) report.changed.push("chinese " + oldChord + " -> " + chord + "  " + entry.char);
}
out.chinese_chords = sortObject(newChinese);

// ---- 2. Roots tree: English lemmas, Chinese chars, Chinese phrases
function assignChinesePhrase(text, label) {
  const chars = [...text].filter(isChinese);
  const pinyin = chars.map(c => (CHAR_INFO[c] ? normalizePinyin(CHAR_INFO[c].pinyin) : "")).join("");
  const tones = chars.map(c => (CHAR_INFO[c] ? String(CHAR_INFO[c].tone) : "")).filter(Boolean);
  if (!pinyin) { report.failures.push(label + ":" + text + " (no pinyin for any char)"); return null; }
  const best = [];
  for (const t of [...new Set(tones.length ? [tones[0], TONE_PARTNER[tones[0]]] : [])].filter(Boolean)) {
    const merged = [t, ...claimLetters(pinyin)];
    const used = {}; const keys = [];
    for (const k of merged) { const f = KEY_TO_FINGER[k]; if (f in used) continue; used[f] = k; keys.push(k); }
    const chord = canonicalize(keys.join(""));
    if (isPhysical(chord) && chord.length >= 2) best.push(chord);
  }
  const plain = canonicalize(ensureMultiKey(claimLetters(pinyin)).join(""));
  if (isPhysical(plain) && plain.length >= 2) best.push(plain);
  best.sort((a, b) => b.length - a.length);
  for (const chord of best) {
    if (!taken.has(chord)) { register(chord, text); return chord; }
    const unique = makeUnique(chord, taken);
    if (unique) { register(unique, text); return unique; }
  }
  report.failures.push(label + ":" + text);
  return null;
}


const newRoots = {};
for (const [oldChord, root] of Object.entries(original.roots || {})) {
  const lemma = root.lemma;
  let chord = null;
  let isZh = false;
  if (isChinese(lemma)) {
    isZh = true;
    chord = [...lemma].length === 1
      ? (CHAR_INFO[lemma]
        ? ((isPhysical(oldChord) && !taken.has(oldChord)) ? oldChord : assignChinese(lemma, CHAR_INFO[lemma].pinyin, CHAR_INFO[lemma].tone, "roots-zh"))
        : assignChinesePhrase(lemma, "roots-zh"))
      : assignChinesePhrase(lemma, "roots-zh");
  } else {
    chord = englishChord(lemma, oldChord, "roots");
  }
  if (!chord) continue;
  register(chord, lemma);   // reserve even when an existing chord was kept
  trace("root", lemma, "old=" + oldChord, "new=" + chord, "zh=" + isZh);
  if (chord !== oldChord) report.changed.push((isZh ? "rootZH " : "root ") + oldChord + " -> " + chord + "  " + lemma);

  const copy = { ...root, chord };
  copy.derivatives = {};
  for (const [dOld, dv] of Object.entries(root.derivatives || {})) {
    let dChord;
    if (isChinese(dv.word)) {
      dChord = [...dv.word].length === 1 && CHAR_INFO[dv.word]
        ? assignChinese(dv.word, CHAR_INFO[dv.word].pinyin, CHAR_INFO[dv.word].tone, "deriv-zh")
        : assignChinesePhrase(dv.word, "deriv-zh");
    } else {
      dChord = englishChord(dv.word, dOld, "derivatives");
    }
    if (!dChord) continue;
    register(dChord, dv.word);
    copy.derivatives[dChord] = { ...dv, chord: dChord };
    if (dChord !== dOld) report.changed.push("deriv " + dOld + " -> " + dChord + "  " + dv.word);
  }
  copy.derivatives = sortObject(copy.derivatives);
  newRoots[chord] = copy;
}
out.roots = sortObject(newRoots);

// ---- 3. steno_dictionary (array, English + Chinese mixed)
out.steno_dictionary = (original.steno_dictionary || []).map(entry => {
  const word = String(entry.word);
  if (isChinese(word)) {
    const chord = zhChord[word] || assignChinesePhrase(word, "dict-zh");
    if (!chord) return null;
    return { ...entry, chord };
  }
  const chord = englishChord(word, entry.chord, "steno_dictionary");
  if (!chord) return null;
  return { ...entry, chord, keys: word.toLowerCase() };
}).filter(Boolean);

// ---- 4. Lookup maps: every chord -> display text
const flat = {};
const chordMap = {};
const put = (chord, text) => { flat[chord] = text + " "; chordMap[chord] = text + " "; };

for (const [chord, R] of Object.entries(out.roots)) {
  put(chord, R.lemma);
  for (const [dc, dv] of Object.entries(R.derivatives)) put(dc, dv.word);
}
for (const [chord, e] of Object.entries(out.chinese_chords)) put(chord, e.char);
for (const e of out.steno_dictionary) if (!flat[e.chord]) put(e.chord, e.word);

// leftover vocabulary that only ever lived in the old lookup maps
const extra = new Set();
for (const v of Object.values(original.flat_chords || {})) extra.add(String(v).trim());
for (const v of Object.values(original.chord_map || {})) extra.add(String(v).trim());
for (const w of extra) {
  if (!w || isChinese(w)) continue;
  if (chordOfWord.has(w.toLowerCase())) continue;
  const chord = assignEnglish(w, "extra");
  if (chord) put(chord, w);
}
out.flat_chords = sortObject(flat);
out.chord_map = sortObject(chordMap);

function sortObject(o) {
  const sorted = {};
  for (const k of Object.keys(o).sort()) sorted[k] = o[k];
  return sorted;
}

// ------------------------------------------------------------- validation
const problems = [];
const seenChord = new Map(); // chord -> word
function check(chord, word, where) {
  if (!isPhysical(chord)) problems.push("IMPOSSIBLE " + where + " [" + chord + "] " + word);
  const key = String(word).toLowerCase().trim();
  if (seenChord.has(chord)) {
    const prev = seenChord.get(chord);
    if (prev !== key) problems.push("COLLISION " + chord + " -> '" + prev + "' and '" + key + "'");
  } else seenChord.set(chord, key);
}
for (const [c, R] of Object.entries(out.roots)) {
  check(c, R.lemma, "roots");
  for (const [dc, dv] of Object.entries(R.derivatives)) check(dc, dv.word, "deriv");
}
for (const [c, e] of Object.entries(out.chinese_chords)) check(c, e.char, "chinese");
for (const e of out.steno_dictionary) check(e.chord, e.word, "dict");
for (const [c, w] of Object.entries(out.chord_map)) check(c, w, "chord_map");

// --------------------------------------------------------------- reporting
console.log("=== chordgen " + (WRITE ? "(WRITE)" : "(dry run)") + (PRESERVE ? " preserve" : "") + " ===");
console.log("fingers: " + ACTIVE_FINGERS + " active / " + ALLOWED.size + " keys  (thumbs idle)");
console.log("digit mirroring: " + (NO_DIGIT_MIRROR ? "OFF" : "on") + "   preserve: " + (PRESERVE ? "on" : "off"));

// how healthy was the ORIGINAL data under this finger map?
{
  let zhBad = 0;
  for (const k of Object.keys(original.chinese_chords || {})) if (!isPhysical(k)) zhBad++;
  const enBefore = [];
  for (const R of Object.values(original.roots || {})) {
    enBefore.push(R.chord);
    for (const dv of Object.values(R.derivatives || {})) enBefore.push(dv.chord);
  }
  const enBad = enBefore.filter(c => !isPhysical(c)).length;
  console.log("original health  : chinese " + zhBad + "/" + Object.keys(original.chinese_chords || {}).length +
    " impossible, english roots tree " + enBad + "/" + enBefore.length + " impossible");
}
console.log("");
console.log("chords total      : " + seenChord.size);
console.log("chords changed    : " + report.changed.length);
console.log("failures          : " + report.failures.length);
console.log("validation issues : " + problems.length);

if (problems.length) {
  console.log("\nproblems (first 20):");
  problems.slice(0, 20).forEach(p => console.log("  " + p));
}
if (report.failures.length) {
  console.log("\nfailures:");
  [...new Set(report.failures)].slice(0, 20).forEach(f => console.log("  " + f));
}
if (report.notes.length) {
  console.log("\nnotes:");
  [...new Set(report.notes)].slice(0, 10).forEach(n => console.log("  " + n));
}

const zhChanges = report.changed.filter(c => /^chinese|ZH/.test(c));
const enChanges = report.changed.filter(c => !/^chinese|ZH/.test(c));
console.log("\nchanged: " + enChanges.length + " English, " + zhChanges.length + " Chinese");
console.log("sample English changes:");
enChanges.slice(0, 12).forEach(c => console.log("  " + c));
console.log("sample Chinese changes:");
zhChanges.slice(0, 8).forEach(c => console.log("  " + c));

// ---- before/after readability comparison
function lengthProfile(keys) {
  const lens = [...keys].map(k => k.length);
  if (!lens.length) return { n: 0, avg: 0, min: 0, max: 0 };
  return {
    n: lens.length,
    avg: +(lens.reduce((a, b) => a + b, 0) / lens.length).toFixed(2),
    min: Math.min(...lens),
    max: Math.max(...lens),
  };
}
function compare(label, beforeKeys, afterKeys) {
  const b = Object.keys(beforeKeys), a = Object.keys(afterKeys);
  const bp = lengthProfile(b), ap = lengthProfile(a);
  console.log("\n" + label);
  console.log("  chords   before " + bp.n + " (avg " + bp.avg + " keys, " + bp.min + "-" + bp.max + ")");
  console.log("  chords   after  " + ap.n + " (avg " + ap.avg + " keys, " + ap.min + "-" + ap.max + ")");
}
compare("CHINESE chords", original.chinese_chords || {}, out.chinese_chords);
{
  const before = [], after = [];
  for (const R of Object.values(original.roots || {})) {
    before.push(R.chord || "");
    for (const dv of Object.values(R.derivatives || {})) before.push(dv.chord || "");
  }
  for (const R of Object.values(out.roots || {})) {
    after.push(R.chord || "");
    for (const dv of Object.values(R.derivatives || {})) after.push(dv.chord || "");
  }
  compare("ENGLISH roots tree", Object.fromEntries(before.map((c, i) => [c + "#" + i, 1])), Object.fromEntries(after.map((c, i) => [c + "#" + i, 1])));
}

let charsKept = 0, charsTotal = 0;
for (const R of Object.values(out.roots)) {
  charsTotal++; if (R.char) charsKept++;
  for (const dv of Object.values(R.derivatives)) { charsTotal++; if (dv.char) charsKept++; }
}
console.log("\nChinese chars preserved in roots tree: " + charsKept + "/" + charsTotal);

if (WRITE) {
  const backup = DATA_FILE + ".bak-" + Date.now();
  fs.copyFileSync(DATA_FILE, backup);
  fs.writeFileSync(DATA_FILE, JSON.stringify(out, null, 2) + "\n", "utf8");
  console.log("\nWROTE " + DATA_FILE + "\nbackup: " + backup);
} else {
  console.log("\n(dry run - nothing written. add --write to apply)");
}
