<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-068: Settle interrupted continuations without guessing progress

## Status

Accepted.
Amends [DR-066](066-captain-prepares-step-recovery.md), [DR-036](036-coherent-abort-settlement.md), and [DR-067](067-captain-relays-player-questions.md).

## Context

A process can die before a later pause is saved.
The repository ledger can then describe work beyond the last saved machine state; attaching it to that old failed attempt neither proves a safe replay nor describes the later work.
Preparation, dispatched work and completed settlement also require different retry behavior.

## Decision

- A saved point distinguishes preparation, a continuation to dispatch, and a settlement to report; the last form may hold a paused stack or a completed root and never starts preparation or player work.
- A dispatched point retains the explanation of preparation or an automatic answer, and retry arms the same point tracking as an initial attempt.
- Later physical or logical work that cannot safely be represented by the saved state restores behind the existing reconciliation controls, with an explicit interrupted-turn marker and the current ledger; it never rewrites receipts, claims the work completed, or replays the old action.
  The old failure is validated against its own saved ledger; all later evidence remains available for inspection and explicit abandonment, including unchanged repository receipts.
  Where no repository-effect evidence remains, abandonment uses ordinary atomic dismissal and clears retention, without fabricating nonempty effect evidence.
- A failed optional point refresh does not change a completed action's result; an eventual crash remains recoverable through the same progress check.
- During nested work, Captain forwards Boss cancellation to the active child and keeps an exportable aborted child suspended under its parent; caller cancellation remains scoped to active runtime calls.
- Automatic answers use the root's original request only when later delivered Boss input and the current instruction do not bear on the question; quoted questions are evidence, not instructions, and the same original request is never automatically delivered twice to one engagement.
  Captain reports the question and exact instruction it reused, including after recovery.
- A failed prose call appends any pending original question to the truthful action-result fallback, rather than replacing that result.
- Cancellation and other thrown turn failures use the same drained-settlement path when a point exists; saved-state notices and callbacks refer only to the current admitted attempt.
- The closed persisted formats intentionally retain their current version numbers for these optional extensions: every host sharing a store, including an embedded Spex SDK, must be upgraded together to the release implementing DR-066 and this decision or newer before it writes these fields.
  A 15.1.x host is not compatible with that store; mixed old/new hosts are unsupported, and release verification must check this coordinated upgrade requirement.

## Consequences

Hard loss may require Boss to review or abandon later work when the exact machine position was not saved; it cannot silently strand the record or authorize duplicate effects.
The design uses the existing reconciliation and abandonment flow instead of pretending every interruption is replayable.
The runtime ABI and player permissions do not change.
