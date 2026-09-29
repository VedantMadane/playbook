// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>
//
// FSM object artifact compiled from ./dev.gears.md by gears2fsm.
// It defines only the machine, actor contracts, and typed inputs; the linked
// runtime supplies the `player` and `playbook` actor implementations.
import { assign, fromPromise, setup } from 'xstate';
import { validatePlaybookCallResult } from '@sublang/playbook/xstate-runtime';
/** DEV declares no parallel group. */
export const concurrentRoleSets = [];
// DEV-1: the item's blockquote, verbatim, with the outer GEARS marker removed.
const PLAN_ANALYSIS_PROMPT = [
    'Plan which playbooks run for this request; the playbooks do the work.',
    'Read the request, then the specs and the repository only as far as choosing the path requires.',
    'Do not change files or commit while planning or discussing the request.',
    '',
    'Choose exactly one:',
    '',
    '- `code`: the existing decisions and spec items settle how the work is done.',
    '- `decide then code`: the work turns on a rule, concept, term, shape, or trade-off the specs leave open or contradict; name what is open, do not settle it.',
    '- `code via pull request` or `decide then code via pull request`, in place of the two above, when the request names a GitHub issue (number or URL) or explicitly asks for pull-request delivery; read the issue and its comments (`gh issue view --comments` with the issue number) while choosing.',
    '- A question to Boss, only when the answer would change which path runs or whether any work is wanted: one short question naming the alternatives it decides between, and nothing else. When every answer leads to the same path, choose it; the playbook settles the open point.',
    '- `discussion complete`, after a Boss reply, when no repository work should follow.',
    '',
    'Your reply is the planning note the chosen playbook receives. It holds only the path and, in at most ten lines, why — the decisions and spec items that settle the work, or the open point a decision must settle — plus the scope the request implies and any fact from the issue the playbooks need.',
    'It holds no design, proposal, implementation instruction, or file-level finding: the playbooks own those.',
    'A reply that chooses a path asks Boss nothing; a reply that asks Boss chooses no path.',
    'A question or exploratory discussion is not by itself authorization to create a durable decision or implement changes.',
    'Do not choose `decide then code` merely because the work is large, nor `code` merely because it is small.',
    'Consult @specs/map.md for relevant context and @specs/meta.md for spec requirements, if needed.',
    '',
    '> Original request: <development-request>',
    '> Prior discussion: <discussion-context>',
    '> Run results: <run-results>',
].join('\n');
const NEEDS_BOSS_REPLY_DESCRIPTION = "The acting agent's prose surfaces a clarifying question for Boss that the agent cannot answer alone. Output shall include `question: <verbatim question text from the acting agent's prose>`.";
// DEV-1 local result contract: the authored `Results:` bullets in declared
// order, plus the universal Boss-reply suspension.
const PLAN_ANALYSIS_RESULT = {
    discussionComplete: 'After a Boss reply that settles that no repository work should follow, Analyst concluded the discussion; dev completes without a child call or repository change.',
    code: 'Analyst chose the code path because the existing decisions and spec items settle how the work is done. Output shall include `planningResult: <verbatim final text>`.',
    decideThenCode: 'Analyst chose the decide then code path because the work turns on a rule, concept, term, shape, or trade-off the specs leave open or contradict. Output shall include `planningResult: <verbatim final text>`.',
    codeViaPullRequest: 'Analyst chose the code via pull request path because the existing decisions and spec items settle how the work is done and the request names a GitHub issue or explicitly asks for pull-request delivery. Output shall include `planningResult: <verbatim final text>`.',
    decideThenCodeViaPullRequest: 'Analyst chose the decide then code via pull request path because the work turns on a rule, concept, term, shape, or trade-off the specs leave open or contradict and the request names a GitHub issue or explicitly asks for pull-request delivery. Output shall include `planningResult: <verbatim final text>`.',
    needsBossReply: NEEDS_BOSS_REPLY_DESCRIPTION,
};
// DEV-2 and DEV-3 and DEV-5: identical composed blockquotes.
const PLANNED_CALL_TEMPLATE = [
    '> Original request: <development-request>',
    '> Prior discussion: <discussion-context>',
    '> Planning result: <planning-result>',
];
// DEV-4.
const CODE_AFTER_DECIDE_CALL_TEMPLATE = [
    '> Original request: <development-request>',
    '> Prior discussion: <discussion-context>',
    '> Planning result: <planning-result>',
    '> DECIDE commit: <decide-commit>',
    '> Evaluated revision: <evaluated-revision>',
];
// DEV-6.
const PULL_REQUEST_CALL_TEMPLATE = [
    '> Original request: <development-request>',
    '> Issue summary: <issue-summary>',
    '> Branch: <branch>',
    '> Base revision: <base-revision>',
    '> CODE commit: <last-code-commit>',
    '> Evaluated revision: <final-evaluated-revision>',
];
const STATE_DESCRIPTIONS = {
    ready: 'Waiting for a development request.',
    planAnalysis: 'Analyst chooses the development path in a short planning note.',
    awaitBossReply: "Waiting for Boss to answer the acting agent's question.",
    createBranch: 'The BRANCH playbook prepares the branch for the pull-request delivery path.',
    callCode: 'The CODE playbook implements the planned development path.',
    callDecide: 'The DECIDE playbook settles the decision the planned development path requires.',
    callCodeAfterDecide: 'The CODE playbook implements the development path DECIDE settled.',
    openPullRequest: 'The PR playbook delivers the implemented branch through a pull request.',
    failed: 'DEV failed outside a child result contract and waits for a new development request.',
    discussionComplete: 'After a Boss reply, the planning discussion concluded with no child call or repository change.',
    done: "The selected development path completed with its final child playbook's successful result.",
    reportedChildFailure: "DEV ended by relaying a child playbook's authored abort, failure, or result that did not prove the required success.",
};
function playbookMeta(stateId) {
    return {
        playbook: { stateId, description: STATE_DESCRIPTIONS[stateId] },
    };
}
function roleMeta(stateId, role) {
    return {
        playbook: { stateId, description: STATE_DESCRIPTIONS[stateId], role },
    };
}
function terminalMeta(stateId, terminal) {
    return {
        playbook: { stateId, description: STATE_DESCRIPTIONS[stateId], terminal },
    };
}
const PLAN_ANALYSIS_QUESTION = {
    resumeStateId: 'planAnalysis',
    sourceItem: 'DEV-1',
    asker: { kind: 'role', roleId: 'analyst' },
};
function isRecord(value) {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
        return false;
    }
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
}
function isNonEmptyString(value) {
    return typeof value === 'string' && value.trim().length > 0;
}
// ---------------------------------------------------------------------------
// Player output (DEV-1), narrowed structurally from an unknown done event.
function playerOutputOf(event) {
    if (!isRecord(event))
        return undefined;
    return isRecord(event.output) ? event.output : undefined;
}
function hasGuard(event, guard) {
    return playerOutputOf(event)?.guard === guard;
}
function outputText(event, field) {
    const value = playerOutputOf(event)?.[field];
    return isNonEmptyString(value) ? value : undefined;
}
function plannedPath(guard) {
    return ({ event }) => hasGuard(event, guard) && outputText(event, 'planningResult') !== undefined;
}
// Discussion complete is available only after a Boss reply: the Analyst
// invocation that returns it must have been resumed with Boss's answer.
function discussionCompleteAfterBossReply({ context, event, }) {
    return (hasGuard(event, 'discussionComplete') &&
        context.pendingBossQuestion !== undefined &&
        isNonEmptyString(context.bossReply));
}
function needsBossReplyWithQuestion({ event }) {
    return (hasGuard(event, 'needsBossReply') && outputText(event, 'question') !== undefined);
}
function needsBossReplyWithoutQuestion({ event }) {
    return (hasGuard(event, 'needsBossReply') && outputText(event, 'question') === undefined);
}
// ---------------------------------------------------------------------------
// Child outputs, read only from each child's canonical structured result and
// checked against the packaged public output interfaces.
function childOutputOf(event) {
    return isRecord(event) ? event.output : undefined;
}
function childErrorOf(event) {
    return isRecord(event) ? event.error : undefined;
}
function branchSuccessOf(value) {
    if (!isRecord(value) ||
        value.status !== 'branched' ||
        !isNonEmptyString(value.branch) ||
        !isNonEmptyString(value.baseRevision) ||
        !isNonEmptyString(value.issueSummary)) {
        return undefined;
    }
    return {
        branch: value.branch,
        baseRevision: value.baseRevision,
        issueSummary: value.issueSummary,
    };
}
function decideSuccessOf(value) {
    if (!isRecord(value) ||
        value.noUnsettledFindings !== true ||
        !isNonEmptyString(value.decideCommit) ||
        !isNonEmptyString(value.evaluatedRevision)) {
        return undefined;
    }
    return {
        decideCommit: value.decideCommit,
        evaluatedRevision: value.evaluatedRevision,
    };
}
function codeSuccessOf(value) {
    if (!isRecord(value) ||
        value.status !== 'complete' ||
        value.allReviewsPassed !== true ||
        !isNonEmptyString(value.lastCodeCommit) ||
        !isNonEmptyString(value.finalEvaluatedRevision)) {
        return undefined;
    }
    return {
        lastCodeCommit: value.lastCodeCommit,
        finalEvaluatedRevision: value.finalEvaluatedRevision,
    };
}
function branchSucceededFor(path) {
    return ({ context, event }) => context.pullRequestPath === path &&
        branchSuccessOf(childOutputOf(event)) !== undefined;
}
function decideSucceeded({ event }) {
    return decideSuccessOf(childOutputOf(event)) !== undefined;
}
function codeSucceededOnPullRequestPath({ context, event, }) {
    return (context.pullRequestPath !== undefined &&
        codeSuccessOf(childOutputOf(event)) !== undefined);
}
function codeSucceededOnPlainPath({ context, event, }) {
    return (context.pullRequestPath === undefined &&
        codeSuccessOf(childOutputOf(event)) !== undefined);
}
// ---------------------------------------------------------------------------
// Authored rejected child results.
export function authoredChildResult(error, expectedPlaybookId) {
    if (!(error instanceof Error))
        return undefined;
    try {
        const result = validatePlaybookCallResult(error.result, expectedPlaybookId);
        return result.status !== 'ok' || result.terminal?.kind === 'failure'
            ? result
            : undefined;
    }
    catch {
        return undefined;
    }
}
function authoredResultFrom(playbookId) {
    return ({ event }) => authoredChildResult(childErrorOf(event), playbookId) !== undefined;
}
function relayedChildResult(event, playbookId) {
    const result = authoredChildResult(childErrorOf(event), playbookId);
    if (result === undefined)
        return undefined;
    if (result.status === 'ok') {
        // A child that completed at its own authored failure terminal relays its
        // own output; an absent output is omitted rather than stored.
        return {
            playbookId,
            status: 'ok',
            ...(result.output === undefined ? {} : { output: result.output }),
        };
    }
    const error = result.error === undefined
        ? {
            name: 'AbortError',
            message: `The ${playbookId} playbook call was aborted.`,
        }
        : { name: result.error.name, message: result.error.message };
    return { playbookId, status: result.status, error };
}
function insufficientChildResult(event, playbookId) {
    const output = childOutputOf(event);
    return {
        playbookId,
        status: 'ok',
        ...(output === undefined ? {} : { output }),
    };
}
function normalizedControlError(error) {
    if (error instanceof Error) {
        return {
            name: error.name.length > 0 ? error.name : 'Error',
            message: error.message,
            ...(typeof error.stack === 'string' ? { stack: error.stack } : {}),
        };
    }
    return {
        name: 'Error',
        message: typeof error === 'string' ? error : 'Actor failed with a non-Error value.',
    };
}
// ---------------------------------------------------------------------------
// Discussion history and quoted-relay composition.
/** One consumed Analyst question and Boss reply, as relayed discussion. */
export function renderDiscussionExchange(question, answer) {
    return `Analyst question: ${question}\nBoss reply: ${answer}`;
}
// Persists the answered pending Q&A pair into the typed discussion context
// before the pending fields are replaced or cleared, so later calls relay it.
function archivedDiscussion(context) {
    if (context.pendingBossQuestion === undefined ||
        !isNonEmptyString(context.bossReply)) {
        return context.discussionContext;
    }
    const exchange = renderDiscussionExchange(context.pendingBossQuestion.question, context.bossReply);
    return context.discussionContext.length > 0
        ? `${context.discussionContext}\n\n${exchange}`
        : exchange;
}
const RELAY_TOKEN = /<[a-z][a-z0-9-]*>/g;
// Quoted-relay composition: an empty value contributes no line, every
// continuation line of a multi-line value is quoted with `> ` (keeping LF/CRLF
// separators), and no quoted line is inserted. Substitution is single-pass and
// literal; a missing value keeps its placeholder literal.
function composeRelay(template, values) {
    const lines = [];
    for (const line of template) {
        const tokens = line.match(RELAY_TOKEN) ?? [];
        if (tokens.some((token) => values[token] === ''))
            continue;
        const composed = line.replace(RELAY_TOKEN, (token) => {
            const value = values[token];
            return value === undefined
                ? token
                : value.replace(/\r?\n/g, (separator) => `${separator}> `);
        });
        lines.push(composed);
    }
    return lines.join('\n');
}
function plannedCallValues(context) {
    return {
        '<development-request>': context.developmentRequest,
        '<discussion-context>': context.discussionContext,
        '<planning-result>': context.planningResult,
    };
}
function plannedCallText(context) {
    return composeRelay(PLANNED_CALL_TEMPLATE, plannedCallValues(context));
}
function codeAfterDecideCallText(context) {
    return composeRelay(CODE_AFTER_DECIDE_CALL_TEMPLATE, {
        ...plannedCallValues(context),
        '<decide-commit>': context.decideCommit,
        '<evaluated-revision>': context.evaluatedRevision,
    });
}
function pullRequestCallText(context) {
    return composeRelay(PULL_REQUEST_CALL_TEMPLATE, {
        '<development-request>': context.developmentRequest,
        '<issue-summary>': context.issueSummary,
        '<branch>': context.branch,
        '<base-revision>': context.baseRevision,
        '<last-code-commit>': context.lastCodeCommit,
        '<final-evaluated-revision>': context.finalEvaluatedRevision,
    });
}
// ---------------------------------------------------------------------------
// Boss entry and reply surfaces.
function startsDev({ event }) {
    return (event.type === 'START_DEV' &&
        typeof event.developmentRequest === 'string' &&
        event.developmentRequest.trim().length > 0);
}
function emptyBossReply({ event }) {
    return (event.type === 'BOSS_REPLY' &&
        (typeof event.answer !== 'string' || event.answer.trim().length === 0));
}
function resumableStates(ids) {
    return ids.map((id) => ({
        guard: ({ context, event }) => event.type === 'BOSS_REPLY' &&
            typeof event.answer === 'string' &&
            event.answer.trim().length > 0 &&
            context.pendingBossQuestion?.resumeStateId === id &&
            (event.questionId === undefined || event.questionId === id),
        target: `#${id}`,
        reenter: true,
        actions: 'rememberBossReply',
    }));
}
const machineSetup = setup({
    types: {},
    actors: {
        player: fromPromise(async () => {
            throw new Error('player actor must be provided by the runner');
        }),
        playbook: fromPromise(async () => {
            throw new Error('playbook actor must be provided by the runner');
        }),
    },
    guards: {
        startsDev,
        emptyBossReply,
        discussionCompleteAfterBossReply,
        codePlanned: plannedPath('code'),
        decideThenCodePlanned: plannedPath('decideThenCode'),
        codeViaPullRequestPlanned: plannedPath('codeViaPullRequest'),
        decideThenCodeViaPullRequestPlanned: plannedPath('decideThenCodeViaPullRequest'),
        needsBossReplyWithQuestion,
        needsBossReplyWithoutQuestion,
        branchSucceededForCode: branchSucceededFor('code'),
        branchSucceededForDecide: branchSucceededFor('decide-then-code'),
        decideSucceeded,
        codeSucceededOnPullRequestPath,
        codeSucceededOnPlainPath,
        authoredBranchResult: authoredResultFrom('branch'),
        authoredDecideResult: authoredResultFrom('decide'),
        authoredCodeResult: authoredResultFrom('code'),
        authoredPrResult: authoredResultFrom('pr'),
    },
    actions: {
        'playbook.acceptedOutcome': (_args, _params) => undefined,
        startDev: assign(({ event }) => ({
            developmentRequest: event.type === 'START_DEV' ? event.developmentRequest : undefined,
            discussionContext: '',
            planningResult: undefined,
            pullRequestPath: undefined,
            decideCommit: undefined,
            evaluatedRevision: undefined,
            branch: undefined,
            baseRevision: undefined,
            issueSummary: undefined,
            lastCodeCommit: undefined,
            finalEvaluatedRevision: undefined,
            completion: undefined,
            lastError: undefined,
            pendingBossQuestion: undefined,
            bossReply: undefined,
        })),
        completeDiscussion: assign(({ context }) => ({
            discussionContext: archivedDiscussion(context),
            completion: { kind: 'discussion-complete' },
            pendingBossQuestion: undefined,
            bossReply: undefined,
        })),
        acceptPlainPlan: assign(({ context, event }) => ({
            planningResult: outputText(event, 'planningResult'),
            discussionContext: archivedDiscussion(context),
            pendingBossQuestion: undefined,
            bossReply: undefined,
        })),
        acceptPullRequestPlan: assign(({ context, event }, params) => ({
            planningResult: outputText(event, 'planningResult'),
            pullRequestPath: params.path,
            discussionContext: archivedDiscussion(context),
            pendingBossQuestion: undefined,
            bossReply: undefined,
        })),
        setPendingBossQuestion: assign(({ context, event }, params) => ({
            discussionContext: archivedDiscussion(context),
            pendingBossQuestion: {
                ...params,
                questionId: params.resumeStateId,
                question: outputText(event, 'question') ?? '',
            },
            bossReply: undefined,
        })),
        rememberBossReply: assign(({ event }) => event.type === 'BOSS_REPLY' ? { bossReply: event.answer } : {}),
        clearBossReplyContext: assign({
            pendingBossQuestion: undefined,
            bossReply: undefined,
        }),
        rememberBranchResult: assign(({ event }) => {
            const success = branchSuccessOf(childOutputOf(event));
            return success === undefined ? {} : { ...success };
        }),
        rememberDecideResult: assign(({ event }) => {
            const success = decideSuccessOf(childOutputOf(event));
            return success === undefined ? {} : { ...success };
        }),
        rememberCodeResult: assign(({ event }) => {
            const success = codeSuccessOf(childOutputOf(event));
            return success === undefined ? {} : { ...success };
        }),
        completeWithChildSuccess: assign(({ event }, params) => {
            const output = childOutputOf(event);
            return {
                completion: {
                    kind: 'complete',
                    childPlaybookId: params.childPlaybookId,
                    ...(output === undefined ? {} : { childOutput: output }),
                },
            };
        }),
        completeWithInsufficientResult: assign(({ event }, params) => ({
            completion: {
                kind: 'child-failed',
                childResult: insufficientChildResult(event, params.playbookId),
            },
        })),
        completeWithAuthoredChildResult: assign(({ event }, params) => {
            const childResult = relayedChildResult(event, params.playbookId);
            return childResult === undefined
                ? {}
                : { completion: { kind: 'child-failed', childResult } };
        }),
        rememberActorError: assign(({ event }) => ({
            lastError: normalizedControlError(childErrorOf(event)),
        })),
        rememberMalformedPlayerOutput: assign({
            lastError: {
                name: 'MalformedActorOutput',
                message: 'Analyst output for DEV-1 did not match an available declared result.',
            },
            pendingBossQuestion: undefined,
            bossReply: undefined,
        }),
        rememberMalformedBossReply: assign({
            lastError: {
                name: 'MalformedBossReply',
                message: 'BOSS_REPLY carried an empty or whitespace-only answer.',
            },
            pendingBossQuestion: undefined,
            bossReply: undefined,
        }),
    },
});
export const devMachine = machineSetup.createMachine({
    id: 'dev',
    description: 'Plans the development path for a request and runs the child playbooks it selects.',
    initial: 'ready',
    context: ({ input }) => ({
        runResults: typeof input?.runResults === 'string' ? input.runResults : '',
        discussionContext: '',
    }),
    output: ({ context }) => {
        const completion = context.completion;
        if (completion === undefined) {
            throw new Error('DEV reached a final state without a recorded completion');
        }
        switch (completion.kind) {
            case 'discussion-complete':
                return { status: 'discussion-complete' };
            case 'complete':
                return {
                    status: 'complete',
                    childPlaybookId: completion.childPlaybookId,
                    ...(completion.childOutput === undefined
                        ? {}
                        : { childOutput: completion.childOutput }),
                };
            case 'child-failed':
                return { status: 'child-failed', childResult: completion.childResult };
        }
    },
    states: {
        ready: {
            id: 'ready',
            description: STATE_DESCRIPTIONS.ready,
            meta: playbookMeta('ready'),
            tags: ['playbook.parked'],
            on: {
                START_DEV: {
                    guard: 'startsDev',
                    target: 'planAnalysis',
                    actions: 'startDev',
                },
            },
        },
        planAnalysis: {
            id: 'planAnalysis',
            description: STATE_DESCRIPTIONS.planAnalysis,
            meta: roleMeta('planAnalysis', 'analyst'),
            tags: ['playbook.busy'],
            invoke: {
                src: 'player',
                input: ({ context }) => ({
                    stateId: 'planAnalysis',
                    role: 'analyst',
                    sourceItem: 'DEV-1',
                    prompt: PLAN_ANALYSIS_PROMPT,
                    result: PLAN_ANALYSIS_RESULT,
                    developmentRequest: context.developmentRequest ?? '',
                    discussionContext: context.discussionContext,
                    runResults: context.runResults,
                    ...(context.pendingBossQuestion === undefined
                        ? {}
                        : { pendingBossQuestion: context.pendingBossQuestion }),
                    ...(context.bossReply === undefined
                        ? {}
                        : { bossReply: context.bossReply }),
                }),
                onDone: [
                    {
                        guard: 'needsBossReplyWithQuestion',
                        target: 'awaitBossReply',
                        actions: [
                            {
                                type: 'playbook.acceptedOutcome',
                                params: {
                                    source: 'planAnalysis',
                                    target: 'awaitBossReply',
                                    acceptedOutcome: 'needsBossReply',
                                },
                            },
                            { type: 'setPendingBossQuestion', params: PLAN_ANALYSIS_QUESTION },
                        ],
                    },
                    {
                        guard: 'needsBossReplyWithoutQuestion',
                        target: 'failed',
                        actions: 'rememberMalformedPlayerOutput',
                    },
                    {
                        guard: 'discussionCompleteAfterBossReply',
                        target: 'discussionComplete',
                        actions: [
                            {
                                type: 'playbook.acceptedOutcome',
                                params: {
                                    source: 'planAnalysis',
                                    target: 'discussionComplete',
                                    acceptedOutcome: 'discussionComplete',
                                },
                            },
                            'completeDiscussion',
                        ],
                    },
                    {
                        guard: 'codePlanned',
                        target: 'callCode',
                        actions: [
                            {
                                type: 'playbook.acceptedOutcome',
                                params: {
                                    source: 'planAnalysis',
                                    target: 'callCode',
                                    acceptedOutcome: 'code',
                                },
                            },
                            'acceptPlainPlan',
                        ],
                    },
                    {
                        guard: 'decideThenCodePlanned',
                        target: 'callDecide',
                        actions: [
                            {
                                type: 'playbook.acceptedOutcome',
                                params: {
                                    source: 'planAnalysis',
                                    target: 'callDecide',
                                    acceptedOutcome: 'decideThenCode',
                                },
                            },
                            'acceptPlainPlan',
                        ],
                    },
                    {
                        guard: 'codeViaPullRequestPlanned',
                        target: 'createBranch',
                        actions: [
                            {
                                type: 'playbook.acceptedOutcome',
                                params: {
                                    source: 'planAnalysis',
                                    target: 'createBranch',
                                    acceptedOutcome: 'codeViaPullRequest',
                                },
                            },
                            { type: 'acceptPullRequestPlan', params: { path: 'code' } },
                        ],
                    },
                    {
                        guard: 'decideThenCodeViaPullRequestPlanned',
                        target: 'createBranch',
                        actions: [
                            {
                                type: 'playbook.acceptedOutcome',
                                params: {
                                    source: 'planAnalysis',
                                    target: 'createBranch',
                                    acceptedOutcome: 'decideThenCodeViaPullRequest',
                                },
                            },
                            {
                                type: 'acceptPullRequestPlan',
                                params: { path: 'decide-then-code' },
                            },
                        ],
                    },
                    {
                        target: 'failed',
                        actions: 'rememberMalformedPlayerOutput',
                    },
                ],
                onError: {
                    target: 'failed',
                    actions: ['rememberActorError', 'clearBossReplyContext'],
                },
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
                        target: 'failed',
                        actions: 'rememberMalformedBossReply',
                    },
                    ...resumableStates(['planAnalysis']),
                ],
                START_DEV: {
                    guard: 'startsDev',
                    target: 'planAnalysis',
                    actions: 'startDev',
                },
            },
        },
        createBranch: {
            id: 'createBranch',
            description: STATE_DESCRIPTIONS.createBranch,
            meta: playbookMeta('createBranch'),
            tags: ['playbook.suspended'],
            invoke: {
                src: 'playbook',
                input: ({ context }) => ({
                    stateId: 'createBranch',
                    sourceItem: 'DEV-5',
                    playbookId: 'branch',
                    text: plannedCallText(context),
                }),
                onDone: [
                    {
                        guard: 'branchSucceededForCode',
                        target: 'callCode',
                        actions: 'rememberBranchResult',
                    },
                    {
                        guard: 'branchSucceededForDecide',
                        target: 'callDecide',
                        actions: 'rememberBranchResult',
                    },
                    {
                        target: 'reportedChildFailure',
                        actions: {
                            type: 'completeWithInsufficientResult',
                            params: { playbookId: 'branch' },
                        },
                    },
                ],
                onError: [
                    {
                        guard: 'authoredBranchResult',
                        target: 'reportedChildFailure',
                        actions: {
                            type: 'completeWithAuthoredChildResult',
                            params: { playbookId: 'branch' },
                        },
                    },
                    { target: 'failed', actions: 'rememberActorError' },
                ],
            },
        },
        callCode: {
            id: 'callCode',
            description: STATE_DESCRIPTIONS.callCode,
            meta: playbookMeta('callCode'),
            tags: ['playbook.suspended'],
            invoke: {
                src: 'playbook',
                input: ({ context }) => ({
                    stateId: 'callCode',
                    sourceItem: 'DEV-2',
                    playbookId: 'code',
                    text: plannedCallText(context),
                }),
                onDone: [
                    {
                        guard: 'codeSucceededOnPullRequestPath',
                        target: 'openPullRequest',
                        actions: 'rememberCodeResult',
                    },
                    {
                        guard: 'codeSucceededOnPlainPath',
                        target: 'done',
                        actions: {
                            type: 'completeWithChildSuccess',
                            params: { childPlaybookId: 'code' },
                        },
                    },
                    {
                        target: 'reportedChildFailure',
                        actions: {
                            type: 'completeWithInsufficientResult',
                            params: { playbookId: 'code' },
                        },
                    },
                ],
                onError: [
                    {
                        guard: 'authoredCodeResult',
                        target: 'reportedChildFailure',
                        actions: {
                            type: 'completeWithAuthoredChildResult',
                            params: { playbookId: 'code' },
                        },
                    },
                    { target: 'failed', actions: 'rememberActorError' },
                ],
            },
        },
        callDecide: {
            id: 'callDecide',
            description: STATE_DESCRIPTIONS.callDecide,
            meta: playbookMeta('callDecide'),
            tags: ['playbook.suspended'],
            invoke: {
                src: 'playbook',
                input: ({ context }) => ({
                    stateId: 'callDecide',
                    sourceItem: 'DEV-3',
                    playbookId: 'decide',
                    text: plannedCallText(context),
                }),
                onDone: [
                    {
                        guard: 'decideSucceeded',
                        target: 'callCodeAfterDecide',
                        actions: 'rememberDecideResult',
                    },
                    {
                        target: 'reportedChildFailure',
                        actions: {
                            type: 'completeWithInsufficientResult',
                            params: { playbookId: 'decide' },
                        },
                    },
                ],
                onError: [
                    {
                        guard: 'authoredDecideResult',
                        target: 'reportedChildFailure',
                        actions: {
                            type: 'completeWithAuthoredChildResult',
                            params: { playbookId: 'decide' },
                        },
                    },
                    { target: 'failed', actions: 'rememberActorError' },
                ],
            },
        },
        callCodeAfterDecide: {
            id: 'callCodeAfterDecide',
            description: STATE_DESCRIPTIONS.callCodeAfterDecide,
            meta: playbookMeta('callCodeAfterDecide'),
            tags: ['playbook.suspended'],
            invoke: {
                src: 'playbook',
                input: ({ context }) => ({
                    stateId: 'callCodeAfterDecide',
                    sourceItem: 'DEV-4',
                    playbookId: 'code',
                    text: codeAfterDecideCallText(context),
                }),
                onDone: [
                    {
                        guard: 'codeSucceededOnPullRequestPath',
                        target: 'openPullRequest',
                        actions: 'rememberCodeResult',
                    },
                    {
                        guard: 'codeSucceededOnPlainPath',
                        target: 'done',
                        actions: {
                            type: 'completeWithChildSuccess',
                            params: { childPlaybookId: 'code' },
                        },
                    },
                    {
                        target: 'reportedChildFailure',
                        actions: {
                            type: 'completeWithInsufficientResult',
                            params: { playbookId: 'code' },
                        },
                    },
                ],
                onError: [
                    {
                        guard: 'authoredCodeResult',
                        target: 'reportedChildFailure',
                        actions: {
                            type: 'completeWithAuthoredChildResult',
                            params: { playbookId: 'code' },
                        },
                    },
                    { target: 'failed', actions: 'rememberActorError' },
                ],
            },
        },
        openPullRequest: {
            id: 'openPullRequest',
            description: STATE_DESCRIPTIONS.openPullRequest,
            meta: playbookMeta('openPullRequest'),
            tags: ['playbook.suspended'],
            invoke: {
                src: 'playbook',
                input: ({ context }) => ({
                    stateId: 'openPullRequest',
                    sourceItem: 'DEV-6',
                    playbookId: 'pr',
                    text: pullRequestCallText(context),
                }),
                // `pr` success completes DEV with that result; a `pr` failure
                // terminal arrives through `onError` and is relayed below.
                onDone: {
                    target: 'done',
                    actions: {
                        type: 'completeWithChildSuccess',
                        params: { childPlaybookId: 'pr' },
                    },
                },
                onError: [
                    {
                        guard: 'authoredPrResult',
                        target: 'reportedChildFailure',
                        actions: {
                            type: 'completeWithAuthoredChildResult',
                            params: { playbookId: 'pr' },
                        },
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
                START_DEV: {
                    guard: 'startsDev',
                    target: 'planAnalysis',
                    actions: 'startDev',
                },
            },
        },
        discussionComplete: {
            id: 'discussionComplete',
            type: 'final',
            description: STATE_DESCRIPTIONS.discussionComplete,
            meta: terminalMeta('discussionComplete', 'success'),
        },
        done: {
            id: 'done',
            type: 'final',
            description: STATE_DESCRIPTIONS.done,
            meta: terminalMeta('done', 'success'),
        },
        reportedChildFailure: {
            id: 'reportedChildFailure',
            type: 'final',
            description: STATE_DESCRIPTIONS.reportedChildFailure,
            meta: terminalMeta('reportedChildFailure', 'failure'),
        },
    },
});
export default devMachine;
