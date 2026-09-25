export type BranchStateId = 'createBranch';
export type BranchSourceItem = 'BRANCH-1';
/**
 * Stable working-leaf ids that may suspend on a Boss question and be resumed
 * by `BOSS_REPLY`. The machine has at most one active player task, so the
 * scalar Boss-reply form applies.
 */
declare const RESUMABLE_STATE_IDS: readonly ["createBranch"];
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
    readonly asker: {
        readonly kind: 'role';
        readonly roleId: 'coder';
    };
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
export type PlayerOutput = {
    readonly guard: 'branched';
    readonly branch: string;
    /** Exact base revision from repository authority, not from Coder's prose. */
    readonly baseRevision: string;
    readonly issueSummary: string;
} | {
    readonly guard: 'refused';
    readonly coderOutput: string;
} | {
    readonly guard: 'needsBossReply';
    readonly question: string;
};
/**
 * Terminal result: exactly the packaged `branch` workflow's public output
 * interface (workflow-contracts.json), derived from typed context.
 */
export type BranchPlaybookOutput = {
    readonly status: 'branched';
    /** Exact new branch name. */
    readonly branch: string;
    /** Exact receipt-observed repository revision the branch was created from. */
    readonly baseRevision: string;
    /** Concise issue-and-comments or request summary. */
    readonly issueSummary: string;
} | {
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
export type BranchEvent = {
    readonly type: 'START_BRANCH';
    readonly callerInput: string;
} | {
    readonly type: 'BOSS_REPLY';
    readonly answer: string;
    readonly questionId?: ResumableStateId;
};
/** No parallel group in this playbook. */
export declare const concurrentRoleSets: readonly (readonly string[])[];
export declare const branchMachine: import("xstate").StateMachine<BranchContext, {
    readonly type: "START_BRANCH";
    readonly callerInput: string;
} | {
    readonly type: "BOSS_REPLY";
    readonly answer: string;
    readonly questionId?: ResumableStateId;
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
    type: "rememberMalformedPlayerOutput";
    params: import("xstate").NonReducibleUnknown;
} | {
    type: "rememberMalformedBossReply";
    params: import("xstate").NonReducibleUnknown;
} | {
    type: "setPendingBossQuestion";
    params: {
        readonly stateId: ResumableStateId;
        readonly sourceItem: BranchSourceItem;
    };
} | {
    type: "clearBossReplyContext";
    params: import("xstate").NonReducibleUnknown;
} | {
    type: "acceptBossReply";
    params: import("xstate").NonReducibleUnknown;
} | {
    type: "startBranch";
    params: import("xstate").NonReducibleUnknown;
} | {
    type: "rememberBranched";
    params: import("xstate").NonReducibleUnknown;
} | {
    type: "rememberRefused";
    params: import("xstate").NonReducibleUnknown;
}, {
    type: "needsBossReply";
    params: {
        readonly stateId: ResumableStateId;
    };
} | {
    type: "canResume";
    params: {
        readonly stateId: ResumableStateId;
    };
} | {
    type: "givesRequest";
    params: unknown;
} | {
    type: "isBranched";
    params: unknown;
} | {
    type: "isRefused";
    params: unknown;
}, never, "failed" | "ready" | "awaitBossReply" | "refused" | "createBranch" | "branched", string, Readonly<Record<never, never>>, {
    readonly status: "branched";
    /** Exact new branch name. */
    readonly branch: string;
    /** Exact receipt-observed repository revision the branch was created from. */
    readonly baseRevision: string;
    /** Concise issue-and-comments or request summary. */
    readonly issueSummary: string;
} | {
    readonly status: "refused";
    /** Complete refusal report. */
    readonly coderOutput: string;
}, import("xstate").EventObject, import("xstate").MetaObject, {
    id: "branch";
    states: {
        readonly ready: {
            id: "ready";
        };
        readonly createBranch: {
            id: "createBranch";
        };
        readonly awaitBossReply: {
            id: "awaitBossReply";
        };
        readonly failed: {
            id: "failed";
        };
        readonly branched: {
            id: "branched";
        };
        readonly refused: {
            id: "refused";
        };
    };
}>;
export default branchMachine;
