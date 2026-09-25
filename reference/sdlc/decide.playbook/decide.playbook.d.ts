import { type XStatePlaybookRuntimeFactory, type XStatePlaybookRuntimeConstruction, type XStatePromptIdentity } from '@sublang/playbook/xstate-runtime';
import { type DecideInput, type PlayerInput } from './decide.fsm.js';
import type { PlaybookHostConstructionCapabilities } from '../code.playbook/playbook-captain.js';
import type { CaptainCallOptions, CaptainResult, JsonValue, NormalizedError, PlayerCallOptions, PlaybookCallRequest, PlaybookCallResult, PlaybookCallStart, PlaybookControlReceipt, PlaybookControlView, PlaybookPendingCall, PlaybookPorts, PlaybookRunResult, PlaybookRuntime, PlaybookRuntimeFactory, PlaybookRuntimeSnapshot, PlaybookSession, PlaybookState, PlaybookStateValue, PlaybookTraceEvent, PlaybookTraceType, PlayerResult, PlayerSessionStore } from '@sublang/playbook/runtime';
export type { CaptainCallOptions, CaptainResult, JsonValue, NormalizedError, PlayerCallOptions, PlaybookCallRequest, PlaybookCallResult, PlaybookCallStart, PlaybookControlReceipt, PlaybookControlView, PlaybookPendingCall, PlaybookPorts, PlaybookRunResult, PlaybookRuntime, PlaybookRuntimeFactory, PlaybookRuntimeSnapshot, PlaybookSession, PlaybookState, PlaybookStateValue, PlaybookTraceEvent, PlaybookTraceType, PlayerResult, PlayerSessionStore, };
export type DecidePlaybookOptions = DecideInput;
export type DecidePlaybookHostCapabilities = PlaybookHostConstructionCapabilities & XStatePlaybookRuntimeConstruction<DecidePlaybookOptions, object>['hostCapabilities'];
/** Keep every line of a relayed runtime value inside its authored quote. */
declare function composePlayerPrompt(input: PlayerInput, promptIdentity: XStatePromptIdentity, resuming?: boolean): string;
export declare const _internal: {
    composePlayerPrompt: typeof composePlayerPrompt;
    VERBATIM_PAYLOAD_FIELDS: ReadonlySet<string>;
    UNFINISHED_FINAL_STATE_IDS: ReadonlySet<string>;
};
declare const createPlaybookRuntime: XStatePlaybookRuntimeFactory<XStatePlaybookRuntimeConstruction<DecidePlaybookOptions, DecidePlaybookHostCapabilities>, 3>;
export default createPlaybookRuntime;
