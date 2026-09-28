<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# IR-112: Seeds Name the Latest Models

## Status

In progress: the specs, seed, documentation, and gates name the latest models, and every documentation example runs against the default seed; the Cligent floor waits for Cligent 0.28.0 to be published.

## Intent

Realize [DR-074](../decisions/074-seeds-name-the-latest-models.md): every starter, default, and seed configuration and every user-facing example names the latest model of its line — the seed `claude-opus-5-5` for Claude and `gpt-6-sol` for Codex — every example runs as written against the default seed, and Playbook requires the oldest Cligent release whose runtime floors serve the seeded models.

## Deliverables

- [x] DR-074 records the rule with its scoped amendments to DR-053 and DR-044, and the map lists it.
- [x] playbook-cli-11's seed table and playbook-cli-13's seeding matrix name the latest models.
- [x] The seed lineup, starter template, seeding tests, documentation examples, live acceptance defaults, and CI acceptance config name them, with a changelog entry.
- [ ] `@sublang/cligent` rises to `^0.28.0`, with release-14 naming that floor as the one serving the seeded models and release-19 checking it.
- [x] Each example in the documentation and README names a model of the adapter its player runs on and runs as written against the default seed.

## Tasks

1. [x] Record DR-074 with its reciprocal DR-053 and DR-044 links and map row, and amend playbook-cli-11 and -13.
2. [x] Move the seed lineup, template, tests, docs, live acceptance defaults, and CI acceptance config to the latest models, and add the changelog entry.
3. [ ] Once Cligent 0.28.0 is published, require `^0.28.0` with a refreshed lockfile, amend release-14 and release-19 for that floor, and add its changelog entry.
4. [x] Retune the Claude-seeded `dev.coder` within its adapter in the role-override and `--with` overlay examples, give the Codex `review.coder` example the grant it needs to commit, record the rule in DR-074, and add the changelog fix.

## Verification

- Task 1 (2026-09-28): `spex lint` reported 0 errors.
- Task 2 (2026-09-28): `pnpm build` left every committed `.js` and `.d.ts` sibling unchanged.
  Under Node 22, as CI runs it, `pnpm test` passed: `spex lint` 0 errors, 2,560 tests passed and 23 skipped, and the Cligent release-capability suite 86 of 86.
  Under the local Node 25 the only failure was `src/fsm-scaffolding.test.ts`'s typed-XState refusal case, whose `rmSync` of a directory symlink Node 25 rejects; it passes under Node 22, and nothing here touches it.
  The two changed seeding suites also passed under Node 20.
- Driving the real CLI's `--list` under isolated homes seeded `claude-opus-5-5` for Claude credentials, `gpt-6-sol` with the `.git` grant for Codex credentials, and `claude-opus-5-5` with the none-ready notice for neither.
- `pnpm check:links` resolved all 3,803 relative links, and the SPDX check passed.
- The paid live acceptance gate was not run.
  The locked Claude Agent SDK 0.3.283 bundles a Claude Code that names `claude-opus-5-5`, and the locked Codex 0.157.1 binary names `gpt-6-sol`, but neither was exercised against a provider.
- Task 4 (2026-09-28): the guide's role-override, `review.coder`, and `fast-lineup.yaml` fences, read from the shipped text and applied as `--with` overlays over a freshly seeded Claude default, passed the real launch plan and Cligent's own `loadTmuxPlayConfig`.
  They yielded `dev.coder` on `claude` / `claude-sonnet-5` at `medium` with fast mode off for the overlay, a CODE `coder` binding to `claude-sonnet-5` at the provider's default effort for the role override, and `review.coder` on `codex` / `gpt-6-sol` with `mode: auto` and the `.git` grant, which needs Codex credentials as any Codex player does.
  The bundled Claude Code names `claude-sonnet-5`; the other examples in the guide, the CLI and embedding guides, and the README already named each model on its own adapter or name none.
  Under Node 22 `pnpm test` passed again (`spex lint` 0 errors; 2,560 passed, 23 skipped; 86 capability checks), and all 3,804 relative links resolve.
