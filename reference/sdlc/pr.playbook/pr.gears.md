<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# PR

Roles:

- Coder

## Workflow

### PR-1

The caller supplies the original request, including the issue it names, if any; the issue summary; the branch to deliver and the base revision it was created from; the last `code`-owned commit and the exact evaluated repository revision; and optional relevant context.
`pr` delivers a reviewed branch into the repository default branch through a GitHub pull request; it changes no files and owns no repository commit.
Each outcome requires affirmative support in Coder's result, and no outcome depends on a fixed presentation format of Coder's reply.
Every outcome keeps the repository exact: pushing a branch and opening a pull request change neither HEAD's commit nor the working tree.

When the caller gives its input, Captain shall relay the complete caller input in quotes (`>`) to Coder, along with the following instruction:

> Publish the branch and open its pull request without changing any file or making any commit.
> Confirm that the working tree is clean and that the checked-out branch is the branch to deliver, not the repository default branch.
> Push the branch to the repository's GitHub remote with its upstream set; never force-push.
> If an open pull request for this branch already exists, use it; otherwise open one against the repository default branch with `gh pr create`.
> Give the pull request a title naming the change and a body with a summary of what changed and why from the base revision to the last commit, the verification the commits report, and a `Closes #N` line for issue number N when the request names one.
> Report the pull request number and URL exactly.
> If the working tree is not clean, the checked-out branch is wrong, the push is rejected, or the pull request cannot be opened, open nothing further and report the failure with its reason.
>
> > Original request: <caller-input>

Results:
- `opened`: Coder's result affirmatively supports that the pull request is open. Output shall include `pullRequest: <exact pull request number as reported>` and `pullRequestUrl: <exact pull request URL as reported>`.
- `notPublished`: Coder's result affirmatively supports that the branch or its pull request was not published; the workflow fails and returns Coder's complete result with its reason to its caller. Output shall include `coderOutput: <verbatim final text>`.

### PR-2

The check wait is a mechanical step: it runs one fixed command whose exit status alone decides its two outcomes, reads no conversation, and produces no prose.

When the pull request is open and no fix has been attempted, Captain shall run:

> n=0
> while gh pr checks 2>&1 | grep -q 'no checks reported'; do
> n=$((n + 1))
> [ "$n" -ge 6 ] && exit 0
> sleep 10
> done
> gh pr checks --watch --fail-fast >/dev/null 2>&1

Results:
- `checksPassed`: The command exited with status zero: the checks passed; a pull request whose repository still reports no checks after a brief wait for them to register counts as passed.
- `checksFailed`: The command exited with a nonzero status: the checks failed.

### PR-3

`pr` makes no more than one fix attempt, and the one fix it may request is owned by `code`.
The call input carries the original request, the pull request, and the coding request in quotes (`>`).

When the checks fail before any fix attempt, Captain shall call playbook `code`:

> > Original request: <caller-input>
> > Pull request: <pull-request-url>
> > Coding request: The pull request's checks are red on the checked-out branch. Inspect the failing checks with `gh pr checks` and `gh run view --log-failed`, fix their cause on this branch with a minimal change, and make the checks pass.

Only after `code` succeeds shall `pr` publish the fix and wait for the checks again.
When `code` returns an authored abort or failure, or a terminal result that does not prove its success, `pr` shall fail relaying that canonical result and shall leave the pull request open.
When the nested `code` call fails outside that authored result contract, `pr` shall park as failed and retain the control-plane error instead of reporting an authored outcome.

### PR-4

The fix publication is a mechanical step: it runs one fixed command whose exit status alone decides its two outcomes, reads no conversation, and produces no prose.
`gh` infers the pull request from the checked-out branch, which the run does not own: the nested `code` call suspends across Boss turns, so the checkout can change before the fix is published.
This step therefore carries one runtime value — the pull request `pr` published — and refuses unless the checkout still infers exactly it.
That identity is reported text, so it binds as a single-quoted shell literal: the command compares it as data and never executes it as shell syntax.
The command pushes nothing until the checked-out branch infers the pull request `pr` published, so a checkout that changed while `code` ran publishes to no other branch.

When `code` succeeds, Captain shall run:

> [ "$(gh pr view --json url --jq .url)" = '<pull-request-url>' ] || exit 1
> git push || exit 1
> n=0
> until [ "$(gh pr view --json headRefOid --jq .headRefOid 2>/dev/null)" = "$(git rev-parse HEAD)" ]; do
> n=$((n + 1))
> [ "$n" -ge 12 ] && exit 1
> sleep 5
> done

Results:
- `fixPublished`: The command exited with status zero, once the pull request's head is the pushed commit: the fix is published.
- `fixNotPublished`: The command exited with a nonzero status: the fix is not published, an authored failure of the workflow that leaves the pull request open.

### PR-5

The second check wait is a mechanical step: it runs one fixed command whose exit status alone decides its two outcomes, reads no conversation, and produces no prose.

When the fix is published, Captain shall run:

> n=0
> while gh pr checks 2>&1 | grep -q 'no checks reported'; do
> n=$((n + 1))
> [ "$n" -ge 6 ] && exit 0
> sleep 10
> done
> gh pr checks --watch --fail-fast >/dev/null 2>&1

Results:
- `checksPassed`: The command exited with status zero: the checks passed.
- `checksStillFailing`: The command exited with a nonzero status: the checks are still failing, an authored failure of the workflow that leaves the pull request open; there is no second fix attempt.

### PR-6

The merge is a mechanical step: it runs one fixed command whose exit status alone decides its two outcomes, reads no conversation, and produces no prose.
`gh` infers the pull request from the checked-out branch, which the run does not own: the nested `code` call suspends across Boss turns, so the checkout can change before the merge runs.
This step therefore carries one runtime value — the pull request `pr` published — and refuses unless the checkout still infers exactly it.
That identity is reported text, so it binds as a single-quoted shell literal: the command compares it as data and never executes it as shell syntax.
The merge creates a merge commit on the repository default branch, requests deletion of the remote and local branch, and checks out the local default branch; GitHub closes the linked issue on merge.
The command requires the inferred pull request to be the one `pr` published and to target the repository default branch before the irreversible merge, and confirms that same pull request's merged state and the default-branch checkout after the merge command succeeds; a queued pull request is not a merged result.
No outcome claims a branch was deleted, because `gh` skips the remote deletion for a pull request from another repository or one already merged and exits zero anyway.

When the checks pass, before or after the one fix attempt, Captain shall run:

> pr=$(gh pr view --json url --jq .url) || exit 1
> [ "$pr" = '<pull-request-url>' ] || exit 1
> base=$(gh repo view --json defaultBranchRef --jq .defaultBranchRef.name) || exit 1
> [ -n "$base" ] || exit 1
> [ "$(gh pr view "$pr" --json baseRefName --jq .baseRefName)" = "$base" ] || exit 1
> gh pr merge --merge --delete-branch --match-head-commit "$(git rev-parse HEAD)" || exit 1
> [ "$(gh pr view "$pr" --json state --jq .state)" = MERGED ] || exit 1
> [ "$(git branch --show-current)" = "$base" ]

Results:
- `merged`: The command exited with status zero: the pull request is merged.
- `mergeRefused`: The command exited with a nonzero status: the merge is refused, an authored failure of the workflow that leaves the pull request in the state GitHub reports, because the checkout no longer infers the published pull request, the pull request targets another branch, GitHub refused the merge for a conflict, a branch protection, a forbidden merge method, or a head that moved, or the merge may have landed while its confirmation, the local switch to the default branch, or the branch deletion failed; a refused merge does not establish that the pull request is unmerged, so the workflow reports it as an unconfirmed merge rather than as not merged.

### PR-7

The local update is a mechanical step: it runs one fixed command whose exit status alone decides its two outcomes, reads no conversation, and produces no prose.

When the pull request is merged, Captain shall run:

> git pull --ff-only

Results:
- `localDefaultUpdated`: The command exited with status zero: the local default branch is updated; the workflow completes, returning the pull request number and URL, the fact that the pull request is merged, and that the local default branch was fast-forwarded to the merged head.
- `localDefaultNotUpdated`: The command exited with a nonzero status: the local default branch is not updated; the workflow completes, since the pull request is merged either way, returning the pull request number and URL, the fact that the pull request is merged, and that the local default branch was not fast-forwarded to the merged head.

## Optimizations

- PR-2: captain → script
- PR-4: captain → script
- PR-5: captain → script
- PR-6: captain → script
- PR-7: captain → script

## Prefixed prompts

- PR-1: relays → tail
