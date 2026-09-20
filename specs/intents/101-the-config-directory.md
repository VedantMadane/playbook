<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# IR-101: The Config Directory

## Status

Complete.

## Intent

Realize [DR-064](../decisions/064-the-config-directory-is-named-config.md): the shared config resolves under `config/`, a launch relocates it from the root's former `playbook/` location ahead of the XDG one, and the emptied former directory goes with the file.

## Deliverables

- [x] DR-064 records the directory, the second former location, and its amendment scope over DR-043.
- [x] The CLI package's resolution, relocation, seeding and relocation-coverage items name `config/` and the two former locations.
- [x] Both front ends resolve and relocate as the items say, with the docs, the README, the release smoke and the changelog following.

## Tasks

1. [x] Record DR-064 with its reciprocal DR-043 link and map row, and amend playbook-cli-3, -85, -13 and -86.
2. [x] Move the resolver and the relocation to `config/` in both front ends, extend the relocation suites, and update the docs, README, release smoke and changelog.

## Verification

- Task 1 (2026-09-20): `spex lint` reported 0 errors.
- Task 2 (2026-09-20): the launcher suites passed 248/248 with the two relocation cases added; `pnpm test` ran `spex lint` with 0 errors and 2013 passing Vitest tests.
- The 5 failures `pnpm test` reports fail identically on the untouched `d7f90fe`: the temp-directory case in `src/fsm-scaffolding.test.ts`, and four source-to-GEARS prompt-contract cases for CODE, REVIEW and DECIDE whose sources that commit edited without an slc recompile.
- `pnpm check:links` passed.
