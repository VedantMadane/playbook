<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# Decide

Roles:

- Coder
- Reviewer

## Independent proposals

The caller supplies the topic including any specific context.
Coder and Reviewer receive the complete topic concurrently and independently; Captain does not wait for either proposal before requesting the other.
Neither role's player receives the other role's proposal until both proposals are complete.
No transition depends on a fixed presentation format of either player's reply.

### DECIDE-1

Parallel group: independent-proposals

When the caller gives a topic, or when a Boss interrupt during the parallel proposal pair restarts the whole pair so that both players receive the same new topic and remain independent, Captain shall relay the complete topic in quotes to Coder and prompt Coder:

> Assess whether the topic is better expressed as a few spec items under @specs/packages/ or requires one or more DRs under @specs/decisions/.
> Propose your design.
> Keep your proposal coherent, focused, and concise.
> Consult @specs/map.md for relevant context and @specs/meta.md for spec requirements, if needed.
> Do not change any files.
>
> > Original topic: <caller-topic>

Results:
- `proposed`: Coder affirmatively provided a complete design proposal; a progress report, status update, or promise of a later proposal supports no proposal outcome.

### DECIDE-2

Parallel group: independent-proposals

When the caller gives a topic, or when a Boss interrupt during the parallel proposal pair restarts the whole pair so that both players receive the same new topic and remain independent, Captain shall relay the complete topic in quotes to Reviewer and prompt Reviewer:

> Assess whether the topic is better expressed as a few spec items under @specs/packages/ or requires one or more DRs under @specs/decisions/.
> Propose your design.
> Keep your proposal coherent, focused, and concise.
> Consult @specs/map.md for relevant context and @specs/meta.md for spec requirements, if needed.
> Do not change any files.
>
> > Original topic: <caller-topic>

Results:
- `proposed`: Reviewer affirmatively provided a complete design proposal; a progress report, status update, or promise of a later proposal supports no proposal outcome. Output shall include `reviewerProposal: <verbatim final text>`.

## Synthesize and commit

### DECIDE-3

Captain uses the repository-effect receipt as the authoritative identity of Coder's new `decide`-owned commit.

When both proposals are complete, Captain shall relay the complete topic and Reviewer's complete proposal to Coder under their own labels in quotes and prompt Coder:

> Synthesize your independent proposal with Reviewer's proposal below.
> Keep to the original topic below and follow what it asks.
> Keep the best, essential parts of either proposal and reject any point that is unsound, unnecessary, or outside the topic.
> Turn the resulting design into the necessary DRs and/or spec items.
> Follow @specs/meta.md and update @specs/map.md when needed.
> Do not change code or implement the design.
>
> Commit the result as one new commit, following @specs/packages/git.md.
> Make the commit message explain concisely what changed and why.
> Identify every new commit you make.
> Credit every AI that contributed to this commit: Coder <coder-llm> and Reviewer <reviewer-llm>, whose proposal it carries.
>
> > Original topic: <caller-topic>
> > Reviewer's independent proposal: <reviewer-proposal>

Results:
- `committed`: Coder committed the synthesized design as one new commit. Output shall include `coderOutput: <verbatim final text>` and `latestCommit: <commit identity>`.

## Review

### DECIDE-4

When Coder has committed, Captain shall call playbook `review`:

> > Original intent: <caller-topic>
> > Review scope: the `decide`-owned commit <decide-commit> and its resulting repository state.
> > Coder output: <coder-output>

`decide` is complete only when `review` returns a result that applies to the supplied review scope, gives the exact evaluated repository revision, and affirmatively establishes that no unsettled findings remain; `decide` shall then return the `decide`-owned commit and that evaluated revision to its caller.
When `review` returns an authored abort or failure, or a terminal result that does not establish those facts, `decide` shall report the failure and the last `decide`-owned commit to its caller.
When the nested `review` call fails outside that authored result contract, `decide` shall park as failed and retain the control-plane error instead of reporting an authored review outcome.

## Prefixed prompts

- DECIDE-1: relays → tail
- DECIDE-2: relays → tail
