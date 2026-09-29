// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

import { assign, fromPromise, setup } from 'xstate';

export type BranchStateId = 'createBranch';

export type BranchSourceItem = 'BRANCH-1';

/**
 * Stable working-leaf ids that may suspend on a Boss question and be resumed
 * by `BOSS_REPLY`. The machine has at most one active player task, so the
 * scalar Boss-reply form applies.
 */
const RESUMABLE_STATE_IDS = ['createBranch'] as const;
export type ResumableStateId = (typeof RESUMABLE_STATE_IDS)[number];

/** JSON-safe normalization of a rejected invocation, retained for inspection. */
export type NormalizedError = {
  readonly name: string;
  readonly message: string;
  readonly stack?: string;
};

/** Question record raised by the suspended Coder working leaf. */
export type PendingBossQuestion = {
  readonly questionId: ResumableStateId;
  readonly resumeStateId: ResumableStateId;
  readonly sourceItem: BranchSourceItem;
  readonly asker: { readonly kind: 'role'; readonly roleId: 'coder' };
  readonly question: string;
};

/** Typed input for the delegated `player` actor. */
export type PlayerInput = {
  readonly stateId: 'createBranch';
  readonly role: 'coder';
  readonly sourceItem: 'BRANCH-1';
  readonly prompt: string;
  readonly result: Readonly<Record<string, string>>;
  /** Backs the prompt's `<caller-input>` placeholder with the exact caller input. */
  readonly callerInput: string;
  readonly pendingBossQuestion?: PendingBossQuestion;
  readonly bossReply?: string;
};

/** Discriminated result contract of the delegated `player` actor. */
export type PlayerOutput =
  | {
      readonly guard: 'branched';
      readonly branch: string;
      /** Exact base revision from repository authority, not from Coder's prose. */
      readonly baseRevision: string;
      readonly issueSummary: string;
    }
  | { readonly guard: 'refused'; readonly coderOutput: string }
  | { readonly guard: 'needsBossReply'; readonly question: string };

/**
 * Terminal result: exactly the packaged `branch` workflow's public output
 * interface (workflow-contracts.json), derived from typed context.
 */
export type BranchPlaybookOutput =
  | {
      readonly status: 'branched';
      /** Exact new branch name. */
      readonly branch: string;
      /** Exact receipt-observed repository revision the branch was created from. */
      readonly baseRevision: string;
      /** Concise issue-and-comments or request summary. */
      readonly issueSummary: string;
    }
  | {
      readonly status: 'refused';
      /** Complete refusal report. */
      readonly coderOutput: string;
    };

/** The machine reads no input: the caller input arrives on `START_BRANCH`. */
export type BranchInput = Readonly<Record<never, never>>;

export type BranchCompletion = 'branched' | 'refused';

export type BranchContext = {
  readonly callerInput?: string;
  readonly branch?: string;
  readonly baseRevision?: string;
  readonly issueSummary?: string;
  readonly coderOutput?: string;
  readonly completion?: BranchCompletion;
  readonly lastError?: NormalizedError;
  readonly pendingBossQuestion?: PendingBossQuestion;
  readonly bossReply?: string;
};

/** Typed Boss surfaces: the caller's entry event and the Boss reply. */
export type BranchEvent =
  | { readonly type: 'START_BRANCH'; readonly callerInput: string }
  | {
      readonly type: 'BOSS_REPLY';
      readonly answer: string;
      readonly questionId?: ResumableStateId;
    };

/** No parallel group in this playbook. */
export const concurrentRoleSets: readonly (readonly string[])[] = [];

const CREATE_BRANCH_PROMPT = [
  'Prepare a new branch for this work without changing any file or making any commit.',
  'Identify the GitHub issue the request names, if any, and read it with its comments (`gh issue view --comments` with the issue number).',
  'If the request could refer to more than one issue, or does not say which work to branch for, ask Boss before creating anything.',
  "Confirm that the working tree is clean and that `gh` is authenticated for the repository's GitHub remote.",
  'Name the branch `issue-N-short-kebab-slug` for issue number N, otherwise a short kebab-case slug of the request.',
  'Create the branch from the current commit and check it out; do not pull, reset, stash, or move HEAD to another commit.',
  'Report the exact branch name, the commit it was created from, and a concise summary of the issue and its comments, or of the request when no issue is named.',
  'If the working tree is not clean, `gh` is not authenticated, the named issue does not exist or cannot be read, or a branch with that name already exists locally or on the remote, create nothing and report the failure with its reason.',
  '',
  '> Original request: <caller-input>',
].join('\n');

const NEEDS_BOSS_REPLY_RESULT =
  "The acting agent's prose surfaces a clarifying question for Boss that the agent cannot answer alone. Output shall include `question: <verbatim question text from the acting agent's prose>`.";

const CREATE_BRANCH_RESULTS = {
  branched:
    "Coder affirmatively reported that it created the new branch from the current commit and checked it out, with the exact branch name and a concise summary of the issue and its comments, or of the request when no issue is named; the absence of a reported obstacle is not support. The branch workflow is then complete and returns the exact branch name, the exact base revision taken from repository authority, and the issue summary to its caller. Output shall include `branch: <exact branch name>`, `baseRevision: <exact base revision from repository authority, not from Coder's prose>`, and `issueSummary: <concise summary of the issue and its comments, or of the request when no issue is named>`.",
  refused:
    "Coder affirmatively reported that it created no branch and gave the failure with its reason, such as a working tree that is not clean, gh not being authenticated, a named issue that does not exist or cannot be read, or a branch with that name already existing locally or on the remote. The branch workflow then fails and reports Coder's complete result with its reason to its caller; no branch was created. Output shall include `coderOutput: <verbatim final text>`.",
  needsBossReply: NEEDS_BOSS_REPLY_RESULT,
} as const;

const STATE_DESCRIPTIONS = {
  ready: 'Waiting for the caller to give a development request to branch for.',
  createBranch:
    'Coder is identifying the request\'s issue and creating and checking out a new branch at the current commit.',
  awaitBossReply: "Waiting for Boss to answer the acting agent's question.",
  failed:
    'The branch workflow failed and is waiting for the caller to give the request again.',
  branched:
    'A new branch for the request was created at the current commit and checked out; the workflow returns its exact name, the exact base revision taken from repository authority, and the issue summary.',
  refused:
    "No branch was created: Coder reported the failure with its reason, and the workflow fails and reports Coder's complete result to its caller.",
} as const;

type DescribedStateId = keyof typeof STATE_DESCRIPTIONS;

function playbookMeta(stateId: DescribedStateId, role?: 'coder') {
  return {
    playbook: {
      stateId,
      description: STATE_DESCRIPTIONS[stateId],
      ...(role === undefined ? {} : { role }),
    },
  };
}

/** A final state also publishes whether its outcome is success or failure. */
function terminalMeta(
  stateId: DescribedStateId,
  terminal: 'success' | 'failure',
) {
  return {
    playbook: {
      stateId,
      description: STATE_DESCRIPTIONS[stateId],
      terminal,
    },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

/**
 * Narrows an unknown event's `output` structurally to the declared `player`
 * contract. Output missing a field its guard requires narrows to `undefined`.
 */
function playerOutputOf(event: unknown): PlayerOutput | undefined {
  if (!isRecord(event) || !isRecord(event.output)) return undefined;
  const output = event.output;
  if (
    output.guard === 'branched' &&
    isNonEmptyString(output.branch) &&
    isNonEmptyString(output.baseRevision) &&
    isNonEmptyString(output.issueSummary)
  ) {
    return {
      guard: 'branched',
      branch: output.branch,
      baseRevision: output.baseRevision,
      issueSummary: output.issueSummary,
    };
  }
  if (output.guard === 'refused' && isNonEmptyString(output.coderOutput)) {
    return { guard: 'refused', coderOutput: output.coderOutput };
  }
  if (output.guard === 'needsBossReply' && isNonEmptyString(output.question)) {
    return { guard: 'needsBossReply', question: output.question };
  }
  return undefined;
}

/** Narrows an unknown event's `error` structurally to a JSON-safe record. */
function normalizedErrorOf(event: unknown): NormalizedError {
  const error = isRecord(event) ? event.error : undefined;
  if (error instanceof Error) {
    const name = error.name || 'Error';
    return typeof error.stack === 'string'
      ? { name, message: error.message, stack: error.stack }
      : { name, message: error.message };
  }
  if (isRecord(error)) {
    const name = typeof error.name === 'string' ? error.name : 'Error';
    const message =
      typeof error.message === 'string'
        ? error.message
        : 'player actor rejected without a normalized error';
    return typeof error.stack === 'string'
      ? { name, message, stack: error.stack }
      : { name, message };
  }
  return {
    name: 'Error',
    message:
      typeof error === 'string'
        ? error
        : 'player actor rejected without a normalized error',
  };
}

function isResumableStateId(value: string): value is ResumableStateId {
  return (RESUMABLE_STATE_IDS as readonly string[]).includes(value);
}

type ResumeTransition = {
  readonly guard: {
    readonly type: 'canResume';
    readonly params: { readonly stateId: ResumableStateId };
  };
  readonly target: `#${ResumableStateId}`;
  readonly reenter: true;
  readonly actions: 'acceptBossReply';
};

/** Builds one guarded `BOSS_REPLY` resume arm per registered working-leaf id. */
function resumableStates(
  ids: readonly ResumableStateId[],
): ResumeTransition[] {
  return ids.map((id) => ({
    guard: { type: 'canResume', params: { stateId: id } },
    target: `#${id}`,
    reenter: true,
    actions: 'acceptBossReply',
  }));
}

const machineSetup = setup({
  types: {} as {
    context: BranchContext;
    events: BranchEvent;
    input: BranchInput;
    output: BranchPlaybookOutput;
  },
  actors: {
    player: fromPromise<PlayerOutput, PlayerInput>(async () => {
      throw new Error('player actor must be provided by the runner');
    }),
  },
  guards: {
    // The entry guard validates the text the current event supplies, before
    // the entry action copies it into context.
    givesRequest: ({ event }) =>
      event.type === 'START_BRANCH' && isNonEmptyString(event.callerInput),
    isBranched: ({ event }) => playerOutputOf(event)?.guard === 'branched',
    isRefused: ({ event }) => playerOutputOf(event)?.guard === 'refused',
    needsBossReply: (
      { event },
      params: { readonly stateId: ResumableStateId },
    ) =>
      playerOutputOf(event)?.guard === 'needsBossReply' &&
      isResumableStateId(params.stateId),
    canResume: (
      { context, event },
      params: { readonly stateId: ResumableStateId },
    ) => {
      if (event.type !== 'BOSS_REPLY' || !isNonEmptyString(event.answer)) {
        return false;
      }
      const pending = context.pendingBossQuestion;
      if (pending === undefined || pending.resumeStateId !== params.stateId) {
        return false;
      }
      return (
        event.questionId === undefined ||
        event.questionId === pending.questionId
      );
    },
  },
  actions: {
    'playbook.acceptedOutcome': (
      _args,
      _params: {
        readonly source: string;
        readonly target: string;
        readonly acceptedOutcome: string;
      },
    ) => undefined,
    startBranch: assign(({ context, event }): Partial<BranchContext> => {
      if (event.type !== 'START_BRANCH') return {};
      return {
        callerInput: event.callerInput,
        ...(context.lastError === undefined ? {} : { lastError: undefined }),
        ...(context.pendingBossQuestion === undefined
          ? {}
          : { pendingBossQuestion: undefined }),
        ...(context.bossReply === undefined ? {} : { bossReply: undefined }),
      };
    }),
    rememberBranched: assign(({ context, event }): Partial<BranchContext> => {
      const output = playerOutputOf(event);
      if (output?.guard !== 'branched') return {};
      return {
        branch: output.branch,
        baseRevision: output.baseRevision,
        issueSummary: output.issueSummary,
        completion: 'branched',
        ...(context.pendingBossQuestion === undefined
          ? {}
          : { pendingBossQuestion: undefined }),
        ...(context.bossReply === undefined ? {} : { bossReply: undefined }),
      };
    }),
    rememberRefused: assign(({ context, event }): Partial<BranchContext> => {
      const output = playerOutputOf(event);
      if (output?.guard !== 'refused') return {};
      return {
        coderOutput: output.coderOutput,
        completion: 'refused',
        ...(context.pendingBossQuestion === undefined
          ? {}
          : { pendingBossQuestion: undefined }),
        ...(context.bossReply === undefined ? {} : { bossReply: undefined }),
      };
    }),
    setPendingBossQuestion: assign(
      (
        { context, event },
        params: {
          readonly stateId: ResumableStateId;
          readonly sourceItem: BranchSourceItem;
        },
      ): Partial<BranchContext> => {
        const output = playerOutputOf(event);
        if (output?.guard !== 'needsBossReply') return {};
        return {
          pendingBossQuestion: {
            questionId: params.stateId,
            resumeStateId: params.stateId,
            sourceItem: params.sourceItem,
            asker: { kind: 'role', roleId: 'coder' },
            question: output.question,
          },
          ...(context.bossReply === undefined ? {} : { bossReply: undefined }),
        };
      },
    ),
    acceptBossReply: assign(({ event }): Partial<BranchContext> =>
      event.type === 'BOSS_REPLY' ? { bossReply: event.answer } : {},
    ),
    clearBossReplyContext: assign(({ context }): Partial<BranchContext> =>
      context.pendingBossQuestion === undefined &&
      context.bossReply === undefined
        ? {}
        : { pendingBossQuestion: undefined, bossReply: undefined },
    ),
    rememberActorError: assign(({ event }): Partial<BranchContext> => ({
      lastError: normalizedErrorOf(event),
    })),
    rememberMalformedPlayerOutput: assign((): Partial<BranchContext> => ({
      lastError: {
        name: 'MalformedPlayerOutput',
        message:
          'Coder result for BRANCH-1 did not satisfy a declared outcome of its result contract.',
      },
    })),
    rememberMalformedBossReply: assign((): Partial<BranchContext> => ({
      lastError: {
        name: 'MalformedBossReply',
        message:
          'BOSS_REPLY carried an empty answer or named no pending question.',
      },
    })),
  },
});

export const branchMachine = machineSetup.createMachine({
  id: 'branch',
  initial: 'ready',
  context: () => ({}),
  output: ({ context }): BranchPlaybookOutput => {
    if (context.completion === 'branched') {
      if (
        !isNonEmptyString(context.branch) ||
        !isNonEmptyString(context.baseRevision) ||
        !isNonEmptyString(context.issueSummary)
      ) {
        throw new Error(
          'BRANCH reached branched without the exact branch name, base revision, and issue summary',
        );
      }
      return {
        status: 'branched',
        branch: context.branch,
        baseRevision: context.baseRevision,
        issueSummary: context.issueSummary,
      };
    }
    if (context.completion === 'refused') {
      if (!isNonEmptyString(context.coderOutput)) {
        throw new Error("BRANCH reached refused without Coder's complete result");
      }
      return { status: 'refused', coderOutput: context.coderOutput };
    }
    throw new Error('BRANCH reached a final state without a recorded completion');
  },
  states: {
    ready: {
      id: 'ready',
      description: STATE_DESCRIPTIONS.ready,
      meta: playbookMeta('ready'),
      tags: ['playbook.parked'],
      on: {
        START_BRANCH: {
          guard: 'givesRequest',
          target: 'createBranch',
          actions: 'startBranch',
        },
      },
    },
    createBranch: {
      id: 'createBranch',
      description: STATE_DESCRIPTIONS.createBranch,
      meta: playbookMeta('createBranch', 'coder'),
      tags: ['playbook.busy'],
      invoke: {
        src: 'player',
        input: ({ context }): PlayerInput => ({
          stateId: 'createBranch',
          role: 'coder',
          sourceItem: 'BRANCH-1',
          prompt: CREATE_BRANCH_PROMPT,
          result: CREATE_BRANCH_RESULTS,
          // Entry is guarded on a non-empty caller input, so this state is
          // never entered without it.
          callerInput: context.callerInput ?? '',
          ...(context.pendingBossQuestion === undefined
            ? {}
            : { pendingBossQuestion: context.pendingBossQuestion }),
          ...(context.bossReply === undefined
            ? {}
            : { bossReply: context.bossReply }),
        }),
        onDone: [
          {
            guard: 'isBranched',
            target: 'branched',
            actions: [
              {
                type: 'playbook.acceptedOutcome',
                params: {
                  source: 'createBranch',
                  target: 'branched',
                  acceptedOutcome: 'branched',
                },
              },
              'rememberBranched',
            ],
          },
          {
            guard: 'isRefused',
            target: 'refused',
            actions: [
              {
                type: 'playbook.acceptedOutcome',
                params: {
                  source: 'createBranch',
                  target: 'refused',
                  acceptedOutcome: 'refused',
                },
              },
              'rememberRefused',
            ],
          },
          {
            guard: {
              type: 'needsBossReply',
              params: { stateId: 'createBranch' },
            },
            target: 'awaitBossReply',
            actions: [
              {
                type: 'playbook.acceptedOutcome',
                params: {
                  source: 'createBranch',
                  target: 'awaitBossReply',
                  acceptedOutcome: 'needsBossReply',
                },
              },
              {
                type: 'setPendingBossQuestion',
                params: { stateId: 'createBranch', sourceItem: 'BRANCH-1' },
              },
            ],
          },
          {
            target: 'failed',
            actions: 'rememberMalformedPlayerOutput',
          },
        ],
        onError: { target: 'failed', actions: 'rememberActorError' },
      },
    },
    awaitBossReply: {
      id: 'awaitBossReply',
      description: STATE_DESCRIPTIONS.awaitBossReply,
      meta: playbookMeta('awaitBossReply'),
      tags: ['playbook.parked'],
      on: {
        BOSS_REPLY: [
          ...resumableStates(RESUMABLE_STATE_IDS),
          {
            target: 'failed',
            actions: ['rememberMalformedBossReply', 'clearBossReplyContext'],
          },
        ],
        START_BRANCH: {
          guard: 'givesRequest',
          target: 'createBranch',
          actions: 'startBranch',
        },
      },
    },
    failed: {
      id: 'failed',
      description: STATE_DESCRIPTIONS.failed,
      meta: playbookMeta('failed'),
      tags: ['playbook.parked'],
      on: {
        START_BRANCH: {
          guard: 'givesRequest',
          target: 'createBranch',
          actions: 'startBranch',
        },
      },
    },
    branched: {
      id: 'branched',
      description: STATE_DESCRIPTIONS.branched,
      meta: terminalMeta('branched', 'success'),
      type: 'final',
    },
    refused: {
      id: 'refused',
      description: STATE_DESCRIPTIONS.refused,
      meta: terminalMeta('refused', 'failure'),
      type: 'final',
    },
  },
});

export default branchMachine;
