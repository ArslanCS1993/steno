#!/usr/bin/env node
/**
 * addfamily.js — store words the way the project stores them: as a ROOT with its
 * derived and inflected forms, not as loose standalone dictionary entries.
 *
 * Model (matches the existing 313-root tree):
 *   roots[rootChord] = { lemma, chord, emoji?, note, char, derivatives{}, inflections{} }
 *   derivatives[derivChord] = { morpheme, chord, word, emoji?, note?, char? }
 *   inflections[num]        = { morpheme, chord:num, word, char }   num = "1".."4"
 *
 * Reachability rules (verified against the tutor's onChordRelease):
 *   - ROOT chords go in chord_map; typing one fires the word directly (STEP 1).
 *   - DERIVATIVE chords do NOT go in chord_map. They are namespaced per root:
 *     type the root chord to arm it, then the derivative chord (STEP 2,
 *     `activeRoot.derivatives[combo]`). Only 6/351 existing derivatives are in
 *     chord_map, all coincidental, so this tool keeps them out.
 *   - INFLECTIONS have no chord of their own - arm the root, then tap 1-4.
 *
 * Verb tap digits: 1 Past (-ed) | 2 Continuous (-ing) | 3 3rd Person (-s) | 4 Past Participle
 *
 * Usage:  node addfamily.js            # dry run
 *         node addfamily.js --write    # apply (timestamped backup)
 */

const fs = require("fs");
const path = require("path");

const DATA_FILE = path.join(__dirname, "data.json");
const WRITE = process.argv.includes("--write");

// ---------------------------------------------------------------- finger map
const FINGER_MAP = {
  "left-pinky": "1qaz", "left-ring": "2wsx", "left-middle": "3edc", "left-index": "45rfvtgb",
  "right-index": "67yhujmn", "right-middle": "8ik,", "right-ring": "9ol.", "right-pinky": "0p;/'",
};
const K2F = {};
for (const [f, ks] of Object.entries(FINGER_MAP)) for (const k of ks) K2F[k] = f;
const DIGITS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"];
const SPARE = "etaoinshrdlucmfwypvbgkjqxz".split("");
const canon = c => [...c].sort().join("");
const physical = c => { const s = new Set(); for (const ch of c) { const f = K2F[ch]; if (!f || s.has(f)) return false; s.add(f); } return true; };
const usedOf = c => { const o = {}; for (const ch of c) o[K2F[ch]] = ch; return o; };
const hexToGlow = h => { const n = parseInt(h.slice(1), 16); return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, 0.4)`; };
const N = s => String(s).trim().toLowerCase();

const VERB = (past, cont, third, pp) => [
  { morpheme: "Past Tense (-ed)", word: past, suffix: "（过去式）" },
  { morpheme: "Continuous (-ing)", word: cont, suffix: "（进行式）" },
  { morpheme: "3rd Person (-s)", word: third, suffix: "（第三人称单数）" },
  { morpheme: "Past Participle (-en)", word: pp, suffix: "（过去分词）" },
];

const FAMILIES = [
  { root: "constitute", char: "构成", emoji: "🧩", bg: "#7c3aed", note: "Form or make up",
    inflections: VERB("constituted", "constituting", "constitutes", "constituted"),
    derivatives: [
      { morpheme: "-ion", word: "constitution", emoji: "📜", char: "宪法", note: "Body of fundamental principles" },
      { morpheme: "-al", word: "constitutional", emoji: "⚖️", char: "宪法的", note: "Relating to the constitution" },
      { morpheme: "-ent", word: "constituent", emoji: "🧱", char: "成分", note: "Component part" },
      { morpheme: "-ency", word: "constituency", emoji: "🗳️", char: "选区", note: "Body of voters" },
      { morpheme: "-ly", word: "constitutionally", emoji: "📖", char: "依宪法地", note: "In a constitutional manner" },
    ] },
  { root: "develop", char: "发展", emoji: "🌱", bg: "#22c55e", note: "Grow or advance",
    inflections: VERB("developed", "developing", "develops", "developed"),
    derivatives: [{ morpheme: "-ment", word: "development", emoji: "📈", char: "开发", note: "Process of growth" }] },
  { root: "include", char: "包括", emoji: "➕", bg: "#f59e0b", note: "Contain as part of a whole",
    inflections: VERB("included", "including", "includes", "included"), derivatives: [] },
  { root: "know", char: "知道", emoji: "🧠", bg: "#a855f7", note: "Have knowledge of",
    inflections: VERB("knew", "knowing", "knows", "known"),
    derivatives: [{ morpheme: "-ledge", word: "knowledge", emoji: "📚", char: "知识", note: "What is known" }] },
  { root: "supply", char: "供应", emoji: "📦", bg: "#14b8a6", note: "Provide what is needed",
    inflections: VERB("supplied", "supplying", "supplies", "supplied"),
    derivatives: [{ morpheme: "-er", word: "supplier", emoji: "🚚", char: "供应商", note: "One who supplies" }] },
  { root: "use", char: "使用", emoji: "🛠️", bg: "#6366f1", note: "Put into service",
    inflections: VERB("used", "using", "uses", "used"),
    derivatives: [
      { morpheme: "re-", word: "reuse", emoji: "♻️", char: "重复使用", note: "Use again" },
      { morpheme: "-er", word: "user", emoji: "👤", char: "用户", note: "One who uses" },
    ] },
  { root: "global", char: "全球", emoji: "🌐", bg: "#0284c7", note: "Worldwide in scope",
    inflections: [],
    derivatives: [{ morpheme: "-ly", word: "globally", emoji: "🌍", char: "全球地", note: "In a global manner" }] },
];

// words that belong under an EXISTING root as a derivative (the tree is 2 levels deep)
const ATTACH = [
  { parentLemma: "to", word: "towards", morpheme: "-s", char: "朝向", emoji: "➡️", note: "In the direction of" },
  // morpheme '-s' (not '-wards') keeps it consistent with forward -> forwards ('1s')
];

// -------------------------------------------------------------------- setup
const d = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));

const ownedWords = new Set();
for (const f of FAMILIES) {
  ownedWords.add(N(f.root));
  for (const i of f.inflections || []) ownedWords.add(N(i.word));
  for (const dv of f.derivatives || []) ownedWords.add(N(dv.word));
}
for (const a of ATTACH) ownedWords.add(N(a.word));

console.log("=== addfamily " + (WRITE ? "(WRITE)" : "(dry run)") + " ===");
console.log("families: " + FAMILIES.length + " roots, " + ATTACH.length + " attachment(s)");
console.log("words owned by this run: " + ownedWords.size);

// ---- 0. clear this tool's own previous output, so re-running is idempotent
// (otherwise a second run would leave the old root in place AND add a new one,
// shifting every chord as it went)
let rootsCleared = 0, derivsCleared = 0;
for (const R of Object.values(d.roots)) {
  for (const dc of Object.keys(R.derivatives || {})) {
    if (ownedWords.has(N(R.derivatives[dc].word))) { delete R.derivatives[dc]; derivsCleared++; }
  }
}
for (const rc of Object.keys(d.roots)) {
  if (ownedWords.has(N(d.roots[rc].lemma))) { delete d.roots[rc]; rootsCleared++; }
}
console.log("\ncleared previous tree entries -> roots:" + rootsCleared + " derivatives:" + derivsCleared);

// ---- 1. pull out the standalone entries (they are becoming tree members)
const removed = { chord_map: 0, flat_chords: 0, steno_dictionary: 0 };
for (const [c, v] of Object.entries(d.chord_map)) if (ownedWords.has(N(v))) { delete d.chord_map[c]; removed.chord_map++; }
for (const [c, v] of Object.entries(d.flat_chords)) if (ownedWords.has(N(v))) { delete d.flat_chords[c]; removed.flat_chords++; }
const dictBefore = d.steno_dictionary.length;
d.steno_dictionary = d.steno_dictionary.filter(e => !ownedWords.has(N(e.word)));
removed.steno_dictionary = dictBefore - d.steno_dictionary.length;
console.log("\nremoved standalone entries -> chord_map:" + removed.chord_map +
  " flat_chords:" + removed.flat_chords + " steno_dictionary:" + removed.steno_dictionary);

// ---- 2. taken set = ROOT chords only (derivative chords are namespaced)
const takenRoots = new Map();
for (const c of Object.keys(d.roots)) if (!takenRoots.has(c)) takenRoots.set(c, "roots");
for (const [c, v] of Object.entries(d.chord_map)) if (!takenRoots.has(c)) takenRoots.set(c, "chord_map=" + N(v));

function derive(word) {
  const used = {}; const keys = []; const skipped = [];
  for (const ch of word.toLowerCase()) {
    if (!K2F[ch]) { skipped.push(ch); continue; }
    const f = K2F[ch];
    if (f in used) { skipped.push(ch + " (" + f + " held by " + used[f] + ")"); continue; }
    used[f] = ch; keys.push(ch);
  }
  return { keys, base: canon(keys.join("")), skipped };
}

function uniqueAgainst(base, takenSet) {
  if (physical(base) && !takenSet.has(base)) return base;
  const used = usedOf(base);
  for (const dg of DIGITS) { if (K2F[dg] in used) continue; const t = canon(base + dg); if (physical(t) && !takenSet.has(t)) return t; }
  for (const l of SPARE) { if (K2F[l] in used) continue; const t = canon(base + l); if (physical(t) && !takenSet.has(t)) return t; }
  return null;
}

const plan = [];
const warnings = [];

// ---- 3. build each root family
for (const F of FAMILIES) {
  const { keys, base } = derive(F.root);
  const chord = uniqueAgainst(base, takenRoots);
  if (!chord) { plan.push({ error: F.root + ": no free root chord" }); continue; }

  takenRoots.set(chord, "NEW:" + N(F.root));
  d.chord_map[chord] = N(F.root) + " ";
  d.flat_chords[chord] = N(F.root) + " ";

  const inflections = {};
  (F.inflections || []).forEach((infl, idx) => {
    const num = String(idx + 1);
    inflections[num] = { morpheme: infl.morpheme, chord: num, word: infl.word, char: F.char + infl.suffix };
  });

  // Derivative chords are local to this root. The root's OWN chord must be
  // excluded too: STEP 1 checks chord_map before STEP 2, so a derivative that
  // reused the root chord would be shadowed and unreachable.
  const localTaken = new Set([chord]);
  const derivatives = {};
  for (const dv of F.derivatives || []) {
    // The project derives a derivative's chord from the MORPHEME, not the whole
    // word (159 vs 57 cases in the existing tree). Deriving from the word is what
    // made "constitution" a 7-key chord: the whole word re-claims the same six
    // fingers as the root, leaving no room to differ. The morpheme is short and
    // already carries the meaning: -ion -> 'ino', -al -> 'al', -ent -> 'ent'.
    const morphemeText = String(dv.morpheme || "").replace(/[^a-zA-Z]/g, "");
    let base = derive(morphemeText || dv.word).base;
    // a single-letter morpheme (-s, -d, -n) still has to be a real chord: 's' -> '1s'
    if (base.length < 2) {
      const u = usedOf(base);
      for (const dg of DIGITS) if (!(K2F[dg] in u)) { base = canon(base + dg); break; }
    }
    let dc = uniqueAgainst(base, localTaken);
    if (!dc) dc = uniqueAgainst(derive(dv.word).base, localTaken); // fall back to whole word
    if (!dc) { plan.push({ error: dv.word + ": no free derivative chord" }); continue; }
    localTaken.add(dc);
    // Not a real conflict: onChordRelease runs the STEP 2 (armed-root derivative)
    // check BEFORE the STEP 1 (chord_map) lookup, so an armed root's morpheme wins.
    if (takenRoots.has(dc)) warnings.push("note: derivative '" + dc + "' (" + dv.word + ") coincides with root chord " + dc + "=" + takenRoots.get(dc) + " - fine, STEP 2 wins while armed");
    derivatives[dc] = { morpheme: dv.morpheme, chord: dc, word: dv.word, emoji: dv.emoji, note: dv.note, char: dv.char };
    d.english_to_chinese[N(dv.word)] = dv.char;
  }

  d.roots[chord] = { lemma: F.root, chord, emoji: F.emoji, note: F.note, char: F.char, derivatives, inflections };
  d.steno_dictionary.push({ word: F.root, chord, keys: keys.join(""), note: "Clean " + keys.length + "-finger match" });
  d.word_visuals[F.root] = { emoji: F.emoji, bg: F.bg, glow: hexToGlow(F.bg), label: F.root.toUpperCase() };
  d.english_to_chinese[F.root] = F.char;

  plan.push({ root: F.root, chord, base, inflections: Object.values(inflections).map(i => i.word), derivatives: Object.values(derivatives).map(x => x.chord + "=" + x.word) });
}

// ---- 4. attach derivatives to existing roots
for (const A of ATTACH) {
  const parent = Object.entries(d.roots).find(([, R]) => N(R.lemma) === N(A.parentLemma));
  if (!parent) { plan.push({ error: "parent root '" + A.parentLemma + "' not found" }); continue; }
  const [pc, PR] = parent;
  const morphemeText = String(A.morpheme || "").replace(/[^a-zA-Z]/g, "");
  let base = derive(morphemeText || A.word).base;
  if (base.length < 2) {
    const u = usedOf(base);
    for (const dg of DIGITS) if (!(K2F[dg] in u)) { base = canon(base + dg); break; }
  }
  const dq = derive(A.word);
  const localTaken = new Set(Object.keys(PR.derivatives || {}));
  let dc = uniqueAgainst(base, localTaken);
  if (!dc) dc = uniqueAgainst(dq.base, localTaken);
  if (!dc) { plan.push({ error: A.word + ": no free derivative chord under " + A.parentLemma }); continue; }
  if (takenRoots.has(dc)) warnings.push("note: derivative '" + dc + "' (" + A.word + ") coincides with root chord " + dc + "=" + takenRoots.get(dc) + " - fine, STEP 2 wins while armed");
  PR.derivatives[dc] = { morpheme: A.morpheme, chord: dc, word: A.word, emoji: A.emoji, note: A.note, char: A.char };
  d.word_visuals[A.word] = { emoji: A.emoji, bg: "#ef4444", glow: hexToGlow("#ef4444"), label: A.word.toUpperCase() };
  d.english_to_chinese[N(A.word)] = A.char;
  // keep it trainable: Training Mode matches on the chord string alone
  d.steno_dictionary.push({ word: A.word, chord: dc, keys: dq.keys.join(""), note: "Derivative of '" + A.parentLemma + "' - arm the root first" });
  plan.push({ attached: A.word, under: A.parentLemma, parentChord: pc, chord: dc });
}

// ------------------------------------------------------------------ report
console.log("\n--- plan ---");
for (const p of plan) {
  if (p.error) { console.log("  ERROR  " + p.error); continue; }
  if (p.attached) { console.log("  attach " + p.attached.padEnd(12) + "-> root " + p.under + " (" + p.parentChord + ")   deriv chord " + p.chord); continue; }
  console.log("  root   " + p.root.padEnd(12) + "chord " + p.chord.padEnd(8) + (p.chord !== p.base ? "(was " + p.base + ")" : "(free)"));
  console.log("         inflections: " + (p.inflections.length ? p.inflections.join(", ") : "(none)"));
  console.log("         derivatives: " + (p.derivatives.length ? p.derivatives.join(", ") : "(none)"));
}
if (warnings.length) { console.log("\nwarnings:"); warnings.forEach(w => console.log("  " + w)); }

// ------------------------------------------------------------------ validate
const problems = [];
const seenRoot = new Map();
for (const [c, R] of Object.entries(d.roots)) {
  if (!physical(c)) { if (["constitute", "develop", "include", "know", "supply", "use", "global"].includes(R.lemma)) problems.push("IMPOSSIBLE root [" + c + "] " + R.lemma); }
  const k = N(R.lemma);
  if (seenRoot.has(c) && seenRoot.get(c) !== k) problems.push("COLLISION root " + c + " -> " + seenRoot.get(c) + " / " + k);
  else seenRoot.set(c, k);
  const seenD = new Map();
  for (const [dc, dv] of Object.entries(R.derivatives || {})) {
    const dk = N(dv.word);
    if (seenD.has(dc) && seenD.get(dc) !== dk) problems.push("COLLISION deriv " + dc + " under " + R.lemma + " -> " + seenD.get(dc) + " / " + dk);
    else seenD.set(dc, dk);
  }
}
console.log("\nissues in the NEW families: " + problems.length);
problems.forEach(p => console.log("  " + p));

let keyTypeBad = 0;
for (const e of d.steno_dictionary) if (Array.isArray(e.keys)) keyTypeBad++;
const newWordNames = FAMILIES.map(f => f.root).concat(ATTACH.map(a => a.word));
console.log("\nsteno_dictionary entries with ARRAY 'keys': " + keyTypeBad);
console.log("\nhow each new word is reached:");
for (const w of newWordNames) {
  const rootHit = Object.entries(d.chord_map).find(([, v]) => N(v) === N(w));
  if (rootHit) { console.log("  " + w.padEnd(12) + "STEP 1  type '" + rootHit[0] + "'" + (d.steno_dictionary.some(e => N(e.word) === N(w)) ? "  (+ in Training)" : "")); continue; }
  for (const [rc, R] of Object.entries(d.roots)) for (const [dc, dv] of Object.entries(R.derivatives || {})) {
    if (N(dv.word) === N(w)) console.log("  " + w.padEnd(12) + "STEP 2  arm '" + rc + "' (" + R.lemma + ") then '" + dc + "'");
  }
}
console.log("\ncounts: roots=" + Object.keys(d.roots).length + " chord_map=" + Object.keys(d.chord_map).length +
  " flat_chords=" + Object.keys(d.flat_chords).length + " dict=" + d.steno_dictionary.length +
  " word_visuals=" + Object.keys(d.word_visuals).length + " english_to_chinese=" + Object.keys(d.english_to_chinese).length);

if (WRITE) {
  // Never write a file that breaks an invariant - checked on the in-memory result
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
  fs.writeFileSync(DATA_FILE, JSON.stringify(d, null, 2).replace(/\n/g, "\r\n"), "utf8");
  console.log("WROTE " + DATA_FILE + "\nbackup: " + backup);
} else {
  console.log("\n(dry run - nothing written. add --write to apply)");
}
