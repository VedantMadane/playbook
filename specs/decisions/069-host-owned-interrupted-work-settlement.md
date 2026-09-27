<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-069: Settle lost progress in the shared host

## Status

Amended by [DR-070](070-durable-step-progress.md): normal step progress replaces saved continuation selections and whole-playbook retry; crash recovery restores and reports before further Boss choice.

Superseded by DR-070 except for the unsupported-position exit, cancellation cleanup, and child-retention rules below.
Amends [DR-068](068-interrupted-continuation-settlement.md), [DR-066](066-captain-prepares-step-recovery.md), and [DR-040](040-outcome-authority-effect-reconciliation.md).

## Context

A process can stop after later work without saving its machine position.
Putting a new marker into every old runtime cannot represent that position, breaks bespoke and older engines, and assigns unrelated work to the wrong workflow.
A saved result also needs its pending retention changes and reports, not only its stack.

## Decision

The saved-selection and whole-turn replay bullets below describe the former protocol; DR-070 replaces them.

- The shared host owns the lost-progress decision defined by [[recovery-27](../packages/recovery.md#recovery-27)]; no runtime receives an invented interruption marker or source identity.
- An explicit uncertain retry with unrepresentable later work settles a failed attempt in chat, preserving all files, receipts, and ordered unresolved-effect evidence; it runs no player and makes no claim that a workflow completed.
  This applies with or without a saved point and whether the prior shell was idle or engaged.
  It differs from discard, which restores the prior boundary and remains forbidden after ledger progress.
- Only retained generations containing a runtime that owns the changed evidence are cleared; other generations remain unchanged.
  Session-level evidence is not attributed to a saved workflow merely because that workflow was active earlier.
- An unchanged ledger keeps ordinary whole-turn replay or the saved continuation.
  A safe unchanged suffix keeps the established whole-turn replay rule when no dispatched point or old failure would be misrepresented; saved assessment and restoration retain their narrowly defined evidence consumption.
- A reporting-only point preserves pending retention changes, unresolved effects, the complete summary, and mandatory presentation text.
  Cancellation during reporting preserves the computed action status.
- After Boss cancellation and complete call draining, an unaccepted player result loses its provider continuation hint; the paused runtime stays, with no late result accepted and no effects replayed.
- A child is retained on cancellation only after its initial text was delivered; summary ownership begins at an action executed in the current turn, not at an idle ancestor.
- A retry follows its saved selection without adding an automatic recovery loop that the original selection did not have.

## Consequences

SDK and CLI recovery use the same host decision and need no per-playbook recovery hook.
A lost machine position cannot resume automatically, but it no longer traps the session or repeats committed work.
Existing runtime adoption fences retain their original purpose and closed format.
The unpublished interrupted-turn runtime marker from DR-068 is removed; the runtime ABI is unchanged.
