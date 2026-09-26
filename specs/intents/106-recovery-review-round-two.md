<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# IR-106: Recovery review, round two

## Status

Completed and verified on `codex/captain-recovery`.
No merge or rewrite of existing commits.

## Intent

Resolve the second review of interrupted-step recovery and Captain-mediated questions while keeping the repair limited to preparing and continuing the stopped work.

## Deliverables

- [x] Preserve downstream progress and settle cancellation through the shared host.
- [x] Bind automatic answers to the current task and report their use.
- [x] Preserve truthful failure replies and complete counts.
- [x] Synchronize affected contracts and add tests that isolate their guards.
- [x] Record every review disposition and verification result.

## Tasks

1. Correct the accepted round-two findings, verify changed inputs, and create one new review-fix commit, crediting GPT-6 Astra as coder and Claude Opus 5.5 as reviewer.

## Review dispositions

All 17 active findings are accepted.
No new rebuttal is needed.

| Item | Disposition and change | Evidence |
| --- | --- | --- |
| 3 | Accept. Advance the saved point after a continuation pauses, including after cancellation drains; do not replay the earlier action against later work. | [Downstream tests](../../reference/sdlc/code.playbook/captain-recovery-progress.integration.test.ts): step retry, assessment and restoration reach a child, lose the first checkpoint acknowledgement and resume that child. |
| 4 | Accept. Save interrupted recovery in the shared host before disposal; keep both errors if saving fails; keep a successfully saved interactive pane open; wait for SDK reporting before disposal; explain saved CLI state. | [Recovery tests](../../reference/sdlc/code.playbook/captain-recovery.integration.test.ts): real managed lifecycle, CLI-to-SDK continuation, immediate abort/dispose, failed save and preserved preparation edits. |
| 7 | Accept. Assessment comparison recognizes the retained source session as an owner. | [Adopted assessment test](../../reference/sdlc/code.playbook/captain-recovery-progress.integration.test.ts): a direct host-selected action saves assessment evidence, loses acknowledgement, then retries without repeating the committed player step. |
| 16 | Accept. Append the original question to the truthful failure reply; do not replace the action result or insert state names from a digest. | [Captain integration tests](../../reference/sdlc/captain.playbook/captain.playbook.integration.test.ts): pending questions with decision outage, rejected action, failed delivery and completed action. |
| 6 | Accept the remaining count defect. Continue accumulated counts with the current frame's counting policy. | [Counts test](../../reference/sdlc/code.playbook/captain-recovery-progress.integration.test.ts): child returns, parent fails and recovers, both steps count and the parent's saved-counts text is used. |
| 10 | Accept. Restore the choice between answer, retry and preparation; remove duplicate digest ownership; correct question-status exceptions and test citations. | [Recovery contract](../packages/recovery.md), [Captain contract](../packages/playbook-captain.md), [controller contract](../packages/captain-playbook.md). |
| 11 | Accept. Align CLI, storage and compiler text with checked point retry, shared cancellation settlement, optional continuation, available jumps and valid unresolved results. | [CLI](../packages/playbook-cli.md), [storage](../packages/session-storage.md), [link contract](../../slc/link.md), [compiler guide](../../slc/gears2fsm.md). |
| 12 | Accept. Give each decision record its own precise amendment; correct map entries and the external SLC citation. | [DR-066](../decisions/066-captain-prepares-step-recovery.md), [map](../map.md); SLC’s round-two report covers DR-053 and its map. |
| 13 | Accept. Correct point-retry and cancellation documentation; make the configuration document's tool-free claim true through item 26. | [CLI guide](../../docs/cli.md), [embedding guide](../../docs/embedding.md); configuration prose needs no change after the code fix. |
| 14 | Accept. Restore exact fact arrays and name checkpoint-disabled tests for the absence of retry. | [Headless failure tests](../../reference/sdlc/code.playbook/headless-failure-retry.test.ts), [runtime tests](../../src/xstate-playbook-runtime.test.ts). |
| 15 | Accept. The previous rebuttal was wrong: otherwise-valid ledgers isolate the restoration rule. Replace weak amendments with seven positive-before/negative-after cases and close the remaining behavior gaps. | [Restoration tests](../../src/step-recovery.integration.test.ts), [recovery tests](../../reference/sdlc/code.playbook/captain-recovery.integration.test.ts), [downstream/store tests](../../reference/sdlc/code.playbook/captain-recovery-progress.integration.test.ts), [child retention test](../../reference/sdlc/code.playbook/playbook-captain.test.ts), [verification contract](../packages/recovery.md#verification). |
| 22 | Accept the SLC residuals. Exclude valid domains from near misses; require full expected-domain text and suppression of unrelated findings. | SLC’s round-two report and its 330 passing verification tests; no SLC implementation change. |
| 24 | Accept. Save the exact handed-off request on the root, restore and adopt it, and offer only that labeled request to the answer check. Previous answers and other engagements cannot supply candidates; old snapshots without a request supply none. | [Recovery tests](../../reference/sdlc/code.playbook/captain-recovery.integration.test.ts): exact delivered text, composed handoff, restored question after another answer; [adoption test](../../reference/sdlc/code.playbook/captain-recovery-progress.integration.test.ts); [shell implementation](../../reference/sdlc/code.playbook/playbook-captain.ts). |
| 25 | Accept. Save the asker, full question and exact reused instruction in the outcome and require Captain to explain its answer. | [Recovery assertions](../../reference/sdlc/code.playbook/captain-recovery.integration.test.ts), [Captain source](../../reference/sdlc/captain.md) and synchronized GEARS/FSM artifacts. |
| 26 | Accept. Use the existing adapter-specific tool restriction and an explicit no-tools instruction for question checks. | [Recovery adapter matrix](../../reference/sdlc/code.playbook/captain-recovery.integration.test.ts): Claude, Gemini, Codex, Kimi and OpenCode. |
| 27 | Accept. SDK `recover(input)` on a settled session uses the same ordinary Captain turn as the CLI; uncertain recovery still accepts no new input. | [Recovery tests](../../reference/sdlc/code.playbook/captain-recovery.integration.test.ts): exact answer delivery without preparation and uncertain-input refusal. |
| 28 | Accept. Say point retry may repeat later external effects and discard would lose saved work; do not blame every point on preparation. | [CLI reporting](../../reference/sdlc/code.playbook/bin/run.js), exercised by interrupted-point CLI cases in the recovery tests. |

Items 1, 2, 8, 9, 17, 18 and 21 remain closed as the reviewer reported.
Item 5's answer-reuse design remains accepted, with its defects handled by 24–27; item 20's residuals are covered by 10 and 24.
The reviewer accepted the prior rejections of 19 and 23, the refusal to discard a saved point in 4, and strict JSON parsing in 6; these remain unchanged.

## Verification

Only changed inputs or checks not previously run were tested again.
The final cancellation fix is in Captain's call handling; the runtime's existing cancellation contract remains intact.

- Build: `npm run build` passed after the final TypeScript change; generated artifacts are included.
- Runtime/shell/recovery group: 680 distinct tests passed across the final five-file run and targeted corrections (237 runtime, 248 shell, 151 compiled Captain integration, 38 recovery, 6 downstream recovery).
- Wider checks: the earlier 18-file run had 702 passes and two cancellation failures; after correcting the implementation, all 237 runtime tests passed, and the final 11-file host/nested run passed all 229 tests.
- The remaining 238 wider checks passed in the earlier run: runtime evidence, step recovery, session storage, compiler nesting and source contracts; their relevant final behavior is unchanged.
- Captain source/GEARS/FSM/introspection/coverage/prompt checks: 6 passed.
- Total distinct targeted Playbook tests: 1,153 passed; overlapping reruns are not counted twice.
- SLC: 330 tests and ESLint passed; no SLC build repeated because its inputs did not change.
- Additional stopped-preparation checks: 6 cases passed, including exact preservation of the original abort and save failure, saved-state CLI advice, and the external-effect warning with no discard suggestion; only the two changed error assertions were rerun after their final correction.
- `spex lint`: Playbook 0 errors / 273 advisory warnings; SLC 0 errors / 1 advisory warning.
- `npm run check:links`: all 3,351 relative links in 200 files resolve.
- `git diff --check`: passed in both repositories.
- Live acceptance: 2 passed, 5 deliberately excluded; Claude Opus 5.5 and GPT-5.6 Sol drove the SDK-only question/clarification/reopen/answer flow and the interrupted-preparation flow.
- The recovery run saved preparation edits, preserved the first commit, resumed the stopped second step and completed with no repeated first player call, extra commit or worktree dirt.
- Live evidence directories: `captain-question-live-G7HrmQ` and `captain-recovery-live-thUPCO` under the macOS temporary directory; both contain durable records, with the question run also saving Captain's replies and its final record.

During development, focused tests exposed the missing store allowance for the new root request, cancellation/disposal differences and stale frame state; those defects were corrected.
Two existing runtime tests rejected an overly broad cancellation change, so it was removed and the fix put in Captain.
A signal assertion was updated to check the forwarded signal rather than object identity, and three new downstream fixtures were corrected to interrupt at the host checkpoint after the runtime call returns, instead of inside a runtime wrapper that had not returned.
Strengthening the failed-save assertions also caught an undefined error-formatting helper in this round's change; using the existing helper preserves both the exact original abort and the save failure.
All affected final tests passed; no failing test was disabled.

The first live attempt failed before the question could be asked because the bundled Claude CLI was 2.1.252, while Opus 5.5 requires at least 2.1.280.
The next attempt uses the already-installed Claude 2.1.282 through the acceptance test's executable override, without changing project dependencies.

Verification used the declared published Cligent 0.26 dependency in an isolated temporary tree, rather than the pre-existing local development link to 0.27.
The original `node_modules/@sublang/cligent -> ../../../cligent` link was restored after verification; no dependency manifest or lockfile changed.
The temporary SDK update attempt was stopped once the installed compatible executable provided the needed live verification.
