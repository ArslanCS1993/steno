#!/usr/bin/env node
/**
 * validate.js — integrity checks for data.json.
 *
 * The question this exists to answer: could an ENGLISH chord (which may carry a
 * disambiguating digit) ever occupy the same chord string as a CHINESE character
 * (whose chord always starts with a tone digit)?
 *
 * Why it needs checking at all: chord_map is a plain object, so one key holds
 * exactly one value. If two words were assigned the same chord, the second
 * silently overwrites the first - no error, no warning, the word just becomes
 * untypeable. Nothing in the tutor can detect that at runtime.
 *
 * The generators run validate() on the in-memory object BEFORE writing, so a
 * file that would break an invariant is never written. Run it standalone to
 * check the file on disk (exits 1 on failure, so it can gate a commit).
 *
 * Usage:  node validate.js
 *         const { validate } = require("./validate");
 */

const fs = require("fs");
const path = require("path");

const isZh = s => /[\u4e00-\u9fff]/.test(String(s));
const N = s => String(s).trim();
const oneChar = s => [...String(s)].length === 1;

// English scheme: thumbs idle, b on Left Index, n on Right Index
const EN = { "left-pinky": "1qaz", "left-ring": "2wsx", "left-middle": "3edc", "left-index": "45rfvtgb", "right-index": "67yhujmn", "right-middle": "8ik,", "right-ring": "9ol.", "right-pinky": "0p;/'" };
// Chinese scheme: thumbs carry b,v,c and n
const ZH = { "left-pinky": "1qaz", "left-ring": "2wsx", "left-middle": "3ed", "left-index": "45rftg", "left-thumb": "bvc", "right-thumb": "n", "right-index": "67yhujm", "right-middle": "8ik,", "right-ring": "9ol.", "right-pinky": "0p;/'" };
const build = m => { const o = {}; for (const [f, ks] of Object.entries(m)) for (const k of ks) o[k] = f; return o; };
const K2F_EN = build(EN), K2F_ZH = build(ZH);

function physical(chord, K2F) {
  if (!chord) return false;
  const seen = new Set();
  for (const ch of chord) {
    const f = K2F[ch];
    if (!f || seen.has(f)) return false;
    seen.add(f);
  }
  return true;
}

function validate(d) {
  const problems = [];   // blocking
  const warnings = [];   // informational, non-blocking
  const info = {};

  const zh = new Map();
  for (const [c, v] of Object.entries(d.chinese_chords || {})) {
    if (zh.has(c)) problems.push("duplicate chord inside chinese_chords: '" + c + "'");
    zh.set(c, v.char);
  }
  const en = new Map();
  for (const [c, v] of Object.entries(d.chord_map || {})) if (!isZh(v)) en.set(c, N(v));

  info.chineseChords = zh.size;
  info.englishChords = en.size;
  info.chordMap = Object.keys(d.chord_map || {}).length;

  // 1. cross-language collision: one chord string claimed by both namespaces
  for (const c of zh.keys()) {
    if (en.has(c)) problems.push("SHARED chord '" + c + "' -> chinese:" + zh.get(c) + " and english:" + en.get(c));
  }

  // 2. every chinese character reachable and not shadowed
  for (const [c, v] of Object.entries(d.chinese_chords || {})) {
    if (!(c in d.chord_map)) problems.push("untypeable chinese '" + c + "' (" + v.char + ") missing from chord_map");
    else if (N(d.chord_map[c]) !== v.char) problems.push("SHADOWED chinese '" + c + "' (" + v.char + ") - chord_map holds '" + N(d.chord_map[c]) + "'");
  }

  // 2b. the other direction: a chord pointing at a SINGLE chinese character must
  // itself be a chinese_chords key. Without this a re-keyed character leaves its
  // old chord behind as a silently working alias (为 moved 4eiw -> 2ei).
  // Scoped to single characters on purpose: multi-character compounds
  // (目标, 什么, 打字) legitimately live only in chord_map.
  let stale = 0;
  for (const [c, v] of Object.entries(d.chord_map || {})) {
    const ch = N(v);
    if (!isZh(ch) || !oneChar(ch)) continue;
    if (!(c in (d.chinese_chords || {}))) { stale++; problems.push("stale chinese alias '" + c + "' -> " + ch + " (single character with no chinese_chords entry)"); }
  }
  info.staleAliases = stale;

  // 3. chord_map vs the legacy flat_chords mirror
  let drift = 0;
  for (const [c, v] of Object.entries(d.flat_chords || {})) {
    const cm = d.chord_map[c];
    if (cm === undefined) continue;
    if (N(cm) !== N(v)) {
      drift++;
      const cross = isZh(cm) !== isZh(v);
      problems.push((cross ? "CROSS-LANGUAGE DRIFT " : "flat_chords drift ") + "'" + c + "': chord_map='" + N(cm) + "' vs flat_chords='" + N(v) + "'");
    }
  }
  info.drift = drift;

  // 4. nothing may collide with the inflection tap digits 1-4
  let singles = 0;
  for (const c of Object.keys(d.chord_map || {})) if (c.length === 1) { singles++; problems.push("single-key chord '" + c + "' -> " + N(d.chord_map[c]) + " (collides with the tap digits)"); }
  info.singleKeyChords = singles;

  // ---- informational only: pre-existing backlog, must NOT block a write
  let impossibleEn = 0;
  for (const c of en.keys()) if (!physical(c, K2F_EN)) impossibleEn++;
  for (const [rc, R] of Object.entries(d.roots || {})) {
    if (!physical(rc, K2F_EN)) impossibleEn++;
    for (const dc of Object.keys(R.derivatives || {})) if (!physical(dc, K2F_EN)) impossibleEn++;
  }
  let impossibleZh = 0;
  for (const c of zh.keys()) if (!physical(c, K2F_ZH)) impossibleZh++;
  let rootsMissing = 0;
  for (const rc of Object.keys(d.roots || {})) if (!(rc in (d.chord_map || {}))) rootsMissing++;

  info.englishImpossible = impossibleEn;
  info.chineseImpossible = impossibleZh;
  info.rootsMissingFromChordMap = rootsMissing;

  // 6. GRAMMAR: a root's part of speech decides which inflections it may carry.
  //
  // This is the rule that keeps mechanically invented forms such as
  // whened / whening / whying out of the dictionary. `function` words (when,
  // where, not, if) have NO slots at all, so nothing may ever inflect them.
  //
  // Illegal inflections BLOCK a write. The older backlog - a bare inflection
  // suffix smuggled into `derivatives` instead of `inflections` - is reported
  // as a warning so the generators keep working while it is cleaned up.
  const ALLOWED = {
    verb: new Set(['Past Tense (-ed)', 'Continuous (-ing)', '3rd Person (-s)', 'Past Participle (-en)',
      'Past Participle', 'Present Participle (-ing)', '1st Person Singular Present',
      '2nd Person or Plural Present', '3rd Person Singular Present', 'Past Tense (Singular)',
      'Past Tense (Plural/Subjunctive)', 'Contraction']),
    noun: new Set(['Plural (-s)', 'Plural', "Possessive ('s)", "Plural Possessive (s')"]),
    adjective: new Set(['Comparative (-er)', 'Superlative (-est)', 'Adverb (-ly)']),
    pronoun: new Set(['Objective Case', 'Possessive Case', 'Reflexive Case', 'Possessive Pronoun']),
    function: new Set(), bound: new Set(), chinese: new Set(), junk: new Set(),
  };
  const BARE_INFLECTION = /^-(e?d|ing|s|en|er|est|ly)$/;
  const byPos = {};
  const grammar = { missingPos: 0, badPos: 0, illegalInflection: 0, inventedInflection: 0, bareInflectionDerivative: 0, unlabelledDerivative: 0, inflectedLemma: 0, junkRoots: 0 };
  for (const [rc, R] of Object.entries(d.roots || {})) {
    const pos = R.pos;
    byPos[pos || '(none)'] = (byPos[pos || '(none)'] || 0) + 1;
    if (!pos) { grammar.missingPos++; problems.push("root '" + rc + "' (" + R.lemma + ") has no pos"); continue; }
    if (!Object.prototype.hasOwnProperty.call(ALLOWED, pos)) { grammar.badPos++; problems.push("root '" + rc + "' has unknown pos '" + pos + "'"); continue; }
    if (pos === 'junk') grammar.junkRoots++;
    for (const [slot, inf] of Object.entries(R.inflections || {})) {
      const label = (inf && inf.morpheme) || '';
      if (!ALLOWED[pos].has(label)) {
        grammar.illegalInflection++;
        problems.push("ILLEGAL INFLECTION: " + pos + " '" + R.lemma + "' slot " + slot + " -> '" + label + "'" +
          (ALLOWED[pos].size === 0 ? "  (pos '" + pos + "' never inflects)" : ""));
      }
    }
    for (const der of Object.values(R.derivatives || {})) {
      const m = (der && der.morpheme) || '';
      if (BARE_INFLECTION.test(m)) {
        // THE `whened` RULE. If the pos can never inflect (function/bound/
        // chinese/junk) then a verb suffix is not a derivational morpheme at
        // all - it is an invented inflection, and it BLOCKS a write.
        // Only the verb suffixes: -er/-est also build real words from
        // prepositions (up -> upper), and -s builds adverbs (to -> towards),
        // so those stay warnings rather than hard errors.
        if (ALLOWED[pos].size === 0 && /^-(ed|ing|d|es|en)$/.test(m)) {
          grammar.inventedInflection++;
          problems.push("INVENTED INFLECTION: '" + R.lemma + "' (" + pos + ", never inflects) -> '" + der.word + "' [" + m + "]");
        } else {
          grammar.bareInflectionDerivative++;
          if (grammar.bareInflectionDerivative <= 5) warnings.push("inflection stored as derivative: '" + R.lemma + "' -> '" + der.word + "' [" + m + "] - move it to inflections");
        }
      }
      if (m && m.toLowerCase() === String(der.word).toLowerCase()) {
        // the morpheme label just repeats the word (be- became 'become')
        grammar.unlabelledDerivative++;
        if (grammar.unlabelledDerivative <= 5) warnings.push("unlabelled derivative morpheme: '" + R.lemma + "' -> '" + der.word + "' (the morpheme should be the affix, e.g. 'be-')");
      }
    }
    if (/(ed|ing)$/.test(String(R.lemma))) grammar.inflectedLemma++;
  }
  info.grammar = grammar;
  info.posDistribution = byPos;

  return { problems, warnings, info };
}

module.exports = { validate, physical, K2F_EN, K2F_ZH };

// ------------------------------------------------------------------- CLI
if (require.main === module) {
  const d = JSON.parse(fs.readFileSync(path.join(__dirname, "data.json"), "utf8"));
  const { problems, warnings, info } = validate(d);

  console.log("=== validate.js ===");
  console.log("chinese chords: " + info.chineseChords + "   english chords: " + info.englishChords + "   chord_map: " + info.chordMap);

  console.log("\n[1] cross-language chord collision (english digit vs chinese tone digit)");
  console.log("  shared chord strings: " + problems.filter(p => p.startsWith("SHARED")).length);

  console.log("\n[2] chinese reachable & unshadowed");
  console.log("  untypeable: " + problems.filter(p => p.startsWith("untypeable")).length +
    "   shadowed: " + problems.filter(p => p.startsWith("SHADOWED")).length);
  console.log("  stale single-character aliases: " + info.staleAliases);

  console.log("\n[3] chord_map vs flat_chords mirror drift");
  console.log("  disagreements: " + info.drift);

  console.log("\n[4] physical validity, per language scheme");
  console.log("  chinese chords impossible under the chinese map: " + info.chineseImpossible);
  console.log("  english/root chords impossible under the english map: " + info.englishImpossible + "  (the b/n-move backlog)");

  console.log("\n[5] chords colliding with the inflection taps 1-4");
  console.log("  single-key chords: " + info.singleKeyChords);

  const g = info.grammar || {};
  console.log("\n[6] GRAMMAR - part of speech governs inflection");
  console.log("  roots by pos: " + Object.entries(info.posDistribution || {}).sort((a, b) => b[1] - a[1]).map(([k, v]) => k + "=" + v).join("  "));
  console.log("  roots missing a pos:            " + g.missingPos);
  console.log("  illegal inflections for the pos: " + g.illegalInflection + "   (blocking)");
  console.log("  invented inflections on a word that never inflects: " + g.inventedInflection + "   (blocking - the 'whened' rule)");
  console.log("  inflection kept as derivative:   " + g.bareInflectionDerivative + "   (warning)");
  console.log("  unlabelled derivative morphemes: " + g.unlabelledDerivative);
  console.log("  root lemmas that are inflected:  " + g.inflectedLemma);
  console.log("  roots flagged as junk lemmas:    " + g.junkRoots);

  console.log("\n[info, non-blocking] roots-tree roots missing from chord_map: " + info.rootsMissingFromChordMap);

  console.log("\n=== summary ===");
  console.log("problems: " + problems.length);
  problems.slice(0, 20).forEach(p => console.log("  ! " + p));
  if (problems.length > 20) console.log("  ... " + (problems.length - 20) + " more");
  console.log("warnings: " + warnings.length);
  warnings.forEach(w => console.log("  ~ " + w));
  console.log("\n" + (problems.length === 0 ? "PASS" : "FAIL - see problems above."));
  process.exit(problems.length ? 1 : 0);
}
