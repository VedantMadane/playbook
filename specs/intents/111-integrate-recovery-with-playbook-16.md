<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# IR-111: Integrate recovery with Playbook 16

## Status

Integration verified on `codex/captain-recovery`; PR remains unmerged.

## Intent

Resolve PR #50 against released Playbook 16 while preserving saved-step recovery, Captain-only questions and the current compiled workflows.

## Deliverables

- [x] Combine the shared parallel runtime with durable progress and checkpoint-only retry.
- [x] Preserve one presentation owner while adopting the newer failure reports.
- [x] Keep the recompiled DECIDE module and verify sequential and parallel interruption.
- [x] Renumber unreleased recovery decisions to DR-069 through DR-073, preserving released IDs.
- [x] Refresh Captain's verifier from the integrated SLC branch and verify changed inputs.

## Tasks

1. Merge main into the PR branch, resolve conflicts, verify the combined behavior and push one merge commit without merging the PR.

## Verification

- Build passed against the declared Cligent 0.26 dependency after correcting two merge omissions: plural pending-question references and the new no-matching-outcome report phrase.
- Broad affected suite: 1,535 passed, 13 failed, 23 skipped across 87 files.
  All failures came from a recovery test adapter naming CODE's old question state; it now answers the singular offered question without guessing a generated state name.
  Targeted reruns passed all 13 formerly failing cases (14 passed in the first selection, including two name-colliding cases, then the omitted case passed alone).
- Captain suites: 672 passed and three failed initially; the three corrected cases passed afterward.
  Those cases update CODE's description, reject a whole-playbook retry during parallel DECIDE proposals, and ensure parallel questions pass only through Captain.
- Shared runtime: 248 passed, followed by one new passing test for the last parallel region's answer after its sibling finished.
  Parallel starts have no invented recovery position; a sequential step after the join retries without repeating proposals.
- DECIDE runtime: 83 passed, including synthesis-step retry without repeating either proposal.
  Portable Boss-reply integration passed after adapting its fake to the shared runtime's prompts and question checks.
- Five real process-loss/cancellation cases passed: root and nested DECIDE during proposals, root and nested DECIDE after the committing step, and cancellation immediately after child input acceptance.
  Concurrent work preserves repository evidence and exits safely; sequential work restores its saved step without making a player call.
- Updated compiler guidance checks passed 23 tests with one optional historical case skipped.
- Relative-link validation resolved all 3,774 links in 211 files.
- Spec lint initially found one forbidden reference to another intent record in this report; corrected.
- The unchanged bounded-model and dependency-capability suites were not repeated.
- This integration used real subprocess crashes and deterministic adapters, without repeating prior provider runs.

SLC's companion merge is `98092b0`; its 1,530 passing tests, two skips and package checks are reported on PR #28.
No existing commit was rewritten and neither PR was merged or released.
