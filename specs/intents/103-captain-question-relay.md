<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# IR-103: Captain question relay

## Status

Completed on `codex/captain-recovery`; not merged or released.

## Intent

Make playbooks usable through Captain alone under [DR-070](../decisions/070-captain-relays-player-questions.md).

## Deliverables

- [x] Complete question evidence and clear Captain replies.
- [x] Desktop input only between turns, with clarification preserving the pause.
- [x] Integration and real-provider verification.

## Tasks

1. Implement and verify the shared question relay and default Captain wording.
2. Correct host input and question presentation, then verify the complete conversation.

## Verification

Ask a long question whose last sentence changes the choice, discuss it through Captain, reopen the session, answer, and finish without reading player output.
Check parallel questions and busy input, then run builds, spec lint, and relevant integration suites.
Keep changes on feature branches; do not merge or release.

Verified 2,095 standard tests in aggregate after correcting the link-definition hash expectation, plus 86 dependency checks; the final affected Captain suites passed 400 tests.
Build, documentation links, and spec lint passed with 272 advisory warnings and no errors.
Tests used the declared Cligent 0.26 dependency; the original local dependency link was restored afterward.
Claude Opus 5.5 and GPT-5.6 Sol completed the question, Captain clarification, session reopen, player follow-up, and final answer using Captain replies alone.
The live check exposed an unnecessary retry of an unanswered choice; preparation now checks for missing Boss decisions first, and the repeated run passed.
A separate real-agent run verified generated-file cleanup and continuation without repeating the earlier commit.
Spex verified 727 UI tests, 337 core tests, and eight Chromium session journeys, including busy input and clarification before answering.
The Playbook and Spex changes must ship together.
