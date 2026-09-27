<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# IR-110: Close the durable recovery review

## Status

Implemented and verified on `codex/captain-recovery`; not merged.

## Intent

Resolve round 6 while preserving simple restore, report and explicit continuation.

## Deliverables

- [x] Distinguish no work, interrupted work and completed work.
- [x] Keep interrupted continuation explicit across later turns.
- [x] Preserve truthful reports, child cancellation and player visibility.
- [x] Automate the bounded model and cover the missing real crash cases.
- [x] Align current specs, public contracts, operator text and changelog.

## Tasks

1. Address the review in one new commit with both requested AI credits.

## Verification

- The final focused run passed 445 tests; three later completion and selected-answer checks passed after the last reporting change.
- After the final full-attempt safety correction, 296 affected runtime and host tests passed, and all 27 real crash/cancellation cases passed across the final run and targeted additions.
- The model checked 63,376 states in nine scenarios and rejected eight deliberate rule violations; its Vitest wrapper passed.
- The broad non-live run passed 2,167 tests with 23 skipped; its five failures were corrected and verified in the affected runs.
- TypeScript build passed using the declared Cligent 0.26 dependency.
- Spec lint: zero errors and 279 sentence-review warnings. All 3,429 checked relative links in 207 files resolve.
- The review report lists every disposition, rebuttal and relevant run in `docs/reviews/round-6.md`; logs are `/private/tmp/review6-*.log`.
- No merge, release, or history rewrite; no SLC changes.
