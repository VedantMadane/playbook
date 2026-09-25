import type { PlaybookCallResult } from '@sublang/playbook/runtime';
export type JsonValue = null | boolean | number | string | readonly JsonValue[] | {
    readonly [key: string]: JsonValue;
};
export type CompactError = {
    readonly name: string;
    readonly message: string;
};
export type ErrorRecord = {
    readonly name: string;
    readonly message: string;
    readonly stack?: string;
};
export type DecideRoleId = 'coder' | 'reviewer';
export type DecideSourceItem = 'DECIDE-1' | 'DECIDE-2' | 'DECIDE-3' | 'DECIDE-4';
/** Delegated-player working leaves; each is its own Boss-reply resume target. */
export type ResumableStateId = 'askCoderProposal' | 'askReviewerProposal' | 'synthesizeCommit';
/**
 * Root BOSS_INTERRUPT targets: the parallel proposal pair as one unit, and the
 * synthesis leaf once both proposals have been promoted.
 */
export type JumpableStateId = 'independentProposals' | 'synthesizeCommit';
/**
 * One role-id array per parallel group, in first-item source order; each
 * inner array follows that group's item order (DECIDE-1, DECIDE-2).
 */
export declare const concurrentRoleSets: readonly (readonly DecideRoleId[])[];
declare const REVIEW_PLAYBOOK_ID: "review";
export type PendingBossQuestion = {
    readonly questionId: ResumableStateId;
    readonly resumeStateId: ResumableStateId;
    readonly sourceItem: 'DECIDE-1' | 'DECIDE-2' | 'DECIDE-3';
    readonly asker: {
        readonly kind: 'role';
        readonly roleId: DecideRoleId;
    };
    readonly question: string;
};
export type PendingBossQuestions = Partial<Record<ResumableStateId, PendingBossQuestion>>;
export type BossReplies = Partial<Record<ResumableStateId, string>>;
declare const CODER_PROPOSAL_RESULTS: {
    readonly proposed: "Coder affirmatively provided a complete design proposal; a progress report, status update, or promise of a later proposal supports no proposal outcome.";
    readonly needsBossReply: "The acting agent's prose surfaces a clarifying question for Boss that the agent cannot answer alone. Output shall include `question: <verbatim question text from the acting agent's prose>`.";
};
declare const REVIEWER_PROPOSAL_RESULTS: {
    readonly proposed: "Reviewer affirmatively provided a complete design proposal; a progress report, status update, or promise of a later proposal supports no proposal outcome. Output shall include `reviewerProposal: <verbatim final text>`.";
    readonly needsBossReply: "The acting agent's prose surfaces a clarifying question for Boss that the agent cannot answer alone. Output shall include `question: <verbatim question text from the acting agent's prose>`.";
};
declare const SYNTHESIZE_COMMIT_RESULTS: {
    readonly committed: "Coder committed the synthesized design as one new commit. Output shall include `coderOutput: <verbatim final text>` and `latestCommit: <commit identity>`.";
    readonly needsBossReply: "The acting agent's prose surfaces a clarifying question for Boss that the agent cannot answer alone. Output shall include `question: <verbatim question text from the acting agent's prose>`.";
};
type PlayerInputBase = {
    readonly pendingBossQuestion?: PendingBossQuestion;
    readonly bossReply?: string;
};
/** DECIDE-1: relays `<caller-topic>` as `callerTopic`. */
export type CoderProposalInput = PlayerInputBase & {
    readonly stateId: 'askCoderProposal';
    readonly role: 'coder';
    readonly sourceItem: 'DECIDE-1';
    readonly prompt: string;
    readonly result: typeof CODER_PROPOSAL_RESULTS;
    readonly callerTopic: string;
};
/** DECIDE-2: relays `<caller-topic>` as `callerTopic`. */
export type ReviewerProposalInput = PlayerInputBase & {
    readonly stateId: 'askReviewerProposal';
    readonly role: 'reviewer';
    readonly sourceItem: 'DECIDE-2';
    readonly prompt: string;
    readonly result: typeof REVIEWER_PROPOSAL_RESULTS;
    readonly callerTopic: string;
};
/**
 * DECIDE-3: relays `<caller-topic>` as `callerTopic` and
 * `<reviewer-proposal>` as `reviewerProposal`.
 */
export type SynthesizeCommitInput = PlayerInputBase & {
    readonly stateId: 'synthesizeCommit';
    readonly role: 'coder';
    readonly sourceItem: 'DECIDE-3';
    readonly prompt: string;
    readonly result: typeof SYNTHESIZE_COMMIT_RESULTS;
    readonly callerTopic: string;
    readonly reviewerProposal: string;
};
export type PlayerInput = CoderProposalInput | ReviewerProposalInput | SynthesizeCommitInput;
export type NeedsBossReplyOutput = {
    readonly guard: 'needsBossReply';
    readonly question: string;
};
export type CoderProposalOutput = {
    readonly guard: 'proposed';
} | NeedsBossReplyOutput;
export type ReviewerProposalOutput = {
    readonly guard: 'proposed';
    readonly reviewerProposal: string;
} | NeedsBossReplyOutput;
export type SynthesizeCommitOutput = {
    readonly guard: 'committed';
    readonly coderOutput: string;
    /** Effect-owned: the runtime fills it from the repository receipt. */
    readonly latestCommit: string;
} | NeedsBossReplyOutput;
export type PlayerOutput = CoderProposalOutput | ReviewerProposalOutput | SynthesizeCommitOutput;
/** DECIDE-4: literal call of the builtin `review` playbook. */
export type PlaybookInput = {
    readonly stateId: 'reviewCommit';
    readonly sourceItem?: 'DECIDE-4';
    readonly playbookId: typeof REVIEW_PLAYBOOK_ID;
    readonly text: string;
};
/** The child machine output itself (or `undefined`), never a wrapper. */
export type PlaybookOutput = JsonValue | undefined;
/** Public output interface of the packaged builtin `review` workflow. */
export type ReviewOutput = {
    readonly noUnsettledFindings: true;
    readonly evaluatedRevision: string;
};
export type DecideInput = Readonly<Record<string, never>>;
export type ReviewStatus = 'aborted' | 'error';
/**
 * Typed run context. A text field holds `''` until its producer runs; every
 * transition that reads one guards it as non-empty first.
 */
export type DecideContext = {
    /** `<caller-topic>`: set by START_DECIDE or a restarting BOSS_INTERRUPT. */
    readonly callerTopic: string;
    /** Branch-staged results; the parallel join promotes them atomically. */
    readonly stagedCoderProposed: boolean;
    readonly stagedReviewerProposal: string;
    /** Promoted proposal results. */
    readonly coderProposed: boolean;
    /** `<reviewer-proposal>`. */
    readonly reviewerProposal: string;
    /** `<coder-output>`. */
    readonly coderOutput: string;
    /** `<decide-commit>`: DECIDE-3's accepted, receipt-owned `latestCommit`. */
    readonly decideCommit: string;
    /** REVIEW's evaluated repository revision on approval. */
    readonly evaluatedRevision: string;
    readonly reviewStatus: ReviewStatus | null;
    readonly reviewError: CompactError | null;
    readonly lastError: ErrorRecord | null;
    readonly pendingBossQuestions: PendingBossQuestions;
    readonly bossReplies: BossReplies;
};
export type DecideEvent = {
    readonly type: 'START_DECIDE';
    readonly callerTopic: string;
} | {
    readonly type: 'BOSS_INTERRUPT';
    readonly targetId: 'independentProposals';
    /** The new topic both proposal players receive. */
    readonly callerTopic: string;
} | {
    readonly type: 'BOSS_INTERRUPT';
    readonly targetId: 'synthesizeCommit';
} | {
    readonly type: 'BOSS_REPLY';
    readonly questionId: string;
    readonly answer: string;
};
/** Exactly the catalog's public `decide` output interface. */
export type DecideOutput = {
    readonly decideCommit: string;
    readonly evaluatedRevision: string;
    readonly noUnsettledFindings: true;
} | {
    readonly lastDecideCommit: string;
    readonly noUnsettledFindings: false;
    readonly reviewStatus: ReviewStatus;
    readonly error?: CompactError;
};
/**
 * Recognizes an authored rejected child result: a validated public result
 * whose status is `aborted` or `error`, or `ok` at the child's authored
 * failure terminal. Anything else is a control-plane error.
 */
export declare function authoredChildResult(error: unknown, expectedPlaybookId: string): PlaybookCallResult | undefined;
export declare const decideMachine: import("xstate").StateMachine<DecideContext, import("xstate").AnyEventObject, {
    [x: string]: import("xstate").ActorRefFromLogic<import("xstate").PromiseActorLogic<PlaybookOutput, PlaybookInput, import("xstate").EventObject>> | import("xstate").ActorRefFromLogic<import("xstate").PromiseActorLogic<PlayerOutput, PlayerInput, import("xstate").EventObject>> | undefined;
}, {
    src: "playbook";
    logic: import("xstate").PromiseActorLogic<PlaybookOutput, PlaybookInput, import("xstate").EventObject>;
    id: string | undefined;
} | {
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
    params: {
        readonly stateId: ResumableStateId;
    };
} | {
    type: "rememberMalformedPlayerOutput";
    params: {
        readonly sourceItem: DecideSourceItem;
    };
} | {
    type: "rememberAuthoredReviewFailure";
    params: import("xstate").NonReducibleUnknown;
} | {
    type: "setPendingBossQuestion";
    params: {
        readonly stateId: ResumableStateId;
    };
} | {
    type: "restartFromInterrupt";
    params: import("xstate").NonReducibleUnknown;
} | {
    type: "rememberEmptyBossReply";
    params: import("xstate").NonReducibleUnknown;
} | {
    type: "rememberUnknownBossReply";
    params: import("xstate").NonReducibleUnknown;
} | {
    type: "startDecide";
    params: import("xstate").NonReducibleUnknown;
} | {
    type: "stageCoderProposal";
    params: import("xstate").NonReducibleUnknown;
} | {
    type: "stageReviewerProposal";
    params: import("xstate").NonReducibleUnknown;
} | {
    type: "promoteProposals";
    params: import("xstate").NonReducibleUnknown;
} | {
    type: "rememberCommit";
    params: import("xstate").NonReducibleUnknown;
} | {
    type: "rememberReviewApproval";
    params: import("xstate").NonReducibleUnknown;
} | {
    type: "rememberUnestablishedReview";
    params: import("xstate").NonReducibleUnknown;
}, {
    type: "needsBossReply";
    params: unknown;
} | {
    type: "authoredReviewFailure";
    params: unknown;
} | {
    type: "committed";
    params: unknown;
} | {
    type: "interruptTargets";
    params: {
        readonly targetId: JumpableStateId;
    };
} | {
    type: "bossReplyIsEmpty";
    params: {
        readonly stateId: ResumableStateId;
    };
} | {
    type: "bossReplyResumes";
    params: {
        readonly stateId: ResumableStateId;
    };
} | {
    type: "bossReplyNamesNoPendingQuestion";
    params: unknown;
} | {
    type: "validStartTopic";
    params: unknown;
} | {
    type: "coderProposedJoining";
    params: unknown;
} | {
    type: "coderProposed";
    params: unknown;
} | {
    type: "reviewerProposedJoining";
    params: unknown;
} | {
    type: "reviewerProposed";
    params: unknown;
} | {
    type: "reviewApproved";
    params: unknown;
}, never, "done" | "failed" | "ready" | "awaitBossReply" | "synthesizeCommit" | "reviewCommit" | "reportedReviewFailure" | {
    independentProposals: {
        coderProposalRegion: "askCoderProposal" | "awaitCoderProposalReply" | "coderProposalStaged";
        reviewerProposalRegion: "askReviewerProposal" | "awaitReviewerProposalReply" | "reviewerProposalStaged";
    };
}, string, Readonly<Record<string, never>>, {
    readonly decideCommit: string;
    readonly evaluatedRevision: string;
    readonly noUnsettledFindings: true;
} | {
    readonly lastDecideCommit: string;
    readonly noUnsettledFindings: false;
    readonly reviewStatus: ReviewStatus;
    readonly error?: CompactError;
}, import("xstate").EventObject, import("xstate").MetaObject, {
    id: "decide";
    states: {
        readonly ready: {
            id: "ready";
        };
        readonly independentProposals: {
            id: "independentProposals";
            states: {
                readonly coderProposalRegion: {
                    id: "coderProposalRegion";
                    states: {
                        readonly askCoderProposal: {
                            id: "askCoderProposal";
                        };
                        readonly awaitCoderProposalReply: {
                            id: "awaitCoderProposalReply";
                        };
                        readonly coderProposalStaged: {
                            id: "coderProposalStaged";
                        };
                    };
                };
                readonly reviewerProposalRegion: {
                    id: "reviewerProposalRegion";
                    states: {
                        readonly askReviewerProposal: {
                            id: "askReviewerProposal";
                        };
                        readonly awaitReviewerProposalReply: {
                            id: "awaitReviewerProposalReply";
                        };
                        readonly reviewerProposalStaged: {
                            id: "reviewerProposalStaged";
                        };
                    };
                };
            };
        };
        readonly synthesizeCommit: {
            id: "synthesizeCommit";
        };
        readonly awaitBossReply: {
            id: "awaitBossReply";
        };
        readonly reviewCommit: {
            id: "reviewCommit";
        };
        readonly failed: {
            id: "failed";
        };
        readonly reportedReviewFailure: {
            id: "reportedReviewFailure";
        };
        readonly done: {
            id: "done";
        };
    };
}>;
export default decideMachine;
