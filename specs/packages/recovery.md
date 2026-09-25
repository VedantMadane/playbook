<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# recovery: Prepare and resume interrupted work

## Intent

Let Boss authorize Captain to prepare an interrupted leaf's prerequisites and continue at its runtime-owned step, preserving completed work ([DR-066](../decisions/066-captain-prepares-step-recovery.md)).

## External Behavior

### recovery-1

Before starting a player or direct-Captain invocation, the shared runtime shall capture a detached invocation checkpoint containing its source state, complete composed prompt, persisted machine, and current effect-ledger boundary prefix.
While parked in `failed`, the runtime shall export that checkpoint as optional `recoveryCheckpoint` in its durable snapshot and restore it without executing the invocation [[playbook-runtime-45](playbook-runtime.md#playbook-runtime-45)].
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

## Verification

### recovery-4

When integration tests fail a later invocation after an earlier one succeeds, they shall verify that a live and a JSON-round-tripped restored runtime advertise and retry only the failed invocation with its original context [[recovery-1](#recovery-1)] [[recovery-3](#recovery-3)], that restoring makes no calls, and that malformed or incompatible checkpoints fail before execution [[recovery-2](#recovery-2)].
Tests shall verify that a completed earlier commit does not block an unchanged failed invocation's retry, while a changed, incomplete, foreign, or unresolved boundary after its checkpoint does [[recovery-3](#recovery-3)].
