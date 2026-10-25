#!/usr/bin/env node
/**
 * addchinese.js — Chinese character chords, under a CHINESE-SPECIFIC finger map.
 *
 * Chinese uses the thumbs, which the English scheme leaves idle:
 *
 *   ENGLISH scheme            CHINESE scheme
 *   Left Index  45rfvtgb      Left Index  45rftg     (b, v moved off)
 *   Left Middle 3edc          Left Middle 3ed       (c moved off)
 *   Left Thumb  (idle)        Left Thumb  bvc       <- pressed with the left thumb
 *   Right Index 67yhujmn      Right Index 67yhujm   (n moved off)
 *   Right Thumb (idle)        Right Thumb n         <- pressed with the right thumb
 *
 * b/v/c/n are exactly the disambiguating letters, so putting them on the thumbs
 * keeps them free: no tone digit lives on a thumb. On the English map v shares
 * Left Index with tone 4, which is why 现 could never be '4xianv' there.
 *
 * Chord rule:  chord = <tone digit> + <pinyin letters, deduped, sorted>
 *              letters clashing with the tone digit's finger are dropped.
 * Collision:   append a disambiguating LETTER - never a digit - trying
 *              v, then c, then n, taking the first whose finger is free.
 *
 * Ownership: characters are rebuilt in their ORIGINAL stored order, so a
 * character that already owned a natural chord keeps it (限 keeps 4ainx, so
 * 现 takes 4ainvx). A character that is also a roots-tree root keeps that
 * root's chord, because the tree owns it.
 *
 * Usage:  node addchinese.js            # dry run
 *         node addchinese.js --write    # apply (timestamped backup)
 */

const fs = require("fs");
const path = require("path");

const DATA_FILE = path.join(__dirname, "data.json");
const WRITE = process.argv.includes("--write");

const ZH_FINGER_MAP = {
  "left-pinky": "1qaz",
  "left-ring": "2wsx",
  "left-middle": "3ed",
  "left-index": "45rftg",
  "left-thumb": "bvc",
  "right-thumb": "n",
  "right-index": "67yhujm",
  "right-middle": "8ik,",
  "right-ring": "9ol.",
  "right-pinky": "0p;/'",
};
const K2F = {};
for (const [f, ks] of Object.entries(ZH_FINGER_MAP)) for (const k of ks) K2F[k] = f;

const DISAMBIG = ["v", "c", "n"];            // tried in this exact order
const FALLBACK = "etaoinshrdlumfwypkgjqxz".split("");
const canon = c => [...c].sort().join("");
const physical = c => { const s = new Set(); for (const ch of c) { const f = K2F[ch]; if (!f || s.has(f)) return false; s.add(f); } return true; };
const usedOf = c => { const o = {}; for (const ch of c) o[K2F[ch]] = ch; return o; };
const hexToGlow = h => { const n = parseInt(h.slice(1), 16); return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, 0.4)`; };
const norm = p => String(p).normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/ü/g, "u").replace(/[^a-zA-Z]/g, "").toLowerCase();
const isChinese = s => /[\u4e00-\u9fff]/.test(String(s));
const oneChar = s => [...String(s)].length === 1;

const NEW_ENTRIES = [
  { char: "作", pinyin: "zuò", tone: 4, en: "do / make",   emoji: "🔨", bg: "#f59e0b" },
  { char: "一", pinyin: "yī",  tone: 1, en: "one",          emoji: "1️⃣", bg: "#6366f1" },
  { char: "门", pinyin: "mén", tone: 2, en: "measure word", emoji: "🚪", bg: "#8b5cf6" },
  { char: "现", pinyin: "xiàn", tone: 4, en: "present",     emoji: "⏱️", bg: "#0ea5e9" },
  { char: "代", pinyin: "dài", tone: 4, en: "era",          emoji: "🕰️", bg: "#14b8a6" },
  { char: "化", pinyin: "huà", tone: 4, en: "-ize",         emoji: "🔄", bg: "#ec4899" },
  { char: "系", pinyin: "xì",  tone: 4, en: "system",       emoji: "🧬", bg: "#22c55e" },
  { char: "统", pinyin: "tǒng", tone: 3, en: "whole",       emoji: "🧩", bg: "#a855f7" },
  { char: "编", pinyin: "biān", tone: 1, en: "compile",     emoji: "🧵", bg: "#f97316" },
  { char: "程", pinyin: "chéng", tone: 2, en: "procedure",  emoji: "📋", bg: "#3b82f6" },
  { char: "语", pinyin: "yǔ",  tone: 3, en: "language",     emoji: "🗣️", bg: "#ef4444" },
  { char: "言", pinyin: "yán", tone: 2, en: "speech",       emoji: "💬", bg: "#64748b" },
  { char: "拥", pinyin: "yōng", tone: 1, en: "hold / have", emoji: "🤗", bg: "#f472b6" },
  { char: "类", pinyin: "lèi",  tone: 4, en: "kind / type",  emoji: "🗂️", bg: "#0891b2" },
  { char: "似", pinyin: "sì",   tone: 4, en: "similar / like", emoji: "🟰", bg: "#7c3aed" },
  { char: "性", pinyin: "xìng", tone: 4, en: "nature / property", emoji: "⚙️", bg: "#b45309" },
  // --- requested additions (only the ones not already in chinese_chords) ---
  { char: "与", pinyin: "yǔ",    tone: 3, en: "and / with",        emoji: "➕", bg: "#f59e0b" },
  { char: "同", pinyin: "tóng",  tone: 2, en: "same / together",   emoji: "🫂", bg: "#0ea5e9" },
  { char: "又", pinyin: "yòu",   tone: 4, en: "again / also",      emoji: "🔁", bg: "#8b5cf6" },
  { char: "非", pinyin: "fēi",   tone: 1, en: "not / non-",        emoji: "❌", bg: "#ef4444" },
  { char: "常", pinyin: "cháng", tone: 2, en: "often / constant",  emoji: "♾️", bg: "#14b8a6" },
  { char: "底", pinyin: "dǐ",    tone: 3, en: "bottom / base",     emoji: "🔽", bg: "#78716c" },
  { char: "层", pinyin: "céng",  tone: 2, en: "layer / floor",     emoji: "🥞", bg: "#f97316" },
  { char: "优", pinyin: "yōu",   tone: 1, en: "excellent",         emoji: "🥇", bg: "#eab308" },
  { char: "因", pinyin: "yīn",   tone: 1, en: "cause / because",   emoji: "💡", bg: "#f59e0b" },
  { char: "此", pinyin: "cǐ",    tone: 3, en: "this / here",       emoji: "⬇️", bg: "#64748b" },
  { char: "适", pinyin: "shì",   tone: 4, en: "suitable / fit",    emoji: "👌", bg: "#22c55e" },
  { char: "合", pinyin: "hé",    tone: 2, en: "join / combine",    emoji: "🔗", bg: "#0891b2" },
  { char: "写", pinyin: "xiě",   tone: 3, en: "write",             emoji: "✍️", bg: "#6366f1" },
  { char: "算", pinyin: "suàn",  tone: 4, en: "calculate",         emoji: "🧮", bg: "#a855f7" },
  { char: "法", pinyin: "fǎ",    tone: 3, en: "method / law",      emoji: "⚖️", bg: "#0369a1" },
  { char: "教", pinyin: "jiào",  tone: 4, en: "teach",             emoji: "📚", bg: "#f59e0b" },
  { char: "涵", pinyin: "hán",   tone: 2, en: "contain / cover",   emoji: "🗃️", bg: "#7c3aed" },
  { char: "盖", pinyin: "gài",   tone: 4, en: "cover / lid",       emoji: "🧢", bg: "#dc2626" },
  { char: "了", pinyin: "le",    tone: 5, en: "completed (particle)", emoji: "🏁", bg: "#475569" },
  { char: "各", pinyin: "gè",    tone: 4, en: "each / various",   emoji: "🌈", bg: "#ec4899" },
  { char: "种", pinyin: "zhǒng", tone: 3, en: "kind / seed",       emoji: "🌾", bg: "#ca8a04" },
  { char: "用", pinyin: "yòng",  tone: 4, en: "use",               emoji: "🧰", bg: "#0ea5e9" },
  { char: "数", pinyin: "shù",   tone: 4, en: "number",            emoji: "#️⃣", bg: "#6366f1" },
  { char: "据", pinyin: "jù",    tone: 4, en: "according to / data", emoji: "📊", bg: "#0284c7" },
  { char: "结", pinyin: "jié",   tone: 2, en: "tie / knot / result", emoji: "🎀", bg: "#db2777" },
  { char: "构", pinyin: "gòu",   tone: 4, en: "structure / construct", emoji: "🏗️", bg: "#b45309" },
  { char: "实", pinyin: "shí",   tone: 2, en: "real / solid",      emoji: "🧱", bg: "#b91c1c" },
  { char: "以", pinyin: "yǐ",    tone: 3, en: "by means of",       emoji: "➡️", bg: "#0891b2" },
  { char: "及", pinyin: "jí",    tone: 2, en: "and / reach",       emoji: "🧲", bg: "#f59e0b" },
  { char: "题", pinyin: "tí",    tone: 2, en: "topic / question",  emoji: "🧾", bg: "#7c3aed" },
  { char: "解", pinyin: "jiě",   tone: 3, en: "solve / untie",     emoji: "🔓", bg: "#22c55e" },
  { char: "对", pinyin: "duì",   tone: 4, en: "correct / toward",  emoji: "✔️", bg: "#16a34a" },
  { char: "于", pinyin: "yú",    tone: 2, en: "at / to (prep)",   emoji: "🔹", bg: "#64748b" },
  { char: "相", pinyin: "xiāng", tone: 1, en: "mutual / appearance", emoji: "🪞", bg: "#06b6d4" },
  { char: "还", pinyin: "hái",   tone: 2, en: "still / return",    emoji: "↩️", bg: "#f59e0b" },
  { char: "提", pinyin: "tí",    tone: 2, en: "lift / raise",      emoji: "🏋️", bg: "#dc2626" },
  { char: "供", pinyin: "gōng",  tone: 1, en: "provide / supply",  emoji: "📤", bg: "#0891b2" },
  { char: "中", pinyin: "zhōng", tone: 1, en: "middle / China",    emoji: "🀄", bg: "#dc2626" },
  { char: "文", pinyin: "wén",   tone: 2, en: "writing / culture", emoji: "📜", bg: "#a16207" },
  { char: "注", pinyin: "zhù",   tone: 4, en: "note / annotate",   emoji: "🔖", bg: "#7c3aed" },
  { char: "释", pinyin: "shì",   tone: 4, en: "explain / release", emoji: "🔍", bg: "#0ea5e9" },
  { char: "可", pinyin: "kě",    tone: 3, en: "can / may",         emoji: "🆗", bg: "#22c55e" },
  { char: "帮", pinyin: "bāng",  tone: 1, en: "help",              emoji: "🛟", bg: "#f97316" },
  { char: "助", pinyin: "zhù",   tone: 4, en: "assist",            emoji: "🆘", bg: "#ef4444" },
  { char: "家", pinyin: "jiā",   tone: 1, en: "home / family",     emoji: "🏡", bg: "#16a34a" },
  { char: "更", pinyin: "gèng",  tone: 4, en: "more / change",     emoji: "📈", bg: "#22c55e" },
  { char: "好", pinyin: "hǎo",   tone: 3, en: "good",              emoji: "😊", bg: "#f59e0b" },
  { char: "学", pinyin: "xué",   tone: 2, en: "study",             emoji: "🏫", bg: "#6366f1" },
  { char: "习", pinyin: "xí",    tone: 2, en: "practice",          emoji: "🗓️", bg: "#8b5cf6" },
];

const d = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));

// --------------------------------------------------------- who owns what
// roots tree: a single-character Chinese root owns its chord
const zhRootChord = {};
for (const [rc, R] of Object.entries(d.roots)) if (isChinese(R.lemma) && oneChar(R.lemma)) zhRootChord[R.lemma] = rc;

// original stored order, so existing owners keep their natural chords
const work = new Map();
for (const v of Object.values(d.chinese_chords)) if (!work.has(v.char)) work.set(v.char, { char: v.char, pinyin: v.pinyin, tone: v.tone, en: v.english });
for (const e of NEW_ENTRIES) if (!work.has(e.char)) work.set(e.char, { char: e.char, pinyin: e.pinyin, tone: e.tone, en: e.en });
const order = [...work.keys()];

const nonChineseChordMap = Object.keys(d.chord_map).length - Object.values(d.chord_map).filter(isChinese).length;

// ------------------------------------------------------------ release chords
const oldChordOf = {};
for (const [c, v] of Object.entries(d.chinese_chords)) oldChordOf[v.char] = c;
for (const [c, v] of Object.entries(d.chinese_chords)) {
  delete d.chinese_chords[c];
  if (String(d.chord_map[c] || "").trim() === v.char) delete d.chord_map[c];
  if (String(d.flat_chords[c] || "").trim() === v.char) delete d.flat_chords[c];
}
// NOTE: the training list is deliberately NOT rebuilt. STENO_DICTIONARY drives
// Training Mode order, so existing rows are updated IN PLACE further down and
// only genuinely new characters are appended. Rebuilding it would silently
// reshuffle the training sequence on every run.

console.log("=== addchinese (rebuild, thumbs on) " + (WRITE ? "WRITE" : "dry run") + " ===");
console.log("Chinese finger map:");
for (const [f, ks] of Object.entries(ZH_FINGER_MAP)) console.log("  " + f.padEnd(14) + ks);
console.log("\ncharacters to rebuild: " + order.length);
console.log("kept from the roots tree (tree owns the chord): " + (Object.keys(zhRootChord).filter(c => work.has(c)).join(" ") || "none"));

const taken = new Map();
for (const [c, v] of Object.entries(d.chord_map)) taken.set(c, "chord_map=" + String(v).trim());
for (const c of Object.keys(d.roots)) if (!taken.has(c)) taken.set(c, "root=" + d.roots[c].lemma);

// Tone digit -> its partner on the OTHER hand. The tutor's mirror is
// bidirectional, so a chord may carry either hand's digit and still be reachable.
const TONE_PARTNER = { "1": "0", "0": "1", "2": "9", "9": "2", "3": "8", "8": "3", "4": "7", "7": "4" };

// LETTERS claim fingers FIRST, then the tone digit is placed on whichever of the
// two partner fingers is still free. Trying both and keeping the candidate that
// retains more letters is what lets 为 hold its w and 性 hold its g:
//   为 wéi  - 2 and w are both Left Ring, so the w was dropped -> '2ei'.
//             9 is Right Ring, still free -> '9eiw', keys 'wei9'.
//   性 xìng - 4 and g are both Left Index, so the g was dropped -> '4inx'.
//             7 is Right Index, still free -> '7ginx', keys 'xing7'.
function naturalChord(pinyin, tone) {
  const letters = [...norm(pinyin)].filter(c => K2F[c]);
  const digits = [...new Set([String(tone), TONE_PARTNER[String(tone)]])].filter(dg => dg && K2F[dg]);
  const candidates = [];
  for (const digit of digits) {
    const used = { [K2F[digit]]: digit };
    const claimed = [];
    for (const ch of letters) {
      const f = K2F[ch];
      if (f in used) continue;
      used[f] = ch; claimed.push(ch);
    }
    candidates.push({ digit, claimed, chord: canon(claimed.join("") + digit) });
  }
  if (!candidates.length) return { chord: "", claimed: [], digit: String(tone) };
  // most letters kept wins; a tie keeps the character's own tone (sort is stable)
  candidates.sort((a, b) => b.claimed.length - a.claimed.length);
  const best = candidates[0];
  return { chord: best.chord, claimed: best.claimed, digit: best.digit };
}

function makeUnique(base) {
  if (physical(base) && base.length >= 2 && !taken.has(base)) return { chord: base, extra: "" };
  const used = usedOf(base);
  for (const l of DISAMBIG) {
    if (K2F[l] in used) continue;
    const t = canon(base + l);
    if (physical(t) && !taken.has(t)) return { chord: t, extra: l };
  }
  for (const l of FALLBACK) {
    if (DISAMBIG.includes(l) || K2F[l] in used) continue;
    const t = canon(base + l);
    if (physical(t) && !taken.has(t)) return { chord: t, extra: l };
  }
  return null;
}

const results = [];
for (const ch of order) {
  const e = work.get(ch);
  const nat = naturalChord(e.pinyin, e.tone);
  const base = nat.chord;
  let got, fromRoot = false;
  if (zhRootChord[ch]) { got = { chord: zhRootChord[ch], extra: "" }; fromRoot = true; }
  else {
    got = makeUnique(base);
    if (got) taken.set(got.chord, "ZH:" + ch);
  }
  if (!got) { results.push({ ...e, base, skip: "no free chord" }); continue; }
  // `keys` = the keys you actually press, written as pinyin letters then the
  // tone digit (numbers at the end), e.g. 'wei9', 'xing7', 'lei4'. Guarded so it
  // can never name a letter that the chord does not actually contain.
  const spelled = nat.claimed.join("") + got.extra + nat.digit;
  const pressKeys = canon(spelled) === canon(got.chord) ? spelled : got.chord;
  results.push({ ...e, base, chord: got.chord, keys: pressKeys, extra: got.extra, digit: nat.digit, old: oldChordOf[ch], fromRoot });
}

console.log("\nchar  pinyin     tone  natural   chord      keys       note");
for (const r of results) {
  if (r.skip) { console.log(r.char + "     " + r.pinyin.padEnd(10) + r.tone + "     " + r.base.padEnd(10) + "-          -          SKIP"); continue; }
  const keys = r.keys;
  let note;
  if (r.fromRoot) note = "roots-tree chord";
  else if (r.old !== r.chord) note = (r.old ? "was '" + r.old + "'" : "NEW") + (r.extra ? "  +" + r.extra : "");
  else note = r.extra ? "+" + r.extra : "unchanged";
  console.log(r.char + "     " + r.pinyin.padEnd(10) + r.tone + "     " + r.base.padEnd(10) + r.chord.padEnd(11) + keys.padEnd(11) + note);
}

const ok = results.filter(r => !r.skip);
const changed = ok.filter(r => r.old !== r.chord);

if (WRITE) {
  const vismap = {};
  for (const e of NEW_ENTRIES) vismap[e.char] = e;
  for (const r of ok) {
    const keys = r.keys;
    d.chinese_chords[r.chord] = { char: r.char, pinyin: r.pinyin, keys, tone: r.tone, english: r.en };
    d.chord_map[r.chord] = r.char + " ";
    d.flat_chords[r.chord] = r.char + " ";
    d.chinese_to_english[r.char] = r.en;
    if (!d.word_visuals[r.char]) {
      const meta = vismap[r.char] || { emoji: "字", bg: "#6366f1" };
      d.word_visuals[r.char] = { emoji: meta.emoji, bg: meta.bg, glow: hexToGlow(meta.bg), label: r.char + " " + r.pinyin.toUpperCase() };
    }
  }

  // update existing training rows in place; append only new characters
  const rows = new Map(ok.map(r => [r.char, { word: r.char, chord: r.chord, keys: r.keys, note: r.pinyin + " - " + r.en }]));
  const placed = new Set();
  d.steno_dictionary = d.steno_dictionary.map(e => {
    if (isChinese(e.word) && oneChar(e.word) && rows.has(e.word)) { placed.add(e.word); return rows.get(e.word); }
    return e;
  });
  for (const r of ok) if (!placed.has(r.char) && !d.steno_dictionary.some(e => e.word === r.char)) d.steno_dictionary.push(rows.get(r.char));

  // deterministic ordering, so two runs produce a byte-identical file
  const sortKeys = o => { const s = {}; for (const k of Object.keys(o).sort()) s[k] = o[k]; return s; };
  d.chord_map = sortKeys(d.chord_map);
  d.flat_chords = sortKeys(d.flat_chords);
}

console.log("\nrebuilt: " + ok.length + "   changed: " + changed.length + "   skipped: " + results.filter(r => r.skip).length);
const byExtra = {};
for (const r of ok) { const k = r.fromRoot ? "roots-tree chord" : (r.extra || "(natural, no disambiguation)"); byExtra[k] = (byExtra[k] || 0) + 1; }
console.log("\nresolution:");
for (const [k, n] of Object.entries(byExtra)) console.log("  " + k.padEnd(30) + n);

const problems = [];
const seen = new Map();
for (const r of ok) {
  if (!physical(r.chord)) problems.push("IMPOSSIBLE " + r.char + " [" + r.chord + "]");
  if (seen.has(r.chord) && seen.get(r.chord) !== r.char) problems.push("COLLISION " + r.chord + " -> " + seen.get(r.chord) + " / " + r.char);
  else seen.set(r.chord, r.char);
}
console.log("\nproblems: " + problems.length);
problems.slice(0, 10).forEach(p => console.log("  " + p));

console.log("\nexpected after write: chinese_chords=" + ok.length +
  " chord_map=" + (nonChineseChordMap + ok.length) + " dict=" + (d.steno_dictionary.length));

if (WRITE) {
  // Never write a file that breaks an invariant - checked on the in-memory result.
  // This is the check that guarantees a chinese chord can never land on the same
  // string as an english one.
  const { validate } = require("./validate");
  const v = validate(d);
  if (v.problems.length) {
    console.log("\nREFUSING TO WRITE - " + v.problems.length + " validation problem(s):");
    v.problems.slice(0, 15).forEach(p => console.log("  ! " + p));
    process.exit(1);
  }
  console.log("\nvalidate.js: PASS (0 problems)");

  const backup = DATA_FILE + ".bak-" + Date.now();
  fs.copyFileSync(DATA_FILE, backup);
  fs.writeFileSync(DATA_FILE, JSON.stringify(d, null, 2).replace(/\n/g, "\r\n"), "utf8");
  console.log("WROTE " + DATA_FILE + "\nbackup: " + backup);
} else {
  console.log("\n(dry run - nothing written. add --write to apply)");
}
