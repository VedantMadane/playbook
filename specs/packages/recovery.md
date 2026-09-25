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

While a failed runtime holds a valid invocation checkpoint and has no unresolved-effect fence, when every ledger boundary after the checkpoint prefix is owned by that runtime and carries a complete `unchanged` receipt, the runtime shall advertise a step retry labeled from the interrupted state's description, retaining `retry:<ENTRY_EVENT>` when that entry targets the same state and using `retry:step` otherwise, in preference to its entry-event retry [[playbook-runtime-52](playbook-runtime.md#playbook-runtime-52)].
Applying that action shall rebuild only the leaf actor from its checkpoint, preserving the session identity, counters, player continuity, original invocation input, and completed predecessor context, then drive it to settlement through the ordinary receipt contract [[playbook-runtime-52](playbook-runtime.md#playbook-runtime-52)].
A missing checkpoint shall preserve the existing retry behavior; an unsafe checkpoint shall authorize no step replay.

### recovery-5

While a leaf has an invocation checkpoint and either a pending Boss question or a ready retry, saved-result assessment, or checkpoint-reconciliation action, its control view shall offer `recovery` containing the captured `prompt`, optional source-state `description`, and a runtime-owned `continuation` of exactly `{kind:'reply'}` or `{kind:'runtime',actionId}`.
The shell shall advertise only the availability and description to ordinary Captain decisions, keeping the full prompt for preparation [[playbook-captain-9](playbook-captain.md#playbook-captain-9)].

### recovery-6

When Boss explicitly requests prerequisite repair before continuation and the leaf advertises recovery, the default Captain shall select the payload-free `recover` action through its ordinary controller loop [[captain-playbook-9](captain-playbook.md#captain-playbook-9)].
An ordinary player answer shall retain exact-text delivery, and a retry needing no preparation shall retain runtime-action selection [[captain-playbook-4](captain-playbook.md#captain-playbook-4)].

### recovery-7

When executing `recover`, the shell shall hold the worktree's exclusive claim and make exactly one fresh, hidden Captain preparation call on its existing serialized queue, using configured permissions and tools, the exact current Boss text, the offered step prompt, pending question, and structured failure:

- inspect and repair only prerequisites necessary for that continuation;
- preserve a waiting player's tracked and non-ignored repository checkpoint; report blocked when preparation requires changing it;
- preserve Boss's work and constraints; do not discard changes or rewrite history without explicit Boss authorization;
- do not perform remaining specialist steps, invent outcomes, change session records or effect evidence, or choose another machine state;
- return exactly `{status:'ready'|'blocked',summary:<nonempty text>}` describing the preparation or remaining blocker.

The call shall use no durable Captain or player conversation token, publish no returned token, and make no corrective or transport retry.
A failed, aborted, malformed, or blocked result shall leave the leaf parked and report the preparation outcome as a reported claim rather than proof of workflow completion.

### recovery-8

After a successful preparation, the shell shall release its repository claim, re-read the same leaf's recovery offer, and continue exactly once only if its continuation still matches: deliver the original Boss text for `reply`, or apply the currently advertised runtime action through its ordinary receipt path [[playbook-captain-8](playbook-captain.md#playbook-captain-8)].
Preparation shall grant no bypass of unresolved-effect reconciliation [[playbook-runtime-79](playbook-runtime.md#playbook-runtime-79)].
The preparation and continuation shall settle as one `recover` turn through the existing durable turn and uncertainty boundary [[playbook-cli-23](playbook-cli.md#playbook-cli-23)], with no automatic repeat after an ambiguous call.

### recovery-10

While the failed invocation checkpoint identifies exactly one owned standalone boundary with a complete single-commit receipt, saved nonempty player text, no spent correction budget, and either no semantic candidate or an already resolved one, the runtime shall advertise `retry:adjudication` as `Retry assessment of the saved result`, provided no other unresolved boundary or retained or deferred fence exists.
The action shall adjudicate the saved text once through the ordinary tool-free judge only when its semantic candidate is missing, require that candidate to reconcile as resolved against the existing receipt, and durably append that candidate without replacing physical evidence.
It shall then deliver the acknowledged result to the checkpoint's invocation through ordinary reconstruction, without calling the player or creating another physical boundary; a failed judgment shall leave the invocation parked, and restoration after acknowledgement shall consume the saved resolved candidate without another judge call.

## Verification

### recovery-4

When integration tests fail a later invocation after an earlier one succeeds, they shall verify that a live and a JSON-round-tripped restored runtime advertise and retry only the failed invocation with its original context [[recovery-1](#recovery-1)] [[recovery-3](#recovery-3)], that restoring makes no calls, and that malformed or incompatible checkpoints fail before execution [[recovery-2](#recovery-2)].
Tests shall verify that a completed earlier commit does not block an unchanged failed invocation's retry, while a changed, incomplete, foreign, or unresolved boundary after its checkpoint does [[recovery-3](#recovery-3)].

### recovery-9

When integration tests recover an interrupted real leaf through the Captain session host, they shall verify that only an advertised offer exposes preparation context [[recovery-5](#recovery-5)], explicit repair intent selects recovery while ordinary answers retain exact delivery [[recovery-6](#recovery-6)], and one isolated preparation call repairs an actual prerequisite under the worktree claim without changing routing-call permissions [[recovery-7](#recovery-7)].
The tests shall verify that ready preparation continues the same restored leaf once, while blocked, malformed, aborted, stale, and unresolved cases remain parked with a truthful settlement [[recovery-8](#recovery-8)].

### recovery-11

When integration tests interrupt adjudication after a real commit, they shall verify that live and restored runtimes recover the saved result with one judge call, preserve the commit and receipt, run no duplicate player call, reject unresolved or malformed candidates, and continue from an acknowledged candidate after interrupted delivery [[recovery-10](#recovery-10)].
