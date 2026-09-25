<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# IR-102: Captain step recovery

## Status

Implemented and verified.

## Intent

Implement and verify [DR-066](../decisions/066-captain-prepares-step-recovery.md).

## Deliverables

- [x] Durable recovery of the interrupted invocation.
- [x] Bounded Captain preparation and continuation through both front ends.
- [x] Integration and real-agent verification, documentation, and merge-ready commits.

## Tasks

1. Preserve the interrupted invocation and retry it without replaying completed steps.
2. Implement Captain preparation, routing, and bounded continuation.
3. Verify recovery through durable sessions and real agents; finish documentation and checks.

## Verification

Exercise failure after a completed phase, nested failure, restart, pending Boss input, preparation failure, and repository-effect fences with real runtimes and Git repositories.
Run real-agent recovery in isolated fixture repositories, then the project build, spec lint, and applicable integration suites.

Live verification on 2026-09-24 used Claude Opus 5.5 for Captain and GPT-5.6 Sol for the worker, with the installed Claude 2.1.282 executable supplied through `PLAYBOOK_ACCEPTANCE_CLAUDE_PATH`.
Both runs reopened their saved session before Captain prepared the missing environment and continued:

| Injected interruption | Evidence |
| --- | --- |
| Player transport fails before the second step | Exactly one first-step call and commit; second-step retry succeeds; three physical boundaries retain the failed unchanged attempt. |
| Judgment transport fails after the first-step commit | Saved text is judged without another first-step player call; second step succeeds; exactly two physical boundaries and the same commit. |

The opt-in `acceptance/captain-recovery.acceptance.test.ts` reproduces both cases with real providers and one injected error event at the selected transport boundary.
Tests use isolated temporary repositories and session stores; no historical user session was modified.

Final checks: Playbook's 2,081 standard tests and 86 dependency-capability tests; SLC's 1,510 tests; both builds and spec linters; SLC lint and formatting; and Playbook's documentation link check.
Playbook spec lint reports no errors and 269 advisory warnings under the current linter.
Verification used published Cligent 0.26.0, as pinned by Playbook, in an isolated temporary installation because the local development link pointed to a different sibling build; the original development link is restored afterward.
