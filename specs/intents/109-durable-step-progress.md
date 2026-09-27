<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# IR-109: Durable step progress

## Status

Implemented and verified on `codex/captain-recovery`; not merged.

## Intent

Replace special recovery points with saved normal progress, including scripts and preparation, and require a Boss choice after a crash.

## Deliverables

- [x] Model the protocol and reproduce current gaps.
- [x] Implement a smaller shared progress protocol and delete replaced mechanisms.
- [x] Verify real crashes, SDK/CLI behavior, saved results and unsupported runtimes.
- [x] Align specs, record results and commit without merging.

## Tasks

1. Model, prototype and implement durable step progress with its tests and specifications.

## Verification

- The initial protocol model reported 33,534 passing states across seven scenarios and five failures in an alleged former protocol. Subsequent review found missing states and an inaccurate historical comparison; those results do not establish the original acceptance claim. The checked-in replacement is a bounded policy model with deliberate mutations and separate real process tests.
- Real process tests: 15 durable-progress cases plus root/nested DECIDE pass, covering player and script completion, missing receipts/results, atomic publication, preparation, completed roots, carried Boss edits, accepted answers, pending questions, a second crash, CLI recovery and an explicit Boss choice to repeat an unfinished script.
- Runtime script tests: saved-result consumption, lost acknowledgement and rejected start save pass without duplicate execution.
- Full non-live suite initially reported 2,153 passes, 13 failures and 23 skips. The failures exposed two regressions (control-error propagation and lease-release admission), obsolete retry expectations, and stale package/doc checks; all were fixed and their affected suites passed. A later preparation-save test was updated to assert the new stop-on-save-failure contract and passed.
- Final affected runs: 752 passes before the final save-stop change; then 636 passes with only the subsequently corrected archive check and save-failure expectation failing. Their targeted reruns passed. The release-capability/archive run passed 87 tests with one optional historical experiment skipped.
- Live Claude Opus 5.5 / GPT-5.6 Sol acceptance passed with injected player transport failure: Captain prepared `.runtime/ready`, retried only the second step, kept the first commit, and left a clean tracked tree. The initial sandbox run could not access provider state; the next run exposed the SDK's old Claude executable. Using the installed Claude 2.1.282 resolved that setup issue.
- TypeScript build passed against the declared published Cligent 0.26 dependency; the original local dependency link is restored afterward. Spec lint: zero errors, 277 sentence-review warnings. Relative-link validation passed.
- Production source shrinks by 129 lines and 3,460 non-whitespace characters, excluding generated files and tests; removed `reply/runtime/settle` saved selections, report validators, `saveStoppedPoint`, whole-turn reconciliation and the shared runtime's whole-playbook retry fallback. The optional legacy entry-context field remains accepted but ignored.
- SDK and CLI use the same host. SLC and Spex need no source changes for this shared-host implementation; no package was released, no branch was merged and no historical commit was rewritten.

Logs for this run are under `/private/tmp/durable-*`; the live evidence is `/var/folders/_r/s32qffsx21g__4nzbx4p6q940000gn/T/captain-recovery-live-3nmVkS`.
