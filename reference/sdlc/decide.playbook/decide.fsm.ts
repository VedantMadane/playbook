// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>
//
// FSM object artifact compiled from ./decide.gears.md by gears2fsm.
// It declares only the machine, its actor contracts, and typed inputs; the
// linked runtime supplies the `player` and `playbook` actor implementations.

import { assign, fromPromise, setup } from 'xstate';
import { validatePlaybookCallResult } from '@sublang/playbook/xstate-runtime';
import type { PlaybookCallResult } from '@sublang/playbook/runtime';

// ---------------------------------------------------------------------------
// Shared JSON and error shapes (exact readonly variance of the shared boundary)
// ---------------------------------------------------------------------------

export type JsonValue =
  | null
  | boolean
  | number
  | string
  | readonly JsonValue[]
  | { readonly [key: string]: JsonValue };

export interface CompactError {
  readonly name: string;
  readonly message: string;
}

export interface ErrorRecord {
  readonly name: string;
  readonly message: string;
  readonly stack?: string;
}

// ---------------------------------------------------------------------------
// Identities
// ---------------------------------------------------------------------------

/** Canonical lowercase local ids of the source roles Coder and Reviewer. */
export type DecideRoleId = 'coder' | 'reviewer';

export type DecideSourceItem = 'DECIDE-1' | 'DECIDE-2' | 'DECIDE-3' | 'DECIDE-4';

/** Delegated-player working leaves; each is its own Boss-reply resume target. */
export type ResumableStateId =
  | 'askCoderProposal'
  | 'askReviewerProposal'
  | 'synthesizeCommit';

/**
 * Root `BOSS_INTERRUPT` targets: the parallel proposal pair as one jumpable
 * unit (DECIDE-1, DECIDE-2), and the synthesis leaf (DECIDE-3). Branch working
 * leaves and waits are never interrupt targets.
 */
export type JumpableStateId = 'independentProposals' | 'synthesizeCommit';

/**
 * One role-id array per parallel group, in first-item source order; the inner
 * array follows the `independent-proposals` item order (DECIDE-1, DECIDE-2).
 */
export const concurrentRoleSets: readonly (readonly DecideRoleId[])[] = [
  ['coder', 'reviewer'],
] as const;

/** The literal nested-call target of DECIDE-4. */
const REVIEW_PLAYBOOK_ID = 'review' as const;

// ---------------------------------------------------------------------------
// Boss-reply suspension (keyed form: the machine has parallel player tasks)
// ---------------------------------------------------------------------------

export interface PendingBossQuestion {
  readonly questionId: ResumableStateId;
  readonly resumeStateId: ResumableStateId;
  readonly sourceItem: 'DECIDE-1' | 'DECIDE-2' | 'DECIDE-3';
  readonly asker: { readonly kind: 'role'; readonly roleId: DecideRoleId };
  readonly question: string;
}

export type PendingBossQuestions = Partial<
  Record<ResumableStateId, PendingBossQuestion>
>;

export type BossReplies = Partial<Record<ResumableStateId, string>>;

const RESUMABLE_STATES = {
  askCoderProposal: { sourceItem: 'DECIDE-1', roleId: 'coder' },
  askReviewerProposal: { sourceItem: 'DECIDE-2', roleId: 'reviewer' },
  synthesizeCommit: { sourceItem: 'DECIDE-3', roleId: 'coder' },
} as const satisfies Record<
  ResumableStateId,
  {
    readonly sourceItem: PendingBossQuestion['sourceItem'];
    readonly roleId: DecideRoleId;
  }
>;

// ---------------------------------------------------------------------------
// Prompts (each item's blockquote, verbatim) and local result contracts
// ---------------------------------------------------------------------------

const NEEDS_BOSS_REPLY_DESCRIPTION =
  "The acting agent's prose surfaces a clarifying question for Boss that the agent cannot answer alone. Output shall include `question: <verbatim question text from the acting agent's prose>`.";

/** DECIDE-1 blockquote; `<caller-topic>` is carried as `callerTopic`. */
const CODER_PROPOSAL_PROMPT = [
  'Assess whether the topic is better expressed as a few spec items under @specs/packages/ or requires one or more DRs under @specs/decisions/.',
  'Propose your design.',
  'Keep your proposal coherent, focused, and concise.',
  'Consult @specs/map.md for relevant context and @specs/meta.md for spec requirements, if needed.',
  'Do not change any files.',
  '',
  '> Original topic: <caller-topic>',
].join('\n');

/** DECIDE-2 blockquote; `<caller-topic>` is carried as `callerTopic`. */
const REVIEWER_PROPOSAL_PROMPT = [
  'Assess whether the topic is better expressed as a few spec items under @specs/packages/ or requires one or more DRs under @specs/decisions/.',
  'Propose your design.',
  'Keep your proposal coherent, focused, and concise.',
  'Consult @specs/map.md for relevant context and @specs/meta.md for spec requirements, if needed.',
  'Do not change any files.',
  '',
  '> Original topic: <caller-topic>',
].join('\n');

/**
 * DECIDE-3 blockquote. `<caller-topic>` is carried as `callerTopic` and
 * `<reviewer-proposal>` as `reviewerProposal`. `<coder-llm>` and
 * `<reviewer-llm>` are local-role prompt identities of Coder and Reviewer: the
 * linker resolves them through the invocation-scoped `promptIdentity(roleId)`
 * lookup, so they stay literal here and have no machine or actor-input field.
 */
const SYNTHESIZE_COMMIT_PROMPT = [
  "Synthesize your independent proposal with Reviewer's proposal below.",
  'Keep to the original topic below and follow what it asks.',
  'Keep the best, essential parts of either proposal and reject any point that is unsound, unnecessary, or outside the topic.',
  'Turn the resulting design into the necessary DRs and/or spec items.',
  'Follow @specs/meta.md and update @specs/map.md when needed.',
  'Do not change code or implement the design.',
  '',
  'Commit the result as one new commit, following @specs/packages/git.md.',
  'Make the commit message explain concisely what changed and why.',
  'Identify every new commit you make.',
  'Credit every AI that contributed to this commit: Coder <coder-llm> and Reviewer <reviewer-llm>, whose proposal it carries.',
  '',
  '> Original topic: <caller-topic>',
  "> Reviewer's independent proposal: <reviewer-proposal>",
].join('\n');

const CODER_PROPOSAL_RESULT = {
  proposed:
    'Coder affirmatively provided a complete design proposal; a progress report, status update, or promise of a later proposal supports no proposal outcome. Output shall include `coderProposal: <verbatim final text>`.',
  needsBossReply: NEEDS_BOSS_REPLY_DESCRIPTION,
} as const;

const REVIEWER_PROPOSAL_RESULT = {
  proposed:
    'Reviewer affirmatively provided a complete design proposal; a progress report, status update, or promise of a later proposal supports no proposal outcome. Output shall include `reviewerProposal: <verbatim final text>`.',
  needsBossReply: NEEDS_BOSS_REPLY_DESCRIPTION,
} as const;

const SYNTHESIZE_COMMIT_RESULT = {
  committed:
    'Coder synthesized the proposals into the necessary DRs and/or spec items and committed the result as one new commit. Output shall include `coderOutput: <verbatim final text>` and `latestCommit: <commit identity>`.',
  needsBossReply: NEEDS_BOSS_REPLY_DESCRIPTION,
} as const;

/** DECIDE-4 blockquote: the `review` call-text template, verbatim. */
const REVIEW_COMMIT_TEMPLATE = [
  '> Original intent: <caller-topic>',
  '> Review scope: the `decide`-owned commit <decide-commit> and its resulting repository state.',
  "> Coder's independent proposal: <coder-proposal>",
  '> Coder output: <coder-output>',
].join('\n');

// ---------------------------------------------------------------------------
// Delegated player actor contract
// ---------------------------------------------------------------------------

interface PlayerInputBase {
  readonly pendingBossQuestion?: PendingBossQuestion;
  readonly bossReply?: string;
}

/** DECIDE-1: relays `<caller-topic>` as `callerTopic`. */
export interface CoderProposalInput extends PlayerInputBase {
  readonly stateId: 'askCoderProposal';
  readonly role: 'coder';
  readonly sourceItem: 'DECIDE-1';
  readonly prompt: string;
  readonly result: typeof CODER_PROPOSAL_RESULT;
  /** `<caller-topic>`: the caller's complete topic. */
  readonly callerTopic: string;
}

/** DECIDE-2: relays `<caller-topic>` as `callerTopic`. */
export interface ReviewerProposalInput extends PlayerInputBase {
  readonly stateId: 'askReviewerProposal';
  readonly role: 'reviewer';
  readonly sourceItem: 'DECIDE-2';
  readonly prompt: string;
  readonly result: typeof REVIEWER_PROPOSAL_RESULT;
  /** `<caller-topic>`: the caller's complete topic. */
  readonly callerTopic: string;
}

/**
 * DECIDE-3: relays `<caller-topic>` as `callerTopic` and
 * `<reviewer-proposal>` as `reviewerProposal`.
 */
export interface SynthesizeCommitInput extends PlayerInputBase {
  readonly stateId: 'synthesizeCommit';
  readonly role: 'coder';
  readonly sourceItem: 'DECIDE-3';
  readonly prompt: string;
  readonly result: typeof SYNTHESIZE_COMMIT_RESULT;
  /** `<caller-topic>`: the caller's complete topic. */
  readonly callerTopic: string;
  /** `<reviewer-proposal>`: Reviewer's complete independent proposal. */
  readonly reviewerProposal: string;
}

export type PlayerInput =
  | CoderProposalInput
  | ReviewerProposalInput
  | SynthesizeCommitInput;

export interface NeedsBossReplyOutput {
  readonly guard: 'needsBossReply';
  readonly question: string;
}

export type CoderProposalOutput =
  | { readonly guard: 'proposed'; readonly coderProposal: string }
  | NeedsBossReplyOutput;

export type ReviewerProposalOutput =
  | { readonly guard: 'proposed'; readonly reviewerProposal: string }
  | NeedsBossReplyOutput;

export type SynthesizeCommitOutput =
  | {
      readonly guard: 'committed';
      readonly coderOutput: string;
      /** Effect-owned: the runtime fills it from the repository receipt. */
      readonly latestCommit: string;
    }
  | NeedsBossReplyOutput;

export type PlayerOutput =
  | CoderProposalOutput
  | ReviewerProposalOutput
  | SynthesizeCommitOutput;

// ---------------------------------------------------------------------------
// Nested playbook actor contract
// ---------------------------------------------------------------------------

/** DECIDE-4: literal call of the builtin `review` playbook. */
export interface PlaybookInput {
  readonly stateId: 'reviewCommit';
  readonly sourceItem?: 'DECIDE-4';
  readonly playbookId: typeof REVIEW_PLAYBOOK_ID;
  readonly text: string;
}

/** A successful call yields the child's own JSON-safe machine output. */
export type PlaybookOutput = JsonValue | undefined;

/** Public output interface of the packaged builtin `review`. */
export interface ReviewOutput {
  readonly noUnsettledFindings: true;
  readonly evaluatedRevision: string;
}

/** Sanitized completed-result evidence of the `review` call that ended DECIDE. */
export type CompletedReviewResult =
  | {
      readonly playbookId: typeof REVIEW_PLAYBOOK_ID;
      readonly status: 'ok';
      readonly output?: JsonValue;
    }
  | {
      readonly playbookId: typeof REVIEW_PLAYBOOK_ID;
      readonly status: 'aborted' | 'error';
      readonly error: CompactError;
    };

// ---------------------------------------------------------------------------
// Machine input, context, events, and output
// ---------------------------------------------------------------------------

/** The machine reads no input: the caller's topic arrives on `START_DECIDE`. */
export type DecideInput = Readonly<Record<string, never>>;

export type ReviewStatus = 'aborted' | 'error';

/**
 * Typed run context. A text field holds `''` until its producer runs; every
 * transition that enters a consumer guards the fields it reads as non-empty.
 */
export interface DecideContext {
  /** `<caller-topic>`: set by `START_DECIDE` or a restarting interrupt. */
  readonly callerTopic: string;
  /** Branch-staged proposals; the parallel join promotes them atomically. */
  readonly stagedCoderProposal: string;
  readonly stagedReviewerProposal: string;
  /** `<coder-proposal>`: Coder's promoted independent proposal. */
  readonly coderProposal: string;
  /** `<reviewer-proposal>`: Reviewer's promoted independent proposal. */
  readonly reviewerProposal: string;
  /** `<coder-output>`: Coder's verbatim final synthesis text. */
  readonly coderOutput: string;
  /** `<decide-commit>`: DECIDE-3's accepted, receipt-owned `latestCommit`. */
  readonly decideCommit: string;
  /** Revision evaluated by the passing `review`. */
  readonly evaluatedRevision: string;
  /** Reported status when `review` did not pass the commit. */
  readonly reviewStatus: ReviewStatus | null;
  /** Compact failure DECIDE reports when `review` did not pass the commit. */
  readonly reviewError: CompactError | null;
  /** Sanitized evidence of the `review` result that ended DECIDE. */
  readonly reviewEvidence: CompletedReviewResult | null;
  readonly lastError: ErrorRecord | null;
  readonly pendingBossQuestions: PendingBossQuestions;
  readonly bossReplies: BossReplies;
}

export type DecideEvent =
  | { readonly type: 'START_DECIDE'; readonly callerTopic: string }
  | {
      readonly type: 'BOSS_INTERRUPT';
      readonly targetId: 'independentProposals';
      /** The new topic both proposal players receive. */
      readonly callerTopic: string;
    }
  | {
      readonly type: 'BOSS_INTERRUPT';
      readonly targetId: 'synthesizeCommit';
    }
  | {
      readonly type: 'BOSS_REPLY';
      readonly questionId: string;
      readonly answer: string;
    };

/** Exactly the catalog's public `decide` output interface. */
export type DecideOutput =
  | {
      readonly decideCommit: string;
      readonly evaluatedRevision: string;
      readonly noUnsettledFindings: true;
    }
  | {
      readonly lastDecideCommit: string;
      readonly noUnsettledFindings: false;
      readonly reviewStatus: ReviewStatus;
      readonly error?: CompactError;
    };

// ---------------------------------------------------------------------------
// State descriptions and public metadata
// ---------------------------------------------------------------------------

const STATE_DESCRIPTIONS = {
  ready: 'Waiting for the caller to give a topic to decide.',
  independentProposals:
    'Coder and Reviewer independently propose designs for the topic in parallel.',
  coderProposalRegion: "Coder's independent proposal branch.",
  askCoderProposal: 'Coder is independently proposing a design for the topic.',
  awaitCoderProposalReply:
    "Waiting for Boss to answer Coder's question about its independent proposal.",
  coderProposalStaged:
    "Coder's independent proposal is complete and staged for the join.",
  reviewerProposalRegion: "Reviewer's independent proposal branch.",
  askReviewerProposal:
    'Reviewer is independently proposing a design for the topic.',
  awaitReviewerProposalReply:
    "Waiting for Boss to answer Reviewer's question about its independent proposal.",
  reviewerProposalStaged:
    "Reviewer's independent proposal is complete and staged for the join.",
  synthesizeCommit:
    'Coder synthesizes both proposals into the necessary DRs and/or spec items and commits the result as one new commit.',
  awaitBossReply: "Waiting for Boss to answer the acting agent's question.",
  reviewCommit: 'The review playbook examines the decide-owned commit.',
  failed:
    'DECIDE parked after a control-plane failure and waits for Boss to restart or resume it.',
  reportedReviewFailure:
    "DECIDE reported review's abort, failure, or unestablished result to its caller with the last decide-owned commit.",
  done: 'DECIDE completed: review established no unsettled findings for the decide-owned commit at the reported evaluated revision.',
} as const;

type DescribedStateId = keyof typeof STATE_DESCRIPTIONS;

function playbookMeta(stateId: DescribedStateId, role?: DecideRoleId) {
  return {
    playbook: {
      stateId,
      description: STATE_DESCRIPTIONS[stateId],
      ...(role === undefined ? {} : { role }),
    },
  };
}

function terminalMeta(
  stateId: 'reportedReviewFailure' | 'done',
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

// ---------------------------------------------------------------------------
// Structural narrowing helpers
// ---------------------------------------------------------------------------

function isObject(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null;
}

function isPlainRecord(
  value: unknown,
): value is Readonly<Record<string, unknown>> {
  if (!isObject(value) || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isResumableStateId(value: unknown): value is ResumableStateId {
  return (
    value === 'askCoderProposal' ||
    value === 'askReviewerProposal' ||
    value === 'synthesizeCommit'
  );
}

/** The actor's `output`, narrowed structurally from an unknown done event. */
function actorOutput(
  event: unknown,
): Readonly<Record<string, unknown>> | undefined {
  if (!isObject(event)) return undefined;
  const output = event.output;
  return isPlainRecord(output) ? output : undefined;
}

function outputString(event: unknown, field: string): string | undefined {
  const value = actorOutput(event)?.[field];
  return isNonEmptyString(value) ? value : undefined;
}

function outputGuardIs(event: unknown, guard: PlayerOutput['guard']): boolean {
  return actorOutput(event)?.guard === guard;
}

/** The actor's `error`, narrowed structurally from an unknown error event. */
function actorError(event: unknown): unknown {
  return isObject(event) ? event.error : undefined;
}

/** Normalizes any thrown or malformed value to a JSON-safe error record. */
function errorRecord(value: unknown): ErrorRecord {
  if (value instanceof Error) {
    return {
      name: isNonEmptyString(value.name) ? value.name : 'Error',
      message: typeof value.message === 'string' ? value.message : '',
      ...(typeof value.stack === 'string' ? { stack: value.stack } : {}),
    };
  }
  if (isObject(value) && typeof value.message === 'string') {
    return {
      name: isNonEmptyString(value.name) ? value.name : 'Error',
      message: value.message,
    };
  }
  return {
    name: 'Error',
    message:
      typeof value === 'string'
        ? value
        : 'The actor failed with a non-Error value.',
  };
}

function withoutKey<Value>(
  record: Partial<Record<ResumableStateId, Value>>,
  stateId: ResumableStateId,
): Partial<Record<ResumableStateId, Value>> {
  const next: Partial<Record<ResumableStateId, Value>> = {};
  for (const key of Object.keys(record)) {
    if (!isResumableStateId(key) || key === stateId) continue;
    const value = record[key];
    if (value !== undefined) next[key] = value;
  }
  return next;
}

/**
 * Strict JSON validation: null, booleans, finite numbers, strings, exact
 * arrays, and plain records of enumerable own data properties. Cycle
 * detection tracks only the active recursion path.
 */
function isJsonValue(
  value: unknown,
  path: Set<object> = new Set(),
): value is JsonValue {
  if (value === null) return true;
  switch (typeof value) {
    case 'boolean':
    case 'string':
      return true;
    case 'number':
      return Number.isFinite(value);
    case 'object':
      break;
    default:
      return false;
  }
  const container = value as object;
  if (path.has(container)) return false;
  path.add(container);
  try {
    if (Array.isArray(container)) {
      if (Object.getPrototypeOf(container) !== Array.prototype) return false;
      const keys = Reflect.ownKeys(container);
      if (keys.length !== container.length + 1) return false;
      const lengthDescriptor = Object.getOwnPropertyDescriptor(
        container,
        'length',
      );
      if (
        lengthDescriptor === undefined ||
        lengthDescriptor.configurable !== false ||
        lengthDescriptor.enumerable !== false ||
        lengthDescriptor.value !== container.length
      ) {
        return false;
      }
      for (let index = 0; index < container.length; index += 1) {
        const descriptor = Object.getOwnPropertyDescriptor(
          container,
          String(index),
        );
        if (
          descriptor === undefined ||
          !descriptor.enumerable ||
          !('value' in descriptor) ||
          !isJsonValue(descriptor.value, path)
        ) {
          return false;
        }
      }
      return true;
    }
    const prototype = Object.getPrototypeOf(container);
    if (prototype !== Object.prototype && prototype !== null) return false;
    for (const key of Reflect.ownKeys(container)) {
      if (typeof key !== 'string') return false;
      const descriptor = Object.getOwnPropertyDescriptor(container, key);
      if (
        descriptor === undefined ||
        !descriptor.enumerable ||
        !('value' in descriptor) ||
        !isJsonValue(descriptor.value, path)
      ) {
        return false;
      }
    }
    return true;
  } finally {
    path.delete(container);
  }
}

// ---------------------------------------------------------------------------
// Actor-output narrowing (declared per-state result contracts)
// ---------------------------------------------------------------------------

function isCoderProposed(event: unknown): boolean {
  return (
    outputGuardIs(event, 'proposed') &&
    outputString(event, 'coderProposal') !== undefined
  );
}

function isReviewerProposed(event: unknown): boolean {
  return (
    outputGuardIs(event, 'proposed') &&
    outputString(event, 'reviewerProposal') !== undefined
  );
}

function isCommitted(event: unknown): boolean {
  return (
    outputGuardIs(event, 'committed') &&
    outputString(event, 'coderOutput') !== undefined &&
    outputString(event, 'latestCommit') !== undefined
  );
}

function isNeedsBossReply(event: unknown): boolean {
  return (
    outputGuardIs(event, 'needsBossReply') &&
    outputString(event, 'question') !== undefined
  );
}

// ---------------------------------------------------------------------------
// Nested `review` results
// ---------------------------------------------------------------------------

/**
 * Recognizes an authored rejected child result: a validated public result
 * whose status is `aborted` or `error`, or `ok` at the child's own authored
 * failure terminal. Anything else is a control-plane error.
 */
export function authoredChildResult(
  error: unknown,
  expectedPlaybookId: string,
): PlaybookCallResult | undefined {
  if (!(error instanceof Error)) return undefined;
  try {
    const result = validatePlaybookCallResult(
      (error as Error & { result?: unknown }).result,
      expectedPlaybookId,
    );
    return result.status !== 'ok' || result.terminal?.kind === 'failure'
      ? result
      : undefined;
  } catch {
    return undefined;
  }
}

/**
 * DECIDE-4's acceptance predicate on the builtin `review` public interface:
 * the result gives the exact evaluated repository revision and affirmatively
 * establishes that no unsettled findings remain. The shared bridge correlates
 * the result with the supplied review scope.
 */
function reviewApprovalFrom(event: unknown): ReviewOutput | undefined {
  const output = actorOutput(event);
  if (output === undefined) return undefined;
  if (
    output.noUnsettledFindings !== true ||
    !isNonEmptyString(output.evaluatedRevision)
  ) {
    return undefined;
  }
  return {
    noUnsettledFindings: true,
    evaluatedRevision: output.evaluatedRevision,
  };
}

/** Reported status, compact error, and evidence of an authored review failure. */
function authoredReviewFailureOf(event: unknown):
  | {
      readonly status: ReviewStatus;
      readonly error: CompactError;
      readonly evidence: CompletedReviewResult;
    }
  | undefined {
  const result = authoredChildResult(actorError(event), REVIEW_PLAYBOOK_ID);
  if (result === undefined) return undefined;
  if (result.status === 'ok') {
    // `ok` at review's own authored failure terminal: a review failure whose
    // own output is relayed as evidence.
    const description = result.terminal?.description;
    return {
      status: 'error',
      error: {
        name: 'ReviewFailed',
        message: isNonEmptyString(description)
          ? `review ended at its authored failure terminal: ${description}`
          : 'review ended at its authored failure terminal.',
      },
      evidence: {
        playbookId: REVIEW_PLAYBOOK_ID,
        status: 'ok',
        ...(result.output === undefined ? {} : { output: result.output }),
      },
    };
  }
  const error: CompactError =
    result.error !== undefined
      ? { name: result.error.name, message: result.error.message }
      : { name: 'AbortError', message: 'The review call was aborted.' };
  return {
    status: result.status,
    error,
    evidence: { playbookId: REVIEW_PLAYBOOK_ID, status: result.status, error },
  };
}

const REVIEW_NOT_ESTABLISHED: CompactError = {
  name: 'ReviewNotEstablished',
  message:
    'review returned a terminal result that does not establish the exact evaluated repository revision with no unsettled findings.',
};

// ---------------------------------------------------------------------------
// Nested call text composition (DECIDE-4 quoted relays)
// ---------------------------------------------------------------------------

const REVIEW_PLACEHOLDER =
  /<caller-topic>|<decide-commit>|<coder-proposal>|<coder-output>/g;

/**
 * Composes the `review` call text from the verbatim template, one line at a
 * time: a quoted relay line whose value is empty contributes no line, and a
 * multi-line value is quoted line by line. The composer adds no empty quoted
 * line of its own.
 */
function reviewCallText(context: DecideContext): string {
  const values: Readonly<Record<string, string>> = {
    '<caller-topic>': context.callerTopic,
    '<decide-commit>': context.decideCommit,
    '<coder-proposal>': context.coderProposal,
    '<coder-output>': context.coderOutput,
  };
  const lines: string[] = [];
  for (const line of REVIEW_COMMIT_TEMPLATE.split('\n')) {
    const tokens = line.match(REVIEW_PLACEHOLDER) ?? [];
    if (tokens.some((token) => values[token] === '')) continue;
    lines.push(
      line.replace(REVIEW_PLACEHOLDER, (token: string) =>
        (values[token] ?? token).split('\n').join('\n> '),
      ),
    );
  }
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Player input mapping (pure reads of typed, entry-validated context)
// ---------------------------------------------------------------------------

function bossReplyFields(
  context: DecideContext,
  stateId: ResumableStateId,
): PlayerInputBase {
  const pendingBossQuestion = context.pendingBossQuestions[stateId];
  const bossReply = context.bossReplies[stateId];
  return {
    ...(pendingBossQuestion === undefined ? {} : { pendingBossQuestion }),
    ...(bossReply === undefined ? {} : { bossReply }),
  };
}

// ---------------------------------------------------------------------------
// Context snapshots
// ---------------------------------------------------------------------------

const INITIAL_CONTEXT: DecideContext = {
  callerTopic: '',
  stagedCoderProposal: '',
  stagedReviewerProposal: '',
  coderProposal: '',
  reviewerProposal: '',
  coderOutput: '',
  decideCommit: '',
  evaluatedRevision: '',
  reviewStatus: null,
  reviewError: null,
  reviewEvidence: null,
  lastError: null,
  pendingBossQuestions: {},
  bossReplies: {},
};

/**
 * A fresh run for a topic: clears every staged and promoted proposal, the
 * commit, review evidence, errors, and every pending Boss question and reply.
 */
function freshRun(callerTopic: string): DecideContext {
  return { ...INITIAL_CONTEXT, callerTopic };
}

/** Context reset shared by every exit into `failed`. */
const FAILURE_RESET = {
  pendingBossQuestions: {},
  bossReplies: {},
  stagedCoderProposal: '',
  stagedReviewerProposal: '',
} as const;

/**
 * A synthesis restart keeps the topic and the promoted proposals, and clears
 * the prior commit, review evidence, error, and every pending question.
 */
const SYNTHESIS_RESTART = {
  coderOutput: '',
  decideCommit: '',
  evaluatedRevision: '',
  reviewStatus: null,
  reviewError: null,
  reviewEvidence: null,
  lastError: null,
  pendingBossQuestions: {},
  bossReplies: {},
} as const;

// ---------------------------------------------------------------------------
// Transition helpers
// ---------------------------------------------------------------------------

/**
 * Accepted-outcome marker (artifact schema 3). `target` names the public
 * state the next snapshot shows after the transition's macrostep.
 */
function acceptedOutcome(
  source: ResumableStateId,
  target: DescribedStateId,
  outcome: 'proposed' | 'committed' | 'needsBossReply',
) {
  return {
    type: 'playbook.acceptedOutcome',
    params: { source, target, acceptedOutcome: outcome },
  } as const;
}

/** Root `BOSS_INTERRUPT` arms, one per jumpable state. */
function bossInterrupts<const Ids extends readonly JumpableStateId[]>(
  ids: Ids,
) {
  return ids.map(
    (targetId) =>
      ({
        guard: { type: 'interruptTargets', params: { targetId } },
        target: `#${targetId}`,
        reenter: true,
        actions: 'restartFromInterrupt',
      }) as const,
  );
}

/** Keyed `BOSS_REPLY` arms of the wait that resumes the given working leaves. */
function resumableStates<const Ids extends readonly ResumableStateId[]>(
  ids: Ids,
) {
  return ids.flatMap((stateId) => [
    {
      guard: { type: 'bossReplyIsEmpty', params: { stateId } },
      target: '#failed',
      actions: 'rememberEmptyBossReply',
    } as const,
    {
      guard: { type: 'bossReplyResumes', params: { stateId } },
      target: `#${stateId}`,
      reenter: true,
      actions: { type: 'rememberBossReply', params: { stateId } },
    } as const,
  ]);
}

/**
 * At the root synthesis wait, where no other task is active, a keyed
 * `BOSS_REPLY` that names no pending question fails the run.
 */
const unknownBossReplyArm = {
  guard: 'bossReplyNamesNoPendingQuestion',
  target: '#failed',
  actions: 'rememberUnknownBossReply',
} as const;

const startDecideArm = {
  guard: 'validStartTopic',
  target: '#independentProposals',
  actions: 'startDecide',
} as const;

function suspendArm(
  stateId: ResumableStateId,
  wait: 'awaitCoderProposalReply' | 'awaitReviewerProposalReply' | 'awaitBossReply',
) {
  return {
    guard: 'needsBossReply',
    target: `#${wait}`,
    actions: [
      acceptedOutcome(stateId, wait, 'needsBossReply'),
      { type: 'setPendingBossQuestion', params: { stateId } },
    ],
  } as const;
}

function malformedPlayerOutputArm(sourceItem: DecideSourceItem) {
  return {
    target: '#failed',
    actions: { type: 'rememberMalformedPlayerOutput', params: { sourceItem } },
  } as const;
}

const playerOnError = {
  target: '#failed',
  actions: 'rememberActorError',
} as const;

type EventArgs = { readonly event: unknown };
type ContextEventArgs = {
  readonly context: DecideContext;
  readonly event: unknown;
};

// ---------------------------------------------------------------------------
// Machine
// ---------------------------------------------------------------------------

export const decideMachine = setup({
  types: {
    context: {} as DecideContext,
    events: {} as DecideEvent,
    input: {} as DecideInput,
    output: {} as DecideOutput,
  },
  actors: {
    player: fromPromise<PlayerOutput, PlayerInput>(async () => {
      throw new Error('player actor must be provided by the runner');
    }),
    playbook: fromPromise<PlaybookOutput, PlaybookInput>(async () => {
      throw new Error('playbook actor must be provided by the runner');
    }),
  },
  guards: {
    validStartTopic: ({ event }) =>
      event.type === 'START_DECIDE' && isNonEmptyString(event.callerTopic),
    // Each arm guards its target id and every typed precondition for
    // entering that target safely.
    interruptTargets: (
      { context, event },
      params: { readonly targetId: JumpableStateId },
    ) => {
      if (event.type !== 'BOSS_INTERRUPT') return false;
      if (event.targetId !== params.targetId) return false;
      if (event.targetId === 'independentProposals') {
        return isNonEmptyString(event.callerTopic);
      }
      return (
        isNonEmptyString(context.callerTopic) &&
        isNonEmptyString(context.coderProposal) &&
        isNonEmptyString(context.reviewerProposal)
      );
    },
    // A branch completing after its sibling has staged its proposal also
    // completes the join, so its accepted outcome lands on `synthesizeCommit`.
    coderProposedJoining: ({ context, event }: ContextEventArgs) =>
      isCoderProposed(event) &&
      isNonEmptyString(context.stagedReviewerProposal) &&
      isNonEmptyString(context.callerTopic),
    coderProposed: ({ event }: EventArgs) => isCoderProposed(event),
    reviewerProposedJoining: ({ context, event }: ContextEventArgs) =>
      isReviewerProposed(event) &&
      isNonEmptyString(context.stagedCoderProposal) &&
      isNonEmptyString(context.callerTopic),
    reviewerProposed: ({ event }: EventArgs) => isReviewerProposed(event),
    committed: ({ context, event }: ContextEventArgs) =>
      isCommitted(event) &&
      isNonEmptyString(context.callerTopic) &&
      isNonEmptyString(context.coderProposal),
    needsBossReply: ({ event }: EventArgs) => isNeedsBossReply(event),
    reviewApproved: ({ context, event }: ContextEventArgs) =>
      isNonEmptyString(context.decideCommit) &&
      reviewApprovalFrom(event) !== undefined,
    authoredReviewFailure: ({ context, event }: ContextEventArgs) =>
      isNonEmptyString(context.decideCommit) &&
      authoredReviewFailureOf(event) !== undefined,
    bossReplyNamesNoPendingQuestion: ({ context, event }) =>
      event.type === 'BOSS_REPLY' &&
      (!isResumableStateId(event.questionId) ||
        context.pendingBossQuestions[event.questionId] === undefined),
    bossReplyIsEmpty: (
      { context, event },
      params: { readonly stateId: ResumableStateId },
    ) =>
      event.type === 'BOSS_REPLY' &&
      event.questionId === params.stateId &&
      context.pendingBossQuestions[params.stateId] !== undefined &&
      !isNonEmptyString(event.answer),
    bossReplyResumes: (
      { context, event },
      params: { readonly stateId: ResumableStateId },
    ) =>
      event.type === 'BOSS_REPLY' &&
      event.questionId === params.stateId &&
      context.pendingBossQuestions[params.stateId] !== undefined &&
      isNonEmptyString(event.answer) &&
      isNonEmptyString(context.callerTopic),
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
    startDecide: assign(({ event }) =>
      event.type === 'START_DECIDE' ? freshRun(event.callerTopic) : {},
    ),
    // A new topic restarts the whole proposal pair from a fresh run; a
    // synthesis restart keeps the topic and the promoted proposals.
    restartFromInterrupt: assign(({ event }) => {
      if (event.type !== 'BOSS_INTERRUPT') return {};
      return event.targetId === 'independentProposals'
        ? freshRun(event.callerTopic)
        : SYNTHESIS_RESTART;
    }),
    // Each branch assigns only its own staged result.
    stageCoderProposal: assign(({ context, event }) => ({
      stagedCoderProposal: outputString(event, 'coderProposal') ?? '',
      pendingBossQuestions: withoutKey(
        context.pendingBossQuestions,
        'askCoderProposal',
      ),
      bossReplies: withoutKey(context.bossReplies, 'askCoderProposal'),
    })),
    stageReviewerProposal: assign(({ context, event }) => ({
      stagedReviewerProposal: outputString(event, 'reviewerProposal') ?? '',
      pendingBossQuestions: withoutKey(
        context.pendingBossQuestions,
        'askReviewerProposal',
      ),
      bossReplies: withoutKey(context.bossReplies, 'askReviewerProposal'),
    })),
    // The join promotes both staged proposals atomically.
    promoteProposals: assign(({ context }) => ({
      coderProposal: context.stagedCoderProposal,
      reviewerProposal: context.stagedReviewerProposal,
      stagedCoderProposal: '',
      stagedReviewerProposal: '',
      pendingBossQuestions: {},
      bossReplies: {},
    })),
    rememberCommit: assign(({ context, event }) => ({
      coderOutput: outputString(event, 'coderOutput') ?? '',
      decideCommit: outputString(event, 'latestCommit') ?? '',
      lastError: null,
      pendingBossQuestions: withoutKey(
        context.pendingBossQuestions,
        'synthesizeCommit',
      ),
      bossReplies: withoutKey(context.bossReplies, 'synthesizeCommit'),
    })),
    setPendingBossQuestion: assign(
      (
        { context, event },
        params: { readonly stateId: ResumableStateId },
      ) => {
        const question = outputString(event, 'question');
        if (question === undefined) return {};
        const { sourceItem, roleId } = RESUMABLE_STATES[params.stateId];
        const pending: PendingBossQuestion = {
          questionId: params.stateId,
          resumeStateId: params.stateId,
          sourceItem,
          asker: { kind: 'role', roleId },
          question,
        };
        return {
          pendingBossQuestions: {
            ...context.pendingBossQuestions,
            [params.stateId]: pending,
          },
          bossReplies: withoutKey(context.bossReplies, params.stateId),
        };
      },
    ),
    rememberBossReply: assign(
      (
        { context, event },
        params: { readonly stateId: ResumableStateId },
      ) =>
        event.type === 'BOSS_REPLY'
          ? {
              bossReplies: {
                ...context.bossReplies,
                [params.stateId]: event.answer,
              },
            }
          : {},
    ),
    rememberEmptyBossReply: assign({
      lastError: {
        name: 'MalformedBossReply',
        message: 'BOSS_REPLY carried an empty answer.',
      },
      ...FAILURE_RESET,
    }),
    rememberUnknownBossReply: assign({
      lastError: {
        name: 'MalformedBossReply',
        message: 'BOSS_REPLY names no pending question.',
      },
      ...FAILURE_RESET,
    }),
    rememberMalformedPlayerOutput: assign(
      ({ event }, params: { readonly sourceItem: DecideSourceItem }) => {
        const output = actorOutput(event);
        return {
          lastError: {
            name: 'MalformedPlayerOutput',
            message:
              output?.guard === 'needsBossReply'
                ? `Player output for ${params.sourceItem} declared needsBossReply without a question.`
                : `Player output for ${params.sourceItem} did not match an outcome declared for its state.`,
          },
          ...FAILURE_RESET,
        };
      },
    ),
    rememberActorError: assign(({ event }) => ({
      lastError: errorRecord(actorError(event)),
      ...FAILURE_RESET,
    })),
    rememberReviewApproval: assign(({ event }) => {
      const approval = reviewApprovalFrom(event);
      if (approval === undefined) return {};
      const output = actorOutput(event);
      const reviewEvidence: CompletedReviewResult = {
        playbookId: REVIEW_PLAYBOOK_ID,
        status: 'ok',
        ...(isJsonValue(output) ? { output } : {}),
      };
      return {
        evaluatedRevision: approval.evaluatedRevision,
        reviewStatus: null,
        reviewError: null,
        reviewEvidence,
        lastError: null,
      };
    }),
    rememberUnestablishedReview: assign(({ event }) => {
      const output = actorOutput(event);
      const reviewEvidence: CompletedReviewResult = {
        playbookId: REVIEW_PLAYBOOK_ID,
        status: 'ok',
        ...(isJsonValue(output) ? { output } : {}),
      };
      return {
        evaluatedRevision: '',
        reviewStatus: 'error' as const,
        reviewError: REVIEW_NOT_ESTABLISHED,
        reviewEvidence,
        lastError: null,
      };
    }),
    rememberAuthoredReviewFailure: assign(({ event }) => {
      const failure = authoredReviewFailureOf(event);
      return failure === undefined
        ? {}
        : {
            evaluatedRevision: '',
            reviewStatus: failure.status,
            reviewError: failure.error,
            reviewEvidence: failure.evidence,
            lastError: null,
          };
    }),
  },
}).createMachine({
  id: 'decide',
  description:
    'DECIDE: independent Coder and Reviewer proposals, a synthesized decide-owned commit, and a nested review.',
  initial: 'ready',
  context: (): DecideContext => INITIAL_CONTEXT,
  output: ({ context }): DecideOutput => {
    const commit = context.decideCommit;
    if (!isNonEmptyString(commit)) {
      throw new Error(
        'DECIDE reached a final state without its decide-owned commit',
      );
    }
    if (context.reviewStatus !== null) {
      return {
        lastDecideCommit: commit,
        noUnsettledFindings: false,
        reviewStatus: context.reviewStatus,
        ...(context.reviewError === null ? {} : { error: context.reviewError }),
      };
    }
    const evaluatedRevision = context.evaluatedRevision;
    if (!isNonEmptyString(evaluatedRevision)) {
      throw new Error(
        'DECIDE completed without the evaluated repository revision',
      );
    }
    return {
      decideCommit: commit,
      evaluatedRevision,
      noUnsettledFindings: true,
    };
  },
  on: {
    BOSS_INTERRUPT: bossInterrupts([
      'independentProposals',
      'synthesizeCommit',
    ] as const),
  },
  states: {
    ready: {
      id: 'ready',
      description: STATE_DESCRIPTIONS.ready,
      meta: playbookMeta('ready'),
      tags: ['playbook.parked'],
      on: {
        START_DECIDE: startDecideArm,
      },
    },
    independentProposals: {
      id: 'independentProposals',
      description: STATE_DESCRIPTIONS.independentProposals,
      meta: playbookMeta('independentProposals'),
      type: 'parallel',
      // No group-level BOSS_REPLY handler: a reply is handled only by the
      // branch wait whose pending question it names, and a reply naming no
      // pending branch question moves no branch.
      states: {
        coderProposalRegion: {
          id: 'coderProposalRegion',
          description: STATE_DESCRIPTIONS.coderProposalRegion,
          meta: playbookMeta('coderProposalRegion'),
          initial: 'askCoderProposal',
          states: {
            askCoderProposal: {
              id: 'askCoderProposal',
              description: STATE_DESCRIPTIONS.askCoderProposal,
              meta: playbookMeta('askCoderProposal', 'coder'),
              tags: ['playbook.busy'],
              invoke: {
                src: 'player',
                input: ({ context }): CoderProposalInput => ({
                  stateId: 'askCoderProposal',
                  role: 'coder',
                  sourceItem: 'DECIDE-1',
                  prompt: CODER_PROPOSAL_PROMPT,
                  result: CODER_PROPOSAL_RESULT,
                  callerTopic: context.callerTopic,
                  ...bossReplyFields(context, 'askCoderProposal'),
                }),
                onDone: [
                  suspendArm('askCoderProposal', 'awaitCoderProposalReply'),
                  {
                    guard: 'coderProposedJoining',
                    target: 'coderProposalStaged',
                    actions: [
                      acceptedOutcome(
                        'askCoderProposal',
                        'synthesizeCommit',
                        'proposed',
                      ),
                      'stageCoderProposal',
                    ],
                  },
                  {
                    guard: 'coderProposed',
                    target: 'coderProposalStaged',
                    actions: [
                      acceptedOutcome(
                        'askCoderProposal',
                        'coderProposalStaged',
                        'proposed',
                      ),
                      'stageCoderProposal',
                    ],
                  },
                  malformedPlayerOutputArm('DECIDE-1'),
                ],
                onError: playerOnError,
              },
            },
            awaitCoderProposalReply: {
              id: 'awaitCoderProposalReply',
              description: STATE_DESCRIPTIONS.awaitCoderProposalReply,
              meta: playbookMeta('awaitCoderProposalReply'),
              tags: ['playbook.parked'],
              on: {
                BOSS_REPLY: resumableStates(['askCoderProposal'] as const),
              },
            },
            coderProposalStaged: {
              id: 'coderProposalStaged',
              description: STATE_DESCRIPTIONS.coderProposalStaged,
              meta: playbookMeta('coderProposalStaged'),
              type: 'final',
            },
          },
        },
        reviewerProposalRegion: {
          id: 'reviewerProposalRegion',
          description: STATE_DESCRIPTIONS.reviewerProposalRegion,
          meta: playbookMeta('reviewerProposalRegion'),
          initial: 'askReviewerProposal',
          states: {
            askReviewerProposal: {
              id: 'askReviewerProposal',
              description: STATE_DESCRIPTIONS.askReviewerProposal,
              meta: playbookMeta('askReviewerProposal', 'reviewer'),
              tags: ['playbook.busy'],
              invoke: {
                src: 'player',
                input: ({ context }): ReviewerProposalInput => ({
                  stateId: 'askReviewerProposal',
                  role: 'reviewer',
                  sourceItem: 'DECIDE-2',
                  prompt: REVIEWER_PROPOSAL_PROMPT,
                  result: REVIEWER_PROPOSAL_RESULT,
                  callerTopic: context.callerTopic,
                  ...bossReplyFields(context, 'askReviewerProposal'),
                }),
                onDone: [
                  suspendArm('askReviewerProposal', 'awaitReviewerProposalReply'),
                  {
                    guard: 'reviewerProposedJoining',
                    target: 'reviewerProposalStaged',
                    actions: [
                      acceptedOutcome(
                        'askReviewerProposal',
                        'synthesizeCommit',
                        'proposed',
                      ),
                      'stageReviewerProposal',
                    ],
                  },
                  {
                    guard: 'reviewerProposed',
                    target: 'reviewerProposalStaged',
                    actions: [
                      acceptedOutcome(
                        'askReviewerProposal',
                        'reviewerProposalStaged',
                        'proposed',
                      ),
                      'stageReviewerProposal',
                    ],
                  },
                  malformedPlayerOutputArm('DECIDE-2'),
                ],
                onError: playerOnError,
              },
            },
            awaitReviewerProposalReply: {
              id: 'awaitReviewerProposalReply',
              description: STATE_DESCRIPTIONS.awaitReviewerProposalReply,
              meta: playbookMeta('awaitReviewerProposalReply'),
              tags: ['playbook.parked'],
              on: {
                BOSS_REPLY: resumableStates(['askReviewerProposal'] as const),
              },
            },
            reviewerProposalStaged: {
              id: 'reviewerProposalStaged',
              description: STATE_DESCRIPTIONS.reviewerProposalStaged,
              meta: playbookMeta('reviewerProposalStaged'),
              type: 'final',
            },
          },
        },
      },
      // The join: taken only after both regions reach final; it promotes both
      // staged proposals atomically before DECIDE-3 begins.
      onDone: {
        target: 'synthesizeCommit',
        actions: 'promoteProposals',
      },
    },
    synthesizeCommit: {
      id: 'synthesizeCommit',
      description: STATE_DESCRIPTIONS.synthesizeCommit,
      meta: playbookMeta('synthesizeCommit', 'coder'),
      tags: ['playbook.busy'],
      invoke: {
        src: 'player',
        input: ({ context }): SynthesizeCommitInput => ({
          stateId: 'synthesizeCommit',
          role: 'coder',
          sourceItem: 'DECIDE-3',
          prompt: SYNTHESIZE_COMMIT_PROMPT,
          result: SYNTHESIZE_COMMIT_RESULT,
          callerTopic: context.callerTopic,
          reviewerProposal: context.reviewerProposal,
          ...bossReplyFields(context, 'synthesizeCommit'),
        }),
        onDone: [
          suspendArm('synthesizeCommit', 'awaitBossReply'),
          {
            guard: 'committed',
            target: 'reviewCommit',
            actions: [
              acceptedOutcome('synthesizeCommit', 'reviewCommit', 'committed'),
              'rememberCommit',
            ],
          },
          malformedPlayerOutputArm('DECIDE-3'),
        ],
        onError: playerOnError,
      },
    },
    awaitBossReply: {
      id: 'awaitBossReply',
      description: STATE_DESCRIPTIONS.awaitBossReply,
      meta: playbookMeta('awaitBossReply'),
      tags: ['playbook.parked'],
      on: {
        BOSS_REPLY: [
          unknownBossReplyArm,
          ...resumableStates(['synthesizeCommit'] as const),
        ],
        START_DECIDE: startDecideArm,
      },
    },
    reviewCommit: {
      id: 'reviewCommit',
      description: STATE_DESCRIPTIONS.reviewCommit,
      meta: playbookMeta('reviewCommit'),
      tags: ['playbook.suspended'],
      invoke: {
        src: 'playbook',
        input: ({ context }): PlaybookInput => ({
          stateId: 'reviewCommit',
          sourceItem: 'DECIDE-4',
          playbookId: REVIEW_PLAYBOOK_ID,
          text: reviewCallText(context),
        }),
        onDone: [
          {
            guard: 'reviewApproved',
            target: 'done',
            actions: 'rememberReviewApproval',
          },
          {
            target: 'reportedReviewFailure',
            actions: 'rememberUnestablishedReview',
          },
        ],
        onError: [
          {
            guard: 'authoredReviewFailure',
            target: 'reportedReviewFailure',
            actions: 'rememberAuthoredReviewFailure',
          },
          { target: 'failed', actions: 'rememberActorError' },
        ],
      },
    },
    failed: {
      id: 'failed',
      description: STATE_DESCRIPTIONS.failed,
      meta: playbookMeta('failed'),
      tags: ['playbook.parked'],
      on: {
        START_DECIDE: startDecideArm,
      },
    },
    reportedReviewFailure: {
      id: 'reportedReviewFailure',
      description: STATE_DESCRIPTIONS.reportedReviewFailure,
      meta: terminalMeta('reportedReviewFailure', 'failure'),
      type: 'final',
    },
    done: {
      id: 'done',
      description: STATE_DESCRIPTIONS.done,
      meta: terminalMeta('done', 'success'),
      type: 'final',
    },
  },
});

export default decideMachine;
