export type JsonValue = null | boolean | number | string | readonly JsonValue[] | {
    readonly [key: string]: JsonValue;
};
export type ErrorRecord = {
    readonly name: string;
    readonly message: string;
    readonly stack?: string;
};
/** Canonical lowercase local ids of the source roles Coder and Reviewer. */
export type ReviewRoleId = 'coder' | 'reviewer';
/** One role-id array per parallel group; REVIEW declares no parallel group. */
export declare const concurrentRoleSets: readonly (readonly ReviewRoleId[])[];
export type ReviewSourceItem = 'REVIEW-1' | 'REVIEW-2' | 'REVIEW-3' | 'REVIEW-4';
/** Delegated-player working leaves (REVIEW-1 … REVIEW-4). */
export type WorkingStateId = 'firstReview' | 'answerFindings' | 'reviewFixCommit' | 'reviewAfterRejection';
/** Working leaves that may suspend for, and resume from, a Boss reply. */
export type ResumableStateId = WorkingStateId;
/** Root `BOSS_INTERRUPT` targets. */
export type JumpableStateId = WorkingStateId;
/** Coder's accepted outcome for the latest answered findings. */
export type CoderOutcome = 'committed' | 'rejectedAll';
export type PendingBossQuestion = {
    readonly questionId: ResumableStateId;
    readonly resumeStateId: ResumableStateId;
    readonly sourceItem: ReviewSourceItem;
    readonly asker: {
        readonly kind: 'role';
        readonly roleId: ReviewRoleId;
    };
    readonly question: string;
};
declare const FIRST_REVIEW_RESULT: {
    readonly findings: "Reviewer raised one or more findings that remain unsettled. The outcome depends on the substance of Reviewer's reply, not on finding numbers or any fixed presentation format; a progress report, status update, or promise of a later result supports no review outcome. Output shall include `reviewerOutput: <verbatim final text>`.";
    readonly clean: "Reviewer affirmatively reported that the requested review is complete and no unsettled findings remain. The outcome depends on the substance of Reviewer's reply, not on finding numbers or any fixed presentation format; a progress report, status update, or promise of a later result supports no review outcome. The review workflow then returns the exact repository revision at which the review scope was evaluated, taken from repository authority rather than from either player's prose, and the fact that no unsettled findings remain within that scope. Output shall include `evaluatedRevision: <repository revision>`.";
    readonly needsBossReply: "The acting agent's prose surfaces a clarifying question for Boss that the agent cannot answer alone. Output shall include `question: <verbatim question text from the acting agent's prose>`.";
};
declare const ANSWER_FINDINGS_RESULT: {
    readonly committed: "Coder accepted one or more findings and made one new review-fix commit, whose identity is taken from the repository-effect receipt rather than from Coder's prose; the outcome does not depend on finding numbers or any fixed presentation format of Coder's reply. Output shall include `latestCommit: <commit identity>` and `coderOutput: <verbatim final text>`.";
    readonly rejectedAll: "Coder rejected every finding and made no commit; the outcome does not depend on finding numbers or any fixed presentation format of Coder's reply. Output shall include `coderOutput: <verbatim final text>`.";
    readonly needsBossReply: "The acting agent's prose surfaces a clarifying question for Boss that the agent cannot answer alone. Output shall include `question: <verbatim question text from the acting agent's prose>`.";
};
declare const REVIEW_FIX_COMMIT_RESULT: {
    readonly findings: "Reviewer raised or kept one or more findings that remain unsettled. The outcome depends on the substance of Reviewer's reply, not on finding numbers or any fixed presentation format; a progress report, status update, or promise of a later result supports no review outcome. Output shall include `reviewerOutput: <verbatim final text>`.";
    readonly clean: "Reviewer affirmatively reported that the requested review is complete and no unsettled findings remain. The outcome depends on the substance of Reviewer's reply, not on finding numbers or any fixed presentation format; a progress report, status update, or promise of a later result supports no review outcome. The review workflow then returns the exact repository revision at which the review scope was evaluated, taken from repository authority rather than from either player's prose, and the fact that no unsettled findings remain within that scope. Output shall include `evaluatedRevision: <repository revision>`.";
    readonly needsBossReply: "The acting agent's prose surfaces a clarifying question for Boss that the agent cannot answer alone. Output shall include `question: <verbatim question text from the acting agent's prose>`.";
};
declare const REVIEW_AFTER_REJECTION_RESULT: {
    readonly findings: "Reviewer kept or raised one or more findings that remain unsettled. The outcome depends on the substance of Reviewer's reply, not on finding numbers or any fixed presentation format; a progress report, status update, or promise of a later result supports no review outcome. Output shall include `reviewerOutput: <verbatim final text>`.";
    readonly clean: "Reviewer affirmatively reported that the requested review is complete and no unsettled findings remain. The outcome depends on the substance of Reviewer's reply, not on finding numbers or any fixed presentation format; a progress report, status update, or promise of a later result supports no review outcome. The review workflow then returns the exact repository revision at which the review scope was evaluated, taken from repository authority rather than from either player's prose, and the fact that no unsettled findings remain within that scope. Output shall include `evaluatedRevision: <repository revision>`.";
    readonly needsBossReply: "The acting agent's prose surfaces a clarifying question for Boss that the agent cannot answer alone. Output shall include `question: <verbatim question text from the acting agent's prose>`.";
};
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
export type PlayerInput = FirstReviewInput | AnswerFindingsInput | ReviewFixCommitInput | ReviewAfterRejectionInput;
export type NeedsBossReplyOutput = {
    readonly guard: 'needsBossReply';
    readonly question: string;
};
/** Output of every Reviewer round (REVIEW-1, REVIEW-3, REVIEW-4). */
export type ReviewerRoundOutput = {
    readonly guard: 'findings';
    readonly reviewerOutput: string;
} | {
    readonly guard: 'clean';
    /** Effect-owned: taken from repository authority, not player prose. */
    readonly evaluatedRevision: string;
} | NeedsBossReplyOutput;
/** Output of Coder's answer to the findings (REVIEW-2). */
export type AnswerFindingsOutput = {
    readonly guard: 'committed';
    /** Effect-owned: the runtime fills it from the repository receipt. */
    readonly latestCommit: string;
    readonly coderOutput: string;
} | {
    readonly guard: 'rejectedAll';
    readonly coderOutput: string;
} | NeedsBossReplyOutput;
export type PlayerOutput = ReviewerRoundOutput | AnswerFindingsOutput;
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
export type ReviewEvent = {
    readonly type: 'START_REVIEW';
    readonly callerInput: string;
} | {
    readonly type: 'BOSS_INTERRUPT';
    readonly targetId: JumpableStateId;
} | {
    readonly type: 'BOSS_REPLY';
    readonly answer: string;
    readonly questionId?: string;
};
/** Exactly the catalog's public `review` output interface. */
export type ReviewOutput = {
    readonly noUnsettledFindings: true;
    readonly evaluatedRevision: string;
};
/**
 * Derives `<original-intent>`: the lines from the first line that begins with
 * `Original intent:` (label removed) through the line before the first later
 * line that begins with `Review scope:`, or through the last line, trimmed.
 * Without that label, or when the section is empty, the whole request as read,
 * trimmed, so the request is never lost.
 */
export declare function originalIntentOf(callerInput: string): string;
export declare const reviewMachine: import("xstate").StateMachine<ReviewContext, {
    readonly type: "START_REVIEW";
    readonly callerInput: string;
} | {
    readonly type: "BOSS_INTERRUPT";
    readonly targetId: JumpableStateId;
} | {
    readonly type: "BOSS_REPLY";
    readonly answer: string;
    readonly questionId?: string;
}, {
    [x: string]: import("xstate").ActorRefFromLogic<import("xstate").PromiseActorLogic<PlayerOutput, PlayerInput, import("xstate").EventObject>> | undefined;
}, {
    src: "player";
    logic: import("xstate").PromiseActorLogic<PlayerOutput, PlayerInput, import("xstate").EventObject>;
    id: string | undefined;
}, {
    type: "playbook.acceptedOutcome";
    params: {
        readonly source: string;
        readonly target: string;
        readonly acceptedOutcome: string;
    };
} | {
    type: "rememberActorError";
    params: import("xstate").NonReducibleUnknown;
} | {
    type: "rememberBossReply";
    params: import("xstate").NonReducibleUnknown;
} | {
    type: "rememberMalformedPlayerOutput";
    params: {
        readonly sourceItem: ReviewSourceItem;
    };
} | {
    type: "clearBossReplyContext";
    params: import("xstate").NonReducibleUnknown;
} | {
    type: "setPendingBossQuestion";
    params: {
        readonly resumeStateId: ResumableStateId;
    };
} | {
    type: "restartFromInterrupt";
    params: import("xstate").NonReducibleUnknown;
} | {
    type: "startReview";
    params: import("xstate").NonReducibleUnknown;
} | {
    type: "rememberFindings";
    params: import("xstate").NonReducibleUnknown;
} | {
    type: "rememberClean";
    params: import("xstate").NonReducibleUnknown;
} | {
    type: "rememberCommitted";
    params: import("xstate").NonReducibleUnknown;
} | {
    type: "rememberRejectedAll";
    params: import("xstate").NonReducibleUnknown;
} | {
    type: "rememberEmptyBossReply";
    params: import("xstate").NonReducibleUnknown;
}, {
    type: "needsBossReply";
    params: unknown;
} | {
    type: "emptyBossReply";
    params: unknown;
} | {
    type: "validStartReview";
    params: unknown;
} | {
    type: "reviewerFindings";
    params: unknown;
} | {
    type: "reviewerClean";
    params: unknown;
} | {
    type: "coderCommitted";
    params: unknown;
} | {
    type: "coderRejectedAll";
    params: unknown;
}, never, "done" | "failed" | "ready" | "awaitBossReply" | "firstReview" | "answerFindings" | "reviewFixCommit" | "reviewAfterRejection", string, Readonly<Record<string, never>>, ReviewOutput, import("xstate").EventObject, import("xstate").MetaObject, {
    id: "review";
    states: {
        readonly ready: {
            id: "ready";
        };
        readonly firstReview: {
            id: "firstReview";
        };
        readonly answerFindings: {
            id: "answerFindings";
        };
        readonly reviewFixCommit: {
            id: "reviewFixCommit";
        };
        readonly reviewAfterRejection: {
            id: "reviewAfterRejection";
        };
        readonly awaitBossReply: {
            id: "awaitBossReply";
        };
        readonly failed: {
            id: "failed";
        };
        readonly done: {
            id: "done";
        };
    };
}>;
export default reviewMachine;
