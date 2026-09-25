<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-066: Captain prepares recovery at the interrupted step

## Status

Accepted.
Amends [DR-029](029-session-scoped-conversational-captain.md)'s tool-free Captain in one scope: an explicitly selected recovery action may run a separate preparation call.
Refines [DR-034](034-durable-failure-retry-continuity.md)'s entry retry with a runtime-owned checkpoint of the actual interrupted invocation.

## Context

A restored machine is insufficient when its next invocation still encounters the repository or environment condition that stopped it.
Captain currently cannot inspect or repair that condition, and retrying the entry event can discard progress or be fenced by an earlier successful commit in the same turn.
The procedure author should not need to describe exception handling, and neither Captain nor Boss should need to edit saved machine state.

## Decision

- Ordinary Captain decisions, replies, and adjudication remain tool-free.
- An explicit Boss recovery request may select one `recover` action: prepare the current leaf, then use its validated continuation.
- Preparation uses a fresh Captain call with the configured permissions, the exact Boss instruction, and runtime-owned interrupted-step context.
  It may inspect and repair prerequisites, but may not perform the specialist's remaining task, invent an outcome, select an arbitrary state, edit session storage, or rewrite/discard work without Boss authorization.
- The shared runtime captures the current invocation before calling its actor and retains that checkpoint with a parked failure.
  Retry reenters that invocation with its original context and input, preserving completed predecessor steps and parent/child ownership.
  Replay permission is established from that invocation's effect boundary, not from all work performed during the Boss turn.
- Preparation does not prove completion or override repository-effect evidence.
  After preparation, the host re-reads the runtime's controls; a pending question receives the original Boss input, and a failed invocation uses the runtime's recovery action.
  A failure or unsatisfied continuation stays parked with its explanation.
- Recovery is host/runtime behavior, independent of individual playbook source and compiler output.
  Existing checkpoints without the new optional invocation checkpoint keep their existing advertised controls.

## Consequences

Captain can repair a missing prerequisite and resume the interrupted leaf without restarting its ancestors or completed phases.
The source language, artifact ABI, and ordinary player permissions are unchanged.
Historical receipts and unresolved-effect fences remain evidence rather than editable instructions.
Unsupported or irreparable historical states are reported honestly rather than advanced by a guessed event.
