<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-074: Seeds Name the Latest Models

## Status

Accepted (2026-09-28).
Amends [DR-053](053-seeding-picks-a-ready-adapter.md) in one scope: model currency, which that record left out of scope, becomes a maintained property of its fixed per-adapter table; selection, precedence, efforts, and the none-ready notice stand.
Amends [DR-044](044-dev-planning-workflow.md) in one scope: the seeded `dev.analyst` player takes its adapter's current seeded model rather than `claude-opus-5`; the player, its binding, and everything else of that record stand.

## Context

The starter's seed table named `claude-opus-5` for `claude` and `gpt-5.6-sol` for `codex`, and the documentation's examples, the live acceptance gate's Codex defaults, and the CI acceptance configuration named these models or older ones.
Both lines have a newer model: Claude Opus 5.5 (`claude-opus-5-5`) and GPT-6 Sol (`gpt-6-sol`).
[DR-053](053-seeding-picks-a-ready-adapter.md) left model currency out of scope and accepted that a seeded model goes stale.
A seed is what a new user runs first and an example is what a reader copies, so a stale name there puts the first run and the documented path on a superseded model.

What held the seed at `claude-opus-5` is a rule the seed keeps: a seeded starter runs on every install Playbook supports.
Which runtime version serves which model is Cligent's knowledge, not Playbook's ([DR-027](027-runtime-compatibility-from-cligent.md)).
Cligent's runtime floors are the lowest versions serving every model its declared behavior depends on, and the launch gate refuses a runtime below them with Cligent's repair ([[playbook-cli-40](../packages/playbook-cli.md#playbook-cli-40)]).
Cligent 0.27's floors serve `claude-opus-5` and the GPT-5.6 routes but neither newer model, so seeding either would install cleanly and could fail the first call on a supported install.
Cligent 0.28.0 raises its Claude floor to the first runtime release serving `claude-opus-5-5` and its Codex floor to the first serving the GPT-6 family.

## Decision

- Every starter, default, or seed configuration and every user-facing example Playbook ships shall name the latest model of its adapter's line — now `claude-opus-5-5` for `claude` and `gpt-6-sol` for `codex`.
  This covers the seeded lineup ([[playbook-cli-11](../packages/playbook-cli.md#playbook-cli-11)]), the documentation's examples, the live acceptance gate's default models, and the CI acceptance configuration.
- Playbook's declared Cligent floor shall rise, where it is older, to the oldest Cligent release whose runtime floors serve every seeded model — for these models, 0.28.0 — so a seeded model and the floor serving it move together and no release seeds a model its Cligent floor does not serve.
  Playbook keeps no runtime-version knowledge of its own; it relies on Cligent's floors as [DR-027](027-runtime-compatibility-from-cligent.md) decided.
- The per-adapter table stays fixed, with the efforts and precedence of [DR-053](053-seeding-picks-a-ready-adapter.md); seeding consults no source of current models.
- Records of past runs — experiment evidence and fixtures captured from runs — keep the models they recorded, and test fixtures that stand for no default keep arbitrary names.

## Consequences

- A fresh install seeds `claude-opus-5-5` or `gpt-6-sol`, as its credentials select, on a runtime the declared Cligent range guarantees can serve it.
- Existing configs are untouched: seeding writes only an absent file, and every seeded value stays tunable in place ([[playbook-cli-6](../packages/playbook-cli.md#playbook-cli-6)]).
- Installs whose agent runtimes predate these models lose support; they meet the launch gate's named repair instead of a failed first call.
- Adopting each newer model is a maintenance change to the seed table, the examples, the gates, and the Cligent floor together, made once a Cligent release's floors serve it.
