<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-070: Save progress before work

## Status

Accepted after bounded model exploration, real process-loss tests and a smaller production implementation.
Replaces the saved-continuation mechanism of [DR-068](068-interrupted-continuation-settlement.md) and narrows [DR-069](069-host-owned-interrupted-work-settlement.md) to unsupported positions.
Amends [DR-066](066-captain-prepares-step-recovery.md).

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
- A worker may outlive its host; it remains unfinished until its completion or retirement is established, and repository observations cannot establish that an outside action is safe to repeat.
- Persist stopped positions and retention changes together; compute mandatory reports from recorded work, and omit nonessential counts after interruption instead of storing presentation fields.
- Remove saved `reply`, `runtime` and `settle` selections and their copied report format; keep the ordinary runtime recovery offers, bounded live preparation and explicit unsupported-position exit.
- Check a bounded whole-protocol model before implementation, then connect its transitions to real process-loss tests; the model's bounds and worker assumptions are explicit, and it is not a proof of unmodeled tools or implementation.

## Consequences

Normal work and recovery share one progress protocol across CLI and SDK.
Crashes no longer require whole-turn replay when a supported step position exists.
Saved continuation selections, copied reports, stopped-point tracking and whole-turn replay are removed.
The journal covers the unfinished attempt; after settlement the saved machine and repository ledger carry the continuing state.
The bounded model is not a formal proof of the implementation or external tools.
