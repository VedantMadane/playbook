<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# IR-110: Close the durable recovery review

## Status

Implemented and verified on `codex/captain-recovery`; not merged.

## Intent

Resolve the final branch review while preserving simple restore, report and explicit continuation.

## Deliverables

- [x] Distinguish no work, interrupted work and completed work.
- [x] Keep interrupted continuation explicit across later turns.
- [x] Preserve truthful reports, child cancellation and player visibility.
- [x] Automate the bounded model and cover the missing real crash cases.
- [x] Align current specs, public contracts, operator text and changelog.

## Tasks

1. Address the review in one new commit with both requested AI credits.

## Verification

The closing review decisions and checks follow.
Earlier rounds remain below as historical verification.

### Closing review decisions

Review scope: Playbook `693abbc`, SLC `00ea868`.
Every open finding is accepted; the settled design and earlier fixes remain in place.
SLC has no new changes.

| Finding | Disposition and evidence |
| --- | --- |
| #62 | Accept: compare validated snapshots in the shared host. Five real SDK/CLI paths reopen stored snapshots without the optional prefix, including both no-work recovery paths. [Host](../../reference/sdlc/code.playbook/bin/run.js), [tests](../../reference/sdlc/code.playbook/session-snapshot-compatibility.integration.test.ts). |
| #29 | Accept: every reply prepares the carried-edit report at the common presentation boundary; only successful presentation advances the exact count that was read. Remove the cancellation reset. SDK and CLI tests cover command replies, failed decisions, malformed decisions, and cancellation after a shown reply. [Shell](../../reference/sdlc/code.playbook/playbook-captain.ts), [process tests](../../reference/sdlc/code.playbook/durable-progress.integration.test.ts). |
| #63 | Accept: progress applies only already-decided retention changes; settlement captures the live root. Applying a clear to the live list preserves the decision until settlement, including repeated exports and later replacement by new retained work. [Shell](../../reference/sdlc/code.playbook/playbook-captain.ts), [shell tests](../../reference/sdlc/code.playbook/playbook-captain.test.ts), [live SDK cases](../../reference/sdlc/code.playbook/durable-progress.integration.test.ts). |
| #51 | Accept: all three output paths record delivery through one return. A delivered output cannot be offered for assessment again; ordinary step retries and questions keep their existing rules. Validation, live/restore tests and the exact consumed-result action list cover this. [Runtime](../../src/xstate-playbook-runtime.ts), [tests](../../src/role-runtime-transition.test.ts). |
| #53 | Accept: remove the hardcoded stop rows and their self-fulfilling mutation. The model now reports only six explored scenarios and eight checked violations; real integration tests own the other claims. [Model](../../scripts/models/recovery.mjs), [test](../../src/recovery-model.test.ts). |
| #64 | Accept: rewrite contradictory clauses in place, remove duplicates, repair decision links, and place each verification requirement with its owning behavior. The complete forbidden-text search has no matches. |
| #65 | Accept: add real DECIDE acceptance, deferred callback ordering, completion-clear settlement, and exact saved/report text assertions. Remove the dead consume branches and ineffective saved-count assertion. [DECIDE tests](../../reference/sdlc/code.playbook/captain-process-loss.integration.test.ts), [runtime tests](../../src/role-runtime-transition.test.ts), [crash fixture](../../reference/sdlc/code.playbook/fixtures/durable-progress-loss.mjs). |
| #66 | Accept: correct the SDK wording, changelog and this record; the earlier #6, #44 and #47 completion claims are corrected below. No claim of testing a historical released-version record is made: the compatibility test removes the optional field from otherwise-valid current records. |

Two implementation details complete the accepted fixes:

- The post-reply cancellation case exposed a shared-host gap: a shell could return normally with an aborted signal, bypassing drained settlement. The host now checks that signal after return and uses its existing interrupted-settlement path; reversing this leaves the record `uncertain` instead of `settled`.
- Updating the live retention list must not consume a clear awaiting settlement. The clear moves into the existing pending decisions before its temporary marker is removed; repeated export and later replacement are tested.

Reject the literal #64 phrase promising a ready runtime retry for interrupted DECIDE: its bespoke runtime cannot save that position.
Two exploratory runs of `pnpm exec vitest run reference/sdlc/code.playbook/captain-process-loss.integration.test.ts -t 'first accepted proposal'` each failed one test with that added assertion; the diagnostic showed `actions: []`, a parked failed state, and the ready shell control `give-up` / `Stop /outer`.
The requested DECIDE acceptance test confirms the preserved parent and child and truthful delivery facts; the shared-runtime child tests retain their retry assertions.
No numbered finding is rejected, and no settled item is reopened.

### Closing review verification

Tests use the declared published Cligent 0.26 dependency, with the original local link restored afterward.
The unchanged dependency-capability check is not repeated; the changed model is checked separately and excluded from the later broad run.
No live provider run, SLC check, merge or release is repeated for this review.

| Command | Result |
| --- | --- |
| `pnpm build` | Both runs passed; the second includes the final TypeScript changes. The four unrelated generated FSM declaration reorderings were restored. |
| `pnpm exec vitest run --exclude src/recovery-model.test.ts --exclude src/cligent-release-capabilities.test.ts` | 2,212 passed, two stale tests failed, 23 skipped; 90 files passed. All 50 durable-progress cases and 81 package-surface checks passed. The two corrected files passed below; unchanged files were not rerun. |
| `pnpm exec vitest run reference/sdlc/captain.playbook/captain.playbook.integration.test.ts reference/sdlc/code.playbook/playbook-captain.test.ts` | 406 passed after correcting both stale tests. |
| `pnpm exec vitest run src/recovery-model.test.ts` | One passed: six explored scenarios and eight rejected violations. |
| `pnpm exec vitest run reference/sdlc/code.playbook/session-snapshot-compatibility.integration.test.ts` | Five passed. |
| `pnpm exec vitest run src/role-runtime-transition.test.ts -t 'never reassesses delivered output\|traces a continued transition'` | Four passed. |
| `pnpm exec vitest run reference/sdlc/code.playbook/playbook-captain.test.ts -t 'preserves a decided clear'` | Two passed, with and without progress writes. |
| `pnpm exec vitest run reference/sdlc/code.playbook/captain-process-loss.integration.test.ts -t 'first accepted proposal'` | One passed. |
| `pnpm exec vitest run reference/sdlc/code.playbook/durable-progress.integration.test.ts -t carried-after-reply` | One passed after fixing the shared late-cancellation boundary. |
| `pnpm exec spex lint` | Zero errors. |
| `node scripts/check-links.mjs` | All checked relative links resolve. |

Earlier feedback, all addressed before the final check:

- Snapshot fixture: two runs each passed three and failed two; one diagnostic run failed one selected case. The fake adapter lacked a continuation token; fixed.
- First extended process run: 13 passed and one failed. Three later selected runs failed while establishing the post-reply cancellation point; they exposed the host's normal-return cancellation gap. The corrected case passed.
- DECIDE fixture: three setup failures from an incorrect parent-classifier reply; corrected. Two exploratory ready-action assertions failed and were removed because the real interrupted bespoke runtime has no checkpoint for retry.
- The broad run found two stale tests: a source-text check required the old formatting, and an abandonment fixture replaced the authoritative ledger with empty history during presentation. The source check now asserts one writer without depending on formatting; the fixture keeps history monotonic while checking that the disposed runtime’s evidence remains in the report. Both affected suites passed all 406 tests afterward.
- The first reversal harness stopped before its second mutation because its text anchor had the wrong indentation. The first case had failed as expected, its bytes were restored, and the remaining cases ran after correcting the anchor.

### Closing review reversal evidence

Each check below temporarily removed the named fix or introduced the stated defect, ran the exact command, and restored the implementation bytes.
All 15 final reversal checks failed for the intended reason.
The older T7 position-source mutation was rerun against the new exact empty action-list assertion.
Completion storage trimming and report trimming are separate checks.

| Finding / case | Reversal | Observed failure | Command |
| --- | --- | --- | --- |
| #62 | Compare the canonical export to the raw stored snapshot. | All five cases fail with `restored Captain snapshot changed before the Boss turn`. | `pnpm exec vitest run reference/sdlc/code.playbook/session-snapshot-compatibility.integration.test.ts` |
| #29 replies | Remove report preparation from the common presentation boundary. | All six SDK/CLI variants fail: one split segment instead of two; no carried-edit report. | `pnpm exec vitest run reference/sdlc/code.playbook/durable-progress.integration.test.ts -t 'carried-cancel.*(command\|decision-error\|malformed)'` |
| #29 shown reply | Restore the aborted-turn prefix reset. | Saved prefix is `0` instead of `1` after a shown reply. | `pnpm exec vitest run reference/sdlc/code.playbook/durable-progress.integration.test.ts -t carried-after-reply` |
| #29 late cancellation | Remove the shared host's signal check after normal shell return. | Record remains `uncertain` instead of `settled`. | `pnpm exec vitest run reference/sdlc/code.playbook/durable-progress.integration.test.ts -t carried-after-reply` |
| #63 live list | Capture the live root during progress. | No-earlier-work case returns `ok` instead of `rejected`; earlier-work case adopts the new task instead of `Earlier task`. | `pnpm exec vitest run reference/sdlc/code.playbook/durable-progress.integration.test.ts -t live-retain` |
| #63 clear | Delete the root-clear marker without retaining its pending decision. | Two failures: clear absent from the first or second settlement export. | `pnpm exec vitest run reference/sdlc/code.playbook/playbook-captain.test.ts -t 'preserves a decided clear'` |
| #51 delivery | Remove the single delivery write. | All three return paths export no `delivered: true`. | `pnpm exec vitest run src/role-runtime-transition.test.ts -t 'never reassesses delivered output'` |
| #51 assessment | Ignore delivery when offering assessment. | All three paths advertise `retry:adjudication` instead of `[]`. | `pnpm exec vitest run src/role-runtime-transition.test.ts -t 'never reassesses delivered output'` |
| #51 validation | Remove literal-true validation. | All three cases accept the invalid snapshot instead of rejecting it. | `pnpm exec vitest run src/role-runtime-transition.test.ts -t 'never reassesses delivered output'` |
| T7 position source | Attach results to any matching checkpoint. | Exact action list contains `retry:START` / `Continue from saved result` instead of `[]`. | `pnpm exec vitest run reference/sdlc/code.playbook/durable-progress.integration.test.ts -t consumed-result` |
| #65 DECIDE | Remove DECIDE's acceptance callback. | Stack is `['outer']` instead of `['outer','decide']`. | `pnpm exec vitest run reference/sdlc/code.playbook/captain-process-loss.integration.test.ts -t 'first accepted proposal'` |
| #65 deferred | Remove the bound deferred-continuation callback. | Callback called zero times instead of once. | `pnpm exec vitest run src/role-runtime-transition.test.ts -t 'traces a continued transition'` |
| #65 completion clear | Ignore the report's retained-root clears. | The completed root's retained generation remains present. | `pnpm exec vitest run reference/sdlc/code.playbook/durable-progress.integration.test.ts -t completed-clear` |
| T9 completion text | Trim the shell's saved completion description. | Saved description loses its leading space and trailing newline. | `pnpm exec vitest run reference/sdlc/code.playbook/durable-progress.integration.test.ts -t completed-exact` |
| #65 report text | Trim the description while composing the recovery report. | The exact `/flow stopped with a failure.  The task needs a different approach.\n` line is absent. | `pnpm exec vitest run reference/sdlc/code.playbook/durable-progress.integration.test.ts -t completed-exact` |

### Prior review decisions

All numbered findings are accepted; two implementation details in the proposed recipe are rejected below because they would lose known behavior.
The previous review record below is historical and is superseded by these decisions.

| Finding | Decision and result |
| --- | --- |
| #6 | Accept: the earlier change defined one count owner, but left item 19 contradictory; that remaining clause is corrected in the closing review. |
| #15 | Accept: real process tests cover the missing inputs, consumed results, repeat crashes, validation and generation ownership. |
| #29 | Accept D5: report carried edits after the last accepted, non-aborted reply; cancellation leaves that prefix unchanged. |
| #30 | Accept D2: child lifetime begins at the runtime's input-acceptance callback, including cancellation and an unavailable description. |
| #36 | Accept: every application sharing the store must upgrade before running this version. |
| #42 | Accept: correct the decision links in both projects; withdraw the earlier SLC rebuttal. SLC's fallback acceptance rules are amended by its controller-discrimination decision. |
| #44 | Accept: existing code and tests showed the players, but items 47, 54 and 55 remained contradictory; they are rewritten in the closing review. |
| #45 | Accept P5: publish the bounded effect-reference union and the shared discard predicate. |
| #47 | Accept D3/D4: durable retention and discard were corrected; progress still predicted live retention offers. Closing-review #63 removes that prediction and preserves pending clears. |
| #48 | Accept D1/D3: remove the interruption marker; record the source step at the store write. |
| #50 | Accept P4: reports name the configured command. |
| #51 | Accept D3: attach output only to the position saved at that step's start. |
| #52 | Accept the review's acknowledgement: step retry and the full-attempt check for new input remain distinct; both are tested. |
| #53 | Accept P6: model earlier, cancelled, resumed and adopted stops; assert each mutant's specific failure; remove duplicate kind-only scenarios. |
| #54 | Accept: public snapshot capture cannot synthesize an interrupted position; update the contract and remove stale members. |
| #55 | Accept: CLI, SDK and configuration docs describe report-only retry and the shared discard rule. |
| #56 | Accept: list the unreleased additions and removals accurately in the changelog. |
| #57 | Accept D1: automatic preparation requires this turn's recorded stop; resuming or adopting stopped work authorizes none. |
| #58 | Accept P1: move the old review here, outside the packed documentation. |
| #59 | Accept P2: exact text stays exact, including newlines; records accept a missing optional state id. |
| #60 | Accept P3: restore the completion and ownership disclaimer. |
| #61 | Accept D2: starts and delivery facts use runtime acceptance, including a parent whose child then fails. |

Two corrections to the recipe:

- D1's executed-receipt-only restriction is rejected: the [shared runtime](../../src/xstate-playbook-runtime.ts) converted a settled failed result into an error-only receipt. It now retains that known `run` result; the shell consumes its stop. An exception without a settled result authorizes no automatic work. The host-retry integration case demonstrates the distinction; its reversal fails with `expected 'failed' to be 'awaitBossReply'`.
- D4's unconditional clear on every root completion is rejected: [recordTerminalRetention](../../reference/sdlc/code.playbook/playbook-captain.ts) deliberately preserves prior work for authored unfinished final states. The completion event now records that existing keep-or-clear decision. The `completed-unfinished` crash case verifies it; its reversal fails with `an unfinished final state keeps its saved generation`.

The remaining D1–D5 and P1–P6 changes are accepted.
R1–R6 and R8 are followed; tests of existing protections use explicit fault injection where no production fix was necessary.
R7 is applied to the last change to each check's inputs, not unrelated later edits: the user's instruction forbids rerunning unchanged checks.
The model and dependency-capability checks are therefore excluded from repeated broad runs; their unchanged earlier results are identified separately.
No live provider run is repeated because these tests exercise the changed host and persistence boundaries directly.

### Prior verification

The final production build used the declared Cligent 0.26 dependency; the original local dependency link is restored after verification.
No merge, release or existing-commit rewrite is performed.

| Command | Result |
| --- | --- |
| `pnpm build` | Passed on the final TypeScript inputs. Five build runs passed as their inputs changed. The later JavaScript cleanup reused the existing nonblank validator and passed the 129 checks below. |
| `pnpm exec vitest run --exclude src/recovery-model.test.ts --exclude src/cligent-release-capabilities.test.ts` | 2,193 passed; 23 skipped; all 91 files passed. Includes all 40 durable-progress cases. |
| `pnpm exec vitest run src/recovery-model.test.ts` | Passed: 11 bounded scenarios, nine mutants rejected with their expected issue strings. Not rerun unchanged. |
| `pnpm exec vitest run src/package-surface.test.ts` | 81 passed after the final packed-doc and declaration cleanup. The known local Cligent 0.27 capability mismatch is unchanged; this run used declared 0.26. |
| `pnpm exec vitest run reference/sdlc/code.playbook/playbook-captain.test.ts -t 'disposes an exportable child before delivery'` | Four passed after strengthening the cancellation assertion. |
| `pnpm exec vitest run reference/sdlc/code.playbook/durable-progress.integration.test.ts -t validation-matrix` | Passed after validating the ownership fixture’s complete record before recovery. |
| `pnpm exec vitest run reference/sdlc/code.playbook/durable-progress.integration.test.ts reference/sdlc/code.playbook/session-store.test.ts` | 129 passed after the final JavaScript cleanup, including all 40 process-loss cases and 89 store checks. |
| `pnpm exec spex lint` | Zero errors; 280 sentence-review warnings. |
| `node scripts/check-links.mjs` | Every checked relative link resolves. |
| `spex lint` in SLC | Passed with no problems; only three documentation files changed, so no unchanged SLC build or tests were repeated. |

The broad command deliberately excludes the unchanged model and dependency-capability inputs instead of invoking `pnpm test` and repeating them.
The original local Cligent link is not the declared dependency used for this verification.

Earlier feedback during this revision:

- Initial focused checks: 42 passed, one obsolete aborted-reply expectation failed.
- Extended crash checks: 33 passed, three fixture setup errors failed (frozen command config, store-list API, and an extra recovery turn in the consumed-result case).
- The next focused run: 299 passed, four stale or invalid fixture assumptions failed.
- Contract/fixture expansion: 293 passed, 41 failed, mainly because the crash fixture imported a helper that was not exported; the remaining failures were interface parsing, exit-code and ledger-read assumptions.
- The next two focused runs: 160 passed/three failed, then 80 passed/three failed; corrected expected callback shape, CLI exit code, otherwise-valid ledger mutation and exact lost-position wording.
- First broad run: 2,186 passed, seven failed, 23 skipped. It exposed the discarded failed-action result and stale expectations for thrown operations, messages, exports, snapshot defaults and internal read counts. The final broad run above passes all of these.
- First spec check after moving the old review: four citation errors; corrected before the final check.

### Prior reversal evidence

Each row temporarily changed the stated behavior, ran the exact command, then restored the implementation bytes.
These were local reversals or injected violations of existing protections, not additional committed implementations.
Every final row below failed as expected.
The first T6 description reversal initially passed because the test only checked disposal; requiring the original cancellation and aborted result exposed that defect, and the strengthened test passed with the implementation restored.
T15’s final fixture is a fully validated session record with owned, unrelated and adopted-source generations.

| Test | Reversal or injected violation | Observed failing output | Command |
| --- | --- | --- | --- |
| T1-3 | Remove the same-turn stop requirement. | `AssertionError [ERR_ASSERTION]: old stop must not trigger preparation or player work` | `pnpm exec vitest run reference/sdlc/code.playbook/durable-progress.integration.test.ts -t 'cancelled-stop\|old-stop\|resume-stop'` |
| T4 | Stop recording runtime stop outcomes. | `AssertionError: expected [] to have a length of 1 but got +0` | `pnpm exec vitest run reference/sdlc/code.playbook/captain-recovery-progress.integration.test.ts -t answer-failure` |
| T4-runtime | Read stops only from executed receipts, dropping failed receipts with known results. | `AssertionError: expected 'failed' to be 'awaitBossReply' // Object.is equality` | `pnpm exec vitest run reference/sdlc/code.playbook/captain-recovery.integration.test.ts -t 'after a host retry'` |
| T5 | Do not reconstruct the interrupted step’s causal attempt. | `TypeError: runtime snapshot failedEffectAttempt null attemptId requires an empty causal suffix` | `pnpm exec vitest run reference/sdlc/code.playbook/durable-progress.integration.test.ts -t player-before-change` |
| T6-before | Call the acceptance hook before entering the child runtime. | `AssertionError: expected +0 to be 1 // Object.is equality` | `pnpm exec vitest run reference/sdlc/code.playbook/playbook-captain.test.ts -t 'disposes an exportable child before delivery: input-abort'` |
| T6-after | Remove the runtime’s acceptance notification. | `AssertionError: expected [ 'flow' ] to deeply equal [ 'flow', 'leaf' ]` | `pnpm exec vitest run reference/sdlc/code.playbook/captain-recovery-progress.integration.test.ts -t 'through child-cancel'` |
| T6-parent | Infer acceptance from a non-failed return instead of the callback. | `AssertionError [ERR_ASSERTION]: [{"seq":8,"turnId":2,"kind":"outcome","payload":["The playbook did not accept the Boss text; no delivery is confirmed.","/flow failed."]}]` | `pnpm exec vitest run reference/sdlc/code.playbook/durable-progress.integration.test.ts -t parent-accepted-child-failed` |
| T6-describe | Read child describe() unguarded before entering its input boundary. | `AssertionError: expected false to be true // Object.is equality` | `pnpm exec vitest run reference/sdlc/code.playbook/playbook-captain.test.ts -t input-abort-describe` |
| T7 | Match any checkpoint id instead of the position’s recorded source step. | `AssertionError [ERR_ASSERTION]: [{"id":"retry:START","label":"Continue from saved result: Complete the task","standing":"ready"}]` | `pnpm exec vitest run reference/sdlc/code.playbook/durable-progress.integration.test.ts -t consumed-result` |
| T8-retention | Save and apply pending retention updates during progress writes. | `AssertionError [ERR_ASSERTION]: Expected values to be strictly deep-equal:` | `pnpm exec vitest run reference/sdlc/code.playbook/durable-progress.integration.test.ts -t give-up` |
| T8-ledger | Allow discard without comparing the current and pre-turn ledgers. | `AssertionError: expected true to be false // Object.is equality` | `pnpm exec vitest run reference/sdlc/code.playbook/captain-recovery-progress.integration.test.ts -t adjudication-discard` |
| T9 | Require selected instructions to be canonically trimmed. | `Error: Selected answer instruction must be in canonical trimmed form` | `pnpm exec vitest run reference/sdlc/code.playbook/durable-progress.integration.test.ts -t exact-answer` |
| T9-completion | Require completion descriptions to be canonically trimmed. | `Error: Expected process loss` | `pnpm exec vitest run reference/sdlc/code.playbook/durable-progress.integration.test.ts -t completed-exact` |
| T10 | Report only changes after the current turn’s initial ledger count. | `AssertionError [ERR_ASSERTION]: The expression evaluated to a falsy value:` | `pnpm exec vitest run reference/sdlc/code.playbook/durable-progress.integration.test.ts -t carried-cancel` |
| T11 | Restore the incomplete repository-only disclaimer. | `AssertionError [ERR_ASSERTION]: The expression evaluated to a falsy value:` | `pnpm exec vitest run reference/sdlc/code.playbook/durable-progress.integration.test.ts -t 'restores player-result'` |
| T12 | Permit report turns to write progress. | `AssertionError [ERR_ASSERTION]: The expression evaluated to a falsy value:` | `pnpm exec vitest run reference/sdlc/code.playbook/durable-progress.integration.test.ts -t lost-position-second-crash` |
| T13 | Filter outcomes using turn instead of turnId. | `AssertionError [ERR_ASSERTION]: delivery assertion needs a real outcome` | `pnpm exec vitest run reference/sdlc/code.playbook/durable-progress.integration.test.ts -t later-step` |
| T14-kind | Remove the step-kind validator. | `AssertionError [ERR_ASSERTION]: Missing expected exception.` | `pnpm exec vitest run reference/sdlc/code.playbook/durable-progress.integration.test.ts -t validation-matrix` |
| T14-playbook | Remove the registered-playbook validator. | `AssertionError [ERR_ASSERTION]: Missing expected exception.` | `pnpm exec vitest run reference/sdlc/code.playbook/durable-progress.integration.test.ts -t validation-matrix` |
| T14-completion | Remove the completed-state validator. | `AssertionError [ERR_ASSERTION]: Missing expected exception.` | `pnpm exec vitest run reference/sdlc/code.playbook/durable-progress.integration.test.ts -t validation-matrix` |
| T14-answer | Remove the nonempty-question-list validator. | `AssertionError [ERR_ASSERTION]: Missing expected exception.` | `pnpm exec vitest run reference/sdlc/code.playbook/durable-progress.integration.test.ts -t validation-matrix` |
| T14-position | Remove the existing-position-step validator. | `AssertionError [ERR_ASSERTION]: Missing expected exception.` | `pnpm exec vitest run reference/sdlc/code.playbook/durable-progress.integration.test.ts -t validation-matrix` |
| T14-current | Remove current-ledger equality at the progress write. | `AssertionError [ERR_ASSERTION]: Missing expected rejection.` | `pnpm exec vitest run reference/sdlc/code.playbook/durable-progress.integration.test.ts -t validation-matrix` |
| T14-monotonic | Remove monotonic extension from saved progress to current evidence. | `AssertionError [ERR_ASSERTION]: Missing expected exception.` | `pnpm exec vitest run reference/sdlc/code.playbook/durable-progress.integration.test.ts -t validation-matrix` |
| T15 | Ignore adopted-source ownership when clearing lost-position generations. | `AssertionError [ERR_ASSERTION]: Expected values to be strictly deep-equal:` | `pnpm exec vitest run reference/sdlc/code.playbook/durable-progress.integration.test.ts -t validation-matrix` |
| T16 | Use the playbook id instead of its configured command. | `AssertionError [ERR_ASSERTION]: report must use configured command` | `pnpm exec vitest run reference/sdlc/code.playbook/durable-progress.integration.test.ts -t command-override` |
| keep-final | Clear a saved generation even when its completion decision is keep. | `AssertionError [ERR_ASSERTION]: an unfinished final state keeps its saved generation` | `pnpm exec vitest run reference/sdlc/code.playbook/durable-progress.integration.test.ts -t completed-unfinished` |
| T17 | Put the old review back in packed docs/reviews/round-6.md. | `AssertionError: expected [ …(22) ] to deeply equal []` | `pnpm exec vitest run src/package-surface.test.ts -t 'resolves every relative link in packed markdown'` |

T1, T2 and T3 each failed under their shared reversal; T10 failed independently for SDK and headless output.

### Previous review record

<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

#### Recovery review, round 6

Review scope: `d55c01e` on `codex/captain-recovery`.

The fixes keep one rule: restore recorded work, report it, then wait for Boss to choose what happens next. A turn that started no work keeps its previous position. Reporting never changes the saved progress.

| Item | Decision | Result and evidence |
| --- | --- | --- |
| 47 | Accept | Reopening uses recorded steps and changed repository evidence. No work restores the exact previous stack and question; an empty progress record permits discard. Report turns save no progress. [Host](../../reference/sdlc/code.playbook/bin/run.js), [crash tests](../../reference/sdlc/code.playbook/durable-progress.integration.test.ts). |
| 48 | Accept | Interrupted runtimes keep an explicit-choice marker through restore and adoption. Automatic recovery excludes their offers; the Captain prompt also states the restriction. New input uses the same full-attempt effect checks as a live failure, and delivery is reported only when accepted work or a successful result confirms it. Step-start capture saves the full-attempt prefix; restore rebuilds its attempt identity from current evidence. [Runtime](../../src/xstate-playbook-runtime.ts), [shell](../../reference/sdlc/code.playbook/playbook-captain.ts). |
| 49 | Accept | Host-written reports and quoted questions bypass the model-prose filter and use the existing single-reply failure path. A real crash test includes “undeclared” in the player's question. [Crash fixture](../../reference/sdlc/code.playbook/fixtures/durable-progress-loss.mjs). |
| 50 | Accept | The same journal records completed root outcomes and selected existing answers. Reports read those facts, preparation results and unfinished calls. Bespoke calls retain only their returned status, rather than unused raw output. Reports no longer claim those discarded outputs remain available. Report history names the actual operation. [Host](../../reference/sdlc/code.playbook/bin/run.js), [store](../../reference/sdlc/code.playbook/bin/session-store.js), [crash tests](../../reference/sdlc/code.playbook/durable-progress.integration.test.ts). |
| 51 | Accept | Using a saved result keeps the start checkpoint. The host attaches results only to positions that have not consumed them. Saved actor output takes precedence over another assessment. Authored-failure and committed-player tests verify both paths. [Runtime tests](../../src/durable-step.integration.test.ts), [crash tests](../../reference/sdlc/code.playbook/durable-progress.integration.test.ts). |
| 52 | Accept the documentation gap; keep the design | A missing checkpoint gives no permission to repeat earlier work. Old failed snapshots and failed nested calls therefore have no whole-playbook retry. The decision and current contracts now say this explicitly. [DR-070](../../specs/decisions/070-durable-step-progress.md), [[recovery-3](../packages/recovery.md#recovery-3)]. |
| 53 | Accept | The model now runs under Vitest, starts from parked input, clears unsupported positions, covers later Boss choices and checks that completed work can make durable progress. Eight deliberately broken rules must fail, including automatic retry, automatic result acceptance, wrong positions and missing results. The inaccurate historical-protocol claim is withdrawn. This is a bounded policy check, not a proof of the implementation. [Model](../../scripts/models/recovery.mjs), [test](../../src/recovery-model.test.ts). |
| 54 | Accept | Public snapshot capture cannot request a fabricated interrupted position. That option remains private to step-start recording. [Runtime](../../src/xstate-playbook-runtime.ts), [test](../../src/durable-step.integration.test.ts). |
| 55 | Accept current operator/API wording | CLI help, discard errors, SDK recovery docs and current contracts describe restore/report/choose. Historical decision text remains historical where explicitly superseded; mass-renaming it adds no behavioral protection. [CLI guide](../../docs/cli.md), [SDK declarations](../../reference/sdlc/code.playbook/session-host.d.ts). |
| 56 | Accept | The changelog records the breaking recovery/store changes, removed fallback and new public contracts. A future release requires a major version and coordinated host upgrades. No release was made. [Changelog](../../CHANGELOG.md). |
| 29 | Accept | Cancellation during the closing reply emits and saves the mandatory report about Boss's carried edits. The test checks both the actual Captain reply and the saved journal. [Crash fixture](../../reference/sdlc/code.playbook/fixtures/durable-progress-loss.mjs). |
| 30 | Accept | A child cancelled before accepting input is disposed. Started work and a changed child position distinguish it from a child that already began. The test now cancels inside the child's input boundary as well as before delivery. [Shell tests](../../reference/sdlc/code.playbook/playbook-captain.test.ts). |
| 44 | Accept | Adopting work that still needs effect checks shows the active leaf's bound players. The same runtime restrictions still prevent ordinary execution. Three adoption checks verify this. [Shell tests](../../reference/sdlc/code.playbook/playbook-captain.test.ts). |
| 15 | Accept | Tests now choose the exact saved-output action, isolate progress and output validation, verify CLI call counts and missing script results, and cover no-work crashes, discard, switching, same-root retention and a second crash with no usable position. An older same-root generation remains when its identity owns none of the new attempt's work; the test checks that exact identity. [Crash tests](../../reference/sdlc/code.playbook/durable-progress.integration.test.ts), [runtime tests](../../src/durable-step.integration.test.ts). |
| 41 | Accept | Current specs agree on stopped settlement, lost-position evidence and controller turn counts. The interrupted-report contract lives in recovery-27; CLI specs bind to it. [Recovery](../../specs/packages/recovery.md), [CLI](../../specs/packages/playbook-cli.md), [Captain](../../specs/packages/playbook-captain.md). |
| 6 | Accept | The saved-count line belongs to the outermost entry actually driven in that counting window. [[playbook-captain-19](../packages/playbook-captain.md#playbook-captain-19)]. |
| 36 | Accept | The upgrade warning applies before running this version, since all steps write progress. [CLI guide](../../docs/cli.md). |
| 42 | Accept Playbook changes; reject the SLC backlink | The map table and decision relationships are corrected. Playbook DR-034 now points to its replacement. SLC DR-034 concerns transition-coverage probes, not recovery; adding that backlink would connect unrelated decisions. [DR-034](../decisions/034-durable-failure-retry-continuity.md), SLC `specs/decisions/034-faithful-transition-coverage.md` (“Keep coverage outside the early compilation gates; this correction changes verification accuracy, not compilation policy.”). |
| 45 | Accept | `ProgressChange` and `InterruptedReport` are exported and their fields and use are specified. The package-surface check passes. [Declarations](../../reference/sdlc/code.playbook/playbook-captain.d.ts), [contract](../../specs/packages/recovery.md). |
| 43, 46, 11 | Accept the review's closed/obsolete status | No new defect was claimed for these items. No separate change is needed. |
| 19, 23 | Keep settled | The review raises no new finding for either item. |

Verification:

- First focused run: 23 passed, 9 failed. It exposed the new answer-record shape error, optional completion-save handling, and faulty test setup. Fixed.
- Second focused run: 27 passed, 6 failed. It exposed saved player output being routed through assessment and stale error expectations. Fixed.
- Third focused run: 284 passed, 3 failed. Only old hidden-player expectations failed; updated for item 44.
- Broad non-live run: 2,167 passed, 5 failed, 23 skipped. The failures were documentation links, a declaration excerpt, two old discard-error expectations, and the incorrect same-root retention expectation. Fixed.
- Final focused run: **445 passed**, across runtime contract, shell, store, SDK/CLI recovery, cancellation and real process-loss tests.
- Final completion/answer checks after the last reporting change: **3 passed**; 22 unrelated cases filtered out.
- The last safety check tightened new-input handling to the full failed attempt. Its affected runtime and SDK/CLI suites passed **296 tests**. The crash suite passed **25 cases**; one new fixture initially missed its second-step transition, then its corrected case passed. A further committed-player second-crash case passed. All **27 crash/cancellation cases** have passing results.
- Model: **63,376 states** pass across nine scenarios; all **eight mutations** are rejected. Its Vitest test passed; it was not rerun after unchanged inputs.
- TypeScript build passed. The first build found three type errors introduced during this fix; corrected before verification. Builds used the declared published Cligent 0.26 dependency; the pre-existing local dependency link is restored afterward.
- Spec lint: **zero errors, 279 sentence-review warnings**. All **3,429 checked links in 207 files** resolve.

Run logs are local verification logs. No merge, release, or history rewrite was performed. SLC has no changes. The changes answer Claude Opus 5.5's review and were implemented by GPT-6 Astra.
