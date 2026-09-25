import type { PlaybookCallResult } from '@sublang/playbook/runtime';
export type JsonValue = null | boolean | number | string | readonly JsonValue[] | {
    readonly [key: string]: JsonValue;
};
/** DEV declares no parallel group. */
export declare const concurrentRoleSets: readonly (readonly string[])[];
export type DevRole = 'analyst';
export type DevChildPlaybookId = 'code' | 'decide' | 'branch' | 'pr';
export type DevCallStateId = 'callCode' | 'callDecide' | 'callCodeAfterDecide' | 'createBranch' | 'openPullRequest';
export type DevCallSourceItem = 'DEV-2' | 'DEV-3' | 'DEV-4' | 'DEV-5' | 'DEV-6';
type ResumableStateId = 'planAnalysis';
/**
 * The development path a pull-request planning outcome selected. It routes
 * the `branch` success into the `code` call (DEV-2) or the `decide` call
 * (DEV-3); its absence means a plain path that calls neither `branch` nor `pr`.
 */
export type DevPullRequestPath = 'code' | 'decide-then-code';
export interface PendingBossQuestion {
    readonly questionId: ResumableStateId;
    readonly resumeStateId: ResumableStateId;
    readonly sourceItem: 'DEV-1';
    readonly asker: {
        readonly kind: 'role';
        readonly roleId: DevRole;
    };
    readonly question: string;
}
type PendingBossQuestionParams = Omit<PendingBossQuestion, 'questionId' | 'question'>;
export interface PlayerInput {
    readonly stateId: ResumableStateId;
    readonly role: DevRole;
    readonly sourceItem: 'DEV-1';
    readonly prompt: string;
    readonly result: Readonly<Record<string, string>>;
    /** Substitutes `<development-request>`. */
    readonly developmentRequest: string;
    /** Substitutes `<discussion-context>`. */
    readonly discussionContext: string;
    /** Substitutes `<run-results>`. */
    readonly runResults: string;
    readonly pendingBossQuestion?: PendingBossQuestion;
    readonly bossReply?: string;
}
export type PlayerOutput = {
    readonly guard: 'discussionComplete';
} | {
    readonly guard: 'code';
    readonly planningResult: string;
} | {
    readonly guard: 'decideThenCode';
    readonly planningResult: string;
} | {
    readonly guard: 'codeViaPullRequest';
    readonly planningResult: string;
} | {
    readonly guard: 'decideThenCodeViaPullRequest';
    readonly planningResult: string;
} | {
    readonly guard: 'needsBossReply';
    readonly question: string;
};
export interface PlaybookInput {
    readonly stateId: DevCallStateId;
    readonly sourceItem: DevCallSourceItem;
    readonly playbookId: DevChildPlaybookId;
    readonly text: string;
}
/** The child's JSON-safe machine output itself, delivered on `onDone`. */
export type PlaybookOutput = JsonValue | undefined;
export interface CompactError {
    readonly name: string;
    readonly message: string;
}
/** A control-plane error retained for inspection while DEV is parked. */
export interface ControlError {
    readonly name: string;
    readonly message: string;
    readonly stack?: string;
}
/** Sanitized canonical child result that DEV relays as its own outcome. */
export type CompletedChildResult = {
    readonly playbookId: DevChildPlaybookId;
    readonly status: 'ok';
    readonly output?: JsonValue;
} | {
    readonly playbookId: DevChildPlaybookId;
    readonly status: 'aborted' | 'error';
    readonly error: CompactError;
};
export type DevPlaybookOutput = {
    readonly status: 'discussion-complete';
} | {
    readonly status: 'complete';
    /** The final child of the selected path: `pr` on a pull-request path. */
    readonly childPlaybookId: 'code' | 'pr';
    /** The successful result of that final child call, when it has one. */
    readonly childOutput?: JsonValue;
} | {
    readonly status: 'child-failed';
    /** The relayed canonical child result that ended the selected path. */
    readonly childResult: CompletedChildResult;
};
type DevCompletion = {
    readonly kind: 'discussion-complete';
} | {
    readonly kind: 'complete';
    readonly childPlaybookId: 'code' | 'pr';
    readonly childOutput?: JsonValue;
} | {
    readonly kind: 'child-failed';
    readonly childResult: CompletedChildResult;
};
export interface DevInput {
    /** Optional seed for `<run-results>`; absent means no relevant run results. */
    readonly runResults?: string;
}
export interface DevContext {
    readonly runResults: string;
    readonly developmentRequest?: string;
    /** Consumed Analyst Q&A for `<discussion-context>`; empty before any reply. */
    readonly discussionContext: string;
    readonly planningResult?: string;
    readonly pullRequestPath?: DevPullRequestPath;
    readonly decideCommit?: string;
    readonly evaluatedRevision?: string;
    readonly branch?: string;
    readonly baseRevision?: string;
    readonly issueSummary?: string;
    readonly lastCodeCommit?: string;
    readonly finalEvaluatedRevision?: string;
    readonly completion?: DevCompletion;
    readonly lastError?: ControlError;
    readonly pendingBossQuestion?: PendingBossQuestion;
    readonly bossReply?: string;
}
export type DevEvent = {
    readonly type: 'START_DEV';
    readonly developmentRequest: string;
} | {
    readonly type: 'BOSS_REPLY';
    readonly answer: string;
    readonly questionId?: string;
};
export declare function authoredChildResult(error: unknown, expectedPlaybookId: string): PlaybookCallResult | undefined;
/** One consumed Analyst question and Boss reply, as relayed discussion. */
export declare function renderDiscussionExchange(question: string, answer: string): string;
export declare const devMachine: import("xstate").StateMachine<DevContext, {
    readonly type: "START_DEV";
    readonly developmentRequest: string;
} | {
    readonly type: "BOSS_REPLY";
    readonly answer: string;
    readonly questionId?: string;
}, {
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
    params: import("xstate").NonReducibleUnknown;
} | {
    type: "rememberMalformedPlayerOutput";
    params: import("xstate").NonReducibleUnknown;
} | {
    type: "clearBossReplyContext";
    params: import("xstate").NonReducibleUnknown;
} | {
    type: "setPendingBossQuestion";
    params: PendingBossQuestionParams;
} | {
    type: "rememberMalformedBossReply";
    params: import("xstate").NonReducibleUnknown;
} | {
    type: "startDev";
    params: import("xstate").NonReducibleUnknown;
} | {
    type: "completeDiscussion";
    params: import("xstate").NonReducibleUnknown;
} | {
    type: "acceptPlainPlan";
    params: import("xstate").NonReducibleUnknown;
} | {
    type: "acceptPullRequestPlan";
    params: {
        readonly path: DevPullRequestPath;
    };
} | {
    type: "rememberBranchResult";
    params: import("xstate").NonReducibleUnknown;
} | {
    type: "rememberDecideResult";
    params: import("xstate").NonReducibleUnknown;
} | {
    type: "rememberCodeResult";
    params: import("xstate").NonReducibleUnknown;
} | {
    type: "completeWithChildSuccess";
    params: {
        readonly childPlaybookId: "code" | "pr";
    };
} | {
    type: "completeWithInsufficientResult";
    params: {
        readonly playbookId: DevChildPlaybookId;
    };
} | {
    type: "completeWithAuthoredChildResult";
    params: {
        readonly playbookId: DevChildPlaybookId;
    };
}, {
    type: "needsBossReplyWithQuestion";
    params: unknown;
} | {
    type: "emptyBossReply";
    params: unknown;
} | {
    type: "startsDev";
    params: unknown;
} | {
    type: "discussionCompleteAfterBossReply";
    params: unknown;
} | {
    type: "needsBossReplyWithoutQuestion";
    params: unknown;
} | {
    type: "decideSucceeded";
    params: unknown;
} | {
    type: "codeSucceededOnPullRequestPath";
    params: unknown;
} | {
    type: "codeSucceededOnPlainPath";
    params: unknown;
} | {
    type: "codePlanned";
    params: unknown;
} | {
    type: "decideThenCodePlanned";
    params: unknown;
} | {
    type: "codeViaPullRequestPlanned";
    params: unknown;
} | {
    type: "decideThenCodeViaPullRequestPlanned";
    params: unknown;
} | {
    type: "branchSucceededForCode";
    params: unknown;
} | {
    type: "branchSucceededForDecide";
    params: unknown;
} | {
    type: "authoredBranchResult";
    params: unknown;
} | {
    type: "authoredDecideResult";
    params: unknown;
} | {
    type: "authoredCodeResult";
    params: unknown;
} | {
    type: "authoredPrResult";
    params: unknown;
}, never, "done" | "failed" | "ready" | "awaitBossReply" | "callCode" | "callDecide" | "callCodeAfterDecide" | "createBranch" | "openPullRequest" | "planAnalysis" | "discussionComplete" | "reportedChildFailure", string, DevInput, {
    readonly status: "discussion-complete";
} | {
    readonly status: "complete";
    /** The final child of the selected path: `pr` on a pull-request path. */
    readonly childPlaybookId: "code" | "pr";
    /** The successful result of that final child call, when it has one. */
    readonly childOutput?: JsonValue;
} | {
    readonly status: "child-failed";
    /** The relayed canonical child result that ended the selected path. */
    readonly childResult: CompletedChildResult;
}, import("xstate").EventObject, import("xstate").MetaObject, {
    id: "dev";
    states: {
        readonly ready: {
            id: "ready";
        };
        readonly planAnalysis: {
            id: "planAnalysis";
        };
        readonly awaitBossReply: {
            id: "awaitBossReply";
        };
        readonly createBranch: {
            id: "createBranch";
        };
        readonly callCode: {
            id: "callCode";
        };
        readonly callDecide: {
            id: "callDecide";
        };
        readonly callCodeAfterDecide: {
            id: "callCodeAfterDecide";
        };
        readonly openPullRequest: {
            id: "openPullRequest";
        };
        readonly failed: {
            id: "failed";
        };
        readonly discussionComplete: {
            id: "discussionComplete";
        };
        readonly done: {
            id: "done";
        };
        readonly reportedChildFailure: {
            id: "reportedChildFailure";
        };
    };
}>;
export default devMachine;
