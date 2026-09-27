<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-070: Save progress before work

## Status

Accepted after bounded model exploration, real process-loss tests and a smaller production implementation.
Replaces the saved-continuation mechanism of [DR-068](068-interrupted-continuation-settlement.md) and narrows [DR-069](069-host-owned-interrupted-work-settlement.md) to unsupported positions.
Amends [DR-066](066-captain-prepares-step-recovery.md), [DR-029](029-session-scoped-conversational-captain.md), [DR-031](031-shared-captain-session-front-ends.md), [DR-040](040-outcome-authority-effect-reconciliation.md), [DR-049](049-portable-session-contract.md), and [DR-051](051-host-selected-runtime-recovery.md).
Supersedes the whole-playbook retry fallback of [DR-034](034-durable-failure-retry-continuity.md).

## Context

An ordinary turn can record a player's commit without saving where execution reached.
Special points during recovery do not solve that gap and require separate rules for copying results, reports and retention.
Scripts and preparation also need start and result records.

## Decision

- Before work starts, durably record its identity and the full runtime-owned position needed to resume it; failure of this save starts no work.
- One execution journal records player, script and preparation starts and results; repository receipts remain the authoritative observations of file and commit changes.
  A player or script actor's completed output is saved before its next transition and consumed without repeating the operation.
  Preparation results record what was done; recovery restores the paused step and requires a Boss choice rather than dispatching preparation again.
- The runtime owns a restorable interrupted position, including its accepted input; the shell assembles the parent/child stack without interpreting opaque machine state.
  An unsupported frame explicitly selects the preserved-work exit rather than a guessed position.
- Reopening an uncertain run restores and reports only; Boss chooses a currently available continuation before any new work starts.
  A missing result means unfinished work, not permission to repeat it, and no automatic recovery loop runs during this reporting turn.
- No recorded work and an unchanged ledger restore the pre-turn position; the interrupted message was not processed and may be discarded. Reporting writes no new progress.
- Automatic recovery consumes only a failed or quiescent outcome produced by an operation in this turn; resuming or adopting stopped work does not authorize preparation.
  Refused input leaves old stops unchanged; an accepted action retains its known run result even in a failed receipt, while a thrown operation without a settled result authorizes no automatic work.
- The runtime reports acceptance immediately before sending the event; the shell uses that callback for delivery facts and child cancellation ownership.
- The store records which unfinished step owns the saved position; only that checkpoint receives its saved result and reconstructed attempt evidence on restore.
- Whole-playbook retry is deliberately removed: an absent invocation checkpoint, including an old failed snapshot or a failed nested call, cannot justify repeating earlier work.
- The journal also records completed root outcomes and answers selected from the existing task; reports read these facts and preparation results without copying presentation text.
- A worker may outlive its host; it remains unfinished until its completion or retirement is established, and repository observations cannot establish that an outside action is safe to repeat.
- Progress stores facts and positions only; retained generations and unresolved effects change at settlement.
  Root completion records the runtime's existing keep-or-clear decision, preserving saved work for authored unfinished final states.
  One shared discard predicate requires no abandonment, no steps and unchanged repository evidence.
- Save the prefix of repository changes already presented to Boss only at a non-aborted reply settlement.
  Cancellation and crashes leave it unchanged so the next reply repeats any mandatory carried-changes report.
- Remove saved `reply`, `runtime` and `settle` selections and their copied report format; keep checkpoint-based runtime recovery offers, bounded live preparation and explicit unsupported-position exit.
- Check a bounded recovery-policy model and require deliberate rule violations to fail; map each checked rule to executable evidence in [[recovery-28](../packages/recovery.md#recovery-28)].
  The model covers saved positions, results and Boss choices, not the full machines, tools or implementation; its mutants do not claim to reproduce an entire historical protocol.

## Consequences

Normal work and recovery share one progress protocol across CLI and SDK.
Recovery never replays a whole turn: it restores the saved step, or preserves work and returns to chat when the position is unavailable.
Saved continuation selections, copied reports, stopped-point tracking and whole-turn replay are removed.
The journal covers the unfinished attempt; after settlement the saved machine and repository ledger carry the continuing state.
The bounded model is not a formal proof of the implementation or external tools.
