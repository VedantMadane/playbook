<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# IR-112: Seeds Name the Latest Models

## Status

In progress: the specs name the latest models; the seed, documentation, and gates follow next, and the Cligent floor waits for Cligent 0.28.0 to be published.

## Intent

Realize [DR-074](../decisions/074-seeds-name-the-latest-models.md): every starter, default, and seed configuration and every user-facing example names `claude-opus-5-5` for Claude and `gpt-6-sol` for Codex, and Playbook requires the oldest Cligent release whose runtime floors serve both.

## Deliverables

- [x] DR-074 records the rule with its scoped amendments to DR-053 and DR-044, and the map lists it.
- [x] playbook-cli-11's seed table and playbook-cli-13's seeding matrix name the latest models.
- [ ] The seed lineup, starter template, seeding tests, documentation examples, live acceptance defaults, and CI acceptance config name them, with a changelog entry.
- [ ] `@sublang/cligent` rises to `^0.28.0`, with release-14 naming that floor as the one serving the seeded models and release-19 checking it.

## Tasks

1. [x] Record DR-074 with its reciprocal DR-053 and DR-044 links and map row, and amend playbook-cli-11 and -13.
2. [ ] Move the seed lineup, template, tests, docs, live acceptance defaults, and CI acceptance config to the latest models, and add the changelog entry.
3. [ ] Once Cligent 0.28.0 is published, require `^0.28.0` with a refreshed lockfile, amend release-14 and release-19 for that floor, and add its changelog entry.

## Verification

- Task 1 (2026-09-28): `spex lint` reported 0 errors.
