export type JsonValue = null | boolean | number | string | readonly JsonValue[] | {
    readonly [key: string]: JsonValue;
};
/** Stable ids of the working leaves; each is also a Boss-reply resume target. */
export type ReviewStateId = 'reviewFirstRound' | 'fixFindings' | 'reviewAfterCommit' | 'reviewAfterRejection';
export type ReviewSourceItem = 'REVIEW-1' | 'REVIEW-2' | 'REVIEW-3' | 'REVIEW-4';
export type ReviewRoleId = 'coder' | 'reviewer';
export type PendingBossQuestion = {
    readonly questionId: ReviewStateId;
    readonly resumeStateId: ReviewStateId;
    readonly sourceItem: ReviewSourceItem;
    readonly asker: {
        readonly kind: 'role';
        readonly roleId: ReviewRoleId;
    };
    readonly question: string;
};
type PlayerInputBase<StateId extends ReviewStateId, RoleId extends ReviewRoleId, SourceItem extends ReviewSourceItem> = {
    readonly stateId: StateId;
    readonly role: RoleId;
    readonly sourceItem: SourceItem;
    readonly prompt: string;
    readonly result: Readonly<Record<string, string>>;
    readonly pendingBossQuestion?: PendingBossQuestion;
    readonly bossReply?: string;
};
/** REVIEW-1: first review round; relays `<caller-input>`. */
export type ReviewFirstRoundInput = PlayerInputBase<'reviewFirstRound', 'reviewer', 'REVIEW-1'> & {
    readonly callerInput: string;
};
/** REVIEW-2: Coder disposition round; relays `<caller-input>` and `<reviewer-output>`. */
export type FixFindingsInput = PlayerInputBase<'fixFindings', 'coder', 'REVIEW-2'> & {
    readonly callerInput: string;
    readonly reviewerOutput: string;
};
/** REVIEW-3: round after a review-fix commit; relays `<caller-input>`, `<latest-commit>`, `<coder-output>`. */
export type ReviewAfterCommitInput = PlayerInputBase<'reviewAfterCommit', 'reviewer', 'REVIEW-3'> & {
    readonly callerInput: string;
    readonly latestCommit: string;
    readonly coderOutput: string;
};
/** REVIEW-4: round after Coder rejected every finding; relays `<caller-input>` and `<coder-output>`. */
export type ReviewAfterRejectionInput = PlayerInputBase<'reviewAfterRejection', 'reviewer', 'REVIEW-4'> & {
    readonly callerInput: string;
    readonly coderOutput: string;
};
export type PlayerInput = ReviewFirstRoundInput | FixFindingsInput | ReviewAfterCommitInput | ReviewAfterRejectionInput;
export type ReviewerOutput = {
    readonly guard: 'findings';
    readonly reviewerOutput: string;
} | {
    readonly guard: 'clean';
    /** Receipt-owned repository revision the clean round evaluated. */
    readonly evaluatedRevision: string;
} | {
    readonly guard: 'needsBossReply';
    readonly question: string;
};
export type CoderOutput = {
    readonly guard: 'committed';
    /** Receipt-owned identity of the new review-fix commit. */
    readonly latestCommit: string;
    readonly coderOutput: string;
} | {
    readonly guard: 'rejectedAll';
    readonly coderOutput: string;
} | {
    readonly guard: 'needsBossReply';
    readonly question: string;
};
export type PlayerOutput = ReviewerOutput | CoderOutput;
/** Public REVIEW output interface (workflow-contracts.json `review`). */
export type ReviewPlaybookOutput = {
    readonly noUnsettledFindings: true;
    /** Exact receipt-observed repository revision evaluated by the final clean review round. */
    readonly evaluatedRevision: string;
};
export type ReviewInput = Readonly<Record<string, never>>;
export type NormalizedError = {
    readonly name: string;
    readonly message: string;
    readonly stack?: string;
};
export type CoderOutcome = 'committed' | 'rejectedAll';
export type ReviewContext = {
    readonly callerInput?: string;
    readonly reviewerOutput?: string;
    readonly latestCommit?: string;
    readonly coderOutput?: string;
    readonly coderOutcome?: CoderOutcome;
    readonly evaluatedRevision?: string;
    readonly lastError?: NormalizedError;
    readonly pendingBossQuestion?: PendingBossQuestion;
    readonly bossReply?: string;
};
export type ReviewEvent = {
    readonly type: 'START_REVIEW';
    readonly callerInput: string;
} | {
    readonly type: 'BOSS_INTERRUPT';
    readonly targetId: ReviewStateId;
} | {
    readonly type: 'BOSS_REPLY';
    readonly answer: string;
    readonly questionId?: ReviewStateId;
};
export declare const concurrentRoleSets: readonly (readonly ReviewRoleId[])[];
export declare const reviewMachine: import("xstate").StateMachine<ReviewContext, {
    readonly type: "START_REVIEW";
    readonly callerInput: string;
} | {
    readonly type: "BOSS_INTERRUPT";
    readonly targetId: ReviewStateId;
} | {
    readonly type: "BOSS_REPLY";
    readonly answer: string;
    readonly questionId?: ReviewStateId;
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
    type: "abandonForInterrupt";
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
    type: "rememberPendingQuestion";
    params: {
        readonly stateId: ReviewStateId;
        readonly sourceItem: ReviewSourceItem;
        readonly roleId: ReviewRoleId;
    };
} | {
    type: "rememberEmptyBossReplyError";
    params: import("xstate").NonReducibleUnknown;
}, {
    type: "needsBossReply";
    params: unknown;
} | {
    type: "emptyBossReply";
    params: unknown;
} | {
    type: "canInterruptTo";
    params: {
        readonly targetId: ReviewStateId;
    };
} | {
    type: "resumesState";
    params: {
        readonly stateId: ReviewStateId;
    };
} | {
    type: "isFindings";
    params: unknown;
} | {
    type: "isClean";
    params: unknown;
} | {
    type: "isCommitted";
    params: unknown;
} | {
    type: "isRejectedAll";
    params: unknown;
} | {
    type: "validStartReview";
    params: unknown;
}, never, "done" | "failed" | "ready" | "awaitBossReply" | "reviewFirstRound" | "fixFindings" | "reviewAfterCommit" | "reviewAfterRejection", string, Readonly<Record<string, never>>, ReviewPlaybookOutput, import("xstate").EventObject, import("xstate").MetaObject, {
    id: "review";
    states: {
        readonly ready: {
            id: "ready";
        };
        readonly reviewFirstRound: {
            id: "reviewFirstRound";
        };
        readonly fixFindings: {
            id: "fixFindings";
        };
        readonly reviewAfterCommit: {
            id: "reviewAfterCommit";
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
