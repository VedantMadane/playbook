<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# recovery: Prepare and resume interrupted work

## Intent

Let Boss authorize Captain to prepare an interrupted leaf's prerequisites and continue at its runtime-owned step, preserving completed work ([DR-066](../decisions/066-captain-prepares-step-recovery.md)).

## External Behavior

### recovery-1

Before starting a player or direct-Captain invocation, the shared runtime shall capture a detached invocation checkpoint containing its source state, complete composed prompt, persisted machine, and current effect-ledger boundary prefix.
While parked in `failed` or waiting for a Boss answer, the runtime shall export that checkpoint as optional `recoveryCheckpoint` in its durable snapshot and restore it without executing the invocation [[playbook-runtime-45](playbook-runtime.md#playbook-runtime-45)].
A machine whose context cannot be captured as JSON shall remain executable without a checkpoint.
The checkpoint shall be replaced by the next invocation and omitted from snapshots in other states.

### recovery-2

When validating a recovery checkpoint, the runtime shall require exactly `stateId`, `prompt`, `machine`, and `boundaryPrefix`, with nonempty strings, a JSON machine snapshot active at that source state, and a nonnegative ledger prefix not exceeding the current boundary count.
Runtime restoration shall additionally require that the checkpoint names a current player or direct-Captain invocation and that its persisted invocation belongs to the declared actor at that state.
An invalid checkpoint shall reject restoration before any actor starts.

### recovery-3

While a failed runtime holds a valid invocation checkpoint and has no unresolved-effect fence, when every ledger boundary after the checkpoint prefix is owned by that runtime and carries a complete `unchanged` receipt or a verified read-only restoration [[recovery-12](#recovery-12)], the runtime shall advertise a step retry labeled from the interrupted state's description, retaining `retry:<ENTRY_EVENT>` when that entry targets the same state and using `retry:step` otherwise, in preference to its entry-event retry [[playbook-runtime-52](playbook-runtime.md#playbook-runtime-52)].
Applying that action shall rebuild only the leaf actor from its checkpoint, preserving the session identity, counters, player continuity, original invocation input, and completed predecessor context, then drive it to settlement through the ordinary receipt contract [[playbook-runtime-52](playbook-runtime.md#playbook-runtime-52)].
A missing checkpoint shall preserve the existing retry behavior; an unsafe checkpoint shall authorize no step replay.

### recovery-5

While a leaf has an invocation checkpoint and either a pending Boss question or a ready step retry, verified-restoration retry, or saved-result assessment, its control view shall offer `recovery` containing the captured `prompt`, optional source-state `description`, optional `preparation` text stating the conditions the runtime will verify, optional JSON `evidence` containing saved player text, declared result choices and repository receipts, and a runtime-owned `continuation` of exactly `{kind:'reply'}` or `{kind:'runtime',actionId}`.
The shell shall advertise only the availability and description to ordinary Captain decisions, keeping the full prompt for preparation [[playbook-captain-9](playbook-captain.md#playbook-captain-9)].

### recovery-6

When the default Captain selects preparation under [[captain-playbook-4](captain-playbook.md#captain-playbook-4)], its selection shall be the payload-free `{action:'recover'}` through the ordinary controller port [[captain-playbook-9](captain-playbook.md#captain-playbook-9)].

### recovery-7

Where the host supplies cancellation of admitted calls, when executing `recover`, the shell shall hold the worktree's exclusive claim and make exactly one fresh, hidden Captain preparation call on its existing serialized queue, using configured permissions and tools, the exact current Boss text, the offered step prompt, pending question, and structured failure:

- inspect and repair only prerequisites necessary for that continuation;
- decide first whether every required Boss choice is already supplied; if any is missing, report blocked before tools, even when no preparation or repair is otherwise needed;
- preserve a waiting player's tracked and non-ignored repository checkpoint; report blocked when preparation requires changing it;
- preserve a recoverable copy before removing or replacing unexpected files;
- preserve Boss's work and constraints; do not discard changes or rewrite history without explicit Boss authorization;
- establish that replay cannot duplicate an external effect before declaring ready; repository receipts alone do not establish this;
- do not perform remaining specialist steps, invent outcomes, change session records or effect evidence, or choose another machine state;
- return exactly `{status:'ready'|'blocked',summary:<nonempty text>}` describing the preparation or remaining blocker.

A host without cancellation shall not offer or start preparation.
The call shall use no durable Captain or player conversation token, publish no returned token, make no corrective or transport retry, and receive a cancellation signal with a 150-second preparation limit starting after the working stack is saved; expiry shall cancel and drain the host turn and its admitted calls, while removing the deadline before the subsequent specialist step.
After a drained preparation stops before continuation, the durable host shall settle an exportable parked stack with unchanged effect evidence, preserving any preparation edits and allowing a new Boss instruction [[playbook-cli-23](playbook-cli.md#playbook-cli-23)].
A process loss before that settlement shall retain the recovery point [[recovery-18](#recovery-18)].
A failed, aborted, malformed, or blocked result shall leave the leaf parked and attribute its outcome to recovery, preserving earlier action outcomes and accumulated counts [[playbook-captain-20](playbook-captain.md#playbook-captain-20)] [[playbook-captain-35](playbook-captain.md#playbook-captain-35)].

### recovery-8

After a successful preparation, the shell shall release its repository claim, re-read the same leaf's recovery offer, and continue exactly once only if its continuation still matches: deliver the original Boss text for `reply`, or apply the currently advertised runtime action through its ordinary receipt path [[playbook-captain-8](playbook-captain.md#playbook-captain-8)].
Preparation shall grant no bypass of unresolved-effect reconciliation [[playbook-runtime-79](playbook-runtime.md#playbook-runtime-79)].
The preparation and continuation shall settle as one `recover` turn through the existing durable turn and uncertainty boundary [[playbook-cli-23](playbook-cli.md#playbook-cli-23)], with an interrupted preparation resumed only from its saved working stack [[recovery-18](#recovery-18)].

### recovery-10

While the failed invocation checkpoint identifies exactly one owned standalone boundary with a complete single-commit receipt, saved nonempty player text, no spent correction budget, and either no semantic candidate or an already resolved one, the runtime shall advertise `retry:adjudication` as `Retry assessment of the saved result`, provided no other unresolved boundary or retained or deferred fence exists.
The action shall adjudicate the saved text once through the ordinary tool-free judge only when its semantic candidate is missing, require that candidate to reconcile as resolved against the existing receipt, and durably append every valid candidate without replacing physical evidence, including a blocked explanation.
A blocked candidate shall replace the old failure explanation, remain unresolved and remove the saved-assessment retry; it shall authorize no invented transition [[playbook-runtime-10](playbook-runtime.md#playbook-runtime-10)].
It shall then deliver the acknowledged result to the checkpoint's invocation through ordinary reconstruction, without calling the player or creating another physical boundary; a failed judgment shall leave the invocation parked, and restoration after acknowledgement shall consume the saved resolved candidate without another judge call.

### recovery-12

While a failed invocation has exactly one owned standalone read-only boundary after its checkpoint, with a complete receipt and unchanged HEAD, the runtime shall offer preparation to restore the original repository and retry that invocation, provided repository observation and exclusive acquisition are available and no other unresolved, deferred, or retained work exists.
The action shall be `retry:restored-step`, labeled `Restore the repository and retry the read-only step`.
When that action runs, the runtime shall hold the repository claim, verify that the current observation equals the boundary's original baseline exactly, and append immutable optional `restored` evidence equal to that baseline before replay and recheck that baseline under the next player call’s claim; a mismatch shall start no player and preserve the paused step.
The recheck shall be confined to that attempt; after a successful check, the runtime shall capture a fresh invocation checkpoint before calling the player [[recovery-1](#recovery-1)].
The boundary's original receipt and semantic evidence shall remain unchanged; restoration shall exclude that boundary from unresolved-work blocking and authorize replay only, never acceptance of its old result.
The effect-ledger validators shall reject restoration on a writable, cohort, deferred, incomplete, or commit-moving boundary, and reject replacement or removal of existing restoration evidence [[playbook-runtime-69](playbook-runtime.md#playbook-runtime-69)].

### recovery-14

After a start, resume, switch, answer, or runtime action leaves a recoverable leaf, the host shall attempt the same preparation-and-continuation operation without another Boss turn, at most twice per turn and once for the same leaf, recovery offer, and failure.
A blocked preparation, cancellation, unavailable offer, or unsuccessful continuation shall end automatic recovery; a conversation-only request or explicit stop shall trigger none.
For a pending question, the host shall first make one fresh tool-free check on the same serialized Captain queue, without a repository claim or preparation point.
That check shall select only an exact existing handed-off task or current non-host-selected Boss instruction; an unanswered, malformed, or failed check shall preserve the original question and outcome without claiming blocked preparation.
A selected existing instruction may be delivered once under the same continuation checks [[recovery-8](#recovery-8)]; a missing product decision, new authority, or contradictory or missing workflow transition shall be explained to Boss without inventing an answer, transition, or completion.

### recovery-16

When an unexpected child-runtime exception after delivery of its initial request leaves an exportable parked leaf, the host shall preserve that leaf and its suspended parents for a later valid reply or recovery instead of treating the exception as an authored completed child result; initialization, visibility and pre-delivery failures shall retain ordinary child disposal [[playbook-runtime-45](playbook-runtime.md#playbook-runtime-45)].

### recovery-18

Before Captain uses preparation tools, and before any saved-assessment or verified-restoration action changes earlier evidence, a durable host shall save the parked working stack, current effect ledger and exact instruction as the uncertain attempt's recovery point [[playbook-cli-23](playbook-cli.md#playbook-cli-23)]:

- the exact point has `snapshot`, `instruction`, and optional `continuation` of `{kind:'reply'}` or `{kind:'runtime',actionId}`; it retains the last settled controller, journal and sequences, while replay retains the attempted input;
- saving fails before tools or continuation, and excludes provider hints [[session-storage-7](session-storage.md#session-storage-7)];
- preparation saves a point without `continuation`; immediately before dispatch it replaces that point with the current parked stack and selected continuation;
- retry restores the saved stack and selects either preparation or its recorded continuation directly, without repeating the original routing action or completed preparation;
- replay checks effect changes relative to that point: every new boundary must be complete and unchanged, and logical operations must be identical; only the two assessment/restoration actions may additionally append monotonic semantic or restoration evidence to existing boundaries [[playbook-runtime-69](playbook-runtime.md#playbook-runtime-69)];
- a vanished continuation shall settle a rejected turn through the ordinary controller path, never fail host setup [[playbook-captain-7](playbook-captain.md#playbook-captain-7)];
- discard refuses a saved point because preparation may have changed prerequisites; without a point, the existing whole-turn checks remain in force, and retry never chooses discard automatically.

The shared application host's asynchronous `recover` operation shall select that retry for an uncertain attempt with no new input, or require a nonempty Boss instruction for a parked step.
It shall arm the selection only after reconciliation and durable turn admission, and never invent Boss input [[playbook-captain-7](playbook-captain.md#playbook-captain-7)].

## Verification

### recovery-19

When an integration test interrupts Captain during preparation inside a suspended parent, it shall reopen the real store, resume preparation and verify that the parent is not restarted, uncertain discard is refused, provider hints are absent and failed recovery writes prevent tool use [[recovery-18](#recovery-18)].

### recovery-4

When integration tests fail a later invocation after an earlier one succeeds, they shall verify that a live and a JSON-round-tripped restored runtime advertise and retry only the failed invocation with its original context [[recovery-1](#recovery-1)] [[recovery-3](#recovery-3)], that restoring makes no calls, and that malformed or incompatible checkpoints fail before execution [[recovery-2](#recovery-2)].
Tests shall verify that a completed earlier commit does not block an unchanged failed invocation's retry, while a changed, incomplete, foreign, or unresolved boundary after its checkpoint does [[recovery-3](#recovery-3)].

### recovery-9

When integration tests recover an interrupted real leaf through the Captain session host, they shall verify that only an advertised offer exposes preparation context [[recovery-5](#recovery-5)], explicit repair intent selects recovery while ordinary answers retain exact delivery [[recovery-6](#recovery-6)], and one isolated preparation call repairs an actual prerequisite under the worktree claim without changing routing-call permissions [[recovery-7](#recovery-7)].
The tests shall verify that ready preparation continues the same restored leaf once, while blocked, malformed, aborted, stale, and unresolved cases remain parked with a truthful settlement [[recovery-8](#recovery-8)].

### recovery-11

When integration tests interrupt adjudication after a real commit, they shall verify that live and restored runtimes recover the saved result with one judge call, preserve the commit and receipt, run no duplicate player call, reject unresolved or malformed candidates, and continue from an acknowledged candidate after interrupted delivery [[recovery-10](#recovery-10)].

### recovery-13

When a real read-only invocation creates an unexpected file after an earlier committed step, the integration suite shall verify that live and restored sessions reject retry before exact restoration, then append restoration evidence and rerun only the interrupted invocation, preserve the earlier commit and original receipt, and never accept the old failed result [[recovery-12](#recovery-12)].

### recovery-15

When the real Captain host encounters an interrupted step or pending question, the integration suite shall verify bounded automatic repair, exact task-input reuse, no recovery on chat or cancellation, and a specific blocked explanation for missing Boss input or an unavailable transition [[recovery-14](#recovery-14)]; preparation timeout shall leave the step paused without timing out later specialist work [[recovery-7](#recovery-7)].

### recovery-17

When a nested runtime throws while preserving an exportable parked state, the integration suite shall verify that its caller remains suspended and the same leaf can continue after repair [[recovery-16](#recovery-16)].
