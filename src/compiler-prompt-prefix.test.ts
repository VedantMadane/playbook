// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  checkSourceGearsContract,
  parseGearsContract,
} from '../scripts/check-slc-source-gears.mjs';
import { defaultComposePlayerPrompt } from './xstate-runtime.js';

const tool = fileURLToPath(new URL('../slc/prefix-prompts.mjs', import.meta.url));
const definition = readFileSync(new URL('../slc/prefix.md', import.meta.url), 'utf8');
const SECTION = '## Prefixed prompts';

const workflows = [
  { id: 'code', prefixed: ['CODE-1', 'CODE-3'] },
  { id: 'review', prefixed: ['REVIEW-1', 'REVIEW-2', 'REVIEW-3', 'REVIEW-4'] },
  { id: 'decide', prefixed: ['DECIDE-1', 'DECIDE-2'] },
  { id: 'dev', prefixed: ['DEV-1'] },
  { id: 'branch', prefixed: ['BRANCH-1'] },
  { id: 'pr', prefixed: ['PR-1'] },
] as const;

function reference(id: string): { source: string; gears: string } {
  const base = new URL(`../reference/sdlc/${id}`, import.meta.url);
  return {
    source: readFileSync(new URL(`${base.href}.md`), 'utf8'),
    gears: readFileSync(new URL(`${base.href}.playbook/${id}.gears.md`), 'utf8'),
  };
}

/** Run the shipped tool on `gears`, returning the target text and stdout. */
function prefix(
  dir: string,
  gears: string,
  keep: readonly string[] = [],
): { text: string; stdout: string } {
  const source = join(dir, 'in.gears.md');
  const target = join(dir, 'out.gears.md');
  writeFileSync(source, gears);
  const stdout = execFileSync(
    process.execPath,
    [tool, '--source', source, '--target', target, ...keep.flatMap((id) => ['--keep', id])],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
  );
  expect(readFileSync(source, 'utf8')).toBe(gears);
  return { text: readFileSync(target, 'utf8'), stdout };
}

/**
 * A relay-first pre-image of a GEARS the pass already rewrote: each prompt's
 * trailing relay block moves back to the head of its blockquote and the
 * provenance section is dropped. For REVIEW-2 this is exactly its Source
 * order, and the shipped tool rewrites the result back to the maintained
 * GEARS byte for byte.
 */
function relayFirst(gears: string): string {
  const start = gears.indexOf(`\n${SECTION}\n`);
  if (start === -1) return gears;
  const lines = gears.slice(0, start + 1).split('\n');
  const out: string[] = [];
  for (let index = 0; index < lines.length; ) {
    if (!lines[index].startsWith('>')) {
      out.push(lines[index++]);
      continue;
    }
    let end = index;
    while (end < lines.length && lines[end].startsWith('>')) end++;
    const quote = lines.slice(index, end);
    let relay = quote.length;
    while (relay > 0 && quote[relay - 1].startsWith('> > ')) relay--;
    out.push(
      ...(relay > 1 && relay < quote.length && quote[relay - 1] === '>'
        ? [...quote.slice(relay), '>', ...quote.slice(0, relay - 1)]
        : quote),
    );
    index = end;
  }
  return out.join('\n');
}

/** Prompt lines of each item, keyed by item id. */
function prompts(gears: string): Map<string, readonly string[]> {
  return new Map(parseGearsContract(gears).map((item) => [item.id, item.prompt]));
}

/** Whether every relay line of a prompt follows every instruction line. */
function relaysTrail(prompt: readonly string[]): boolean {
  const lastInstruction = prompt.reduce(
    (last, line, index) => (line !== '' && !line.startsWith('>') ? index : last),
    -1,
  );
  return prompt.every((line, index) => !line.startsWith('>') || index > lastInstruction);
}

/** Section text from `marker` to the next `## ` heading or the end, trailing blank lines dropped. */
function section(gears: string, marker: string): string | undefined {
  const start = gears.indexOf(`${marker}\n`);
  if (start === -1) return undefined;
  const rest = gears.slice(start + marker.length + 1);
  const next = rest.search(/^## /m);
  return (next === -1 ? rest : rest.slice(0, next)).replace(/\n+$/, '\n');
}

/** A Source of fenced instructions and its faithful raw GEARS, one item per instruction. */
function flow(instructions: readonly (readonly string[])[]): { source: string; gears: string } {
  const head = ['# Flow', '', 'Roles:', '', '- Coder', ''];
  const source = [
    ...head,
    ...instructions.flatMap((lines, index) => [
      `When step ${index + 1} starts, Captain shall give Coder the following instruction:`,
      '',
      '```markdown',
      ...lines,
      '```',
      '',
    ]),
  ].join('\n');
  const gears = [
    ...head,
    ...instructions.flatMap((lines, index) => [
      `### FLOW-${index + 1}`,
      '',
      `When step ${index + 1} starts, Captain shall prompt Coder:`,
      '',
      ...lines.map((line) => (line === '' ? '>' : `> ${line}`)),
      '',
      'Results:',
      '- `done`: Coder finished.',
      '',
    ]),
  ].join('\n');
  return { source, gears };
}

/** An instruction whose fenced template carries an authored run of two blank lines. */
const TEMPLATE = [
  '> Request: <caller-input>',
  '',
  'Create `notes.txt` with exactly this content:',
  '',
  '~~~text',
  'first',
  '',
  '',
  'second',
  '~~~',
];

/** A faithful raw GEARS of one Flow item with the given prompt lines. */
function oneItem(prompt: readonly string[]): string {
  return [
    '# Flow', '', 'Roles:', '', '- Coder', '',
    '### FLOW-1', '', 'When step 1 starts, Captain shall prompt Coder:', '',
    ...prompt.map((line) => (line === '' ? '>' : `> ${line}`)), '',
    'Results:', '- `done`: Coder finished.', '',
  ].join('\n');
}

const FLOW_HEAD = ['# Flow', '', 'Roles:', '', '- Coder', ''];

describe('prompt-prefix pass tool (compiler-prompt-prefix-6)', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'playbook-prefix-'));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it.each(workflows)('$id: rewrites exactly the relay-first items', ({ id, prefixed }) => {
    const { gears } = reference(id);
    const { text, stdout } = prefix(dir, gears);
    if (section(gears, SECTION) !== undefined) {
      // A bundle recompiled since the pass shipped already carries its
      // output: no relay precedes an instruction, so nothing is rewritten,
      // and its provenance lists exactly the items whose relays now trail.
      expect(stdout).toContain('no eligible item');
      expect(text).toBe(gears);
      expect(section(gears, SECTION)).toBe(
        `\n${prefixed.map((itemId) => `- ${itemId}: relays → tail`).join('\n')}\n`,
      );
      for (const [itemId, prompt] of prompts(gears)) {
        expect(relaysTrail(prompt), itemId).toBe(true);
      }
      return;
    }
    expect(stdout.trim().split('\n')).toEqual([...prefixed]);

    const before = prompts(gears);
    const after = prompts(text);
    expect([...after.keys()]).toEqual([...before.keys()]);
    for (const [itemId, prompt] of before) {
      const rewritten = after.get(itemId)!;
      if (prefixed.includes(itemId as never)) {
        expect(relaysTrail(prompt)).toBe(false);
        expect(relaysTrail(rewritten)).toBe(true);
        // Every line survives byte-for-byte; only relay lines move.
        expect([...rewritten].filter((line) => line !== '').sort()).toEqual(
          [...prompt].filter((line) => line !== '').sort(),
        );
        expect(rewritten.filter((line) => !line.startsWith('>') && line !== '')).toEqual(
          prompt.filter((line) => !line.startsWith('>') && line !== ''),
        );
        expect(rewritten.filter((line) => line.startsWith('>'))).toEqual(
          prompt.filter((line) => line.startsWith('>')),
        );
      } else {
        expect(rewritten).toEqual(prompt);
      }
    }

    // Everything outside the rewritten blockquotes — the other items, the
    // metadata, and an `## Optimizations` section — is byte-identical.
    const strip = (input: string) =>
      input.replace(/^>.*\n/gm, '').replace(new RegExp(`\\n${SECTION}\\n[\\s\\S]*$`), '');
    expect(strip(text)).toBe(strip(gears));
    expect(section(text, '## Optimizations')).toBe(section(gears, '## Optimizations'));
    expect(section(text, SECTION)).toBe(
      `\n${prefixed.map((itemId) => `- ${itemId}: relays → tail`).join('\n')}\n`,
    );
    expect(text.indexOf(SECTION)).toBeGreaterThan(text.lastIndexOf('\n### '));
    if (id === 'pr') {
      expect(text.indexOf(SECTION)).toBeGreaterThan(text.indexOf('## Optimizations'));
    }

    // The rewrite is idempotent: nothing is eligible the second time.
    const again = prefix(dir, text);
    expect(again.text).toBe(text);
    expect(again.stdout).toContain('no eligible item');
  });

  it('skips a kept item and leaves an ineligible package untouched', () => {
    const gears = relayFirst(reference('review').gears);
    const { text, stdout } = prefix(dir, gears, ['REVIEW-2']);
    expect(stdout.trim().split('\n')).toEqual(['REVIEW-1', 'REVIEW-3', 'REVIEW-4']);
    expect(prompts(text).get('REVIEW-2')).toEqual(prompts(gears).get('REVIEW-2'));

    const captain = readFileSync(
      new URL('../reference/sdlc/captain.playbook/captain.gears.md', import.meta.url),
      'utf8',
    );
    const untouched = prefix(dir, captain);
    expect(untouched.text).toBe(captain);
    expect(untouched.text).not.toContain(SECTION);
  });

  it('keeps a quoted line adjacent to an instruction with that instruction', () => {
    const gears = [
      '### FLOW-1',
      '',
      'When work starts, Captain shall prompt Coder:',
      '',
      '> > Original request: <caller-input>',
      '>',
      '> Implement the request below.',
      '> > Original request: <caller-input>',
      '',
      'Results:',
      '- `done`: Coder finished.',
      '',
    ].join('\n');
    const { text } = prefix(dir, gears);
    expect(prompts(text).get('FLOW-1')).toEqual([
      'Implement the request below.',
      '> Original request: <caller-input>',
      '',
      '> Original request: <caller-input>',
    ]);
  });

  it('moves a blank-separated quoted block inside a fenced instruction and keeps an adjacent one', () => {
    const source = [
      '# Flow',
      '',
      'Roles:',
      '',
      '- Coder',
      '',
      'Captain shall give Coder the following instruction:',
      '',
      '```markdown',
      '> Request: <caller-input>',
      '',
      'Read the request and act on it.',
      'Quote it back like this:',
      '> Request: <caller-input>',
      '```',
      '',
    ].join('\n');
    const gears = [
      '# Flow',
      '',
      'Roles:',
      '',
      '- Coder',
      '',
      '### FLOW-1',
      '',
      'When work starts, Captain shall prompt Coder:',
      '',
      '> > Request: <caller-input>',
      '>',
      '> Read the request and act on it.',
      '> Quote it back like this:',
      '> > Request: <caller-input>',
      '',
      'Results:',
      '- `done`: Coder acted on the request.',
      '',
    ].join('\n');
    expect(checkSourceGearsContract(source, gears)).toEqual([]);
    const { text, stdout } = prefix(dir, gears);
    expect(stdout.trim()).toBe('FLOW-1');
    expect(prompts(text).get('FLOW-1')).toEqual([
      'Read the request and act on it.',
      'Quote it back like this:',
      '> Request: <caller-input>',
      '',
      '> Request: <caller-input>',
    ]);
    expect(checkSourceGearsContract(source, text)).toEqual([]);
    const unlisted = text.slice(0, text.indexOf(`\n${SECTION}`) + 1);
    expect(checkSourceGearsContract(source, unlisted)).toEqual([
      'source instruction fragment at line 9 was dropped or changed',
    ]);
  });

  it('preserves CRLF line endings', () => {
    const { gears } = reference('branch');
    const crlf = gears.replaceAll('\n', '\r\n');
    const { text } = prefix(dir, crlf);
    expect(text).not.toMatch(/[^\r]\n/);
    expect(text.replaceAll('\r\n', '\n')).toBe(prefix(dir, gears).text);
  });

  it('rewrites the shipped definition example exactly as printed', () => {
    const examples = [...definition.matchAll(/```markdown\n([\s\S]*?)```/g)].map((match) => match[1]);
    expect(examples).toHaveLength(2);
    const [before, after] = examples;
    const { text, stdout } = prefix(dir, before);
    expect(stdout.trim()).toBe('REVIEW-2');
    expect(text).toBe(`${after}\n${SECTION}\n\n- REVIEW-2: relays → tail\n`);
  });

  it('merges a later application into one provenance section', () => {
    const gears = relayFirst(reference('review').gears);
    const again = prefix(dir, prefix(dir, gears, ['REVIEW-2']).text);
    expect(again.stdout.trim()).toBe('REVIEW-2');
    expect(again.text).toBe(prefix(dir, gears).text);
    expect(again.text).toBe(reference('review').gears);
    expect(again.text.match(/^## Prefixed prompts$/gm)).toHaveLength(1);
  });
});

describe('prefix-first prompts share their instructions as a cache prefix (compiler-prompt-prefix-7)', () => {
  it('composes REVIEW-2 with two requests sharing the whole instruction block', () => {
    const dir = mkdtempSync(join(tmpdir(), 'playbook-prefix-'));
    try {
      const gears = relayFirst(reference('review').gears);
      const { text } = prefix(dir, gears);
      const compose = (prompt: readonly string[], callerInput: string) =>
        defaultComposePlayerPrompt({
          stateId: 'fixFindings',
          role: 'coder',
          sourceItem: 'REVIEW-2',
          prompt: prompt.join('\n'),
          result: {},
          callerInput,
          reviewerOutput: `Findings for ${callerInput}`,
        } as never);
      const commonPrefix = (left: string, right: string) => {
        let index = 0;
        while (index < left.length && left[index] === right[index]) index++;
        return left.slice(0, index);
      };
      const before = prompts(gears).get('REVIEW-2')!;
      const after = prompts(text).get('REVIEW-2')!;
      const instructions = after.filter((line) => !line.startsWith('>')).join('\n').trimEnd();
      expect(instructions).toContain('For each review item, accept or reject it.');

      const shared = commonPrefix(compose(after, 'Add a flag.'), compose(after, 'Remove a flag.'));
      expect(shared.startsWith(instructions)).toBe(true);
      const original = commonPrefix(compose(before, 'Add a flag.'), compose(before, 'Remove a flag.'));
      expect(original).toBe('> Original request: ');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('fidelity checker accepts prefixed items only with provenance (compiler-prompt-prefix-8)', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'playbook-prefix-'));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it.each(workflows)('$id: zero findings for the tool output', ({ id }) => {
    const { source, gears } = reference(id);
    expect(checkSourceGearsContract(source, prefix(dir, gears).text)).toEqual([]);
  });

  it('reports the mutants', () => {
    const { source, gears } = reference('code');
    const prefixed = prefix(dir, gears).text;
    const withoutSection = prefixed.slice(0, prefixed.indexOf(`\n${SECTION}`) + 1);
    expect(checkSourceGearsContract(source, withoutSection)).toEqual([
      'CODE-1: authored prompt fragments are out of Source order',
      'CODE-3: authored prompt fragments are out of Source order',
    ]);
    expect(checkSourceGearsContract(source, `${prefixed}- CODE-2: relays → tail\n`)).toEqual([
      'CODE-2: listed as prefixed but its prompt is in Source order',
    ]);
    expect(
      checkSourceGearsContract(source, `${prefixed}- CODE-9: relays → tail\n- CODE-1 moved\n`),
    ).toEqual([
      'Prefixed prompts: malformed entry: "- CODE-1 moved"',
      'Prefixed prompts: CODE-9 is not an item',
    ]);
    const dropped = prefixed.replace('> > Run results: <run-results>\n', '');
    expect(checkSourceGearsContract(source, dropped)).toContain(
      'source relay fragment at line 28 was dropped or changed',
    );
    // The landed CODE GEARS already carries the pass's output, so the
    // relay-first mutant moves CODE-1's trailing relays back before its first
    // instruction while the section still lists it.
    const relays = '>\n> > Original request: <caller-input>\n> > Run results: <run-results>\n';
    const relayFirst = gears
      .replace(relays, '')
      .replace(
        '> First determine whether',
        `${relays.slice(2)}>\n> First determine whether`,
      );
    expect(relayFirst).not.toBe(gears);
    expect(checkSourceGearsContract(source, relayFirst)).toEqual([
      'CODE-1: listed as prefixed but a relay precedes an instruction',
    ]);
    const twice = `${prefixed}\n${SECTION}\n\n- CODE-2: relays → tail\n`;
    expect(checkSourceGearsContract(source, twice)).toEqual([
      `Prefixed prompts: duplicate section at line ${twice.split('\n').lastIndexOf(SECTION) + 1}`,
      'CODE-2: listed as prefixed but its prompt is in Source order',
    ]);
  });
});

describe('prefix units keep ownership, multiplicity, and blank lines (compiler-prompt-prefix-9)', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'playbook-prefix-'));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it("keeps an instruction's authored blank lines and collapses only a moved block's", () => {
    expect(prompts(prefix(dir, flow([TEMPLATE]).gears).text).get('FLOW-1')).toEqual([
      'Create `notes.txt` with exactly this content:',
      '',
      '~~~text',
      'first',
      '',
      '',
      'second',
      '~~~',
      '',
      '> Request: <caller-input>',
    ]);
    const bounded = flow([['Do X.', '', '', '> Request: <caller-input>', '', 'Do Y.']]);
    expect(prompts(prefix(dir, bounded.gears).text).get('FLOW-1')).toEqual([
      'Do X.',
      '',
      'Do Y.',
      '',
      '> Request: <caller-input>',
    ]);
  });

  it('owns units by fragment and counts each occurrence', () => {
    const shared = flow([
      ['> Request: <caller-input>', '', 'Implement the request.', '', 'Report every result.'],
      ['> Request: <caller-input>', '', 'Test the change.', '', 'Report every result.'],
      ['> Request: <caller-input>', '', 'Run the tests.', '', 'Fix every failure.', '', 'Run the tests.'],
    ]);
    expect(checkSourceGearsContract(shared.source, prefix(dir, shared.gears).text)).toEqual([]);
    const repeated = flow([
      ['> Request: <caller-input>', '', 'Implement the request.', '', '> Request: <caller-input>', '', 'Report every result.'],
    ]);
    const both = prefix(dir, repeated.gears).text;
    expect(checkSourceGearsContract(repeated.source, both)).toEqual([]);
    expect(
      checkSourceGearsContract(repeated.source, both.replace('> > Request: <caller-input>\n>\n', '')),
    ).toEqual([
      'source instruction fragment at line 9 was dropped or changed',
      'FLOW-1: authored prompt fragments are out of Source order',
    ]);
    const masked = flow([
      ['> Request: <caller-input>', '', 'Implement the request.'],
      ['Test the change.', '', '> Request: <caller-input>'],
    ]);
    expect(
      checkSourceGearsContract(masked.source, `${prefix(dir, masked.gears).text}- FLOW-2: relays → tail\n`),
    ).toEqual(['FLOW-2: listed as prefixed but its prompt is in Source order']);
  });

  it('accepts a boundary of more than one blank line that the Source put between fragments', () => {
    const source = [
      '# Flow', '', 'Roles:', '', '- Coder', '',
      "When step 1 starts, Captain shall relay the request in quotes (`>`) and give Coder these instructions:",
      '', '> Request: <caller-input>', '',
      '```markdown', 'Implement the request.', '```', '',
      'Two blank lines then separate the second instruction from the first:', '',
      '```markdown', 'Report every result.', '```', '',
    ].join('\n');
    const gears = [
      '# Flow', '', 'Roles:', '', '- Coder', '',
      '### FLOW-1', '', 'When step 1 starts, Captain shall prompt Coder:', '',
      '> > Request: <caller-input>', '>', '> Implement the request.', '>', '>', '> Report every result.', '',
      'Results:', '- `done`: Coder finished.', '',
    ].join('\n');
    expect(checkSourceGearsContract(source, gears)).toEqual([]);
    const { text, stdout } = prefix(dir, gears);
    expect(stdout.trim()).toBe('FLOW-1');
    expect(prompts(text).get('FLOW-1')).toEqual([
      'Implement the request.', '', '', 'Report every result.', '', '> Request: <caller-input>',
    ]);
    expect(checkSourceGearsContract(source, text)).toEqual([]);
  });

  it('keeps the alternative assignment that shows the rewrite', () => {
    // Two items whose fragments mirror each other rewrite to identical prompts.
    const mirrored = flow([
      ['Implement the request.', '', '> Request: <caller-input>'],
      ['> Request: <caller-input>', '', 'Implement the request.'],
    ]);
    const { text, stdout } = prefix(dir, mirrored.gears);
    expect(stdout.trim()).toBe('FLOW-2');
    expect(checkSourceGearsContract(mirrored.source, text)).toEqual([]);
  });

  it('accepts moved bare relays authored through prose, alone and adjacent', () => {
    const source = [
      ...FLOW_HEAD,
      'When step 1 starts, Captain shall relay the caller input and the run results in quotes (`>`) before giving Coder this instruction:',
      '', '```markdown', 'Do X.', '```', '',
    ].join('\n');
    for (const bare of [['> <caller-input>'], ['> <caller-input>', '> <run-results>']]) {
      const gears = oneItem([...bare, '', 'Do X.']);
      expect(checkSourceGearsContract(source, gears)).toEqual([]);
      const { text, stdout } = prefix(dir, gears);
      expect(stdout.trim()).toBe('FLOW-1');
      expect(prompts(text).get('FLOW-1')).toEqual(['Do X.', '', ...bare]);
      expect(checkSourceGearsContract(source, text)).toEqual([]);
    }
  });

  it('accepts the boundaries the Source authored between fragments, including none', () => {
    const cases = [
      {
        // Two instruction fragments joined without a blank line.
        source: [
          ...FLOW_HEAD,
          'When step 1 starts, Captain shall relay the request in quotes (`>`) and give Coder these instructions, the second directly after the first:',
          '', '> Request: <caller-input>', '',
          '```markdown', 'Do X.', '```', '',
          '```markdown', 'Do Y.', '```', '',
        ],
        gears: oneItem(['> Request: <caller-input>', '', 'Do X.', 'Do Y.']),
        rewritten: ['Do X.', 'Do Y.', '', '> Request: <caller-input>'],
      },
      {
        // Two relay fragments joined without a blank line.
        source: [
          ...FLOW_HEAD,
          'When step 1 starts, Captain shall relay the request in quotes (`>`):',
          '', '> Request: <caller-input>', '',
          'and, directly below it, the summary in quotes (`>`):',
          '', '> Summary: <summary>', '',
          'Then Captain shall give Coder this instruction:',
          '', '```markdown', 'Do X.', '```', '',
        ],
        gears: oneItem(['> Request: <caller-input>', '> Summary: <summary>', '', 'Do X.']),
        rewritten: ['Do X.', '', '> Request: <caller-input>', '> Summary: <summary>'],
      },
      {
        // A relay fragment joined directly to an instruction stays beside it.
        source: [
          ...FLOW_HEAD,
          'When step 1 starts, Captain shall relay the summary in quotes (`>`):',
          '', '> Summary: <summary>', '',
          'and the request in quotes (`>`) directly followed by this instruction:',
          '', '> Request: <caller-input>', '',
          '```markdown', 'Do X.', '```', '',
        ],
        gears: oneItem(['> Summary: <summary>', '', '> Request: <caller-input>', 'Do X.']),
        rewritten: ['> Request: <caller-input>', 'Do X.', '', '> Summary: <summary>'],
      },
    ];
    for (const { source: lines, gears, rewritten } of cases) {
      const source = lines.join('\n');
      expect(checkSourceGearsContract(source, gears)).toEqual([]);
      const { text, stdout } = prefix(dir, gears);
      expect(stdout.trim()).toBe('FLOW-1');
      expect(prompts(text).get('FLOW-1')).toEqual(rewritten);
      expect(checkSourceGearsContract(source, text)).toEqual([]);
    }
  });

  it('keeps the authored boundary after a relay that stays in place', () => {
    // The second relay follows `Prepare.` directly, so it stays, and the two
    // blank lines Source authored after it survive with it.
    const source = [
      ...FLOW_HEAD,
      'When step 1 starts, Captain shall give Coder these instructions, the second directly after the first:',
      '', '```markdown', '> First: <first>', '', 'Prepare.', '```', '',
      '```markdown', '> Second: <second>', '', '', 'Execute.', '```', '',
    ].join('\n');
    const gears = oneItem(['> First: <first>', '', 'Prepare.', '> Second: <second>', '', '', 'Execute.']);
    expect(checkSourceGearsContract(source, gears)).toEqual([]);
    const { text, stdout } = prefix(dir, gears);
    expect(stdout.trim()).toBe('FLOW-1');
    expect(prompts(text).get('FLOW-1')).toEqual([
      'Prepare.', '> Second: <second>', '', '', 'Execute.', '', '> First: <first>',
    ]);
    expect(checkSourceGearsContract(source, text)).toEqual([]);
    // The authored count is exact: one or three blank lines there is a change.
    for (const blanks of [1, 3]) {
      const changed = text.replace('> > Second: <second>\n>\n>\n> Execute.', `> > Second: <second>\n${'>\n'.repeat(blanks)}> Execute.`);
      expect(changed).not.toBe(text);
      expect(checkSourceGearsContract(source, changed)).toContain(
        'FLOW-1: authored prompt fragments are out of Source order',
      );
    }
  });

  it('keeps the authored boundary before a relay that stays in place', () => {
    // The first fragment ends with a relay two blank lines after its
    // instruction; the second fragment's instruction follows it directly, so
    // the relay stays and the two blank lines before it survive.
    const source = [
      ...FLOW_HEAD,
      'When step 1 starts, Captain shall give Coder these instructions, the second directly after the first:',
      '', '```markdown', '> Zero: <zero>', '', 'Prepare.', '', '', '> First: <first>', '```', '',
      '```markdown', 'Execute.', '```', '',
    ].join('\n');
    const gears = oneItem(['> Zero: <zero>', '', 'Prepare.', '', '', '> First: <first>', 'Execute.']);
    expect(checkSourceGearsContract(source, gears)).toEqual([]);
    const { text, stdout } = prefix(dir, gears);
    expect(stdout.trim()).toBe('FLOW-1');
    expect(prompts(text).get('FLOW-1')).toEqual([
      'Prepare.', '', '', '> First: <first>', 'Execute.', '', '> Zero: <zero>',
    ]);
    expect(checkSourceGearsContract(source, text)).toEqual([]);
    for (const blanks of [1, 3]) {
      const changed = text.replace('> Prepare.\n>\n>\n> > First: <first>', `> Prepare.\n${'>\n'.repeat(blanks)}> > First: <first>`);
      expect(changed).not.toBe(text);
      expect(checkSourceGearsContract(source, changed)).toContain(
        'FLOW-1: authored prompt fragments are out of Source order',
      );
    }
  });

  it('conserves identical fragments across many items without a search bound', () => {
    const same = ['> Context: <context>', '', 'Act.'];
    const seven = flow(Array.from({ length: 7 }, () => same));
    const sevenRewritten = prefix(dir, seven.gears);
    expect(sevenRewritten.stdout.trim().split('\n')).toHaveLength(7);
    expect(checkSourceGearsContract(seven.source, sevenRewritten.text)).toEqual([]);
    // Deleting one of the seven leaves six occurrences for seven fragments.
    const seventh = sevenRewritten.text.slice(sevenRewritten.text.indexOf('### FLOW-7'), sevenRewritten.text.indexOf('## Prefixed prompts'));
    const dropped = checkSourceGearsContract(seven.source, sevenRewritten.text.replace(seventh, '').replace('- FLOW-7: relays → tail\n', ''));
    expect(dropped).toHaveLength(1);
    expect(dropped[0]).toMatch(/^source instruction fragment at line \d+ was dropped or changed$/);
    const many = flow(Array.from({ length: 65 }, () => same));
    const kept = Array.from({ length: 64 }, (_unused, index) => `FLOW-${index + 1}`);
    const last = prefix(dir, many.gears, kept);
    expect(last.stdout.trim()).toBe('FLOW-65');
    expect(checkSourceGearsContract(many.source, last.text)).toEqual([]);
  });

  it('reports a fragment that only a tiling already spent could cover', () => {
    // Mirrored items rewrite to the same prompt: deleting one item leaves one
    // prompt, which can stand for one of the two authored fragments only.
    const mirrored = flow([
      ['Act.', '', '> Context: <context>'],
      ['> Context: <context>', '', 'Act.'],
    ]);
    const rewritten = prefix(dir, mirrored.gears).text;
    expect(checkSourceGearsContract(mirrored.source, rewritten)).toEqual([]);
    const firstItem = rewritten.slice(rewritten.indexOf('### FLOW-1'), rewritten.indexOf('### FLOW-2'));
    expect(checkSourceGearsContract(mirrored.source, rewritten.replace(firstItem, ''))).toEqual([
      'source instruction fragment at line 17 was dropped or changed',
    ]);
    // One prompt composed of both fragments loses one of them the same way.
    const composed = {
      source: [
        ...FLOW_HEAD,
        'When step 1 starts, Captain shall give Coder these two instructions:', '',
        '```markdown', 'Act.', '', '> Context: <context>', '```', '',
        '```markdown', '> Context: <context>', '', 'Act.', '```', '',
      ].join('\n'),
      gears: oneItem(['Act.', '', '> Context: <context>', '', '> Context: <context>', '', 'Act.']),
    };
    const both = prefix(dir, composed.gears).text;
    expect(checkSourceGearsContract(composed.source, both)).toEqual([]);
    const halved = both.replace('> Act.\n>\n> Act.', '> Act.').replace('> > Context: <context>\n>\n> > Context: <context>', '> > Context: <context>');
    expect(prompts(halved).get('FLOW-1')).toEqual(['Act.', '', '> Context: <context>']);
    expect(checkSourceGearsContract(composed.source, halved)).toEqual([
      'source instruction fragment at line 15 was dropped or changed',
    ]);
  });

  it("holds an instruction's interior blank lines exact", () => {
    const { source, gears } = flow([TEMPLATE]);
    const text = prefix(dir, gears).text;
    expect(checkSourceGearsContract(source, text)).toEqual([]);
    for (const blanks of [0, 1, 3]) {
      const changed = text.replace('> first\n>\n>\n> second', `> first\n${'>\n'.repeat(blanks)}> second`);
      expect(checkSourceGearsContract(source, changed)).toContain(
        'source instruction fragment at line 9 was dropped or changed',
      );
    }
  });
});
