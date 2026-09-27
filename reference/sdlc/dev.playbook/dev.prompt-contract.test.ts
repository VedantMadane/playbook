// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

import { describe, expect, it } from 'vitest';

import {
  devMachine,
  renderDiscussionExchange,
  type DevContext,
  type PlayerInput,
} from './dev.fsm.js';
import { enumeratePlayerStates } from './dev.fsm.introspect.js';
import { _internal } from './dev.playbook.js';

const promptIdentity = (roleId: string): string => roleId;
const composePlayerPrompt = (input: PlayerInput, resuming?: boolean): string =>
  _internal.composePlayerPrompt(input, promptIdentity, resuming);

const PLANNING_NOTE_BOUND = [
  'It holds only the path and, in at most ten lines, why',
  'It holds no design, proposal, implementation instruction, or file-level finding: the playbooks own those.',
] as const;

const BOSS_QUESTION_RULE = [
  'A question to Boss, only when the answer would change which path runs or whether any work is wanted: one short question naming the alternatives it decides between, and nothing else.',
  'A reply that chooses a path asks Boss nothing; a reply that asks Boss chooses no path.',
] as const;

const ACTUAL_CONTEXT: DevContext = {
  runResults: 'tests passed',
  developmentRequest: 'Plan the request.',
  discussionContext: renderDiscussionExchange('Narrow or broad?', 'Narrow.'),
};

function planInput(overrides: Partial<PlayerInput> = {}): PlayerInput {
  return {
    stateId: 'planAnalysis',
    role: 'analyst',
    sourceItem: 'DEV-1',
    prompt: [
      'Plan which playbooks run for this request.',
      '',
      '> Original request: <development-request>',
      '> Prior discussion: <discussion-context>',
      '> Run results: <run-results>',
    ].join('\n'),
    result: { code: 'done' },
    developmentRequest: 'line one\nline two',
    discussionContext: 'Analyst question: Which?\nBoss reply: The first.',
    runResults: 'test one\ntest two',
    ...overrides,
  };
}

describe('DEV player prompt composition', () => {
  it.each([undefined, false, true])('exposes the runtime composer arguments (resuming=%s)', (resuming) => {
    const input = planInput({
      pendingBossQuestion: {
        questionId: 'planAnalysis',
        resumeStateId: 'planAnalysis',
        sourceItem: 'DEV-1',
        asker: { kind: 'role', roleId: 'analyst' },
        question: 'Which exact scope?',
      },
      bossReply: 'Use the narrow scope.',
    });
    const body = composePlayerPrompt(planInput());
    const identity = (): string => { throw new Error('DEV does not request role identity'); };
    const prompt = resuming === undefined
      ? _internal.composePlayerPrompt(input, identity)
      : _internal.composePlayerPrompt(input, identity, resuming);
    expect(prompt).toBe([
      'Continue the same task using Boss’s reply below.',
      ...(resuming === true ? [] : ['Your previous question:\nWhich exact scope?']),
      'Boss reply:\nUse the narrow scope.',
      body,
    ].join('\n\n'));
  });

  it('forbids repository changes in the authored planning prompt', () => {
    for (const state of enumeratePlayerStates(devMachine)) {
      const input = state.getInput(ACTUAL_CONTEXT);
      expect(input.prompt).toContain(
        'Do not change files or commit while planning or discussing the request.',
      );
      expect(composePlayerPrompt(input)).toContain(
        'Do not change files or commit while planning or discussing the request.',
      );
    }
  });

  // DR-061: the planning note is the children's instruction, so the prompt
  // bounds what it may hold and what it may never hold.
  it.each(PLANNING_NOTE_BOUND)('bounds the planning note: %s', (sentence) => {
    for (const state of enumeratePlayerStates(devMachine)) {
      const input = state.getInput(ACTUAL_CONTEXT);
      expect(input.prompt).toContain(sentence);
      expect(composePlayerPrompt(input)).toContain(sentence);
    }
  });

  // DR-061: a Boss question is a routing instrument, never a design request,
  // and never shares a reply with a chosen path.
  it.each(BOSS_QUESTION_RULE)('confines a Boss question: %s', (sentence) => {
    for (const state of enumeratePlayerStates(devMachine)) {
      const input = state.getInput(ACTUAL_CONTEXT);
      expect(input.prompt).toContain(sentence);
      expect(composePlayerPrompt(input)).toContain(sentence);
    }
  });

  it('keeps every line of relayed values inside Markdown quotes', () => {
    expect(composePlayerPrompt(planInput())).toBe(
      [
        'Plan which playbooks run for this request.',
        '',
        '> Original request: line one',
        '> line two',
        '> Prior discussion: Analyst question: Which?',
        '> Boss reply: The first.',
        '> Run results: test one',
        '> test two',
      ].join('\n'),
    );
  });

  it('omits the optional relays when no value exists yet', () => {
    const prompt = composePlayerPrompt(
      planInput({ discussionContext: '', runResults: '' }),
    );
    expect(prompt).not.toContain('<discussion-context>');
    expect(prompt).not.toContain('<run-results>');
    expect(prompt).not.toContain('\n> \n');
    expect(prompt).toContain(
      'Plan which playbooks run for this request.\n\n> Original request: line one\n> line two',
    );
  });

  it('feeds the machine-tracked discussion context into the relay', () => {
    const state = enumeratePlayerStates(devMachine)[0]!;
    const input = state.getInput(ACTUAL_CONTEXT);
    expect(input.discussionContext).toBe(ACTUAL_CONTEXT.discussionContext);
    // The composed prompt is exactly the authored DEV-1 body (equal to its
    // GEARS item, per the gears-fsm suite) in its prefix layout (DR-065):
    // every instruction line first, then the three quoted relays, each
    // placeholder bound to its own field and every continuation line of a
    // multiline value kept inside the quote.
    const values: Record<string, string> = {
      '<development-request>': 'Plan the request.',
      '<discussion-context>': 'Analyst question: Narrow or broad?\nBoss reply: Narrow.',
      '<run-results>': 'tests passed',
    };
    const expected = input.prompt
      .split('\n')
      .map((line) =>
        line.replace(/<[a-z-]+>/g, (token) =>
          values[token]!.replaceAll('\n', '\n> '),
        ),
      )
      .join('\n');
    expect(composePlayerPrompt(input)).toBe(expected);
    expect(expected.endsWith(
      '\n\n> Original request: Plan the request.\n> Prior discussion: Analyst question: Narrow or broad?\n> Boss reply: Narrow.\n> Run results: tests passed',
    )).toBe(true);
    expect(expected.startsWith(
      'Plan which playbooks run for this request; the playbooks do the work.\n',
    )).toBe(true);
  });

  it('prepends the universal continuation before authored content', () => {
    const prompt = composePlayerPrompt(
      planInput({
        pendingBossQuestion: {
          questionId: 'planAnalysis',
          resumeStateId: 'planAnalysis',
          sourceItem: 'DEV-1',
          asker: { kind: 'role', roleId: 'analyst' },
          question: 'Which scope?',
        },
        bossReply: 'Use the narrow scope.',
      }),
    );
    expect(prompt).toMatch(
      /^Continue the same task[\s\S]*Your previous question:\nWhich scope\?\n\nBoss reply:\nUse the narrow scope\.\n\nPlan which playbooks run for this request\.\n\n> Original request: line one/,
    );
  });
});
