// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ITEM_HEADING = /^###\s+([^\s]+)\s*$/;
const MARKDOWN_FENCE = /^```markdown\s*$/i;
const FENCE_END = /^```\s*$/;
const BLOCKQUOTE = /^>\s?(.*)$/;
const PLACEHOLDER = /<([A-Za-z_$#][A-Za-z0-9_$#-]*)>/g;
const RESULT_BULLET = /^-\s+`([A-Za-z_$][A-Za-z0-9_$]*)`:\s+(.+)$/;
const REQUIRED_FIELD = /^([A-Za-z_$][A-Za-z0-9_$]*)(?::\s*<([^>]+)>)?$/;
const ENGLISH_PLAYER = '[A-Z][A-Za-z0-9_-]*';
const PREFIXED_SECTION = /^##\s+Prefixed prompts\s*$/;
const PREFIXED_BULLET = /^-\s+([^\s:]+):\s+relays → tail\s*$/;
const RELAY_LINE = /^>/;
const BARE_RELAY = /^>\s+<[A-Za-z_$#][A-Za-z0-9_$#-]*>$/;
const TILING_LIMIT = 64;

/**
 * The items every `## Prefixed prompts` section lists as rewritten by the
 * prefix pass (slc/prefix.md), with a finding for each malformed entry and for
 * each section after the first.
 */
export function prefixedItems(gearsText) {
  const ids = [];
  const findings = [];
  const lines = gearsText.split('\n');
  let sections = 0;
  for (let start = 0; start < lines.length; start++) {
    if (!PREFIXED_SECTION.test(lines[start])) continue;
    if (++sections > 1) findings.push(`Prefixed prompts: duplicate section at line ${start + 1}`);
    for (let index = start + 1; index < lines.length; index++) {
      const line = lines[index];
      if (/^#{1,3}\s/.test(line)) break;
      if (line.trim() === '') continue;
      const bullet = PREFIXED_BULLET.exec(line);
      if (bullet === null) {
        findings.push(`Prefixed prompts: malformed entry: ${JSON.stringify(line)}`);
        continue;
      }
      ids.push(bullet[1]);
    }
  }
  return { ids, findings };
}

/**
 * The units the prefix pass moves or keeps: a quoted relay fragment is one
 * relay unit; in an instruction or prompt fragment, a paragraph of only quoted
 * lines is a relay unit, and the lines between relay units, without their
 * bounding blank lines, are one instruction unit that keeps its interior blank
 * lines. Each unit keeps its Source position for ordering.
 */
function fragmentUnits(fragment) {
  if (fragment.kind === 'relay') {
    return [{ kind: 'relay', start: fragment.start, lines: fragment.lines }];
  }
  const units = [];
  let from = -1;
  let to = -1;
  const flush = () => {
    if (from === -1) return;
    units.push({
      kind: 'instruction',
      start: fragment.start + from,
      lines: fragment.lines.slice(from, to),
    });
    from = -1;
  };
  for (let index = 0; index < fragment.lines.length; ) {
    let end = index;
    while (end < fragment.lines.length && fragment.lines[end] !== '') end++;
    const paragraph = fragment.lines.slice(index, end);
    if (paragraph.length > 0 && paragraph.every((line) => RELAY_LINE.test(line))) {
      flush();
      units.push({ kind: 'relay', start: fragment.start + index, lines: paragraph });
    } else if (paragraph.length > 0) {
      if (from === -1) from = index;
      to = end;
    }
    index = end + 1;
  }
  flush();
  return units;
}

/** Resolve Markdown escaping that is Source syntax rather than prompt content. */
function normalizePromptLine(line) {
  return line.replace(/\\([<>])/g, '$1');
}

/** Whether prose immediately introducing a Source blockquote makes `>` content. */
function introducesQuotedRelay(lines, start) {
  const context = [];
  for (let index = start - 1; index >= 0 && context.length < 4; index--) {
    const line = lines[index].trim();
    if (line === '') continue;
    if (line.startsWith('#') || line.startsWith('```')) break;
    context.unshift(line);
  }
  return /\bin quotes\s*\(`>`\)/i.test(context.join(' '));
}

/** Prompt fragments authored explicitly in one free-form playbook Source. */
export function sourcePromptFragments(sourceText) {
  const lines = sourceText.split('\n');
  const fragments = [];
  for (let index = 0; index < lines.length; index++) {
    if (MARKDOWN_FENCE.test(lines[index])) {
      const start = index;
      const content = [];
      for (index++; index < lines.length && !FENCE_END.test(lines[index]); index++) {
        content.push(normalizePromptLine(lines[index]));
      }
      if (index >= lines.length) {
        throw new Error(`unclosed markdown instruction fence at line ${start + 1}`);
      }
      fragments.push({ kind: 'instruction', start, lines: content });
      continue;
    }

    if (!BLOCKQUOTE.test(lines[index])) continue;
    const start = index;
    const quotedRelay = introducesQuotedRelay(lines, start);
    const content = [];
    while (index < lines.length) {
      const match = BLOCKQUOTE.exec(lines[index]);
      if (match === null) break;
      const line = normalizePromptLine(match[1]);
      content.push(
        quotedRelay ? (line === '' ? '>' : `> ${line}`) : line,
      );
      index++;
    }
    index--;
    fragments.push({
      kind: quotedRelay ? 'relay' : 'prompt',
      start,
      lines: content,
    });
  }
  return fragments.filter((fragment) => fragment.lines.length > 0);
}

/** Required result fields and their ownership annotation. */
function resultFields(description) {
  const marker = description.indexOf('Output shall include');
  if (marker === -1) return [];
  const fields = [];
  for (const match of description.slice(marker).matchAll(/`([^`]+)`/g)) {
    const field = REQUIRED_FIELD.exec(match[1].trim());
    if (field === null) continue;
    fields.push({
      name: field[1],
      verbatim: field[2]?.trim().toLowerCase() === 'verbatim final text',
    });
  }
  return fields;
}

/** Player named by one delegated GEARS acting sentence. */
function actingPlayer(acting) {
  const prompted = new RegExp(
    `\\bCaptain shall prompt\\s+(${ENGLISH_PLAYER})\\b`,
  ).exec(acting)?.[1];
  if (prompted !== undefined) return prompted;
  return new RegExp(
    `\\bCaptain shall relay\\b.*?\\bto\\s+(${ENGLISH_PLAYER})\\b`,
  ).exec(acting)?.[1];
}

/** Minimal GEARS item surface needed for Source and relay-contract checks. */
export function parseGearsContract(gearsText) {
  const lines = gearsText.split('\n');
  const starts = [];
  for (let index = 0; index < lines.length; index++) {
    const heading = ITEM_HEADING.exec(lines[index]);
    if (heading !== null) starts.push({ index, id: heading[1] });
  }

  return starts.map((start, ordinal) => {
    const end = starts[ordinal + 1]?.index ?? lines.length;
    const section = lines.slice(start.index + 1, end);
    const firstQuote = section.findIndex((line) => BLOCKQUOTE.test(line));
    const prompt = [];
    let cursor = firstQuote;
    while (cursor >= 0 && cursor < section.length) {
      const quote = BLOCKQUOTE.exec(section[cursor]);
      if (quote === null) break;
      prompt.push(normalizePromptLine(quote[1]));
      cursor++;
    }
    const acting = section.slice(0, Math.max(firstQuote, 0)).join(' ');
    const delegated = /\bCaptain shall (?:prompt\b|relay\b)/.test(acting);
    // slc/text2gears.md "Script behaviors": fixed machine syntax, so the
    // clause stays in this exact English form in every source language.
    const script = /\bCaptain shall run:/.test(acting);
    const player = actingPlayer(acting);
    const results = [];
    for (const line of section.slice(Math.max(cursor, 0))) {
      const bullet = RESULT_BULLET.exec(line);
      if (bullet === null) continue;
      results.push({
        guard: bullet[1],
        description: bullet[2],
        fields: resultFields(bullet[2]),
      });
    }
    return { id: start.id, ordinal, delegated, script, player, prompt, results };
  });
}

/** Canonical kebab-token to camel-field mapping from slc/link.md. */
function placeholderField(token) {
  if (token === '#') return 'irNumber';
  return token.replace(/-([A-Za-z0-9_$])/g, (_match, next) => next.toUpperCase());
}

/** First exact contiguous occurrence of `needle` in `haystack`. */
function fragmentIndex(haystack, needle) {
  if (needle.length === 0 || needle.length > haystack.length) return -1;
  outer: for (let index = 0; index <= haystack.length - needle.length; index++) {
    for (let offset = 0; offset < needle.length; offset++) {
      if (haystack[index + offset] !== needle[offset]) continue outer;
    }
    return index;
  }
  return -1;
}

/** Whether two line arrays are equal. */
function sameLines(left, right) {
  return left.length === right.length && left.every((line, index) => line === right[index]);
}

/**
 * Checks for an item the prefix pass lists as rewritten. Its prompt must be
 * tiled by whole fragments taken in Source order: their instruction units in
 * the region before the trailing relay blocks and their relay units among
 * the trailing blocks, or in place where the raw layout kept a relay beside
 * instruction text, each unit occurrence used once, with blank lines and bare
 * relay lines free among the trailing blocks. Between the units of one
 * fragment one blank line stands where a moved relay unit stood and the
 * authored boundary elsewhere; between fragments, the boundary Source
 * authored. Every alternative tiling is kept: a rewrite is recognized
 * whenever one tiling shows a relay that moved past an instruction, and the
 * tilings are returned, as lists of fragment indexes, for conservation.
 */
function prefixedItemFindings(item, fragments) {
  const { prompt } = item;
  // The relay blocks the pass moves: blank-bounded runs of relay lines.
  const inBlock = prompt.map(() => false);
  for (let start = 0; start < prompt.length; start++) {
    let end = start;
    while (end < prompt.length && RELAY_LINE.test(prompt[end])) end++;
    if (end > start && (start === 0 || prompt[start - 1] === '') &&
      (end === prompt.length || prompt[end] === '')) inBlock.fill(true, start, end);
    start = Math.max(start, end);
  }
  const lastStatic = prompt.findLastIndex((line, index) => line !== '' && !inBlock[index]);
  if (inBlock.some((inside, index) => inside && index < lastStatic)) {
    return { findings: [`${item.id}: listed as prefixed but a relay precedes an instruction`], tilings: [] };
  }
  const statics = prompt.slice(0, lastStatic + 1);
  const tail = prompt.slice(lastStatic + 1);
  const free = (line) => line === '' || BARE_RELAY.test(line);
  // The static line after `unit` matched at the cursor across `boundary`:
  // exactly one blank line where a moved relay unit stood, one or more
  // between units of one fragment that both stayed, and any number, none
  // included, between fragments (slc/text2gears.md).
  const staticMatch = (line, unit, boundary) => {
    let at = line;
    if (line > 0) {
      if (boundary === 'moved') {
        if (statics[at] !== '') return -1;
        at++;
      } else {
        if (boundary === 'stayed' && statics[at] !== '') return -1;
        while (at < statics.length && statics[at] === '') at++;
      }
    }
    return sameLines(statics.slice(at, at + unit.lines.length), unit.lines)
      ? at + unit.lines.length
      : -1;
  };
  // The tail line after `unit` matched at or after the cursor, past free lines.
  const tailMatch = (at, unit) => {
    for (let t = at; t + unit.lines.length <= tail.length; t++) {
      if (sameLines(tail.slice(t, t + unit.lines.length), unit.lines)) return t + unit.lines.length;
      if (!free(tail[t])) return -1;
    }
    return -1;
  };
  // Each reachable position — static line, tail line, whether a relay unit
  // reached the tail, whether an instruction unit followed one — with every
  // list of fragment indexes some path to it carries.
  const keyOf = (state) =>
    `${state.line} ${state.tail} ${Number(state.moved)} ${Number(state.rewrite)}`;
  const merge = (states, state) => {
    const existing = states.get(keyOf(state));
    if (existing === undefined) states.set(keyOf(state), state);
    else for (const list of state.lists) {
      if (existing.lists.size < TILING_LIMIT) existing.lists.add(list);
    }
  };
  let reached = new Map();
  merge(reached, { line: 0, tail: 0, moved: false, rewrite: false, lists: new Set(['']) });
  fragments.forEach((fragment, index) => {
    const next = new Map();
    for (const state of reached.values()) merge(next, { ...state, lists: new Set(state.lists) });
    let frontier = [...reached.values()].map((state) => ({ ...state, boundary: 'fragment' }));
    for (const unit of fragmentUnits(fragment)) {
      const advanced = [];
      for (const state of frontier) {
        const line = staticMatch(state.line, unit, state.boundary);
        if (unit.kind === 'instruction') {
          if (line >= 0) {
            advanced.push({ ...state, line, boundary: 'stayed', rewrite: state.rewrite || state.moved });
          }
          continue;
        }
        const end = tailMatch(state.tail, unit);
        if (end >= 0) advanced.push({ ...state, tail: end, moved: true, boundary: 'moved' });
        if (line >= 0) advanced.push({ ...state, line, boundary: 'stayed' });
      }
      frontier = advanced;
    }
    for (const state of frontier) {
      const lists = new Set([...state.lists].map((list) => `${list} ${index}`.trim()));
      merge(next, { line: state.line, tail: state.tail, moved: state.moved, rewrite: state.rewrite, lists });
    }
    reached = next;
  });
  const ends = [...reached.values()].filter((state) =>
    state.line === statics.length && tail.slice(state.tail).every(free));
  if (ends.length === 0) {
    return { findings: [`${item.id}: authored prompt fragments are out of Source order`], tilings: [] };
  }
  // A listing is a no-op only when no tiling shows a relay that moved past an
  // instruction and the tail holds no bare relay line, whose Source position
  // the prose leaves open.
  const noOp = !ends.some((state) => state.rewrite) && !tail.some((line) => BARE_RELAY.test(line));
  return {
    findings: noOp ? [`${item.id}: listed as prefixed but its prompt is in Source order`] : [],
    tilings: [...new Set(ends.flatMap((state) => [...state.lists]))]
      .map((list) => (list === '' ? [] : list.split(' ').map(Number))),
  };
}

/**
 * The fragments, among `uncovered`, that no choice of one tiling per listed
 * item covers together, the first complete cover ending the search and a
 * bounded search keeping the best cover found.
 */
function uncoveredByTilings(uncovered, choices) {
  const wanted = new Set(uncovered);
  let best = new Set();
  let budget = 10000;
  const search = (depth, covered) => {
    if (covered.size > best.size) best = covered;
    if (budget-- <= 0 || best.size === wanted.size || depth === choices.length) return;
    for (const tiling of choices[depth]) {
      const next = new Set(covered);
      for (const index of tiling) if (wanted.has(index)) next.add(index);
      search(depth + 1, next);
    }
  };
  search(0, new Set());
  return uncovered.filter((index) => !best.has(index));
}

/** Fields whose result contracts make the player's final text authoritative. */
export function verbatimFieldsFromGears(gearsText) {
  const fields = new Set();
  for (const item of parseGearsContract(gearsText)) {
    for (const result of item.results) {
      for (const field of result.fields) {
        if (field.verbatim) fields.add(field.name);
      }
    }
  }
  return fields;
}

/** Compare a linked runtime's field ownership with its GEARS annotations. */
export function checkLinkedVerbatimContract(gearsText, linkedFields) {
  const expected = verbatimFieldsFromGears(gearsText);
  const actual = new Set(linkedFields);
  const findings = [];
  for (const field of expected) {
    if (!actual.has(field)) findings.push(`linked runtime omits verbatim field ${field}`);
  }
  for (const field of actual) {
    if (!expected.has(field)) findings.push(`linked runtime invents verbatim field ${field}`);
  }
  return findings;
}

/**
 * Deterministic conservation checks at the Source -> GEARS seam.
 *
 * Semantic item partitioning remains the compiler's judgment, but authored
 * fragments, their order, literal quote markers, and ownership of relayed
 * player output are mechanically decidable and checked here.
 */
export function checkSourceGearsContract(sourceText, gearsText) {
  const fragments = sourcePromptFragments(sourceText);
  const items = parseGearsContract(gearsText);
  const prefixed = prefixedItems(gearsText);
  const findings = [...prefixed.findings];
  const itemIds = new Set(items.map((item) => item.id));
  for (const id of prefixed.ids) {
    if (!itemIds.has(id)) findings.push(`Prefixed prompts: ${id} is not an item`);
  }
  const prefixedIds = new Set(prefixed.ids);
  const listed = new Map(items
    .filter((item) => prefixedIds.has(item.id))
    .map((item) => [item.id, prefixedItemFindings(item, fragments)]));
  // DR-065 §3: an unlisted item carries a fragment contiguously, as does a
  // listed item that admits no tiling and is already reported; a listed item
  // that tiles carries exactly the fragments of one tiling of its prompt,
  // chosen so that the listed items together cover every fragment no other
  // item carries — one occurrence never stands for two authored fragments.
  const contiguousCarriers = items.filter((item) =>
    !prefixedIds.has(item.id) || listed.get(item.id).tilings.length === 0);
  const uncovered = fragments
    .map((_fragment, index) => index)
    .filter((index) =>
      !contiguousCarriers.some((item) => fragmentIndex(item.prompt, fragments[index].lines) >= 0));
  const dropped = uncoveredByTilings(
    uncovered,
    [...listed.values()].map((entry) => entry.tilings).filter((tilings) => tilings.length > 0),
  );
  const relayedFields = new Set(
    fragments
      .filter((fragment) => fragment.kind === 'relay')
      .flatMap((fragment) =>
        fragment.lines.flatMap((line) =>
          [...line.matchAll(PLACEHOLDER)].map((match) =>
            placeholderField(match[1]),
          ),
        ),
      ),
  );
  const allPromptLines = new Set(
    fragments.flatMap((fragment) => fragment.lines.filter((line) => line !== '')),
  );

  for (const index of dropped) {
    const fragment = fragments[index];
    findings.push(
      `source ${fragment.kind} fragment at line ${fragment.start + 1} was dropped or changed`,
    );
  }

  for (const item of items) {
    const matches = fragments
      .map((fragment) => ({
        fragment,
        promptIndex: fragmentIndex(item.prompt, fragment.lines),
      }))
      .filter((entry) => entry.promptIndex >= 0)
      // A repeated relay inside a complete authored fragment has that
      // fragment's position, not the position of its earlier standalone use.
      .filter((entry, _index, entries) => !entries.some((other) =>
        other.fragment.lines.length > entry.fragment.lines.length &&
        other.promptIndex <= entry.promptIndex &&
        other.promptIndex + other.fragment.lines.length >=
          entry.promptIndex + entry.fragment.lines.length,
      ))
      .sort((left, right) => left.promptIndex - right.promptIndex);
    if (listed.has(item.id)) {
      findings.push(...listed.get(item.id).findings);
    } else {
      for (let index = 1; index < matches.length; index++) {
        if (matches[index - 1].fragment.start > matches[index].fragment.start) {
          findings.push(`${item.id}: authored prompt fragments are out of Source order`);
          break;
        }
      }
    }

    for (const line of item.prompt) {
      if (line === '' || allPromptLines.has(line)) continue;
      if (BARE_RELAY.test(line)) continue;
      findings.push(`${item.id}: prompt line is not an authored fragment: ${JSON.stringify(line)}`);
    }
  }

  const producers = new Map();
  for (const item of items) {
    for (const result of item.results) {
      for (const field of result.fields) {
        const entries = producers.get(field.name) ?? [];
        entries.push({
          itemId: item.id,
          ordinal: item.ordinal,
          delegated: item.delegated,
          verbatim: field.verbatim,
        });
        producers.set(field.name, entries);
      }
    }
  }

  for (const [field, entries] of producers) {
    if (entries.some((entry) => entry.verbatim) && entries.some((entry) => !entry.verbatim)) {
      findings.push(`${field}: result field mixes verbatim and judge-authored ownership`);
    }
  }

  const reported = new Set();
  for (const item of items) {
    // A script blockquote is shell text no agent ever reads, so a placeholder
    // there binds the command to its target rather than relaying player text
    // into a prompt; the literal quote marker does not apply to it.
    if (item.script) continue;
    for (const line of item.prompt) {
      for (const match of line.matchAll(PLACEHOLDER)) {
        const field = placeholderField(match[1]);
        if (!relayedFields.has(field)) continue;
        const key = `${item.id}:${field}`;
        if (!line.startsWith('> ') && !reported.has(`quote:${key}`)) {
          findings.push(`${item.id}: relayed player field ${field} lacks a literal quote marker`);
          reported.add(`quote:${key}`);
        }
      }
    }
  }

  return findings;
}

async function main(argv) {
  if (argv.length !== 2) {
    throw new Error('usage: check-slc-source-gears.mjs <source.md> <gears.md>');
  }
  const [sourcePath, gearsPath] = argv.map((path) => resolve(path));
  const [source, gears] = await Promise.all([
    readFile(sourcePath, 'utf8'),
    readFile(gearsPath, 'utf8'),
  ]);
  const findings = checkSourceGearsContract(source, gears);
  if (findings.length === 0) return;
  for (const finding of findings) process.stderr.write(`${finding}\n`);
  process.exitCode = 1;
}

const invokedPath = process.argv[1] === undefined ? undefined : resolve(process.argv[1]);
if (invokedPath === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
