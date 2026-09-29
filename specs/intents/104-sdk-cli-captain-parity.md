<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# IR-104: SDK and CLI Captain parity

## Status

Completed on `codex/captain-recovery`; not merged or released.

## Intent

Verify recent recovery and conversation changes through both public entry points under [DR-031](../decisions/031-shared-captain-session-front-ends.md).

## Deliverables

- [x] Shared question, clarification, answer, and recovery verification.
- [x] CLI recovery specifications consistent with saved-step recovery.
- [x] Real-agent non-interactive conversation verification.

## Tasks

1. Audit the shared engine, correct stale CLI requirements, and verify SDK/CLI continuation and recovery.

## Verification

Run the real default Captain and runtime through SDK and CLI turns, preserving questions across host changes and checking plain and JSON output.
Interrupt preparation and cross the SDK/CLI boundary with retry; ensure discard cannot erase that preparation.
Run a real-provider CLI conversation and the affected suites, build, spec lint and documentation links.
Keep the feature branches unmerged and unreleased.

Both entry points already construct the same Captain host, use the same question and preparation logic, and restore saved recovery through the same code; no runtime change was needed.
Corrected CLI requirements that still described whole-turn retry and discard without the saved-preparation exception.
All 101 tests in the headless, cross-host conversation and recovery suites passed.
Claude Opus 5.5 and GPT-5.6 Sol completed the non-interactive CLI question, clarification, reopen, player follow-up and final answer; plain and JSON output matched the saved Captain reply.
Build and documentation links passed; spec lint reported no errors and 272 advisory warnings.
Tests used the declared Cligent 0.26 dependency; the original local dependency link was restored afterward.
Spex and SLC needed no further changes.
