<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# IR-102: Captain step recovery

## Status

In progress.

## Intent

Implement and verify [DR-066](../decisions/066-captain-prepares-step-recovery.md).

## Deliverables

- [x] Durable recovery of the interrupted invocation.
- [x] Bounded Captain preparation and continuation through both front ends.
- [ ] Integration and real-agent verification, documentation, and merged commits.

## Tasks

1. Preserve the interrupted invocation and retry it without replaying completed steps.
2. Implement Captain preparation, routing, and bounded continuation.
3. Verify recovery through durable sessions and real agents; finish documentation and checks.

## Verification

Exercise failure after a completed phase, nested failure, restart, pending Boss input, preparation failure, and repository-effect fences with real runtimes and Git repositories.
Run real-agent recovery in isolated fixture repositories, then the project build, spec lint, and applicable integration suites.
