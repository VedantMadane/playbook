// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createActor, fromPromise, waitFor } from 'xstate';

import { parseGearsContract } from '../../../scripts/check-slc-source-gears.mjs';
import { ACCEPTED_OUTCOME_ACTION_TYPE } from '../../../src/accepted-outcome.js';
import {
  concurrentRoleSets,
  reviewMachine,
  type PlayerInput,
  type ReviewContext,
} from './review.fsm.js';
import { reviewPlaybookRegistryEntry } from './review.registry.js';

interface RawState {
  tags?: readonly string[];
  meta?: unknown;
  invoke?: {
    src?: unknown;
    input?: (args: { context: ReviewContext }) => PlayerInput;
    onDone?: RawTransition | readonly RawTransition[];
  };
  on?: Record<string, RawTransition | readonly RawTransition[]>;
  states?: Record<string, RawState>;
}

interface RawMachineConfig {
  on?: Record<string, RawTransition | readonly RawTransition[]>;
  states?: Record<string, RawState>;
}

interface RawTransition {
  guard?: unknown;
  target?: unknown;
  actions?: unknown;
}

interface TransitionFixture {
  // `undefined` names the unguarded malformed-output fallback arm.
  guard: string | undefined;
  target: string;
  context: ReviewContext;
  event: unknown;
}

const gears = new Map(
  parseGearsContract(
    readFileSync(new URL('./review.gears.md', import.meta.url), 'utf8'),
  ).map((item) => [item.id, item]),
);

const machineConfig = (
  reviewMachine as unknown as { config: RawMachineConfig }
).config;
const states = machineConfig.states ?? {};

const expected = [
  ['reviewFirstRound', 'REVIEW-1'],
  ['fixFindings', 'REVIEW-2'],
  ['reviewAfterCommit', 'REVIEW-3'],
  ['reviewAfterRejection', 'REVIEW-4'],
] as const;

const context: ReviewContext = {
  callerInput: 'Initial request',
  reviewerOutput: 'Reviewer findings',
  coderOutput: 'Coder disposition',
  latestCommit: '1111111111111111111111111111111111111111',
  evaluatedRevision: '3333333333333333333333333333333333333333',
};

const done = (output: unknown) => ({
  type: 'xstate.done.actor.player',
  output,
});

const pendingContext = (
  stateId:
    | 'reviewFirstRound'
    | 'fixFindings'
    | 'reviewAfterCommit'
    | 'reviewAfterRejection',
  sourceItem: 'REVIEW-1' | 'REVIEW-2' | 'REVIEW-3' | 'REVIEW-4',
  roleId: 'coder' | 'reviewer',
  extra: ReviewContext = {},
): ReviewContext => ({
  ...context,
  ...extra,
  pendingBossQuestion: {
    questionId: stateId,
    resumeStateId: stateId,
    sourceItem,
    asker: { kind: 'role', roleId },
    question: 'Which requirement applies?',
  },
});

const interrupt = (targetId: string) => ({
  type: 'BOSS_INTERRUPT',
  targetId,
  bossIntent: 'Redo this round.',
});

const transitionFixtures: Record<string, readonly TransitionFixture[]> = {
  // Each Boss jump is guarded by its target id and by the typed context the
  // target round needs, so no round is entered without its evidence.
  'root.on.BOSS_INTERRUPT': [
    {
      guard: 'canInterruptTo',
      target: '#reviewFirstRound',
      context: { callerInput: 'Initial request' },
      event: interrupt('reviewFirstRound'),
    },
    {
      guard: 'canInterruptTo',
      target: '#fixFindings',
      context,
      event: interrupt('fixFindings'),
    },
    {
      guard: 'canInterruptTo',
      target: '#reviewAfterCommit',
      context: { ...context, coderOutcome: 'committed' },
      event: interrupt('reviewAfterCommit'),
    },
    {
      guard: 'canInterruptTo',
      target: '#reviewAfterRejection',
      context: { ...context, coderOutcome: 'rejectedAll' },
      event: interrupt('reviewAfterRejection'),
    },
  ],
  'reviewFirstRound.invoke.onDone': [
    {
      guard: 'isFindings',
      target: 'fixFindings',
      context,
      event: done({ guard: 'findings', reviewerOutput: 'Finding 1' }),
    },
    {
      guard: 'isClean',
      target: 'done',
      context,
      event: done({
        guard: 'clean',
        evaluatedRevision: '3333333333333333333333333333333333333333',
      }),
    },
    {
      guard: 'needsBossReply',
      target: 'awaitBossReply',
      context,
      event: done({ guard: 'needsBossReply', question: 'Which scope?' }),
    },
    {
      guard: undefined,
      target: 'failed',
      context,
      event: done({ guard: 'findings' }),
    },
  ],
  'fixFindings.invoke.onDone': [
    {
      guard: 'isCommitted',
      target: 'reviewAfterCommit',
      context,
      event: done({
        guard: 'committed',
        coderOutput: 'Committed the accepted fixes.',
        latestCommit: '2222222222222222222222222222222222222222',
      }),
    },
    {
      guard: 'isRejectedAll',
      target: 'reviewAfterRejection',
      context,
      event: done({
        guard: 'rejectedAll',
        coderOutput: 'Rejected with evidence',
      }),
    },
    {
      guard: 'needsBossReply',
      target: 'awaitBossReply',
      context,
      event: done({ guard: 'needsBossReply', question: 'Which scope?' }),
    },
    {
      // A commit claim without the receipt-derived commit identity accepts
      // no arm and fails closed.
      guard: undefined,
      target: 'failed',
      context,
      event: done({ guard: 'committed', coderOutput: 'Committed.' }),
    },
  ],
  'reviewAfterCommit.invoke.onDone': [
    {
      guard: 'isFindings',
      target: 'fixFindings',
      context,
      event: done({ guard: 'findings', reviewerOutput: 'Finding 2' }),
    },
    {
      guard: 'isClean',
      target: 'done',
      context,
      event: done({
        guard: 'clean',
        evaluatedRevision: '3333333333333333333333333333333333333333',
      }),
    },
    {
      guard: 'needsBossReply',
      target: 'awaitBossReply',
      context,
      event: done({ guard: 'needsBossReply', question: 'Which scope?' }),
    },
    {
      guard: undefined,
      target: 'failed',
      context,
      event: done({ guard: 'clean' }),
    },
  ],
  'reviewAfterRejection.invoke.onDone': [
    {
      guard: 'isFindings',
      target: 'fixFindings',
      context,
      event: done({ guard: 'findings', reviewerOutput: 'Finding remains' }),
    },
    {
      guard: 'isClean',
      target: 'done',
      context,
      event: done({
        guard: 'clean',
        evaluatedRevision: '3333333333333333333333333333333333333333',
      }),
    },
    {
      guard: 'needsBossReply',
      target: 'awaitBossReply',
      context,
      event: done({ guard: 'needsBossReply', question: 'Which scope?' }),
    },
    {
      guard: undefined,
      target: 'failed',
      context,
      event: done({ guard: 'needsBossReply', question: '  ' }),
    },
  ],
  // A resume also requires the typed context its round needs, so each
  // follow-up round's fixture carries the Coder disposition that entered it.
  'awaitBossReply.on.BOSS_REPLY': [
    {
      guard: 'emptyBossReply',
      target: '#failed',
      context: pendingContext('reviewFirstRound', 'REVIEW-1', 'reviewer'),
      event: {
        type: 'BOSS_REPLY',
        questionId: 'reviewFirstRound',
        answer: '  ',
      },
    },
    {
      guard: 'resumesState',
      target: '#reviewFirstRound',
      context: pendingContext('reviewFirstRound', 'REVIEW-1', 'reviewer'),
      event: {
        type: 'BOSS_REPLY',
        questionId: 'reviewFirstRound',
        answer: 'Answer',
      },
    },
    {
      guard: 'resumesState',
      target: '#fixFindings',
      context: pendingContext('fixFindings', 'REVIEW-2', 'coder'),
      event: {
        type: 'BOSS_REPLY',
        questionId: 'fixFindings',
        answer: 'Answer',
      },
    },
    {
      guard: 'resumesState',
      target: '#reviewAfterCommit',
      context: pendingContext('reviewAfterCommit', 'REVIEW-3', 'reviewer', {
        coderOutcome: 'committed',
      }),
      event: {
        type: 'BOSS_REPLY',
        questionId: 'reviewAfterCommit',
        answer: 'Answer',
      },
    },
    {
      guard: 'resumesState',
      target: '#reviewAfterRejection',
      context: pendingContext('reviewAfterRejection', 'REVIEW-4', 'reviewer', {
        coderOutcome: 'rejectedAll',
      }),
      event: {
        type: 'BOSS_REPLY',
        questionId: 'reviewAfterRejection',
        answer: 'Answer',
      },
    },
  ],
};

function orderedTransitions(
  current: Record<string, RawState>,
  parent = '',
): Map<string, readonly RawTransition[]> {
  const found = new Map<string, readonly RawTransition[]>();
  if (parent === '') {
    for (const [event, transitions] of Object.entries(machineConfig.on ?? {})) {
      if (Array.isArray(transitions)) found.set(`root.on.${event}`, transitions);
    }
  }
  for (const [key, state] of Object.entries(current)) {
    const path = parent === '' ? key : `${parent}.${key}`;
    if (Array.isArray(state.invoke?.onDone)) {
      found.set(`${path}.invoke.onDone`, state.invoke.onDone);
    }
    for (const [event, transitions] of Object.entries(state.on ?? {})) {
      if (Array.isArray(transitions)) {
        found.set(`${path}.on.${event}`, transitions);
      }
    }
    for (const [nestedPath, transitions] of orderedTransitions(
      state.states ?? {},
      path,
    )) {
      found.set(nestedPath, transitions);
    }
  }
  return found;
}

function guardName(guard: unknown): string | undefined {
  if (typeof guard === 'string') return guard;
  if (typeof guard !== 'object' || guard === null) return undefined;
  const type = (guard as { type?: unknown }).type;
  return typeof type === 'string' ? type : undefined;
}

function guardParams(guard: unknown): unknown {
  return typeof guard === 'object' && guard !== null
    ? (guard as { params?: unknown }).params
    : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function acceptedOutcomeMarkers(
  transition: RawTransition,
): readonly unknown[] {
  const actions =
    transition.actions === undefined
      ? []
      : Array.isArray(transition.actions)
        ? transition.actions
        : [transition.actions];
  return actions
    .filter(
      (action) =>
        isRecord(action) && action.type === ACCEPTED_OUTCOME_ACTION_TYPE,
    )
    .map((action) => action.params);
}

describe('REVIEW GEARS to FSM compilation', () => {
  it('maps every REVIEW item once with its canonical role and exact prompt', () => {
    expect([...gears.keys()]).toEqual(expected.map(([, item]) => item));
    // playbook-1: the FSM export and the registry manifest agree on the
    // (empty) ordered concurrent role sets.
    expect(concurrentRoleSets).toEqual([]);
    expect(concurrentRoleSets).toEqual(
      reviewPlaybookRegistryEntry.concurrentRoleSets,
    );
    for (const [stateId, sourceItem] of expected) {
      const item = gears.get(sourceItem);
      const input = states[stateId]?.invoke?.input?.({ context });
      expect(input).toBeDefined();
      expect(input?.stateId).toBe(stateId);
      expect(input?.sourceItem).toBe(sourceItem);
      expect(item?.player).toBeDefined();
      expect(input?.role).toBe(item?.player?.toLowerCase());
      expect(input?.prompt).toBe(item?.prompt.join('\n'));
      expect(states[stateId]?.tags).toContain('playbook.busy');
      expect(states[stateId]?.meta).toEqual({
        playbook: {
          stateId,
          description: expect.any(String),
          role: item?.player?.toLowerCase(),
        },
      });
    }
  });

  it('preserves each authored result contract and adds only Boss suspension', () => {
    for (const [stateId, sourceItem] of expected) {
      const input = states[stateId]?.invoke?.input?.({ context });
      const entries = Object.entries(input?.result ?? {});
      expect(entries.slice(0, -1)).toEqual(
        (gears.get(sourceItem)?.results ?? []).map(
          ({ guard, description }) => [guard, description],
        ),
      );
      expect(entries.at(-1)?.[0]).toBe('needsBossReply');
    }
  });

  it('tells the adjudicator in every Reviewer outcome that a progress report supports none', () => {
    // compiler-results-13 / playbook-21: the adjudicator reads only each
    // outcome's result description, so the Source's qualification that a
    // progress report, status update, or promise of a later result supports
    // no review outcome sits in every Reviewer result the judge selects from.
    const qualification =
      'a progress report, status update, or promise of a later result does not support this outcome';
    for (const [stateId, sourceItem] of expected) {
      const input = states[stateId]?.invoke?.input?.({ context });
      if (input?.role !== 'reviewer') continue;
      expect(Object.keys(input.result), stateId).toEqual([
        'findings',
        'clean',
        'needsBossReply',
      ]);
      for (const guard of ['findings', 'clean']) {
        expect(input.result[guard], `${stateId}.${guard}`).toContain(
          qualification,
        );
      }
      for (const { guard, description } of gears.get(sourceItem)?.results ??
        []) {
        expect(description, `${sourceItem}.${guard}`).toContain(qualification);
      }
    }
  });

  it('has one load-bearing fixture for every ordered transition arm', () => {
    const actual = orderedTransitions(states);
    expect([...actual.keys()]).toEqual(Object.keys(transitionFixtures));

    const guards = reviewMachine.implementations.guards as unknown as Record<
      string,
      (
        args: { context: ReviewContext; event: unknown },
        params: unknown,
      ) => boolean
    >;
    for (const [location, fixtures] of Object.entries(transitionFixtures)) {
      const arms = actual.get(location) ?? [];
      expect(
        arms.map((arm) => ({ guard: guardName(arm.guard), target: arm.target })),
        location,
      ).toEqual(fixtures.map(({ guard, target }) => ({ guard, target })));

      fixtures.forEach((fixture, index) => {
        const evaluations = arms.slice(0, index + 1).map((arm) => {
          const name = guardName(arm.guard);
          return name === undefined
            ? true
            : guards[name](
                { context: fixture.context, event: fixture.event },
                guardParams(arm.guard),
              );
        });
        expect(evaluations, `${location}[${index}]`).toEqual([
          ...Array.from({ length: index }, () => false),
          true,
        ]);
      });
    }
  });

  it('marks all twelve governed outcomes with stable identities', () => {
    const governed = [
      {
        stateId: 'reviewFirstRound',
        expected: [
          {
            source: 'reviewFirstRound',
            target: 'fixFindings',
            acceptedOutcome: 'findings',
          },
          {
            source: 'reviewFirstRound',
            target: 'done',
            acceptedOutcome: 'clean',
          },
          {
            source: 'reviewFirstRound',
            target: 'awaitBossReply',
            acceptedOutcome: 'needsBossReply',
          },
        ],
      },
      {
        stateId: 'fixFindings',
        expected: [
          {
            source: 'fixFindings',
            target: 'reviewAfterCommit',
            acceptedOutcome: 'committed',
          },
          {
            source: 'fixFindings',
            target: 'reviewAfterRejection',
            acceptedOutcome: 'rejectedAll',
          },
          {
            source: 'fixFindings',
            target: 'awaitBossReply',
            acceptedOutcome: 'needsBossReply',
          },
        ],
      },
      {
        stateId: 'reviewAfterCommit',
        expected: [
          {
            source: 'reviewAfterCommit',
            target: 'fixFindings',
            acceptedOutcome: 'findings',
          },
          {
            source: 'reviewAfterCommit',
            target: 'done',
            acceptedOutcome: 'clean',
          },
          {
            source: 'reviewAfterCommit',
            target: 'awaitBossReply',
            acceptedOutcome: 'needsBossReply',
          },
        ],
      },
      {
        stateId: 'reviewAfterRejection',
        expected: [
          {
            source: 'reviewAfterRejection',
            target: 'fixFindings',
            acceptedOutcome: 'findings',
          },
          {
            source: 'reviewAfterRejection',
            target: 'done',
            acceptedOutcome: 'clean',
          },
          {
            source: 'reviewAfterRejection',
            target: 'awaitBossReply',
            acceptedOutcome: 'needsBossReply',
          },
        ],
      },
    ] as const;

    for (const { stateId, expected } of governed) {
      const onDone = states[stateId]?.invoke?.onDone;
      expect(Array.isArray(onDone), stateId).toBe(true);
      const arms = onDone as readonly RawTransition[];
      // The trailing unguarded malformed-output fallback accepts no outcome
      // and so carries no marker.
      expect(arms).toHaveLength(expected.length + 1);
      expect(
        arms.map((arm) => acceptedOutcomeMarkers(arm)),
        stateId,
      ).toEqual([...expected.map((marker) => [marker]), []]);
      expect(arms.at(-1)?.guard, stateId).toBeUndefined();
    }
  });

  it('keeps every round relay quoted, ordered, and receipt- or player-owned', () => {
    // Every round relays the complete caller input (original intent, review
    // scope, and context) ahead of the round-specific evidence.
    expect(gears.get('REVIEW-1')?.prompt).toContain('> Original request: <caller-input>');
    expect(gears.get('REVIEW-2')?.prompt).toEqual(
      expect.arrayContaining(['> Original request: <caller-input>', '> Reviewer findings: <reviewer-output>']),
    );
    expect(gears.get('REVIEW-3')?.prompt).toEqual(
      expect.arrayContaining([
        '> Original request: <caller-input>',
        '> Latest commit: <latest-commit>',
        '> Coder output: <coder-output>',
      ]),
    );
    expect(gears.get('REVIEW-4')?.prompt).toEqual(
      expect.arrayContaining(['> Original request: <caller-input>', '> Coder output: <coder-output>']),
    );
    // The evaluated revision relays only where a receipt-derived review-fix
    // commit exists; no other round leaves a placeholder without a producer.
    for (const [id, item] of gears) {
      if (id === 'REVIEW-3') continue;
      expect(item.prompt, id).not.toContain('> Latest commit: <latest-commit>');
    }
    const review3 = gears.get('REVIEW-3')?.prompt ?? [];
    expect(review3.indexOf('> Original request: <caller-input>')).toBeLessThan(
      review3.indexOf('> Latest commit: <latest-commit>'),
    );
    expect(review3.indexOf('> Latest commit: <latest-commit>')).toBeLessThan(
      review3.indexOf('> Coder output: <coder-output>'),
    );
    // DR-065: the prefix pass moved every relay block after the last
    // instruction line; the layout itself records each move.
    for (const [id, item] of gears) {
      const firstRelay = item.prompt.findIndex((line) => line.startsWith('> '));
      expect(firstRelay, id).toBeGreaterThan(0);
      expect(item.prompt[firstRelay - 1], id).toBe('');
      expect(
        item.prompt.slice(firstRelay).every((line) => line.startsWith('> ')),
        id,
      ).toBe(true);
    }

    const text = readFileSync(
      new URL('./review.gears.md', import.meta.url),
      'utf8',
    );
    expect(text).toContain(
      '`reviewerOutput: <verbatim final text>`',
    );
    expect(text).toContain('`coderOutput: <verbatim final text>`');
    // The review-fix commit identity is annotated as a commit identity, not
    // verbatim player text: it is receipt-owned effect evidence.
    expect(text).toContain('`latestCommit: <commit identity>`');
    expect(text).not.toContain('`latestCommit: <verbatim final text>`');
    expect(text).not.toMatch(/^## Prefixed prompts$/m);
  });

  // playbook-13/-15: a resumed call that fails leaves its working state
  // without suspending for its own question, so the failure exit clears the
  // pending question and reply rather than parking them in `failed`.
  it.each(
    (
      [
        ['reviewFirstRound', []],
        ['fixFindings', [{ guard: 'findings', reviewerOutput: '1. Finding' }]],
        [
          'reviewAfterCommit',
          [
            { guard: 'findings', reviewerOutput: '1. Finding' },
            {
              guard: 'committed',
              latestCommit: '2222222222222222222222222222222222222222',
              coderOutput: 'Fixed.',
            },
          ],
        ],
        [
          'reviewAfterRejection',
          [
            { guard: 'findings', reviewerOutput: '1. Finding' },
            { guard: 'rejectedAll', coderOutput: 'Rejected with evidence.' },
          ],
        ],
      ] as const
    ).flatMap(([stateId, before]) =>
      (['actor error', 'malformed output'] as const).map(
        (failure) => [stateId, failure, before] as const,
      ),
    ),
  )(
    'clears the Boss reply when resumed %s fails with %s',
    async (stateId, failure, before) => {
      const inputs: PlayerInput[] = [];
      const script: unknown[] = [
        ...before,
        { guard: 'needsBossReply', question: 'Which release applies?' },
        failure === 'actor error'
          ? new Error('player is down')
          : stateId === 'fixFindings'
            ? { guard: 'committed', coderOutput: 'Committed.' }
            : { guard: 'findings' },
      ];
      const actor = createActor(
        reviewMachine.provide({
          actors: {
            player: fromPromise(async ({ input }: { input: PlayerInput }) => {
              inputs.push(input);
              const next = script.shift();
              if (next instanceof Error) throw next;
              return next as never;
            }),
          },
        }),
      ).start();
      actor.send({ type: 'START_REVIEW', callerInput: 'Review the release.' });
      await waitFor(actor, (snapshot) => snapshot.matches('awaitBossReply'));
      expect(actor.getSnapshot().context.pendingBossQuestion).toMatchObject({
        resumeStateId: stateId,
      });

      actor.send({ type: 'BOSS_REPLY', answer: 'Use 6.0.' });
      const failed = await waitFor(actor, (snapshot) =>
        snapshot.matches('failed'),
      );

      // The resumed call carried the question and reply it answers ...
      expect(inputs.at(-1)).toMatchObject({
        stateId,
        pendingBossQuestion: { question: 'Which release applies?' },
        bossReply: 'Use 6.0.',
      });
      // ... and its failure keeps neither.
      expect(failed.context.lastError).toBeDefined();
      expect(failed.context.pendingBossQuestion).toBeUndefined();
      expect(failed.context.bossReply).toBeUndefined();
      expect(script).toEqual([]);
      actor.stop();
    },
  );

  it('refuses a Boss jump into a round whose typed context is missing', () => {
    const guards = reviewMachine.implementations.guards as unknown as Record<
      string,
      (
        args: { context: ReviewContext; event: unknown },
        params: unknown,
      ) => boolean
    >;
    const enterable = (probe: ReviewContext) =>
      expected
        .map(([targetId]) => targetId)
        .filter((targetId) =>
          guards.canInterruptTo(
            { context: probe, event: interrupt(targetId) },
            { targetId },
          ),
        );
    expect(enterable({})).toEqual([]);
    expect(enterable({ callerInput: 'Initial request' })).toEqual([
      'reviewFirstRound',
    ]);
    // Findings and a Coder disposition exist, but no disposition is recorded,
    // so neither follow-up round can be entered.
    expect(enterable(context)).toEqual(['reviewFirstRound', 'fixFindings']);
  });

  it('requires receipt-derived identities before accepting commit or completion', () => {
    const guards = reviewMachine.implementations.guards as unknown as Record<
      string,
      (
        args: { context: ReviewContext; event: unknown },
        params: unknown,
      ) => boolean
    >;
    expect(
      guards.isCommitted(
        {
          context,
          event: done({ guard: 'committed', coderOutput: 'Committed.' }),
        },
        undefined,
      ),
    ).toBe(false);
    expect(
      guards.isCommitted(
        {
          context,
          event: done({
            guard: 'committed',
            coderOutput: 'Committed.',
            latestCommit: '   ',
          }),
        },
        undefined,
      ),
    ).toBe(false);
    // DR-045: completion equally requires the receipt-observed revision.
    expect(
      guards.isClean(
        { context, event: done({ guard: 'clean' }) },
        undefined,
      ),
    ).toBe(false);
    expect(
      guards.isClean(
        {
          context,
          event: done({ guard: 'clean', evaluatedRevision: ' ' }),
        },
        undefined,
      ),
    ).toBe(false);
  });

  it('derives the terminal result from the receipt-observed revision only', () => {
    const output = (
      reviewMachine as unknown as {
        config: { output: (args: { context: ReviewContext }) => unknown };
      }
    ).config.output;
    expect(output({ context })).toEqual({
      noUnsettledFindings: true,
      evaluatedRevision: '3333333333333333333333333333333333333333',
    });
    // DR-045: completion without a receipt-observed revision is guarded out;
    // the output derivation refuses to fabricate one.
    expect(() =>
      output({ context: { callerInput: 'Initial request' } }),
    ).toThrow(/without a receipt-observed evaluated revision/);
  });

  it('declares the terminal kind of its one final state', () => {
    const states = (
      reviewMachine as unknown as {
        config: {
          states: Record<
            string,
            { type?: string; description?: string; meta?: unknown }
          >;
        };
      }
    ).config.states;
    // DR-048: REVIEW's only completion is a success, so a caller's `onDone`
    // proves approval without reading REVIEW's output fields.
    expect(
      Object.entries(states)
        .filter(([, state]) => state.type === 'final')
        .map(([id]) => id),
    ).toEqual(['done']);
    expect(states.done?.meta).toEqual({
      playbook: {
        stateId: 'done',
        description: states.done?.description,
        terminal: 'success',
      },
    });
  });
});
