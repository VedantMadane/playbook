<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# Dev

Roles:

- Analyst

The caller supplies a development request including any desired outcome, scope, and context.

`dev` is an optional repository-aware planner for a development request that needs more analysis before choosing a development path.
It coordinates existing playbooks and owns no repository commit itself.

## Planning

### DEV-1

Analyst chooses the path and states why in a short planning note; analysis, design, and implementation belong to the playbooks `dev` calls, and a question to Boss serves only the choice of path.
The planning result has six semantic outcomes: needs Boss reply, discussion complete, code, decide then code, code via pull request, and decide then code via pull request.
Each outcome requires affirmative support in Analyst's result; absence of a reason to choose another outcome is not support.
No outcome depends on a fixed presentation format of Analyst's reply.
`dev` shall act on the accepted outcome itself and shall not return to the session Captain for another routing decision.
For needs Boss reply, `dev` shall use the standard Boss-question suspension with Analyst's complete response; the session Captain shall present that response to Boss and, after Boss replies, resume `dev` with the answer in the same Analyst conversation, including the previous question only when that conversation must start fresh.

At the start of `dev` and after each Boss reply, Captain shall relay the development request, relevant discussion context, and any relevant run results to Analyst in quotes (`>`), along with the planning instruction:

> Plan which playbooks run for this request; the playbooks do the work.
> Read the request, then the specs and the repository only as far as choosing the path requires.
> Do not change files or commit while planning or discussing the request.
>
> Choose exactly one:
>
> - `code`: the existing decisions and spec items settle how the work is done.
> - `decide then code`: the work turns on a rule, concept, term, shape, or trade-off the specs leave open or contradict; name what is open, do not settle it.
> - `code via pull request` or `decide then code via pull request`, in place of the two above, when the request names a GitHub issue (number or URL) or explicitly asks for pull-request delivery; read the issue and its comments (`gh issue view --comments` with the issue number) while choosing.
> - A question to Boss, only when the answer would change which path runs or whether any work is wanted: one short question naming the alternatives it decides between, and nothing else. When every answer leads to the same path, choose it; the playbook settles the open point.
> - `discussion complete`, after a Boss reply, when no repository work should follow.
>
> Your reply is the planning note the chosen playbook receives. It holds only the path and, in at most ten lines, why — the decisions and spec items that settle the work, or the open point a decision must settle — plus the scope the request implies and any fact from the issue the playbooks need.
> It holds no design, proposal, implementation instruction, or file-level finding: the playbooks own those.
> A reply that chooses a path asks Boss nothing; a reply that asks Boss chooses no path.
> A question or exploratory discussion is not by itself authorization to create a durable decision or implement changes.
> Do not choose `decide then code` merely because the work is large, nor `code` merely because it is small.
> Consult @specs/map.md for relevant context and @specs/meta.md for spec requirements, if needed.
>
> > Original request: <development-request>
> > Prior discussion: <discussion-context>
> > Run results: <run-results>

Results:
- `discussionComplete`: After a Boss reply that settles that no repository work should follow, Analyst concluded the discussion; dev completes without a child call or repository change.
- `code`: Analyst chose the code path because the existing decisions and spec items settle how the work is done. Output shall include `planningResult: <verbatim final text>`.
- `decideThenCode`: Analyst chose the decide then code path because the work turns on a rule, concept, term, shape, or trade-off the specs leave open or contradict. Output shall include `planningResult: <verbatim final text>`.
- `codeViaPullRequest`: Analyst chose the code via pull request path because the existing decisions and spec items settle how the work is done and the request names a GitHub issue or explicitly asks for pull-request delivery. Output shall include `planningResult: <verbatim final text>`.
- `decideThenCodeViaPullRequest`: Analyst chose the decide then code via pull request path because the work turns on a rule, concept, term, shape, or trade-off the specs leave open or contradict and the request names a GitHub issue or explicitly asks for pull-request delivery. Output shall include `planningResult: <verbatim final text>`.

## Development paths

### DEV-2

When the accepted planning result is code, or when `branch` has succeeded on the code via pull request path, Captain shall call playbook `code`:

> > Original request: <development-request>
> > Prior discussion: <discussion-context>
> > Planning result: <planning-result>

On the code path, `code` success completes `dev` with that successful `code` result; a plain request calls neither `branch` nor `pr`.
On the code via pull request path, only after `code` succeeds shall `dev` call playbook `pr`.
If `code` returns an authored abort or failure, or a terminal result that does not prove the success required for the selected path, `dev` shall start no later child and shall relay that canonical result.
If the `code` call fails outside its authored result contract, `dev` shall park as failed and retain the control-plane error.
`dev` shall consume commit, revision, branch, and pull-request identities only from each child's canonical structured result, never from player prose.

### DEV-3

When the accepted planning result is decide then code, or when `branch` has succeeded on the decide then code via pull request path, Captain shall call playbook `decide`:

> > Original request: <development-request>
> > Prior discussion: <discussion-context>
> > Planning result: <planning-result>

Only after `decide` succeeds shall `dev` call playbook `code` with the `decide`-owned commit and exact evaluated repository revision from `decide`'s canonical structured result.
`dev` shall not separately call `review` for the design scope already reviewed by `decide`.
On the decide then code path, a plain request calls neither `branch` nor `pr`.
If `decide` returns an authored abort or failure, or a terminal result that does not prove the success required for the selected path, `dev` shall start no later child and shall relay that canonical result.
If the `decide` call fails outside its authored result contract, `dev` shall park as failed and retain the control-plane error.
`dev` shall consume commit, revision, branch, and pull-request identities only from each child's canonical structured result, never from player prose.

### DEV-4

When `decide` has succeeded on the decide then code path or the decide then code via pull request path, Captain shall call playbook `code`:

> > Original request: <development-request>
> > Prior discussion: <discussion-context>
> > Planning result: <planning-result>
> > DECIDE commit: <decide-commit>
> > Evaluated revision: <evaluated-revision>

`dev` shall not separately call `review` for the design scope already reviewed by `decide`.
On the decide then code path, `code` success completes `dev` with that successful `code` result; a plain request calls neither `branch` nor `pr`.
On the decide then code via pull request path, only after `code` succeeds shall `dev` call playbook `pr`.
If `code` returns an authored abort or failure, or a terminal result that does not prove the success required for the selected path, `dev` shall start no later child and shall relay that canonical result.
If the `code` call fails outside its authored result contract, `dev` shall park as failed and retain the control-plane error.
`dev` shall consume commit, revision, branch, and pull-request identities only from each child's canonical structured result, never from player prose.

### DEV-5

When the accepted planning result is code via pull request or decide then code via pull request and no child call has started yet, Captain shall call playbook `branch`:

> > Original request: <development-request>
> > Prior discussion: <discussion-context>
> > Planning result: <planning-result>

Only after `branch` succeeds shall `dev` continue with the `code` call for code via pull request, or the `decide` call and then the `code` call for decide then code via pull request, each with the same input as its plain path.
If `branch` returns an authored abort or failure, or a terminal result that does not prove the success required for the selected path, `dev` shall start no later child and shall relay that canonical result; a `branch` failure ends `dev` under this rule.
If the `branch` call fails outside its authored result contract, `dev` shall park as failed and retain the control-plane error.
`dev` shall consume commit, revision, branch, and pull-request identities only from each child's canonical structured result, never from player prose.

### DEV-6

When `code` has succeeded on the code via pull request path or the decide then code via pull request path, Captain shall call playbook `pr`:

> > Original request: <development-request>
> > Issue summary: <issue-summary>
> > Branch: <branch>
> > Base revision: <base-revision>
> > CODE commit: <last-code-commit>
> > Evaluated revision: <final-evaluated-revision>

The branch and base revision come from `branch`'s canonical structured result, and the last `code`-owned commit and exact final evaluated repository revision come from the successful `code` call's canonical structured result.
`pr` success completes `dev` with that successful `pr` result.
If `pr` returns an authored abort or failure, or a terminal result that does not prove the success required for the selected path, `dev` shall relay that canonical result; a `pr` failure ends `dev` under this rule.
If the `pr` call fails outside its authored result contract, `dev` shall park as failed and retain the control-plane error.
`dev` shall consume commit, revision, branch, and pull-request identities only from each child's canonical structured result, never from player prose.
