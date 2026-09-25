// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

import { describe, expect, it } from 'vitest';

import { codeMachine, type CodeContext } from './code.fsm.js';
import {
  enumerateAwaitBossReply,
  enumerateNestedPlaybookStates,
  enumeratePlayerStates,
  enumerateRootEvents,
} from './code.fsm.introspect.js';

const CONTEXT: CodeContext = {
  runResults: 'unit tests passed',
  callerInput: 'Implement the intent.',
  coderOutput: 'Committed the requested change.',
  codeCommit: 'abc123',
  irNumber: '040',
  irTask: 'Implement task 1.',
};

describe('CODE FSM introspection', () => {
  it('enumerates the two Coder states with exact GEARS identity', () => {
    const states = enumeratePlayerStates(codeMachine);
    expect(states.map(({ stateId, sourceItem }) => ({ stateId, sourceItem }))).toEqual([
      { stateId: 'firstPhase', sourceItem: 'CODE-1' },
      { stateId: 'irTaskPhase', sourceItem: 'CODE-3' },
    ]);
    expect(states.map((state) => state.getInput(CONTEXT).role)).toEqual([
      'coder',
      'coder',
    ]);
  });

  it('enumerates both literal REVIEW calls and their exact inputs', () => {
    const states = enumerateNestedPlaybookStates(codeMachine);
    expect(states.map(({ stateId, sourceItem }) => ({ stateId, sourceItem }))).toEqual([
      { stateId: 'reviewNewIntentPhase', sourceItem: 'CODE-2' },
      { stateId: 'reviewIrTaskPhase', sourceItem: 'CODE-4' },
    ]);
    expect(states.map((state) => state.getInput(CONTEXT))).toEqual([
      {
        stateId: 'reviewNewIntentPhase',
        sourceItem: 'CODE-2',
        playbookId: 'review',
        text:
          '> Original intent: Implement the intent.\n' +
          '> Review scope: the commit abc123 from this coding phase and its resulting repository state.\n' +
          '> Coder output: Committed the requested change.',
      },
      {
        stateId: 'reviewIrTaskPhase',
        sourceItem: 'CODE-4',
        playbookId: 'review',
        text:
          '> Original intent: Implement the intent.\n' +
          '> Review scope: the commit abc123 from this coding phase and its resulting repository state.\n' +
          '> Coder output: Committed the requested change.\n' +
          '\n' +
          '> Current IR task: Implement task 1.',
      },
    ]);
  });

  it('exposes one entry, empty-reply failure, and two resume arms', () => {
    expect(enumerateRootEvents(codeMachine)).toEqual({
      startCode: { target: 'firstPhase' },
    });
    expect(
      enumerateAwaitBossReply(codeMachine).bossReplyTransitions.map(
        ({ target }) => target,
      ),
    ).toEqual(['failed', 'firstPhase', 'irTaskPhase']);
  });
});
