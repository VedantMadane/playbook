import type { PlaybookCallResult } from '@sublang/playbook/runtime';
export type JsonValue = null | boolean | number | string | readonly JsonValue[] | {
    readonly [key: string]: JsonValue;
};
export type PrStateId = 'openPullRequest' | 'waitForChecks' | 'fixChecks' | 'publishFix' | 'waitForFixChecks' | 'mergePullRequest' | 'updateLocalDefault';
export type PrSourceItem = 'PR-1' | 'PR-2' | 'PR-3' | 'PR-4' | 'PR-5' | 'PR-6' | 'PR-7';
/** Working leaves a Boss reply may resume (scalar Boss-reply form). */
export type ResumableStateId = 'openPullRequest';
/** No parallel group: the playbook runs one delegated role at a time. */
export declare const concurrentRoleSets: readonly (readonly string[])[];
export type PendingBossQuestion = {
    readonly questionId: 'openPullRequest';
    readonly resumeStateId: 'openPullRequest';
    readonly sourceItem: 'PR-1';
    readonly asker: {
        readonly kind: 'role';
        readonly roleId: 'coder';
    };
    readonly question: string;
};
export type PlayerInput = {
    readonly stateId: 'openPullRequest';
    readonly role: 'coder';
    readonly sourceItem: 'PR-1';
    readonly prompt: string;
    readonly result: Readonly<Record<string, string>>;
    /** `<caller-input>`: the complete caller input, relayed in quotes. */
    readonly callerInput: string;
    readonly pendingBossQuestion?: PendingBossQuestion;
    readonly bossReply?: string;
};
export type PlayerOutput = {
    readonly guard: 'opened';
    readonly pullRequest: string;
    readonly pullRequestUrl: string;
} | {
    readonly guard: 'notPublished';
    readonly coderOutput: string;
} | {
    readonly guard: 'needsBossReply';
    readonly question: string;
};
export type ScriptStateId = 'waitForChecks' | 'publishFix' | 'waitForFixChecks' | 'mergePullRequest' | 'updateLocalDefault';
export type ScriptInput = {
    readonly stateId: ScriptStateId;
    readonly sourceItem: 'PR-2' | 'PR-4' | 'PR-5' | 'PR-6' | 'PR-7';
    /** The script blockquote, with its runtime values bound as shell literals. */
    readonly command: string;
    /** Zero-exit guard first, then the nonzero-exit guard. */
    readonly result: Readonly<Record<string, string>>;
};
export type ScriptOutput = {
    readonly guard: 'checksPassed';
    readonly exitStatus: number;
} | {
    readonly guard: 'checksFailed';
    readonly exitStatus: number;
} | {
    readonly guard: 'fixPublished';
    readonly exitStatus: number;
} | {
    readonly guard: 'fixNotPublished';
    readonly exitStatus: number;
} | {
    readonly guard: 'checksStillFailing';
    readonly exitStatus: number;
} | {
    readonly guard: 'merged';
    readonly exitStatus: number;
} | {
    readonly guard: 'mergeRefused';
    readonly exitStatus: number;
} | {
    readonly guard: 'localDefaultUpdated';
    readonly exitStatus: number;
} | {
    readonly guard: 'localDefaultNotUpdated';
    readonly exitStatus: number;
};
export type PrChildPlaybookId = 'code';
export type PlaybookInput = {
    readonly stateId: 'fixChecks';
    readonly sourceItem?: 'PR-3';
    readonly playbookId: PrChildPlaybookId;
    readonly text: string;
};
/** The playbook actor resolves with the child's own machine output. */
export type PlaybookOutput = JsonValue | undefined;
export type CompactError = {
    readonly name: string;
    readonly message: string;
};
export type ErrorRecord = {
    readonly name: string;
    readonly message: string;
    readonly stack?: string;
};
/** Sanitized canonical `code` result relayed by the `fix-failed` outcome. */
export type CompletedCodeResult = {
    readonly playbookId: 'code';
    readonly status: 'ok';
    readonly output?: JsonValue;
} | {
    readonly playbookId: 'code';
    readonly status: 'aborted' | 'error';
    readonly error: CompactError;
};
/** Public `pr` output interface (workflow-contracts catalog). */
export type PrPlaybookOutput = {
    readonly status: 'merged';
    readonly pullRequest: string;
    readonly pullRequestUrl: string;
    readonly localDefaultUpdated: boolean;
} | {
    readonly status: 'not-merged';
    readonly reason: 'not-published';
    readonly coderOutput: string;
} | {
    readonly status: 'not-merged';
    readonly reason: 'fix-failed';
    readonly pullRequest: string;
    readonly pullRequestUrl: string;
    readonly childResult: CompletedCodeResult;
} | {
    readonly status: 'not-merged';
    readonly reason: 'fix-not-published' | 'checks-failed';
    readonly pullRequest: string;
    readonly pullRequestUrl: string;
} | {
    readonly status: 'merge-unconfirmed';
    readonly pullRequest: string;
    readonly pullRequestUrl: string;
};
export type PrInput = Readonly<Record<string, never>>;
export type PrCompletion = 'merged' | 'not-published' | 'fix-failed' | 'fix-not-published' | 'checks-failed' | 'merge-unconfirmed';
export type PrContext = {
    readonly callerInput?: string;
    readonly pullRequest?: string;
    readonly pullRequestUrl?: string;
    readonly coderOutput?: string;
    readonly childResult?: CompletedCodeResult;
    readonly localDefaultUpdated?: boolean;
    readonly completion?: PrCompletion;
    readonly lastError?: ErrorRecord;
    readonly pendingBossQuestion?: PendingBossQuestion;
    readonly bossReply?: string;
};
export type PrEvent = {
    readonly type: 'START_PR';
    readonly callerInput: string;
} | {
    readonly type: 'BOSS_REPLY';
    readonly answer: string;
    readonly questionId?: 'openPullRequest';
};
export declare function authoredChildResult(error: unknown, expectedPlaybookId: string): PlaybookCallResult | undefined;
export declare const prMachine: import("xstate").StateMachine<PrContext, {
    readonly type: "START_PR";
    readonly callerInput: string;
} | {
    readonly type: "BOSS_REPLY";
    readonly answer: string;
    readonly questionId?: "openPullRequest";
}, {
    [x: string]: import("xstate").ActorRefFromLogic<import("xstate").PromiseActorLogic<PlaybookOutput, PlaybookInput, import("xstate").EventObject>> | import("xstate").ActorRefFromLogic<import("xstate").PromiseActorLogic<PlayerOutput, PlayerInput, import("xstate").EventObject>> | import("xstate").ActorRefFromLogic<import("xstate").PromiseActorLogic<ScriptOutput, ScriptInput, import("xstate").EventObject>> | undefined;
}, {
    src: "playbook";
    logic: import("xstate").PromiseActorLogic<PlaybookOutput, PlaybookInput, import("xstate").EventObject>;
    id: string | undefined;
} | {
    src: "player";
    logic: import("xstate").PromiseActorLogic<PlayerOutput, PlayerInput, import("xstate").EventObject>;
    id: string | undefined;
} | {
    src: "script";
    logic: import("xstate").PromiseActorLogic<ScriptOutput, ScriptInput, import("xstate").EventObject>;
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
    type: "rememberEmptyBossReplyError";
    params: import("xstate").NonReducibleUnknown;
} | {
    type: "rememberMalformedPlayerOutput";
    params: import("xstate").NonReducibleUnknown;
} | {
    type: "setPendingBossQuestion";
    params: import("xstate").NonReducibleUnknown;
} | {
    type: "clearBossReplyContext";
    params: import("xstate").NonReducibleUnknown;
} | {
    type: "completeWithInsufficientCodeResult";
    params: import("xstate").NonReducibleUnknown;
} | {
    type: "completeWithCodeFailure";
    params: import("xstate").NonReducibleUnknown;
} | {
    type: "startPr";
    params: import("xstate").NonReducibleUnknown;
} | {
    type: "rememberOpened";
    params: import("xstate").NonReducibleUnknown;
} | {
    type: "completeNotPublished";
    params: import("xstate").NonReducibleUnknown;
} | {
    type: "completeFixNotPublished";
    params: import("xstate").NonReducibleUnknown;
} | {
    type: "completeChecksFailed";
    params: import("xstate").NonReducibleUnknown;
} | {
    type: "completeMergeUnconfirmed";
    params: import("xstate").NonReducibleUnknown;
} | {
    type: "completeMergedLocalUpdated";
    params: import("xstate").NonReducibleUnknown;
} | {
    type: "completeMergedLocalNotUpdated";
    params: import("xstate").NonReducibleUnknown;
} | {
    type: "rememberMalformedScriptOutput";
    params: import("xstate").NonReducibleUnknown;
} | {
    type: "rememberMalformedChildOutput";
    params: import("xstate").NonReducibleUnknown;
}, {
    type: "needsBossReply";
    params: unknown;
} | {
    type: "emptyBossReply";
    params: unknown;
} | {
    type: "fixPublished";
    params: unknown;
} | {
    type: "fixNotPublished";
    params: unknown;
} | {
    type: "checksStillFailing";
    params: unknown;
} | {
    type: "merged";
    params: unknown;
} | {
    type: "mergeRefused";
    params: unknown;
} | {
    type: "localDefaultUpdated";
    params: unknown;
} | {
    type: "localDefaultNotUpdated";
    params: unknown;
} | {
    type: "isOpened";
    params: unknown;
} | {
    type: "isNotPublished";
    params: unknown;
} | {
    type: "isCodeSuccess";
    params: unknown;
} | {
    type: "isInsufficientCodeResult";
    params: unknown;
} | {
    type: "isAuthoredCodeFailure";
    params: unknown;
} | {
    type: "validStartPr";
    params: unknown;
} | {
    type: "waitForChecksPassed";
    params: unknown;
} | {
    type: "waitForChecksFailed";
    params: unknown;
} | {
    type: "waitForFixChecksPassed";
    params: unknown;
}, never, "failed" | "ready" | "awaitBossReply" | "openPullRequest" | "waitForChecks" | "fixChecks" | "publishFix" | "waitForFixChecks" | "mergePullRequest" | "updateLocalDefault" | "notPublished" | "checksFailed" | "fixNotPublished" | "mergedLocalUpdated" | "mergedLocalNotUpdated" | "fixFailed" | "mergeUnconfirmed", string, Readonly<Record<string, never>>, {
    readonly status: "merged";
    readonly pullRequest: string;
    readonly pullRequestUrl: string;
    readonly localDefaultUpdated: boolean;
} | {
    readonly status: "not-merged";
    readonly reason: "not-published";
    readonly coderOutput: string;
} | {
    readonly status: "not-merged";
    readonly reason: "fix-failed";
    readonly pullRequest: string;
    readonly pullRequestUrl: string;
    readonly childResult: CompletedCodeResult;
} | {
    readonly status: "not-merged";
    readonly reason: "fix-not-published" | "checks-failed";
    readonly pullRequest: string;
    readonly pullRequestUrl: string;
} | {
    readonly status: "merge-unconfirmed";
    readonly pullRequest: string;
    readonly pullRequestUrl: string;
}, import("xstate").EventObject, import("xstate").MetaObject, {
    id: "pr";
    states: {
        readonly ready: {
            id: "ready";
        };
        readonly openPullRequest: {
            id: "openPullRequest";
        };
        readonly awaitBossReply: {
            id: "awaitBossReply";
        };
        readonly waitForChecks: {
            id: "waitForChecks";
        };
        readonly fixChecks: {
            id: "fixChecks";
        };
        readonly publishFix: {
            id: "publishFix";
        };
        readonly waitForFixChecks: {
            id: "waitForFixChecks";
        };
        readonly mergePullRequest: {
            id: "mergePullRequest";
        };
        readonly updateLocalDefault: {
            id: "updateLocalDefault";
        };
        readonly failed: {
            id: "failed";
        };
        readonly mergedLocalUpdated: {
            id: "mergedLocalUpdated";
        };
        readonly mergedLocalNotUpdated: {
            id: "mergedLocalNotUpdated";
        };
        readonly notPublished: {
            id: "notPublished";
        };
        readonly fixFailed: {
            id: "fixFailed";
        };
        readonly fixNotPublished: {
            id: "fixNotPublished";
        };
        readonly checksFailed: {
            id: "checksFailed";
        };
        readonly mergeUnconfirmed: {
            id: "mergeUnconfirmed";
        };
    };
}>;
export default prMachine;
