<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# IR-102: Captain step recovery

## Status

Completed on the feature branches; not merged or released.

## Intent

Implement and verify [DR-069](../decisions/069-captain-prepares-step-recovery.md).

## Deliverables

- [x] Durable recovery of the interrupted invocation.
- [x] Bounded Captain preparation and continuation through both front ends.
- [x] Replayed failure cases, automatic bounded preparation, and integration and real-agent verification.

## Tasks

1. Preserve the interrupted invocation and retry it without replaying completed steps.
2. Implement Captain preparation, routing, and bounded continuation.
3. Verify recovery through durable sessions and real agents; finish documentation and checks.
4. Complete automatic recovery, portable DECIDE replies, read-only restoration, missing-transition reporting, and verification; correct the concurrent ownership-check failure found during those runs.

Keep both projects on `codex/captain-recovery`; do not merge to `main` without a later Boss instruction.

## Verification

Exercise failure after a completed phase, nested failure, restart, pending Boss input, preparation failure, and repository-effect fences with real runtimes and Git repositories.
Run real-agent recovery in isolated fixture repositories, then the project build, spec lint, and applicable integration suites.

Live verification on 2026-09-25 used Claude Opus 5.5 for Captain and GPT-5.6 Sol for the worker, with the installed Claude executable supplied through `PLAYBOOK_ACCEPTANCE_CLAUDE_PATH`.

| Case | Verified result |
| --- | --- |
| Player interruption after an earlier commit | Preparation restores the missing local setting; only the stopped step repeats. |
| Interrupted judgment after a commit | Saved text is assessed without repeating the committed player. |
| Read-only check creates unwanted output | Captain preserves and removes the output, prevents its return, and the runtime verifies restoration before retry. |
| Interruption after preparation tools ran | Reopening resumes the saved preparation point, retaining the earlier commit. |
| No declared result fits | The real judge reports blocked; Captain explains the missing path to Boss, with no repeated player or false completion. |

All five cases passed in `acceptance/captain-recovery.acceptance.test.ts`.
Tests used isolated temporary repositories and session stores; no historical user session was modified.
A separate integration test reopened DECIDE without provider hints and continued its original operation with the exact task and Boss answer.
That test also exposed a concurrent lease-owner check failure; read-only checks now coexist and release drains them before retiring ownership, verified against the real store.

Final checks: Playbook's 2,094 standard tests and 86 dependency-capability tests; SLC's 1,510 tests; both builds and spec linters; SLC lint and formatting; and Playbook's documentation link check.
One SLC test timed out during the concurrent full checks; its complete 36-test file passed on rerun.
Playbook spec lint reports no errors and 271 advisory warnings under the current linter.
Standard Playbook checks used published Cligent 0.26.0, as declared by Playbook, in an isolated temporary installation because the development link targets a different sibling build.
The original development link was restored afterward.
