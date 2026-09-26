// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>
//
// FSM object artifact compiled from ./review.gears.md by gears2fsm.
// It declares only the machine, its actor contracts, and typed inputs; the
// linked runtime supplies the `player` actor implementation.

import { assign, fromPromise, setup } from 'xstate';

// ---------------------------------------------------------------------------
// Shared JSON and error shapes
// ---------------------------------------------------------------------------

export type JsonValue =
  | null
  | boolean
  | number
  | string
  | readonly JsonValue[]
  | { readonly [key: string]: JsonValue };

export type ErrorRecord = {
  readonly name: string;
  readonly message: string;
  readonly stack?: string;
};

// ---------------------------------------------------------------------------
// Identities
// ---------------------------------------------------------------------------

/** Canonical lowercase local ids of the source roles Coder and Reviewer. */
export type ReviewRoleId = 'coder' | 'reviewer';

/** One role-id array per parallel group; REVIEW declares no parallel group. */
export const concurrentRoleSets: readonly (readonly ReviewRoleId[])[] = [];

export type ReviewSourceItem =
  | 'REVIEW-1'
  | 'REVIEW-2'
  | 'REVIEW-3'
  | 'REVIEW-4';

/** Delegated-player working leaves (REVIEW-1 … REVIEW-4). */
export type WorkingStateId =
  | 'firstReview'
  | 'answerFindings'
  | 'reviewFixCommit'
  | 'reviewAfterRejection';

/** Working leaves that may suspend for, and resume from, a Boss reply. */
export type ResumableStateId = WorkingStateId;

/** Root `BOSS_INTERRUPT` targets. */
export type JumpableStateId = WorkingStateId;

/** Coder's accepted outcome for the latest answered findings. */
export type CoderOutcome = 'committed' | 'rejectedAll';

// ---------------------------------------------------------------------------
// Boss-reply suspension (scalar form: one active player task at a time)
// ---------------------------------------------------------------------------

export type PendingBossQuestion = {
  readonly questionId: ResumableStateId;
  readonly resumeStateId: ResumableStateId;
  readonly sourceItem: ReviewSourceItem;
  readonly asker: { readonly kind: 'role'; readonly roleId: ReviewRoleId };
  readonly question: string;
};

const RESUME_METADATA = {
  firstReview: { sourceItem: 'REVIEW-1', roleId: 'reviewer' },
  answerFindings: { sourceItem: 'REVIEW-2', roleId: 'coder' },
  reviewFixCommit: { sourceItem: 'REVIEW-3', roleId: 'reviewer' },
  reviewAfterRejection: { sourceItem: 'REVIEW-4', roleId: 'reviewer' },
} as const satisfies Record<
  ResumableStateId,
  { readonly sourceItem: ReviewSourceItem; readonly roleId: ReviewRoleId }
>;

// ---------------------------------------------------------------------------
// Prompts (each item's blockquote, verbatim) and local result contracts
// ---------------------------------------------------------------------------

/** REVIEW-1 blockquote; `<caller-input>` is carried as `callerInput`. */
const FIRST_REVIEW_PROMPT = [
  'A new review begins for the review scope.',
  'Keep to the original intent and follow what it asks.',
  'When the scope names commits, read each commit message for its context and rationale; otherwise use repository history and commit messages wherever they help establish that context.',
  '',
  'Understand the full picture and think systematically about the underlying design.',
  'Continue to identify issues or improvements, if any, without duplication.',
  'Number the findings consistently across rounds.',
  'Flag only what materially affects correctness, behavior, or spec quality — not style, equally valid alternatives, or theoretical threats.',
  'For specs, flag stale, missing, over-specified, or under-specified ones, if any.',
  'Avoid unnecessary complexity in code or tests, but flag any fundamental design flaw when leaving it would cost more in later patches than fixing it now.',
  '',
  'If an issue represents a class of defect, find every instance within the review scope worth fixing rather than surfacing one or two per round, which drags out the review.',
  'For any rebuttal, accept or challenge it.',
  'Treat as settled, and do not raise again, any finding in this review rejected twice with reasoning.',
  '',
  'Do not re-run tests or builds whose inputs have not changed since any previous reported run.',
  'Do not edit files or commit; report findings only.',
  '',
  'Consult @specs/map.md for context if needed; verify it remains accurate.',
  'Consult @specs/meta.md for spec requirements if needed; verify affected specs follow it.',
  '',
  '> Original request: <caller-input>',
].join('\n');

/**
 * REVIEW-2 blockquote. `<original-intent>` is carried as `originalIntent` and
 * `<reviewer-output>` as `reviewerOutput`. `<coder-llm>` and `<reviewer-llm>`
 * are local-role prompt identities of Coder and Reviewer: the linker resolves
 * them through the invocation-scoped `promptIdentity(roleId)` lookup, so they
 * stay literal here and have no machine, context, or actor-input field.
 */
const ANSWER_FINDINGS_PROMPT = [
  'For each review item, accept or reject it.',
  'Before deciding, understand the full picture and think systematically about the underlying design.',
  'Keep to the original intent and follow what it asks.',
  'Reject anything that is not essential or is not worth fixing now.',
  'If you accept an item, fix its root cause, including any fundamental design flaw — do not patch around it; if it represents a class of defect, find every instance within the review scope worth fixing rather than addressing one or two per round, which drags out the review.',
  'If you reject an item, give the reasoning and cite code or test output that supports it.',
  'Do not re-run tests or builds whose inputs have not changed since any previous reported run.',
  '',
  'If you accept any item, make minimal changes and add one new review-fix commit; never rewrite any existing commit.',
  'Follow @specs/packages/git.md.',
  'Make the commit message explain concisely what changed and why, including relevant verification.',
  'Identify every new commit you make.',
  'Credit every AI that contributed to this commit: Coder <coder-llm> and Reviewer <reviewer-llm>, whose findings it answers.',
  '',
  'If you reject every item, change nothing and make no commit.',
  'Report every disposition, all relevant run results, and every rebuttal.',
  '',
  '> Original intent: <original-intent>',
  '> Reviewer findings: <reviewer-output>',
].join('\n');

/**
 * REVIEW-3 blockquote. `<original-intent>` is carried as `originalIntent`,
 * `<latest-commit>` as `latestCommit`, and `<coder-output>` as `coderOutput`.
 */
const REVIEW_FIX_COMMIT_PROMPT = [
  'A new review round begins for the review scope in the cumulative committed state, with particular attention to the latest review-fix commit.',
  'Keep to the original intent and follow what it asks.',
  "Read the latest review-fix commit's message and see Coder's feedback below.",
  '',
  'Understand the full picture and think systematically about the underlying design.',
  'Continue to identify issues or improvements, if any, without duplication.',
  'Number the findings consistently across rounds.',
  'Flag only what materially affects correctness, behavior, or spec quality — not style, equally valid alternatives, or theoretical threats.',
  'For specs, flag stale, missing, over-specified, or under-specified ones, if any.',
  'Avoid unnecessary complexity in code or tests, but flag any fundamental design flaw when leaving it would cost more in later patches than fixing it now.',
  '',
  'If an issue represents a class of defect, find every instance within the review scope worth fixing rather than surfacing one or two per round, which drags out the review.',
  'For any rebuttal, accept or challenge it.',
  'Treat as settled, and do not raise again, any finding in this review rejected twice with reasoning.',
  '',
  'Do not re-run tests or builds whose inputs have not changed since any previous reported run.',
  'Do not edit files or commit; report findings only.',
  '',
  'Consult @specs/map.md for context if needed; verify it remains accurate.',
  'Consult @specs/meta.md for spec requirements if needed; verify affected specs follow it.',
  '',
  '> Original intent: <original-intent>',
  '> Latest commit: <latest-commit>',
  '> Coder output: <coder-output>',
].join('\n');

/**
 * REVIEW-4 blockquote. `<original-intent>` is carried as `originalIntent` and
 * `<coder-output>` as `coderOutput`.
 */
const REVIEW_AFTER_REJECTION_PROMPT = [
  'No new commit was made because Coder rejected every finding.',
  "See Coder's feedback below.",
  '',
  'Understand the full picture and think systematically about the underlying design.',
  'Continue to identify issues or improvements, if any, without duplication.',
  'Number the findings consistently across rounds.',
  'Flag only what materially affects correctness, behavior, or spec quality — not style, equally valid alternatives, or theoretical threats.',
  'For specs, flag stale, missing, over-specified, or under-specified ones, if any.',
  'Avoid unnecessary complexity in code or tests, but flag any fundamental design flaw when leaving it would cost more in later patches than fixing it now.',
  '',
  'If an issue represents a class of defect, find every instance within the review scope worth fixing rather than surfacing one or two per round, which drags out the review.',
  'For any rebuttal, accept or challenge it.',
  'Treat as settled, and do not raise again, any finding in this review rejected twice with reasoning.',
  '',
  'Do not re-run tests or builds whose inputs have not changed since any previous reported run.',
  'Do not edit files or commit; report findings only.',
  '',
  'Consult @specs/map.md for context if needed; verify it remains accurate.',
  'Consult @specs/meta.md for spec requirements if needed; verify affected specs follow it.',
  '',
  '> Original intent: <original-intent>',
  '> Coder output: <coder-output>',
].join('\n');

const NEEDS_BOSS_REPLY_RESULT =
  "The acting agent's prose surfaces a clarifying question for Boss that the agent cannot answer alone. Output shall include `question: <verbatim question text from the acting agent's prose>`.";

const FIRST_REVIEW_RESULT = {
  findings:
    "Reviewer raised one or more findings that remain unsettled. The outcome depends on the substance of Reviewer's reply, not on finding numbers or any fixed presentation format; a progress report, status update, or promise of a later result supports no review outcome. Output shall include `reviewerOutput: <verbatim final text>`.",
  clean:
    "Reviewer affirmatively reported that the requested review is complete and no unsettled findings remain. The outcome depends on the substance of Reviewer's reply, not on finding numbers or any fixed presentation format; a progress report, status update, or promise of a later result supports no review outcome. The review workflow then returns the exact repository revision at which the review scope was evaluated, taken from repository authority rather than from either player's prose, and the fact that no unsettled findings remain within that scope. Output shall include `evaluatedRevision: <repository revision>`.",
  needsBossReply: NEEDS_BOSS_REPLY_RESULT,
} as const;

const ANSWER_FINDINGS_RESULT = {
  committed:
    "Coder accepted one or more findings and made one new review-fix commit, whose identity is taken from the repository-effect receipt rather than from Coder's prose; the outcome does not depend on finding numbers or any fixed presentation format of Coder's reply. Output shall include `latestCommit: <commit identity>` and `coderOutput: <verbatim final text>`.",
  rejectedAll:
    "Coder rejected every finding and made no commit; the outcome does not depend on finding numbers or any fixed presentation format of Coder's reply. Output shall include `coderOutput: <verbatim final text>`.",
  needsBossReply: NEEDS_BOSS_REPLY_RESULT,
} as const;

const REVIEW_FIX_COMMIT_RESULT = {
  findings:
    "Reviewer raised or kept one or more findings that remain unsettled. The outcome depends on the substance of Reviewer's reply, not on finding numbers or any fixed presentation format; a progress report, status update, or promise of a later result supports no review outcome. Output shall include `reviewerOutput: <verbatim final text>`.",
  clean:
    "Reviewer affirmatively reported that the requested review is complete and no unsettled findings remain. The outcome depends on the substance of Reviewer's reply, not on finding numbers or any fixed presentation format; a progress report, status update, or promise of a later result supports no review outcome. The review workflow then returns the exact repository revision at which the review scope was evaluated, taken from repository authority rather than from either player's prose, and the fact that no unsettled findings remain within that scope. Output shall include `evaluatedRevision: <repository revision>`.",
  needsBossReply: NEEDS_BOSS_REPLY_RESULT,
} as const;

const REVIEW_AFTER_REJECTION_RESULT = {
  findings:
    "Reviewer kept or raised one or more findings that remain unsettled. The outcome depends on the substance of Reviewer's reply, not on finding numbers or any fixed presentation format; a progress report, status update, or promise of a later result supports no review outcome. Output shall include `reviewerOutput: <verbatim final text>`.",
  clean:
    "Reviewer affirmatively reported that the requested review is complete and no unsettled findings remain. The outcome depends on the substance of Reviewer's reply, not on finding numbers or any fixed presentation format; a progress report, status update, or promise of a later result supports no review outcome. The review workflow then returns the exact repository revision at which the review scope was evaluated, taken from repository authority rather than from either player's prose, and the fact that no unsettled findings remain within that scope. Output shall include `evaluatedRevision: <repository revision>`.",
  needsBossReply: NEEDS_BOSS_REPLY_RESULT,
} as const;

// ---------------------------------------------------------------------------
// Delegated player actor contract
// ---------------------------------------------------------------------------

type PlayerInputBase = {
  readonly pendingBossQuestion?: PendingBossQuestion;
  readonly bossReply?: string;
};

/** REVIEW-1: relays `<caller-input>` as `callerInput`. */
export type FirstReviewInput = PlayerInputBase & {
  readonly stateId: 'firstReview';
  readonly role: 'reviewer';
  readonly sourceItem: 'REVIEW-1';
  readonly prompt: string;
  readonly result: typeof FIRST_REVIEW_RESULT;
  /** `<caller-input>`: the caller's complete request. */
  readonly callerInput: string;
};

/**
 * REVIEW-2: relays `<original-intent>` as `originalIntent` and
 * `<reviewer-output>` as `reviewerOutput`.
 */
export type AnswerFindingsInput = PlayerInputBase & {
  readonly stateId: 'answerFindings';
  readonly role: 'coder';
  readonly sourceItem: 'REVIEW-2';
  readonly prompt: string;
  readonly result: typeof ANSWER_FINDINGS_RESULT;
  /** `<original-intent>`: the `Original intent:` section of the request. */
  readonly originalIntent: string;
  /** `<reviewer-output>`: Reviewer's verbatim findings. */
  readonly reviewerOutput: string;
};

/**
 * REVIEW-3: relays `<original-intent>` as `originalIntent`,
 * `<latest-commit>` as `latestCommit`, and `<coder-output>` as `coderOutput`.
 */
export type ReviewFixCommitInput = PlayerInputBase & {
  readonly stateId: 'reviewFixCommit';
  readonly role: 'reviewer';
  readonly sourceItem: 'REVIEW-3';
  readonly prompt: string;
  readonly result: typeof REVIEW_FIX_COMMIT_RESULT;
  readonly originalIntent: string;
  /** `<latest-commit>`: REVIEW-2's accepted, receipt-owned `latestCommit`. */
  readonly latestCommit: string;
  /** `<coder-output>`: Coder's verbatim final text. */
  readonly coderOutput: string;
};

/**
 * REVIEW-4: relays `<original-intent>` as `originalIntent` and
 * `<coder-output>` as `coderOutput`.
 */
export type ReviewAfterRejectionInput = PlayerInputBase & {
  readonly stateId: 'reviewAfterRejection';
  readonly role: 'reviewer';
  readonly sourceItem: 'REVIEW-4';
  readonly prompt: string;
  readonly result: typeof REVIEW_AFTER_REJECTION_RESULT;
  readonly originalIntent: string;
  readonly coderOutput: string;
};

export type PlayerInput =
  | FirstReviewInput
  | AnswerFindingsInput
  | ReviewFixCommitInput
  | ReviewAfterRejectionInput;

export type NeedsBossReplyOutput = {
  readonly guard: 'needsBossReply';
  readonly question: string;
};

/** Output of every Reviewer round (REVIEW-1, REVIEW-3, REVIEW-4). */
export type ReviewerRoundOutput =
  | { readonly guard: 'findings'; readonly reviewerOutput: string }
  | {
      readonly guard: 'clean';
      /** Effect-owned: taken from repository authority, not player prose. */
      readonly evaluatedRevision: string;
    }
  | NeedsBossReplyOutput;

/** Output of Coder's answer to the findings (REVIEW-2). */
export type AnswerFindingsOutput =
  | {
      readonly guard: 'committed';
      /** Effect-owned: the runtime fills it from the repository receipt. */
      readonly latestCommit: string;
      readonly coderOutput: string;
    }
  | { readonly guard: 'rejectedAll'; readonly coderOutput: string }
  | NeedsBossReplyOutput;

export type PlayerOutput = ReviewerRoundOutput | AnswerFindingsOutput;

// ---------------------------------------------------------------------------
// Machine input, context, events, and output
// ---------------------------------------------------------------------------

/** REVIEW takes no host configuration; the caller's request enters by event. */
export type ReviewInput = Readonly<Record<string, never>>;

/**
 * Typed run context. A text field holds `''` until its producer runs; every
 * transition into a state that reads one guards it as non-empty first. The
 * scalar Boss-reply fields are omitted until first set and cleared to `null`,
 * so context never carries an own `undefined` member.
 */
export type ReviewContext = {
  /** `<caller-input>`: the caller's complete request. */
  readonly callerInput: string;
  /** `<original-intent>`: derived from `callerInput` whenever it is stored. */
  readonly originalIntent: string;
  /** `<reviewer-output>`: Reviewer's latest verbatim findings. */
  readonly reviewerOutput: string;
  /** `<coder-output>`: Coder's latest verbatim final text. */
  readonly coderOutput: string;
  /** `<latest-commit>`: the latest accepted review-fix `latestCommit`. */
  readonly latestCommit: string;
  /** Coder's accepted outcome for the latest answered findings. */
  readonly coderOutcome: CoderOutcome | null;
  /** Repository revision evaluated by the final clean round. */
  readonly evaluatedRevision: string;
  readonly lastError: ErrorRecord | null;
  readonly pendingBossQuestion?: PendingBossQuestion | null;
  readonly bossReply?: string | null;
};

export type ReviewEvent =
  | { readonly type: 'START_REVIEW'; readonly callerInput: string }
  | { readonly type: 'BOSS_INTERRUPT'; readonly targetId: JumpableStateId }
  | {
      readonly type: 'BOSS_REPLY';
      readonly answer: string;
      readonly questionId?: string;
    };

/** Exactly the catalog's public `review` output interface. */
export type ReviewOutput = {
  readonly noUnsettledFindings: true;
  readonly evaluatedRevision: string;
};

// ---------------------------------------------------------------------------
// State descriptions and public metadata
// ---------------------------------------------------------------------------

const STATE_DESCRIPTIONS = {
  ready: "Waiting for the caller's review request.",
  firstReview:
    "Reviewer runs the first review round over the caller's review scope.",
  answerFindings:
    "Coder accepts or rejects each of Reviewer's findings, fixing accepted ones in one new review-fix commit.",
  reviewFixCommit:
    'Reviewer runs the next review round over the cumulative committed state after the latest review-fix commit.',
  reviewAfterRejection:
    'Reviewer runs the next review round after Coder rejected every finding without a new commit.',
  awaitBossReply: "Waiting for Boss to answer the acting agent's question.",
  failed:
    'REVIEW parked after a failure and waits for Boss to restart or resume it.',
  done: 'REVIEW completed: Reviewer affirmatively reported no unsettled findings within the review scope at the returned evaluated repository revision.',
} as const;

type StateKey = keyof typeof STATE_DESCRIPTIONS;

function playbookMeta(stateId: StateKey, role?: ReviewRoleId) {
  return {
    playbook: {
      stateId,
      description: STATE_DESCRIPTIONS[stateId],
      ...(role === undefined ? {} : { role }),
    },
  };
}

function terminalMeta(stateId: 'done', terminal: 'success' | 'failure') {
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

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

/** The actor's `output`, read structurally from an unknown done event. */
function doneOutputOf(event: unknown): unknown {
  return isRecord(event) ? event.output : undefined;
}

/** The actor's `error`, read structurally from an unknown error event. */
function actorErrorOf(event: unknown): unknown {
  return isRecord(event) ? event.error : undefined;
}

/** Narrows a player done event to the declared player output contract. */
function playerOutputOf(event: unknown): PlayerOutput | undefined {
  const output = doneOutputOf(event);
  if (!isRecord(output)) return undefined;
  switch (output.guard) {
    case 'findings':
      return isNonEmptyString(output.reviewerOutput)
        ? { guard: 'findings', reviewerOutput: output.reviewerOutput }
        : undefined;
    case 'clean':
      return isNonEmptyString(output.evaluatedRevision)
        ? { guard: 'clean', evaluatedRevision: output.evaluatedRevision }
        : undefined;
    case 'committed':
      return isNonEmptyString(output.latestCommit) &&
        isNonEmptyString(output.coderOutput)
        ? {
            guard: 'committed',
            latestCommit: output.latestCommit,
            coderOutput: output.coderOutput,
          }
        : undefined;
    case 'rejectedAll':
      return isNonEmptyString(output.coderOutput)
        ? { guard: 'rejectedAll', coderOutput: output.coderOutput }
        : undefined;
    case 'needsBossReply':
      return isNonEmptyString(output.question)
        ? { guard: 'needsBossReply', question: output.question }
        : undefined;
    default:
      return undefined;
  }
}

/** Normalizes any thrown or malformed value to a JSON-safe error record. */
function errorRecord(value: unknown): ErrorRecord {
  if (value instanceof Error) {
    return {
      name:
        typeof value.name === 'string' && value.name.length > 0
          ? value.name
          : 'Error',
      message: typeof value.message === 'string' ? value.message : '',
      ...(typeof value.stack === 'string' ? { stack: value.stack } : {}),
    };
  }
  if (isRecord(value) && typeof value.message === 'string') {
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

// ---------------------------------------------------------------------------
// `<original-intent>`: the `Original intent:` section of the caller's request
// ---------------------------------------------------------------------------

const ORIGINAL_INTENT_LABEL = 'Original intent:';
const ORIGINAL_INTENT_END_LABELS = ['Review scope:'] as const;

/**
 * The request as read: where every non-blank line begins with `>`, each line
 * is read without that marker and one optional space after it.
 */
function requestAsRead(text: string): string {
  const lines = text.split('\n');
  const quoted =
    lines.some((line) => line.trim().length > 0) &&
    lines.every((line) => line.trim().length === 0 || line.startsWith('>'));
  if (!quoted) return text;
  return lines
    .map((line) => {
      if (!line.startsWith('>')) return line;
      return line.startsWith('> ') ? line.slice(2) : line.slice(1);
    })
    .join('\n');
}

/**
 * Derives `<original-intent>`: the lines from the first line that begins with
 * `Original intent:` (label removed) through the line before the first later
 * line that begins with `Review scope:`, or through the last line, trimmed.
 * Without that label, or when the section is empty, the whole request as read,
 * trimmed, so the request is never lost.
 */
export function originalIntentOf(callerInput: string): string {
  const asRead = requestAsRead(callerInput);
  const lines = asRead.split('\n');
  const start = lines.findIndex((line) =>
    line.startsWith(ORIGINAL_INTENT_LABEL),
  );
  if (start < 0) return asRead.trim();
  let end = lines.length;
  for (let index = start + 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (
      line !== undefined &&
      ORIGINAL_INTENT_END_LABELS.some((label) => line.startsWith(label))
    ) {
      end = index;
      break;
    }
  }
  const firstLine = lines[start] ?? '';
  const section = [
    firstLine.slice(ORIGINAL_INTENT_LABEL.length),
    ...lines.slice(start + 1, end),
  ]
    .join('\n')
    .trim();
  return section.length > 0 ? section : asRead.trim();
}

// ---------------------------------------------------------------------------
// Context resets
// ---------------------------------------------------------------------------

const INITIAL_CONTEXT: ReviewContext = {
  callerInput: '',
  originalIntent: '',
  reviewerOutput: '',
  coderOutput: '',
  latestCommit: '',
  coderOutcome: null,
  evaluatedRevision: '',
  lastError: null,
};

/** Clears the scalar pending question and reply. */
const BOSS_REPLY_RESET = {
  pendingBossQuestion: null,
  bossReply: null,
} as const;

/** A fresh review for a request: clears every prior round, error, and question. */
function freshRun(callerInput: string): ReviewContext {
  return {
    ...INITIAL_CONTEXT,
    ...BOSS_REPLY_RESET,
    callerInput,
    originalIntent: originalIntentOf(callerInput),
  };
}

/** A restart of the first round keeps the request and clears every round. */
const FIRST_ROUND_RESTART = {
  reviewerOutput: '',
  coderOutput: '',
  latestCommit: '',
  coderOutcome: null,
  evaluatedRevision: '',
  lastError: null,
  ...BOSS_REPLY_RESET,
} as const;

/** A restart of a later round keeps the round evidence it relays. */
const LATER_ROUND_RESTART = {
  evaluatedRevision: '',
  lastError: null,
  ...BOSS_REPLY_RESET,
} as const;

// ---------------------------------------------------------------------------
// Guards
// ---------------------------------------------------------------------------

type EventArgs = { readonly event: unknown };
type MachineArgs = {
  readonly context: ReviewContext;
  readonly event: ReviewEvent;
};

const outcomeIs =
  (guard: PlayerOutput['guard']) =>
  ({ event }: EventArgs): boolean =>
    playerOutputOf(event)?.guard === guard;

/** Typed context each jumpable working leaf requires to be entered safely. */
const INTERRUPT_PRECONDITIONS = {
  firstReview: (context: ReviewContext) =>
    isNonEmptyString(context.callerInput) &&
    isNonEmptyString(context.originalIntent),
  answerFindings: (context: ReviewContext) =>
    isNonEmptyString(context.originalIntent) &&
    isNonEmptyString(context.reviewerOutput),
  reviewFixCommit: (context: ReviewContext) =>
    context.coderOutcome === 'committed' &&
    isNonEmptyString(context.originalIntent) &&
    isNonEmptyString(context.latestCommit) &&
    isNonEmptyString(context.coderOutput),
  reviewAfterRejection: (context: ReviewContext) =>
    context.coderOutcome === 'rejectedAll' &&
    isNonEmptyString(context.originalIntent) &&
    isNonEmptyString(context.coderOutput),
} as const satisfies Record<
  JumpableStateId,
  (context: ReviewContext) => boolean
>;

const validStartReview = ({ event }: MachineArgs): boolean =>
  event.type === 'START_REVIEW' && isNonEmptyString(event.callerInput);

const repliesToPendingQuestion = ({ context, event }: MachineArgs): boolean =>
  event.type === 'BOSS_REPLY' &&
  isRecord(context.pendingBossQuestion) &&
  (event.questionId === undefined ||
    event.questionId === context.pendingBossQuestion.questionId);

const emptyBossReply = (args: MachineArgs): boolean =>
  repliesToPendingQuestion(args) &&
  args.event.type === 'BOSS_REPLY' &&
  !isNonEmptyString(args.event.answer);

// ---------------------------------------------------------------------------
// Transition helpers
// ---------------------------------------------------------------------------

/** One guarded root transition per jumpable state. */
function bossInterrupts<const Ids extends readonly JumpableStateId[]>(
  ids: Ids,
) {
  return ids.map((id) => ({
    guard: ({ context, event }: MachineArgs) =>
      event.type === 'BOSS_INTERRUPT' &&
      event.targetId === id &&
      INTERRUPT_PRECONDITIONS[id](context),
    target: `#${id}` as const,
    reenter: true,
    actions: 'restartFromInterrupt' as const,
  }));
}

/** One guarded `BOSS_REPLY` resume transition per suspended working leaf. */
function resumableStates<const Ids extends readonly ResumableStateId[]>(
  ids: Ids,
) {
  return ids.map((id) => ({
    guard: (args: MachineArgs) =>
      repliesToPendingQuestion(args) &&
      args.event.type === 'BOSS_REPLY' &&
      isNonEmptyString(args.event.answer) &&
      isRecord(args.context.pendingBossQuestion) &&
      args.context.pendingBossQuestion.resumeStateId === id,
    target: `#${id}` as const,
    reenter: true,
    actions: 'rememberBossReply' as const,
  }));
}

/** The pending question and reply selected for the invoking working leaf. */
function bossReplyFields(context: ReviewContext): PlayerInputBase {
  const pendingBossQuestion = context.pendingBossQuestion;
  const bossReply = context.bossReply;
  return {
    ...(pendingBossQuestion === undefined || pendingBossQuestion === null
      ? {}
      : { pendingBossQuestion }),
    ...(bossReply === undefined || bossReply === null ? {} : { bossReply }),
  };
}

/**
 * Accepted-outcome marker (artifact schema 3). `target` names the state the
 * public snapshot shows after the transition.
 */
const acceptedOutcome = (
  source: WorkingStateId,
  target: StateKey,
  outcome: PlayerOutput['guard'],
) =>
  ({
    type: 'playbook.acceptedOutcome',
    params: { source, target, acceptedOutcome: outcome },
  }) as const;

/** Reviewer round `onDone` arms (REVIEW-1, REVIEW-3, REVIEW-4). */
const reviewerRoundOnDone = (source: WorkingStateId) =>
  [
    {
      guard: 'reviewerFindings',
      target: '#answerFindings',
      actions: [
        acceptedOutcome(source, 'answerFindings', 'findings'),
        'rememberFindings',
        'clearBossReplyContext',
      ],
    },
    {
      guard: 'reviewerClean',
      target: '#done',
      actions: [
        acceptedOutcome(source, 'done', 'clean'),
        'rememberClean',
        'clearBossReplyContext',
      ],
    },
    suspendArm(source),
    malformedPlayerOutputArm(source),
  ] as const;

function suspendArm(source: WorkingStateId) {
  return {
    guard: 'needsBossReply',
    target: '#awaitBossReply',
    actions: [
      acceptedOutcome(source, 'awaitBossReply', 'needsBossReply'),
      { type: 'setPendingBossQuestion', params: { resumeStateId: source } },
    ],
  } as const;
}

function malformedPlayerOutputArm(source: WorkingStateId) {
  return {
    target: '#failed',
    actions: [
      {
        type: 'rememberMalformedPlayerOutput',
        params: { sourceItem: RESUME_METADATA[source].sourceItem },
      },
      'clearBossReplyContext',
    ],
  } as const;
}

const playerOnError = {
  target: '#failed',
  actions: ['rememberActorError', 'clearBossReplyContext'],
} as const;

const startReviewTransition = {
  guard: 'validStartReview',
  target: '#firstReview',
  actions: 'startReview',
} as const;

// ---------------------------------------------------------------------------
// Machine
// ---------------------------------------------------------------------------

export const reviewMachine = setup({
  types: {} as {
    context: ReviewContext;
    events: ReviewEvent;
    input: ReviewInput;
    output: ReviewOutput;
  },
  actors: {
    player: fromPromise<PlayerOutput, PlayerInput>(async () => {
      throw new Error('player actor must be provided by the runner');
    }),
  },
  guards: {
    validStartReview,
    emptyBossReply,
    reviewerFindings: outcomeIs('findings'),
    reviewerClean: outcomeIs('clean'),
    coderCommitted: outcomeIs('committed'),
    coderRejectedAll: outcomeIs('rejectedAll'),
    needsBossReply: outcomeIs('needsBossReply'),
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
    startReview: assign(({ event }) =>
      event.type === 'START_REVIEW' ? freshRun(event.callerInput) : {},
    ),
    restartFromInterrupt: assign(({ event }) => {
      if (event.type !== 'BOSS_INTERRUPT') return {};
      return event.targetId === 'firstReview'
        ? FIRST_ROUND_RESTART
        : LATER_ROUND_RESTART;
    }),
    rememberFindings: assign(({ event }) => {
      const output = playerOutputOf(event);
      return output?.guard === 'findings'
        ? { reviewerOutput: output.reviewerOutput, lastError: null }
        : {};
    }),
    rememberClean: assign(({ event }) => {
      const output = playerOutputOf(event);
      return output?.guard === 'clean'
        ? { evaluatedRevision: output.evaluatedRevision, lastError: null }
        : {};
    }),
    rememberCommitted: assign(({ event }) => {
      const output = playerOutputOf(event);
      return output?.guard === 'committed'
        ? {
            latestCommit: output.latestCommit,
            coderOutput: output.coderOutput,
            coderOutcome: 'committed' as const,
            lastError: null,
          }
        : {};
    }),
    rememberRejectedAll: assign(({ event }) => {
      const output = playerOutputOf(event);
      return output?.guard === 'rejectedAll'
        ? {
            coderOutput: output.coderOutput,
            coderOutcome: 'rejectedAll' as const,
            lastError: null,
          }
        : {};
    }),
    setPendingBossQuestion: assign(
      ({ event }, params: { readonly resumeStateId: ResumableStateId }) => {
        const output = playerOutputOf(event);
        if (output?.guard !== 'needsBossReply') return {};
        const { sourceItem, roleId } = RESUME_METADATA[params.resumeStateId];
        const pendingBossQuestion: PendingBossQuestion = {
          questionId: params.resumeStateId,
          resumeStateId: params.resumeStateId,
          sourceItem,
          asker: { kind: 'role', roleId },
          question: output.question,
        };
        return { pendingBossQuestion, bossReply: null, lastError: null };
      },
    ),
    rememberBossReply: assign(({ event }) =>
      event.type === 'BOSS_REPLY' ? { bossReply: event.answer } : {},
    ),
    clearBossReplyContext: assign(BOSS_REPLY_RESET),
    rememberEmptyBossReply: assign({
      lastError: {
        name: 'BossReplyError',
        message: 'BOSS_REPLY carried an empty answer.',
      },
      ...BOSS_REPLY_RESET,
    }),
    rememberMalformedPlayerOutput: assign(
      (_args, params: { readonly sourceItem: ReviewSourceItem }) => ({
        lastError: {
          name: 'PlayerOutputError',
          message: `Player result for ${params.sourceItem} did not match a declared outcome with its required fields.`,
        },
      }),
    ),
    rememberActorError: assign(({ event }) => ({
      lastError: errorRecord(actorErrorOf(event)),
    })),
  },
}).createMachine({
  id: 'review',
  description:
    'REVIEW: Reviewer and Coder alternate review rounds and review-fix commits until Reviewer reports no unsettled findings.',
  initial: 'ready',
  context: (): ReviewContext => INITIAL_CONTEXT,
  output: ({ context }): ReviewOutput => {
    if (!isNonEmptyString(context.evaluatedRevision)) {
      throw new Error(
        'REVIEW completed without the evaluated repository revision',
      );
    }
    return {
      noUnsettledFindings: true,
      evaluatedRevision: context.evaluatedRevision,
    };
  },
  on: {
    BOSS_INTERRUPT: bossInterrupts([
      'firstReview',
      'answerFindings',
      'reviewFixCommit',
      'reviewAfterRejection',
    ] as const),
  },
  states: {
    ready: {
      id: 'ready',
      description: STATE_DESCRIPTIONS.ready,
      meta: playbookMeta('ready'),
      tags: ['playbook.parked'],
      on: {
        START_REVIEW: startReviewTransition,
      },
    },
    firstReview: {
      id: 'firstReview',
      description: STATE_DESCRIPTIONS.firstReview,
      meta: playbookMeta('firstReview', 'reviewer'),
      tags: ['playbook.busy'],
      invoke: {
        src: 'player',
        input: ({ context }): FirstReviewInput => ({
          stateId: 'firstReview',
          role: 'reviewer',
          sourceItem: 'REVIEW-1',
          prompt: FIRST_REVIEW_PROMPT,
          result: FIRST_REVIEW_RESULT,
          callerInput: context.callerInput,
          ...bossReplyFields(context),
        }),
        onDone: reviewerRoundOnDone('firstReview'),
        onError: playerOnError,
      },
    },
    answerFindings: {
      id: 'answerFindings',
      description: STATE_DESCRIPTIONS.answerFindings,
      meta: playbookMeta('answerFindings', 'coder'),
      tags: ['playbook.busy'],
      invoke: {
        src: 'player',
        input: ({ context }): AnswerFindingsInput => ({
          stateId: 'answerFindings',
          role: 'coder',
          sourceItem: 'REVIEW-2',
          prompt: ANSWER_FINDINGS_PROMPT,
          result: ANSWER_FINDINGS_RESULT,
          originalIntent: context.originalIntent,
          reviewerOutput: context.reviewerOutput,
          ...bossReplyFields(context),
        }),
        onDone: [
          {
            guard: 'coderCommitted',
            target: '#reviewFixCommit',
            actions: [
              acceptedOutcome('answerFindings', 'reviewFixCommit', 'committed'),
              'rememberCommitted',
              'clearBossReplyContext',
            ],
          },
          {
            guard: 'coderRejectedAll',
            target: '#reviewAfterRejection',
            actions: [
              acceptedOutcome(
                'answerFindings',
                'reviewAfterRejection',
                'rejectedAll',
              ),
              'rememberRejectedAll',
              'clearBossReplyContext',
            ],
          },
          suspendArm('answerFindings'),
          malformedPlayerOutputArm('answerFindings'),
        ],
        onError: playerOnError,
      },
    },
    reviewFixCommit: {
      id: 'reviewFixCommit',
      description: STATE_DESCRIPTIONS.reviewFixCommit,
      meta: playbookMeta('reviewFixCommit', 'reviewer'),
      tags: ['playbook.busy'],
      invoke: {
        src: 'player',
        input: ({ context }): ReviewFixCommitInput => ({
          stateId: 'reviewFixCommit',
          role: 'reviewer',
          sourceItem: 'REVIEW-3',
          prompt: REVIEW_FIX_COMMIT_PROMPT,
          result: REVIEW_FIX_COMMIT_RESULT,
          originalIntent: context.originalIntent,
          latestCommit: context.latestCommit,
          coderOutput: context.coderOutput,
          ...bossReplyFields(context),
        }),
        onDone: reviewerRoundOnDone('reviewFixCommit'),
        onError: playerOnError,
      },
    },
    reviewAfterRejection: {
      id: 'reviewAfterRejection',
      description: STATE_DESCRIPTIONS.reviewAfterRejection,
      meta: playbookMeta('reviewAfterRejection', 'reviewer'),
      tags: ['playbook.busy'],
      invoke: {
        src: 'player',
        input: ({ context }): ReviewAfterRejectionInput => ({
          stateId: 'reviewAfterRejection',
          role: 'reviewer',
          sourceItem: 'REVIEW-4',
          prompt: REVIEW_AFTER_REJECTION_PROMPT,
          result: REVIEW_AFTER_REJECTION_RESULT,
          originalIntent: context.originalIntent,
          coderOutput: context.coderOutput,
          ...bossReplyFields(context),
        }),
        onDone: reviewerRoundOnDone('reviewAfterRejection'),
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
          {
            guard: 'emptyBossReply',
            target: '#failed',
            actions: 'rememberEmptyBossReply',
          },
          ...resumableStates([
            'firstReview',
            'answerFindings',
            'reviewFixCommit',
            'reviewAfterRejection',
          ] as const),
        ],
        START_REVIEW: startReviewTransition,
      },
    },
    failed: {
      id: 'failed',
      description: STATE_DESCRIPTIONS.failed,
      meta: playbookMeta('failed'),
      tags: ['playbook.parked'],
      on: {
        START_REVIEW: startReviewTransition,
      },
    },
    done: {
      id: 'done',
      description: STATE_DESCRIPTIONS.done,
      meta: terminalMeta('done', 'success'),
      type: 'final',
    },
  },
});

export default reviewMachine;
