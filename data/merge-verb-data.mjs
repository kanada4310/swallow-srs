#!/usr/bin/env node
/**
 * merge-verb-data.mjs
 * Parse two verb pattern data files and merge them into a single TSV for SRS import.
 */

import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ─── Helpers ───

function cleanMarkdown(s) {
  return s.replace(/\\_/g, '_').replace(/\\!/g, '!').replace(/\\]/g, ']').trim();
}

function normalizeVerb(verb) {
  // "grow up" -> "grow_up", "look on" -> "look_on", "be aware" -> "be_aware", etc.
  return verb.trim().replace(/\s+/g, '_');
}

// ─── Tag derivation helpers ───

/** Derive 文型 tag from section + subsection context */
function deriveBunkeiFromMd(section) {
  const map = {
    '実はSVO': '文型:SVO',
    'SVC': '文型:SVC',
    'SVOO': '文型:SVOO',
    'SVO_do': '文型:SVOC',
    'SVO_to_do': '文型:SVO+to_do',
    'SVO_as_do': '文型:SVO+as',
  };
  return map[section] || null;
}

function deriveBunkeiFromTsv(unit, subsection) {
  // unit: tell型/say型, rob型/provide型, etc.
  // subsection: V人of～, V人that～, etc.
  if (!subsection) return null;

  const sub = subsection.replace(/\s/g, '');

  if (sub.includes('V人of') || sub.includes('V人of物')) return '文型:SVO+of';
  if (sub.includes('V人that')) return '文型:SVO+that';
  if (sub.includes('V人to～') || sub.includes('V人to do')) return '文型:SVO+to_do';
  if (sub.includes('Vto人that')) return '文型:SV+to人+that';
  if (sub.includes('V人with物')) return '文型:SVO+with';
  if (sub.includes('V人for')) return '文型:SVO+for';
  if (sub.includes('V人from')) return '文型:SVO+from_-ing';
  if (sub.includes('V人into')) return '文型:SVO+into_-ing';
  if (sub.includes('V人outof')) return '文型:SVO+out_of_-ing';
  if (sub.includes('Vthatsshould') || sub.includes('Vthat')) return '文型:V+that_should';
  if (sub.includes('Vof') || sub.includes('Vthat')) return null; // think型 ambiguous
  if (sub.includes('be形容詞of') || sub.includes('besureof') || sub.includes('beconsciousof') ||
      sub.includes('beawareof') || sub.includes('beignorantof') || sub.includes('beproudof') ||
      sub.includes('beashamedof') || sub.includes('beafraidof') || sub.includes('becarefulof')) {
    return '文型:be+形容詞+of';
  }
  if (sub.includes('fillAwithB') || sub.includes('face/confrontAwithB')) return '文型:SVO+with';
  if (sub.includes('apologizeto人for')) return '文型:SVO+for';
  if (sub.includes('begratefulto人for')) return '文型:be+形容詞+for';
  if (sub.includes('criticize人for')) return '文型:SVO+for';
  if (sub.includes('tellAfromB')) return null; // special usage
  if (sub.includes('tellthat')) return null;
  if (sub.includes('besaidto')) return null;
  if (sub.includes('speak＋言語') || sub.includes('speak+言語')) return null;
  if (sub.includes('lend人物') || sub.includes('owe人物') || sub.includes('rent人物')) return '文型:SVOO';
  if (sub.includes('allow人to') || sub.includes('permit人to')) return '文型:SVO+to_do';
  if (sub.includes('forgive人for') || sub.includes('excuse人for')) return '文型:SVO+for';
  if (sub.includes('suspectthat') || sub.includes('doubtthat')) return '文型:V+that';

  return null;
}

function derivePrepositionFromMd(section) {
  const map = {
    'SVO_as_do': '前置詞:as',
  };
  return map[section] || null;
}

function derivePrepositionFromTsv(subsection) {
  if (!subsection) return null;
  const sub = subsection.replace(/\s/g, '');

  if (sub.includes('V人of') || sub.includes('V人of物')) return '前置詞:of';
  if (sub.includes('V人with物')) return '前置詞:with';
  if (sub.includes('V人for') || sub.includes('begratefulto人for') || sub.includes('criticize人for') ||
      sub.includes('forgive人for') || sub.includes('excuse人for')) return '前置詞:for';
  if (sub.includes('V人from')) return '前置詞:from';
  if (sub.includes('V人into')) return '前置詞:into';
  if (sub.includes('V人outof')) return '前置詞:out_of';
  if (sub.includes('Vto人that')) return '前置詞:to';
  if (sub.includes('fillAwithB') || sub.includes('face/confrontAwithB')) return '前置詞:with';
  if (sub.includes('be形容詞of') || sub.includes('besureof') || sub.includes('beconsciousof') ||
      sub.includes('beawareof') || sub.includes('beignorantof') || sub.includes('beproudof') ||
      sub.includes('beashamedof') || sub.includes('beafraidof') || sub.includes('becarefulof')) {
    return '前置詞:of';
  }
  if (sub.includes('apologizeto人for')) return '前置詞:to|前置詞:for';
  if (sub.includes('allow人to') || sub.includes('permit人to')) return '前置詞:to';

  return null;
}

// For .md file: 自動詞vs他動詞 has subsections with verb pairs
// Need to determine 自動詞 or 他動詞 based on verb
const JIDOUSHI_VERBS = new Set(['lie', 'rise', 'grow up', 'sit', 'arise']);
const TADOUSHI_VERBS = new Set(['lay', 'raise', 'bring up', 'seat']);

function deriveBunkeiForJiTa(verb) {
  const v = verb.trim().toLowerCase();
  if (JIDOUSHI_VERBS.has(v)) return '文型:SV';
  if (TADOUSHI_VERBS.has(v)) return '文型:SVO';
  return null;
}

// ─── Parse .md file ───

function parseMdFile(filepath) {
  const content = readFileSync(filepath, 'utf-8');
  const lines = content.split('\n');

  const entries = [];
  let currentSection = null;  // e.g. '自動詞vs他動詞'
  let currentSubsection = null; // e.g. 'lie/lay'
  const seenIds = new Set();

  const sectionMap = {
    '１．自動詞 vs. 他動詞': '自動詞vs他動詞',
    '２．実はSVO': '実はSVO',
    '３．SVC': 'SVC',
    '４．SVOO（give/take型）': 'SVOO',
    '５．SVO do（使役動詞/知覚動詞）': 'SVO_do',
    '５．SVO to do': 'SVO_to_do',
    '５．SVO as do': 'SVO_as_do',
  };

  for (const rawLine of lines) {
    const line = cleanMarkdown(rawLine);

    // Section header: # **１．自動詞 vs. 他動詞**
    const sectionMatch = line.match(/^#\s+\*\*(.+?)\*\*\s*$/);
    if (sectionMatch) {
      const headerText = sectionMatch[1].trim();
      for (const [pattern, sectionName] of Object.entries(sectionMap)) {
        if (headerText.includes(pattern) || headerText === pattern) {
          currentSection = sectionName;
          currentSubsection = null;
          break;
        }
      }
      continue;
    }

    // Subsection header: ## **lie vs. lay**
    const subMatch = line.match(/^##\s+\*\*(.+?)\*\*\s*$/);
    if (subMatch) {
      const subText = subMatch[1].trim();
      // Normalize: "lie vs. lay" -> "lie/lay", "grow up  vs. bring up" -> "grow_up/bring_up"
      currentSubsection = subText
        .replace(/\s+vs\.?\s+/g, '/')
        .replace(/\s*\(vs\.\s*(.+?)\)/g, '/$1')
        .replace(/\s+/g, '_');
      continue;
    }

    // Table row: | id | 日本語文 | 指定動詞 | パーツ | 正答 |
    const tableMatch = line.match(/^\|\s*(.+?)\s*\|\s*(.+?)\s*\|\s*(.+?)\s*\|\s*(.+?)\s*\|\s*(.+?)\s*\|/);
    if (tableMatch) {
      const [, col1, col2, col3, col4, col5] = tableMatch;

      // Skip header rows and separator rows
      if (col1.includes(':') && col1.includes('-')) continue;
      if (col2.includes('日本語文') || col2.includes('-----')) continue;
      if (col1.trim() === '' && col2.includes('日本語文')) continue;

      const id = col1.trim();
      if (!id || id === '' || id.includes('---')) continue;

      // Skip duplicate IDs within .md
      if (seenIds.has(id)) {
        console.log(`  [md dup] Skipping duplicate ID within .md: ${id}`);
        continue;
      }
      seenIds.add(id);

      const jpText = col2.trim();
      const verb = col3.trim();
      const parts = col4.trim();
      const answer = col5.trim();

      // Build tags
      const tags = [];

      // Section tag
      if (currentSection) tags.push(currentSection);

      // Subsection tag
      if (currentSubsection) tags.push(currentSubsection);

      // Verb tag
      if (verb && verb !== '－') {
        tags.push('v:' + normalizeVerb(verb));
      }

      // 文型 tag
      if (currentSection === '自動詞vs他動詞') {
        const bunkei = deriveBunkeiForJiTa(verb);
        if (bunkei) tags.push(bunkei);
      } else {
        const bunkei = deriveBunkeiFromMd(currentSection);
        if (bunkei) tags.push(bunkei);
      }

      // 前置詞 tag
      const prep = derivePrepositionFromMd(currentSection);
      if (prep) tags.push(prep);

      // SVO_to_do section: add 前置詞:to
      if (currentSection === 'SVO_to_do') {
        tags.push('前置詞:to');
      }

      entries.push({
        id,
        jp: jpText,
        verb,
        parts,
        answer,
        tags: tags.join('|'),
        source: 'md',
        section: currentSection,
        sectionOrder: Object.keys(sectionMap).findIndex(k => sectionMap[k] === currentSection),
      });
    }
  }

  return entries;
}

// ─── Parse TSV file ───

function parseTsvFile(filepath) {
  const content = readFileSync(filepath, 'utf-8');
  const lines = content.split('\n');

  const entries = [];
  let currentUnit = null;     // e.g. 'tell型/say型'
  let currentSubsection = null; // e.g. 'V人of～'
  let unitOrder = 0;

  const unitMap = {
    'UNIT 1': 'tell型/say型',
    'UNIT 2': 'rob型/provide型',
    'UNIT 3': 'thank型/persuade型/prevent型',
    'UNIT 4': 'suggest型/think型',
    'UNIT 5': '言う・貸す借りるの識別',
    'UNIT 6': 'その他の語法',
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trimEnd();
    if (!line) continue;

    const cols = line.split('\t');

    // Skip header row
    if (cols[0] === 'ID') continue;

    // Check for UNIT header (only col1 has content)
    const isUnitHeader = cols[0].startsWith('UNIT') && (!cols[1] || cols[1].trim() === '') && (!cols[3] || cols[3].trim() === '');
    if (isUnitHeader) {
      for (const [prefix, unitName] of Object.entries(unitMap)) {
        if (cols[0].startsWith(prefix)) {
          currentUnit = unitName;
          currentSubsection = null;
          unitOrder++;
          break;
        }
      }
      continue;
    }

    // Check for subsection header (only col1 has content, not a UNIT header, and doesn't have all 5 cols)
    const isSubsectionHeader = cols[0].trim() !== '' &&
      (!cols[1] || cols[1].trim() === '') &&
      (!cols[3] || cols[3].trim() === '') &&
      !cols[0].startsWith('UNIT');
    if (isSubsectionHeader) {
      currentSubsection = normalizeSubsection(cols[0].trim());
      continue;
    }

    // Data row: must have 5 columns
    if (cols.length < 5) continue;
    const [id, jp, verb, parts, answer] = cols.map(c => c.trim());
    if (!id || !jp || !answer) continue;

    // Build tags
    const tags = [];

    // Section tag
    if (currentUnit) tags.push(currentUnit);

    // Subsection tag
    if (currentSubsection) tags.push(currentSubsection);

    // Verb tag
    if (verb && verb !== '－') {
      tags.push('v:' + normalizeVerb(verb));
    }

    // 文型 tag
    const bunkei = deriveBunkeiFromTsvEntry(currentUnit, currentSubsection, verb, id);
    if (bunkei) tags.push(bunkei);

    // 前置詞 tag
    const prep = derivePrepositionFromTsvEntry(currentSubsection, verb, id);
    if (prep) {
      for (const p of prep.split('|')) {
        tags.push(p);
      }
    }

    entries.push({
      id,
      jp,
      verb,
      parts,
      answer,
      tags: tags.join('|'),
      source: 'tsv',
      section: currentUnit,
      sectionOrder: 100 + unitOrder,  // TSV units come after md sections
    });
  }

  return entries;
}

function normalizeSubsection(raw) {
  // "V 人 of ～" -> "V人of～"
  // "fill A with B" -> "fillAwithB"
  // "be sure of ～" -> "be_sure_of"
  // "apologize to 人 for ～" -> "apologize_to人for～"
  // "tell A from B" -> "tellAfromB"

  // Map certain patterns to clean tag names
  const subMap = [
    [/^V\s+人\s+of\s+～$/i, 'V人of～'],
    [/^V\s+人\s+of\s+物$/i, 'V人of物'],
    [/^V\s+人\s+that\s+～$/i, 'V人that～'],
    [/^V\s+人\s+to\s+～$/i, 'V人to～'],
    [/^V\s+to\s+人\s+that\s+～$/i, 'Vto人that～'],
    [/^V\s+人\s+with\s+物$/i, 'V人with物'],
    [/^V\s+人\s+for\s+～$/i, 'V人for～'],
    [/^V\s+人\s+into\s+-ing$/i, 'V人into-ing'],
    [/^V\s+人\s+out\s+of\s+-ing$/i, 'V人out_of-ing'],
    [/^V\s+人\s+from\s+-ing$/i, 'V人from-ing'],
    [/^V\s+that\s+s\s+should\s+原形／原形$/i, 'V_that_should'],
    [/^V\s+that\s+s\s+should$/i, 'V_that_should'],
    [/^V\s+of\s+名詞／V\s+that\s+sv$/i, 'V_of/V_that'],
    [/^fill\s+A\s+with\s+B$/i, 'fillAwithB'],
    [/^face\s*\/\s*confront\s+A\s+with\s+B$/i, 'face/confrontAwithB'],
    [/^apologize\s+to\s+人\s+for\s+～$/i, 'apologize_to人for～'],
    [/^be\s+grateful\s+to\s+人\s+for\s+～$/i, 'be_grateful_to人for～'],
    [/^criticize\s+人\s+for\s+～$/i, 'criticize人for～'],
    [/^be\s+sure\s+of\s+～$/i, 'be_sure_of'],
    [/^be\s+conscious\s+of\s+～$/i, 'be_conscious_of'],
    [/^be\s+aware\s+of\s+～$/i, 'be_aware_of'],
    [/^be\s+ignorant\s+of\s+～$/i, 'be_ignorant_of'],
    [/^be\s+proud\s+of\s+～$/i, 'be_proud_of'],
    [/^be\s+ashamed\s+of\s+～$/i, 'be_ashamed_of'],
    [/^be\s+afraid\s+of\s+～$/i, 'be_afraid_of'],
    [/^be\s+careful\s+of\s+～$/i, 'be_careful_of'],
    [/^tell\s+A\s+from\s+B$/i, 'tellAfromB'],
    [/^tell\s+that\s+～.*$/i, 'tell_that'],
    [/^be\s+said\s+to\s+.*$/i, 'be_said_to'],
    [/^speak\s*＋\s*言語$/i, 'speak+言語'],
    [/^lend\s+人\s+物$/i, 'lend人物'],
    [/^owe\s+人\s+物$/i, 'owe人物'],
    [/^rent\s+人\s+物.*$/i, 'rent人物'],
    [/^allow\s+人\s+to\s+～.*$/i, 'allow人to～'],
    [/^permit\s+人\s+to\s+～.*$/i, 'permit人to～'],
    [/^forgive\s+人\s+for\s+～.*$/i, 'forgive人for～'],
    [/^excuse\s+人\s+for\s+～.*$/i, 'excuse人for～'],
    [/^suspect\s+that\s+～$/i, 'suspect_that'],
    [/^doubt\s+that\s+～$/i, 'doubt_that'],
    [/^人\s+hit\s+on.*come\s+up\s+with\s+考え$/i, 'hit_on/come_up_with'],
    [/^考え\s+occur\s+to\s+人／考え\s+strike\s+人$/i, 'occur_to/strike'],
    [/^出来事\s+happen\s+to\s+人$/i, 'happen_to人'],
    [/^happen\s+to\s+V.*$/i, 'happen_to_V'],
    [/^物\s+suit\s+人／物\s+become\s+人$/i, 'suit/become'],
    [/^物\s+match\s+物／物\s+go\s+with\s+物$/i, 'match/go_with'],
    [/^borrow.*$/i, 'borrow'],
    [/^hire.*$/i, 'hire'],
    [/^use.*$/i, 'use'],
  ];

  for (const [re, tag] of subMap) {
    if (re.test(raw)) return tag;
  }

  // Fallback: just collapse spaces
  return raw.replace(/\s+/g, '_');
}

function deriveBunkeiFromTsvEntry(unit, subsection, verb, id) {
  if (!subsection) return null;
  const sub = subsection;

  // tell型/say型
  if (sub === 'V人of～') return '文型:SVO+of';
  if (sub === 'V人that～') return '文型:SVO+that';
  if (sub === 'V人to～') return '文型:SVO+to_do';
  if (sub === 'Vto人that～') return '文型:SV+to人+that';
  if (sub === 'apologize_to人for～') return '文型:SVO+for';

  // rob型/provide型
  if (sub === 'V人of物') return '文型:SVO+of';
  if (sub === 'V人with物') return '文型:SVO+with';
  if (sub === 'fillAwithB' || sub === 'face/confrontAwithB') return '文型:SVO+with';

  // thank型/persuade型/prevent型
  if (sub === 'V人for～' || sub === 'be_grateful_to人for～' || sub === 'criticize人for～') return '文型:SVO+for';
  if (sub === 'V人into-ing') return '文型:SVO+into_-ing';
  if (sub === 'V人out_of-ing') return '文型:SVO+out_of_-ing';
  if (sub === 'V人from-ing') return '文型:SVO+from_-ing';

  // suggest型
  if (sub === 'V_that_should') return '文型:V+that_should';
  if (sub === 'V_of/V_that') return null; // ambiguous

  // be 形容詞 of ～
  if (sub.startsWith('be_') && sub.endsWith('_of')) return '文型:be+形容詞+of';

  // Unit 5 patterns
  if (sub === 'lend人物' || sub === 'owe人物' || sub === 'rent人物') return '文型:SVOO';
  if (sub === 'allow人to～' || sub === 'permit人to～') return '文型:SVO+to_do';
  if (sub === 'forgive人for～' || sub === 'excuse人for～') return '文型:SVO+for';
  if (sub === 'suspect_that' || sub === 'doubt_that') return '文型:V+that';

  // Unit 6 patterns
  if (sub === 'hit_on/come_up_with') return '文型:SVO';
  if (sub === 'occur_to/strike') return '文型:SVO';
  if (sub === 'happen_to人') return '文型:SV+to';
  if (sub === 'happen_to_V') return '文型:SV+to_do';
  if (sub === 'suit/become') return '文型:SVO';
  if (sub === 'match/go_with') return '文型:SVO';

  return null;
}

function derivePrepositionFromTsvEntry(subsection, verb, id) {
  if (!subsection) return null;
  const sub = subsection;

  if (sub === 'V人of～' || sub === 'V人of物') return '前置詞:of';
  if (sub === 'V人with物' || sub === 'fillAwithB' || sub === 'face/confrontAwithB') return '前置詞:with';
  if (sub === 'V人for～' || sub === 'criticize人for～') return '前置詞:for';
  if (sub === 'be_grateful_to人for～') return '前置詞:to|前置詞:for';
  if (sub === 'V人into-ing') return '前置詞:into';
  if (sub === 'V人out_of-ing') return '前置詞:out_of';
  if (sub === 'V人from-ing') return '前置詞:from';
  if (sub === 'Vto人that～') return '前置詞:to';
  if (sub === 'apologize_to人for～') return '前置詞:to|前置詞:for';
  if (sub === 'allow人to～' || sub === 'permit人to～') return '前置詞:to';
  if (sub === 'forgive人for～' || sub === 'excuse人for～') return '前置詞:for';

  // be 形容詞 of
  if (sub.startsWith('be_') && sub.endsWith('_of')) return '前置詞:of';

  return null;
}

// ─── Main ───

function main() {
  const mdPath = join(__dirname, '動詞の語法.md');
  const tsvPath = join(__dirname, 'verb_patterns_print - 動詞の語法_全UNIT.tsv');
  const outPath = join(__dirname, '動詞の語法_統合.tsv');

  console.log('Parsing .md file...');
  const mdEntries = parseMdFile(mdPath);
  console.log(`  Found ${mdEntries.length} entries in .md file`);

  console.log('Parsing .tsv file...');
  const tsvEntries = parseTsvFile(tsvPath);
  console.log(`  Found ${tsvEntries.length} entries in .tsv file`);

  // Merge: TSV takes priority for duplicate IDs
  const merged = new Map();
  let dupCount = 0;

  // Add md entries first
  for (const entry of mdEntries) {
    merged.set(entry.id, entry);
  }

  // Add tsv entries, overwriting duplicates
  for (const entry of tsvEntries) {
    if (merged.has(entry.id)) {
      console.log(`  [dedup] ID "${entry.id}" exists in both files. Keeping TSV version.`);
      dupCount++;
    }
    merged.set(entry.id, entry);
  }

  // Sort: by sectionOrder, then by ID
  const sorted = Array.from(merged.values()).sort((a, b) => {
    if (a.sectionOrder !== b.sectionOrder) return a.sectionOrder - b.sectionOrder;
    // Sort by ID: extract base and number
    const parseId = (id) => {
      const match = id.match(/^(.+?)_(\d+)$/);
      if (match) return { base: match[1], num: parseInt(match[2]) };
      return { base: id, num: 0 };
    };
    const aId = parseId(a.id);
    const bId = parseId(b.id);
    if (aId.base !== bId.base) return aId.base.localeCompare(bId.base);
    return aId.num - bId.num;
  });

  // Write output
  const BOM = '\uFEFF';
  const header = 'ID\t日本語文\t指定動詞\tパーツ\t正答\tタグ';
  const rows = sorted.map(e => `${e.id}\t${e.jp}\t${e.verb}\t${e.parts}\t${e.answer}\t${e.tags}`);
  const output = BOM + header + '\r\n' + rows.join('\r\n') + '\r\n';

  writeFileSync(outPath, output, 'utf-8');
  console.log(`\nOutput written to: ${outPath}`);

  // Summary
  console.log('\n=== Summary ===');
  console.log(`Total entries: ${sorted.length}`);
  console.log(`Duplicates resolved (TSV preferred): ${dupCount}`);

  // Per-section counts
  const sectionCounts = {};
  for (const e of sorted) {
    const section = e.section || '(no section)';
    sectionCounts[section] = (sectionCounts[section] || 0) + 1;
  }
  console.log('\nEntries per section:');
  for (const [section, count] of Object.entries(sectionCounts)) {
    console.log(`  ${section}: ${count}`);
  }
}

main();
