<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# IR-105: Recovery review fixes

## Status

Complete; one new review-fix commit, with existing commits unchanged.

## Intent

Resolve the accepted findings in the review of recovery, question relay and shared session hosting while preserving bounded preparation and safe continuation.

## Deliverables

- [x] Recovery checks and saved points belong to one interrupted operation.
- [x] Failed preparation preserves accurate action history and usable pauses.
- [x] Questions and blocked judgments remain visible without invented answers.
- [x] Specifications and focused evidence match the implemented behavior.
- [x] Every review item has a recorded disposition and supporting evidence.

## Tasks

1. Correct the shared recovery boundary, related contracts and regression coverage, then record each review disposition in one review-fix commit.

## Verification

Run only tests and builds whose inputs changed, recording the exact runs and results.
Cover repeated restoration, interruption before and after continuation, automatic retry identities, question and error presentation, SDK rejection, and affected compiler checks.
Credit Coder GPT-6 Astra and Reviewer Claude Opus 5.5.
Keep all branches unmerged and unreleased.

Review dispositions for Playbook `894f42b` and SLC `ade0cfb`:

| Finding | Disposition | Evidence or reason |
| --- | --- | --- |
| 1 | Accept | Repeated read-only restoration and attempt cleanup in `step-recovery.integration.test.ts`. |
| 2 | Accept | Failed host retry followed by successful automatic repair uses distinct keys in `captain-recovery.integration.test.ts`. |
| 3 | Accept | Saved preparation/continuation phases and shared replay checks; committed continuations refuse duplicate work. |
| 4 | Accept in part | Cancelled preparation settles a usable pause; reject discard because interrupted preparation can already have edited prerequisites. |
| 5 | Accept in part | Isolate ordinary questions from tools and locks; retain automatic exact-input reuse when Boss already answered. |
| 6 | Accept in part | Preserve action/outcome pairing and counts; keep strict JSON rather than accepting malformed authorization to continue. |
| 7 | Accept | Direct assessment/restoration actions save the working point before changing earlier evidence. |
| 8 | Accept | Blocked assessment preserves its cause and candidate and offers no repeated assessment. |
| 9 | Accept | SDK parked recovery, asynchronous rejection, actual Boss input and rejected-admission isolation. |
| 10 | Accept | Captain and shell contracts synchronized. |
| 11 | Accept | Runtime, compiler link, CLI, store and public API contracts synchronized. |
| 12 | Accept | Amended decision records and durable cross-project dependency record. |
| 13 | Accept | Configuration, CLI and embedding documentation corrected. |
| 14 | Accept | Restore fallback matrix and explicit failure causes. The real CODE/REVIEW matrix now covers both a transport failure that stays paused and Boss explicitly dismissing REVIEW, which retains and later adopts the active generation preceding CODE's unfinished terminal. |
| 15 | Accept in part | Add missing assertions and narrow claims; reject requiring malformed data to reach a particular later validator when earlier validation already refuses it before execution. |
| 16 | Accept | Failed Captain prose preserves the original complete question in `captain.playbook.integration.test.ts`. |
| 17 | Accept | Child exception retention requires initial input to have started and excludes visibility failures. |
| 18 | Accept | Foreign runtime evidence is excluded in `xstate-playbook-runtime.test.ts`. |
| 19 | Reject | A missing declared result is a playbook defect for Boss, not authority to invent a result or restart DECIDE proposals. Blocked-commit and missing-transition cases preserve evidence and perform no extra player work. |
| 20 | Accept | Restoration identity/capabilities, digest citation, brief prose exceptions and peer citations specified. |
| 21 | Accept | Decision table and summaries corrected. |
| 22 | Accept in SLC | Both checkers report the matching action set; 330 tests pass in SLC commit `ddeb699`. |
| 23 | Reject | Additional live development checks leave the packed-candidate release suite intact. Authorized models and a small-question length assertion do not change that gate. |

Completed checks:

- Playbook build passed; checked-in JS and declarations regenerated.
- Broad suite: 2,098 passed, 12 failed, 23 skipped; corrected fixture, retry-key and contract expectations, then affected suites passed with 771 tests and one skip.
- Additional coverage: 24 passed; later edge-case run passed 273 with two invalid new-task expectations removed without weakening the runtime; final affected suites passed all 514 tests.
- Strengthened same-parent/same-child assertions passed in all three SDK/CLI interruption cases; unchanged cases were not rerun.
- Both real CODE/REVIEW transport-failure and explicit-child-dismissal retention cases passed; the other 146 unchanged cases were not rerun.
- All five real-model recovery scenarios passed across two runs; the first run exposed a stale cancellation expectation, corrected before rerunning only the remaining cases.
- Captain-only SDK/CLI live conversation checks both passed, including clarification, reopening, a player-directed follow-up and final answer delivery.
- SLC build, 330 tests, ESLint, formatting and spec lint passed; formatting-only edits did not trigger another build or test run.
- Spec lint has zero errors and 271 warnings; all 3,305 relative links resolve.
