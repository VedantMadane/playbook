<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# recovery: Prepare and resume interrupted work

## Intent

Let Boss authorize Captain to prepare an interrupted leaf's prerequisites and continue at its runtime-owned step, preserving completed work ([DR-066](../decisions/066-captain-prepares-step-recovery.md)).

## External Behavior

### recovery-1

Before starting a player or direct-Captain invocation, the shared runtime shall capture a detached invocation checkpoint containing its source state, complete composed prompt, persisted machine, and current effect-ledger boundary prefix.
While parked in `failed` or waiting for a Boss answer, the runtime shall export that checkpoint as optional `recoveryCheckpoint` in its durable snapshot and restore it without executing the invocation [[playbook-runtime-45](playbook-runtime.md#playbook-runtime-45)].
A machine whose context cannot be captured as JSON shall remain executable without a checkpoint.
The checkpoint shall be replaced by the next invocation and omitted from snapshots in other states.

### recovery-2

When validating a recovery checkpoint, the runtime shall require exactly `stateId`, `prompt`, `machine`, and `boundaryPrefix`, with nonempty strings, a JSON machine snapshot active at that source state, and a nonnegative ledger prefix not exceeding the current boundary count.
Runtime restoration shall additionally require that the checkpoint names a current player or direct-Captain invocation and that its persisted invocation belongs to the declared actor at that state with matching `input.stateId`.
An invalid checkpoint shall reject restoration before any actor starts.

### recovery-3

While a failed runtime holds a valid invocation checkpoint and has no unresolved-effect fence, when every ledger boundary after the checkpoint prefix is owned by that runtime and carries a complete `unchanged` receipt or a verified read-only restoration [[recovery-12](#recovery-12)], the runtime shall advertise a step retry labeled from the interrupted state's description, retaining `retry:<ENTRY_EVENT>` when that entry targets the same state and using `retry:step` otherwise, in preference to its entry-event retry [[playbook-runtime-52](playbook-runtime.md#playbook-runtime-52)].
Applying that action shall rebuild only the leaf actor from its checkpoint, preserving the session identity, counters, player continuity, original invocation input, and completed predecessor context, then drive it to settlement through the ordinary receipt contract [[playbook-runtime-52](playbook-runtime.md#playbook-runtime-52)].
A missing checkpoint shall preserve the existing retry behavior; an unsafe checkpoint shall authorize no step replay.

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
The preparation and continuation shall settle as one `recover` turn through the existing durable turn and uncertainty boundary [[playbook-cli-23](playbook-cli.md#playbook-cli-23)], with an interrupted preparation resumed only from its saved working stack [[recovery-18](#recovery-18)].

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
A selected instruction shall become the continuation point's exact instruction; the outcome shall record the asker, full question and exact reused instruction, and Captain's closing reply shall briefly name the asker, question and instruction reused, including after retry ([DR-068](../decisions/068-interrupted-continuation-settlement.md)).
A selected existing instruction may be delivered once under the same continuation checks [[recovery-8](#recovery-8)]; a missing product decision, new authority, or contradictory or missing workflow transition shall be explained to Boss without inventing an answer, transition, or completion.

### recovery-16

When an unexpected child-runtime exception or cancellation after delivery of its initial request leaves an exportable parked leaf, the host shall preserve that leaf and its suspended parents for a later valid reply or recovery instead of treating the exception as an authored completed child result; initialization, visibility and pre-delivery failures shall retain ordinary child disposal [[playbook-runtime-45](playbook-runtime.md#playbook-runtime-45)].

### recovery-18

Before Captain uses preparation tools, and before any saved-assessment or verified-restoration action changes earlier evidence, a durable host shall save the parked working stack, current effect ledger and exact instruction as the uncertain attempt's recovery point [[playbook-cli-23](playbook-cli.md#playbook-cli-23)]:

- the exact point has `snapshot`, `instruction`, and optional `continuation` of `{kind:'reply'}`, `{kind:'runtime',actionId}`, or `{kind:'settle',status:'ok'|'failed'|'rejected',settlement?}`, each allowing optional nonempty-string-array `facts`; it retains the last settled controller, journal and sequences, while replay retains the attempted input;
- a required save fails before tools or continuation and excludes provider hints [[session-storage-7](session-storage.md#session-storage-7)];
- preparation saves a point without `continuation`; immediately before dispatch it replaces that point with the current parked stack, selected continuation and truthful explanation;
- after the continuation stops, the host shall attempt to advance the point to that actual stack or completed root, acknowledged ledger and `settle` continuation containing the full pending settlement; failure of this optional save shall not alter the action's result;
- retry arms point tracking, restores the saved stack and selects preparation, the recorded continuation, or reporting only for `settle`, without repeating the original routing action or completed preparation or adding an automatic recovery loop;
- unrepresentable later progress shall follow the shared host decision [[recovery-27](#recovery-27)], without adding runtime fields;
- saved assessment/restoration may consume its own monotonic evidence changes without repeating the player [[playbook-runtime-69](playbook-runtime.md#playbook-runtime-69)];
- a vanished continuation shall settle a rejected turn through the ordinary controller path, never fail host setup [[playbook-captain-7](playbook-captain.md#playbook-captain-7)];
- discard refuses a saved point because it preserves work from the attempted turn; retry never chooses discard automatically.

The optional closed `settlement` shall contain `retentionUpdates` and `unresolvedEffects` using the ordinary settlement validators [[playbook-captain-41](playbook-captain.md#playbook-captain-41)], and optional `report` and nonempty `presentation` text.
The closed report shall contain `status` matching the continuation, string-array `facts`, exact nonnegative-integer `counts:{interruptions,copyPastes}`, nonempty `progressPhrase`, and nonnegative-integer `progressRounds`, with optional string `playbookId`, string-array `bossFacts`, ordinary compact control `receipt`, string `leafStateSummary`, and string `savedLine` [[playbook-captain-20](playbook-captain.md#playbook-captain-20)].
The saved data shall be detached and token-free, restore retention updates before settlement, retain mandatory unresolved-effect and carried-changes reports, and preserve the computed status when only the closing reply is cancelled; cancellation before an action computes its outcome shall save `settle(failed)` after calls drain.
A saved selection shall be armed only after reconciliation and shall execute only after durable turn admission, without invented Boss input [[playbook-captain-7](playbook-captain.md#playbook-captain-7)].

### recovery-20

When a turn throws while a recovery point exists, after admitted calls drain the shared durable host shall settle its current exportable stack and acknowledged effect evidence before disposal, preserving completed work and preparation edits and allowing a new Boss instruction [[playbook-cli-23](playbook-cli.md#playbook-cli-23)].
A settlement failure shall preserve the original turn failure, still attempt safe disposal, and retain uncertainty; a process loss before settlement shall retain the point [[recovery-18](#recovery-18)].

### recovery-21

When a stopped turn settles under [[recovery-20](#recovery-20)], the interactive pane shall remain open, headless failure shall explain that work is saved, and SDK disposal shall await settlement and its reporting.
The notice and callbacks shall identify only the current admitted attempt, never a prior settlement or a turn that was not admitted.

### recovery-22

When an application uses the shared host, its asynchronous `recover()` on a controller opened with `mode:'recover'` shall retry a recorded uncertain instruction without new input, while `recover(input)` for a settled pause shall require nonempty Boss text and route it through the ordinary Captain turn.
Busy or closing controllers shall reject calls with that state before inspecting uncertainty.
If any live controller later becomes uncertain, ordinary input, retry, and recovery calls shall require disposal and reopening with `mode:'recover'` explicitly before retry ([DR-068](../decisions/068-interrupted-continuation-settlement.md)).

### recovery-27

When explicit uncertain retry finds ledger progress beyond a saved dispatched point or failed attempt, or progress that disallows ordinary whole-turn replay, the shared host shall settle the interrupted attempt without restoring its old workflow stack ([DR-069](../decisions/069-host-owned-interrupted-work-settlement.md)):

- first reconstruct incomplete receipts and require a monotonic ledger extension; reconstruction or validation failure keeps uncertainty [[playbook-cli-23](playbook-cli.md#playbook-cli-23)];
- preserve the saved-assessment and restoration exceptions [[recovery-18](#recovery-18)];
- apply this rule to both chat and parked snapshots, with or without a saved point, independently of runtime implementation;
- restore only the saved Captain conversation in chat and admit the recorded attempt before reporting a failed turn, never deliver a player request, replay an action, invent a runtime marker, or claim workflow completion;
- project changed or appended physical boundaries and changed logical operations, in ledger order with logical chains counted once, through the ordinary bounded unresolved-effect projection [[playbook-captain-58](playbook-captain.md#playbook-captain-58)], including an empty list when all work was unchanged;
- clear only retained generations containing a current or adopted-source runtime identity owning that changed evidence, keep every other generation unchanged, and atomically save those changes with the full authoritative ledger and report [[playbook-cli-23](playbook-cli.md#playbook-cli-23)];
- explain that the exact stopping point was lost, files and recorded evidence remain, and Boss should check the work before starting another attempt; attribute no unknown work to a saved workflow;
- an unchanged ledger shall use the recorded continuation or ordinary whole-turn replay, even after a prior lost-progress settlement; the presence of old recovery evidence alone shall not replace later Boss input.

## Verification

### recovery-19

When integration tests kill preparation before it returns and separately cancel preparation with drained settlement, they shall reopen the real store, resume only the killed preparation, report the cancelled preparation without rerunning it, and verify that the parent is not restarted, discard is refused, provider hints are absent and failed point writes prevent tool use [[recovery-18](#recovery-18)].

### recovery-23

When integration tests cancel or fail a turn with a saved point, they shall verify shared settlement through CLI, interactive and SDK entry points, including abort followed immediately by disposal, completed status and retained-root clears surviving cancellation during closing, saved counts and carried-changes reports, a failed settlement preserving both errors and a later pre-Captain failure that cannot report a prior saved result [[recovery-20](#recovery-20)] [[recovery-21](#recovery-21)].

### recovery-24

When integration tests advance past assessment, step retry and restoration into a child, they shall verify saved reporting-only recovery followed by a new instruction continuing that child, retained source ownership permitting assessment evidence, and a vanished saved action becoming a rejected turn [[recovery-18](#recovery-18)].
Tests shall kill a real process without abort cleanup during unchanged and committed work, a whole-turn runtime retry, a repeated retry and a completed root's reply, then verify that reporting-only and lost-progress settlement repeat no player calls or commits, while an eligible whole-turn replay retains its stated replay behavior [[recovery-18](#recovery-18)] [[recovery-27](#recovery-27)].

### recovery-28

When the process-loss suite kills real hosts from chat, inside nested stacks including a bespoke runtime, before a receipt write, during a retry, and after switching to another root, it shall verify that lost-progress settlement preserves commits and evidence without player replay, starts no stale runtime, keeps unrelated retained generations, and leaves the session ready for new Boss input [[recovery-27](#recovery-27)].
The suite shall verify that a retried continuation saves its next reporting point and that restored automatic-answer reporting preserves the exact reused instruction [[recovery-18](#recovery-18)] [[recovery-14](#recovery-14)].

### recovery-25

When integration tests validate saved points, they shall isolate controller, journal, parked-state and current-ledger checks with otherwise-valid snapshots and verify that failed optional saves preserve the action result [[recovery-18](#recovery-18)].

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
