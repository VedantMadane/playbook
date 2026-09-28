import type { CodeContext, PlaybookInput, PlayerInput, codeMachine } from './code.fsm.js';
export type TransitionGuard = (args: {
    context: CodeContext;
    event: unknown;
}) => boolean;
export interface InvokingTransition {
    readonly index: number;
    readonly target: string;
    readonly guard?: TransitionGuard;
    readonly actions: unknown;
}
export interface PlayerStateInfo {
    readonly stateId: string;
    readonly sourceItem: string;
    readonly getInput: (context: CodeContext) => PlayerInput;
    readonly transitions: readonly InvokingTransition[];
}
export interface NestedPlaybookStateInfo {
    readonly stateId: string;
    readonly sourceItem: string;
    readonly getInput: (context: CodeContext) => PlaybookInput;
    readonly transitions: readonly InvokingTransition[];
}
export interface AwaitBossReplyInfo {
    readonly stateId: 'awaitBossReply';
    readonly bossReplyTransitions: readonly InvokingTransition[];
}
export declare function enumeratePlayerStates(machine: typeof codeMachine): readonly PlayerStateInfo[];
export declare const enumerateCaptainStates: typeof enumeratePlayerStates;
export declare function enumerateNestedPlaybookStates(machine: typeof codeMachine): readonly NestedPlaybookStateInfo[];
export declare function enumerateAwaitBossReply(machine: typeof codeMachine): AwaitBossReplyInfo;
export declare function enumerateRootEvents(machine: typeof codeMachine): {
    readonly startCode: {
        readonly target: string;
    };
};
