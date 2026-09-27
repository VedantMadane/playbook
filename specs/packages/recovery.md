<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# recovery: Prepare and resume interrupted work

## Intent

Let Boss authorize Captain to prepare an interrupted leaf's prerequisites and continue at its runtime-owned step, preserving completed work ([DR-066](../decisions/066-captain-prepares-step-recovery.md)).

## External Behavior

### recovery-1

Before starting a player, direct-Captain or script invocation, the shared runtime shall capture a detached checkpoint containing its source state, complete composed prompt or command, persisted invocation machine including accepted Boss input, and current effect-ledger boundary prefix.
The optional `recordStep(step, position?)` port shall receive a fresh UUID start and a runtime-owned restorable failed position before execution, then the same start with its JSON actor result before the next transition.
A failed start save shall start no work; a failed result save shall stop further work while retaining the known output for drained settlement.
While failed or waiting for Boss, the runtime shall export its checkpoint as optional `recoveryCheckpoint` and restore without execution [[playbook-runtime-45](playbook-runtime.md#playbook-runtime-45)].
A non-JSON context shall remain executable with an explicit unavailable position; no checkpoint shall be invented.
The checkpoint shall be replaced by the next invocation and omitted in other states.

### recovery-2

When validating a checkpoint, the runtime shall require `stateId`, `prompt`, `machine`, and `boundaryPrefix`, with nonempty strings, a JSON machine active at that source state, and a nonnegative prefix not exceeding the ledger; optional members shall be UUID `id` and JSON `result`.
Restoration shall require exactly one current player, direct-Captain or script invocation with the declared actor and matching `input.stateId`.
A saved result shall name a declared guard and supply its required fields; a script result shall contain exactly `guard` and integer `exitStatus` consistent with its declared exit mapping.
Invalid checkpoints shall reject before execution.

### recovery-3

While failed with a valid checkpoint and no unresolved-effect fence, the runtime shall advertise retry only when every later boundary belongs to that runtime and is unchanged or has verified read-only restoration [[recovery-12](#recovery-12)], or when a saved result exists and every later boundary belongs to that runtime and source state.
The action shall retain `retry:<ENTRY_EVENT>` when the entry targets that source, otherwise use `retry:step`, and label the source description, explicitly naming a saved result when present.
Applying it shall rebuild only that invocation, preserving session identity, counters, player continuity, original input and completed predecessor context, consuming a saved output without repeating work [[playbook-runtime-52](playbook-runtime.md#playbook-runtime-52)].
A missing or unsafe checkpoint shall authorize no retry; the runtime shall not fall back to restarting the playbook.

### recovery-5

While a leaf has an invocation checkpoint and either a pending Boss question or a ready step retry, verified-restoration retry, or saved-result assessment, its control view shall offer `recovery` containing the captured `prompt`, optional source-state `description`, optional `preparation` text stating the conditions the runtime will verify, optional JSON `evidence` containing saved player text, declared result choices and repository receipts, and a runtime-owned `continuation` of exactly `{kind:'reply'}` or `{kind:'runtime',actionId}`.

### recovery-6

When the default Captain selects preparation under [[captain-playbook-4](captain-playbook.md#captain-playbook-4)], its selection shall be the payload-free `{action:'recover'}` through the ordinary controller port [[captain-playbook-9](captain-playbook.md#captain-playbook-9)].
An ordinary answer shall select `deliver`; a requested advertised retry needing no preparation shall select `runtime`; a request to repair prerequisites and continue shall select `recover` only when preparation is available.

### recovery-7

Where the host supplies cancellation of admitted calls, when executing `recover`, the shell shall hold the worktree's exclusive claim and make exactly one fresh, hidden Captain preparation call on its existing serialized queue, using configured permissions and tools, the exact current Boss text, the offered step prompt, pending question, and structured failure:

- inspect and repair only prerequisites necessary for that continuation;
- decide first whether every required Boss choice is already supplied; if any is missing, report blocked before tools, even when no preparation or repair is otherwise needed;
- preserve a waiting player's tracked and non-ignored repository checkpoint; report blocked when preparation requires changing it;
- preserve a recoverable copy before removing or replacing unexpected files;
- preserve Boss's work and constraints; do not discard changes or rewrite history without explicit Boss authorization;
- establish that replay cannot duplicate an external effect before declaring ready; repository receipts alone do not establish this;
- do not perform remaining specialist steps, invent outcomes, change session records or effect evidence, or choose another machine state;
- return exactly `{status:'ready'|'blocked',summary:<nonempty text>}` describing the preparation or remaining blocker.

A host without cancellation shall not offer or start preparation.
The call shall use no durable Captain or player conversation token, publish no returned token, make no corrective or transport retry, and receive a cancellation signal with a 150-second preparation limit starting after the working stack is saved; expiry shall cancel and drain the host turn and its admitted calls, while removing the deadline before the subsequent specialist step.
A failed, aborted, malformed, or blocked result shall leave the leaf parked and attribute its outcome to recovery, preserving earlier action outcomes and accumulated counts [[playbook-captain-20](playbook-captain.md#playbook-captain-20)] [[playbook-captain-35](playbook-captain.md#playbook-captain-35)].

### recovery-8

After a successful preparation, the shell shall release its repository claim, re-read the same leaf's recovery offer, and continue exactly once only if its continuation still matches: deliver the original Boss text for `reply`, or apply the currently advertised runtime action through its ordinary receipt path [[playbook-captain-8](playbook-captain.md#playbook-captain-8)].
Preparation shall grant no bypass of unresolved-effect reconciliation [[playbook-runtime-79](playbook-runtime.md#playbook-runtime-79)].
The preparation and continuation shall settle as one `recover` turn through the durable uncertainty boundary [[playbook-cli-23](playbook-cli.md#playbook-cli-23)]; process loss shall require reporting before Boss chooses further work [[recovery-27](#recovery-27)].

### recovery-10

While the failed invocation checkpoint identifies exactly one owned standalone boundary with a complete single-commit receipt, saved nonempty player text, no spent correction budget, and either no semantic candidate or an already resolved one, the runtime shall advertise `retry:adjudication` as `Retry assessment of the saved result`, provided no other unresolved boundary or retained or deferred fence exists.
The action shall adjudicate the saved text once through the ordinary tool-free judge only when its semantic candidate is missing, require that candidate to reconcile as resolved against the existing receipt, and durably append every valid candidate without replacing physical evidence, including a candidate that remains unresolved.
A blocked candidate shall replace the old failure explanation, remain unresolved and remove the saved-assessment retry; it shall authorize no invented transition [[playbook-runtime-10](playbook-runtime.md#playbook-runtime-10)].
It shall then deliver the acknowledged result to the checkpoint's invocation through ordinary reconstruction, without calling the player or creating another physical boundary; a failed judgment shall leave the invocation parked, and restoration after acknowledgement shall consume the saved resolved candidate without another judge call.

### recovery-12

While a failed invocation has exactly one owned standalone read-only boundary after its checkpoint, with a complete receipt and unchanged HEAD, the runtime shall offer preparation to restore the original repository and retry that invocation, provided repository observation and exclusive acquisition are available and no other unresolved, deferred, or retained work exists.
The action shall be `retry:restored-step`, labeled `Restore the repository and retry the read-only step`.
When that action runs, the runtime shall hold the repository claim, verify that the current observation equals the boundary's original baseline exactly, and append immutable optional `restored` evidence equal to that baseline before replay and recheck that baseline under the next player call’s claim; a mismatch shall start no player and preserve the paused step.
The recheck shall be confined to that attempt; after a successful check, the runtime shall capture a fresh invocation checkpoint before calling the player [[recovery-1](#recovery-1)].
The boundary's original receipt and semantic evidence shall remain unchanged; restoration shall exclude that boundary from unresolved-work blocking and authorize replay only, never acceptance of its old result.
The effect-ledger validators shall reject restoration on a writable, cohort, deferred, incomplete, or commit-moving boundary, and reject replacement or removal of existing restoration evidence [[playbook-runtime-69](playbook-runtime.md#playbook-runtime-69)].

### recovery-14

After a start, resume, switch, answer, or runtime action leaves a recoverable leaf, the host shall attempt the same preparation-and-continuation operation without another Boss turn, at most twice per turn and once for the same leaf, recovery offer, and failure.
A blocked preparation, cancellation, unavailable offer, or unsuccessful continuation shall end automatic recovery; a conversation-only request or explicit stop shall trigger none.
For a pending question, the host shall first make one fresh tool-free check on the same serialized Captain queue, without a repository claim or recovery point, using the hidden-control envelope of [[playbook-captain-31](playbook-captain.md#playbook-captain-31)].
The root frame shall retain its exact handed-off request as optional nonempty `request`, through capture, restore and adoption; the root shall also retain optional `inputs`, an array of nonempty exact texts subsequently delivered to this engagement, while a child shall carry neither member; older snapshots omitting them remain valid.
The check shall receive only that request as `{label:"Current engagement request",instruction:<exact request>}`, or an empty list when no request was saved or that exact request has already been delivered again.
Later delivered Boss input and the current turn instruction, excluding the entire turn that started that task even after automatic preparation, shall be provided as context that cannot be selected; when any bears on the question, the check shall return null rather than override it with the original request.
It shall return exactly `{instructionIndex:null}` for missing input, or `{instructionIndex:N}` selecting an in-range integer index; an absent, out-of-range, malformed, or failed selection shall preserve the original question and outcome without claiming blocked preparation.
A previous answer or another engagement's task shall not be a candidate.
A selected instruction shall be delivered exactly; the live outcome and Captain's closing reply shall record the asker, question and instruction reused, while interrupted reporting derives only saved evidence [[recovery-18](#recovery-18)].
A selected existing instruction may be delivered once under the same continuation checks [[recovery-8](#recovery-8)]; a missing product decision, new authority, or contradictory or missing workflow transition shall be explained to Boss without inventing an answer, transition, or completion.

### recovery-16

When an unexpected child-runtime exception or cancellation after delivery of its initial request leaves an exportable parked leaf, the host shall preserve that leaf and its suspended parents for a later valid reply or recovery instead of treating the exception as an authored completed child result; initialization, visibility and pre-delivery failures shall retain ordinary child disposal [[playbook-runtime-45](playbook-runtime.md#playbook-runtime-45)].

### recovery-18

Before external work, a durable host shall atomically save the uncertain attempt's progress as exactly `{snapshot,steps}` ([DR-070](../decisions/070-durable-step-progress.md)):

- `snapshot` is the runtime-owned full working stack, or `null` when a frame cannot represent its position; the shell joins parent/child identities without interpreting machine context;
- the snapshot retains the preceding settled Captain, journal and sequences, the current ledger, player ledger, issued identities, and accepted runtime input;
- `steps` contains unique UUID starts with exactly `id`, `kind:'player'|'captain'|'script'|'preparation'`, `stateId`, `runtimeSessionId`, `playbookId`, and optional JSON `result`; a result requires its start, identities never change, and an acknowledged result is immutable;
- preparation saves its parked position before tools; custom runtime calls without a supplied position record starts and results with an unavailable position;
- a result save does not move the saved position; after work drains, an optional save advances to the actual stopped stack or completed root without changing the action result on failure;
- pending retention changes and progress save together; the record remains token-free [[session-storage-7](session-storage.md#session-storage-7)]; all lease writes serialize;
- required save failure stops further work; atomic write loss preserves either the previous complete record or the next complete record;
- discard refuses any saved progress, and retry never chooses discard automatically.

When reporting interrupted work, the host shall derive repository changes and carried Boss edits from the authoritative ledger, preserve pending questions, and omit nonessential saved-count reports; it shall store no continuation selection or copied report.

### recovery-20

When a turn throws while progress exists, after admitted calls drain the shared host shall settle its current exportable stack and acknowledged evidence before disposal, preserving completed results and preparation edits and allowing a new Boss instruction [[playbook-cli-23](playbook-cli.md#playbook-cli-23)].
Settlement failure shall preserve the original failure, attempt safe disposal, and retain uncertainty; process loss shall retain acknowledged progress [[recovery-18](#recovery-18)].

### recovery-21

When a stopped turn settles under [[recovery-20](#recovery-20)], the interactive pane shall remain open, headless failure shall explain that work is saved, and SDK disposal shall await settlement and its reporting.
The notice and callbacks shall identify only the current admitted attempt, never a prior settlement or a turn that was not admitted.

### recovery-22

When an application opens a controller with `mode:'recover'`, its asynchronous `recover()` shall restore and report the uncertain attempt without new input or execution [[recovery-27](#recovery-27)]; `recover(input)` for a settled pause shall require nonempty Boss text and route it through an ordinary Captain turn.
Busy or closing controllers shall reject with that state first.
A live controller newly left uncertain shall require disposal and explicit reopening with `mode:'recover'` before further input or recovery.

### recovery-27

When explicit uncertain retry opens an interrupted attempt, the shared host shall restore and report only, never automatically repeat work or run preparation, even when receipts show no repository change ([DR-070](../decisions/070-durable-step-progress.md)):

- reconstruct incomplete receipts and require monotonic ledger evidence before restoration; a failed check retains uncertainty [[playbook-cli-23](playbook-cli.md#playbook-cli-23)];
- restore a saved supported stack with the current ledger, attaching a completed result only to its exact step, runtime, playbook and source identity;
- absent a supported position, restore Captain conversation in chat, preserve files and records, and clear only retained generations containing current or adopted-source identities owning the attempt's changed evidence or steps;
- admit the recorded attempt and report through the shell without a Captain decision, player, script or preparation call; the Captain conversation shall catch up on its next ordinary turn;
- report changed boundaries and logical operations in ledger order, counting logical chains once, through the bounded evidence projection [[playbook-captain-58](playbook-captain.md#playbook-captain-58)];
- explain the restored position or lost-position limit, publish available controls, and require Boss to check outside actions and stop any surviving worker before repeating unfinished work;
- only a later explicit Boss input or action may continue; a second crash follows the same rule.

A missing result shall mean unfinished work, never evidence of no effect; a repository observation shall not prove that an outside action did not occur or that a worker has stopped.

## Verification

### recovery-19

When integration tests interrupt preparation, they shall reopen the store and report without rerunning tools, preserve the exact leaf and parents, refuse discard, strip provider hints, and block tools after a refused start save [[recovery-18](#recovery-18)] [[recovery-27](#recovery-27)].

### recovery-23

When integration tests cancel or fail a turn with saved progress, they shall verify drained settlement through CLI, interactive and SDK, including immediate disposal, completed results and retained-root changes surviving closing cancellation, mandatory carried-changes reports, settlement failure preserving both errors, and no report of an earlier attempt [[recovery-20](#recovery-20)] [[recovery-21](#recovery-21)].

### recovery-24

When system tests kill real hosts during ordinary and nested player or script work, before receipts, before and after atomic publication, during preparation, after completion and during recovery, they shall verify no calls on reopen or reporting, accepted input preservation, reuse of saved outputs without duplicated effects, and mandatory change reports without copied counts [[recovery-1](#recovery-1)] [[recovery-18](#recovery-18)] [[recovery-27](#recovery-27)].

### recovery-28

When system tests kill a root or nested bespoke runtime with parallel work and no supported position, they shall verify preserved commits and evidence, no stale runtime or player execution, and an explained safe exit to Captain [[recovery-27](#recovery-27)].
The bounded protocol model shall expose missing positions in the former protocol and pass the new protocol across two crashes, surviving workers, atomic writes, nesting, parallel work, scripts, preparation and cancellation; real process tests shall exercise the corresponding implementation boundaries [[recovery-18](#recovery-18)].

### recovery-25

When integration tests validate progress, they shall isolate controller, journal, identity, current-ledger and immutable-result checks with otherwise-valid snapshots and verify that failed optional stopped-position saves preserve the action result [[recovery-18](#recovery-18)].

### recovery-26

When integration tests use SDK recovery, they shall verify rejection of new input before uncertain recovery, ordinary routing of a settled pause's answer and a busy-controller rejection before uncertainty guidance and an explicit reopen instruction for any live controller newly left uncertain [[recovery-22](#recovery-22)].

### recovery-4

When integration tests fail a later invocation after an earlier one succeeds, they shall verify that a live and a JSON-round-tripped restored runtime advertise and retry only the failed invocation with its original context [[recovery-1](#recovery-1)] [[recovery-3](#recovery-3)], that restoring makes no calls, and that malformed or incompatible checkpoints fail before execution [[recovery-2](#recovery-2)].
Tests shall verify that a completed earlier commit does not block an unchanged failed invocation's retry, while a changed, incomplete, foreign, or unresolved boundary after its checkpoint does [[recovery-3](#recovery-3)].

### recovery-9

When integration tests recover an interrupted real leaf through the Captain session host, they shall verify that only an advertised offer exposes preparation context [[recovery-5](#recovery-5)], explicit repair intent selects recovery while ordinary answers retain exact delivery [[recovery-6](#recovery-6)], and one isolated preparation call repairs an actual prerequisite under the worktree claim without changing routing-call permissions [[recovery-7](#recovery-7)].
The tests shall verify that model-selected ready preparation continues the same restored leaf once, its prompt requires missing Boss choices to block before tools, while blocked, malformed, aborted, stale, and unresolved cases remain parked with a truthful settlement [[recovery-8](#recovery-8)].

### recovery-11

When integration tests interrupt adjudication after a real commit, they shall verify that live and restored runtimes recover the saved result with one judge call, preserve the commit and receipt, run no duplicate player call, retain valid unresolved candidates without continuing, reject malformed candidates, and continue from an acknowledged candidate after interrupted delivery [[recovery-10](#recovery-10)].

### recovery-13

When a real read-only invocation creates an unexpected file after an earlier committed step, the integration suite shall verify that live and restored sessions reject retry before exact restoration, then append restoration evidence and rerun only the interrupted invocation, preserve the earlier commit and original receipt, and never accept the old failed result [[recovery-12](#recovery-12)].
Otherwise-valid commit-moving, writable changed and unchanged, incomplete, ambiguous, two-member cohort and logical-operation ledgers shall fail only after restoration evidence is added; a successful restoration shall refresh the checkpoint [[recovery-12](#recovery-12)].

### recovery-15

When the real Captain host encounters an interrupted step or pending question, the integration suite shall verify bounded automatic repair, exact task-input reuse from the current root after restore or adoption, truthful automatic-answer reporting, rejected malformed, out-of-range and failed question checks, the two-attempt bound, no repeated automatic delivery of the root request, later Boss input as nonselectable context, quoted-question protection, empty candidates for old snapshots, invalid root and child request/input fields, exact action attribution, no recovery on chat or cancellation, and a specific blocked explanation for missing Boss input or an unavailable transition [[recovery-14](#recovery-14)]; preparation timeout shall leave the step paused without timing out later specialist work [[recovery-7](#recovery-7)].

### recovery-17

When a nested runtime throws while preserving an exportable parked state, the integration suite shall verify that its caller remains suspended and the same leaf can continue after repair, while an ordinary pre-delivery error disposes even an otherwise exportable child [[recovery-16](#recovery-16)].
Cancellation before initial delivery shall dispose the child; cancellation during its initial and later real player calls shall preserve that child under its suspended parent with an available recovery action [[recovery-16](#recovery-16)].
