<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# Branch

Roles:

- Coder

The caller supplies a development request that names a GitHub issue (number or URL) or, when no issue is named, describes the work, together with any relevant context.

`branch` prepares pull-request delivery of one development request: it creates and checks out a new branch at the current commit.
It changes no files and owns no repository commit.

## Workflow

### BRANCH-1

Where every outcome keeps the repository exact, so that a new branch at the current commit changes neither HEAD's commit nor the working tree, where Captain takes the base revision from repository authority rather than from Coder's prose, where each outcome requires affirmative support in Coder's result and depends on no fixed presentation format of Coder's reply, and where Boss's answer to Coder's question about which issue or work the request means resumes this same behavior with that answer as continuation context, when the caller gives the request, Captain shall relay the complete caller input in quotes (`>`) to Coder, along with the following instruction:

> Prepare a new branch for this work without changing any file or making any commit.
> Identify the GitHub issue the request names, if any, and read it with its comments (`gh issue view --comments` with the issue number).
> If the request could refer to more than one issue, or does not say which work to branch for, ask Boss before creating anything.
> Confirm that the working tree is clean and that `gh` is authenticated for the repository's GitHub remote.
> Name the branch `issue-N-short-kebab-slug` for issue number N, otherwise a short kebab-case slug of the request.
> Create the branch from the current commit and check it out; do not pull, reset, stash, or move HEAD to another commit.
> Report the exact branch name, the commit it was created from, and a concise summary of the issue and its comments, or of the request when no issue is named.
> If the working tree is not clean, `gh` is not authenticated, the named issue does not exist or cannot be read, or a branch with that name already exists locally or on the remote, create nothing and report the failure with its reason.
>
> > Original request: <caller-input>

Results:
- `branched`: Coder affirmatively reported that it created the new branch from the current commit and checked it out, with the exact branch name and a concise summary of the issue and its comments, or of the request when no issue is named; the absence of a reported obstacle is not support. The branch workflow is then complete and returns the exact branch name, the exact base revision taken from repository authority, and the issue summary to its caller. Output shall include `branch: <exact branch name>`, `baseRevision: <exact base revision from repository authority, not from Coder's prose>`, and `issueSummary: <concise summary of the issue and its comments, or of the request when no issue is named>`.
- `refused`: Coder affirmatively reported that it created no branch and gave the failure with its reason, such as a working tree that is not clean, gh not being authenticated, a named issue that does not exist or cannot be read, or a branch with that name already existing locally or on the remote. The branch workflow then fails and reports Coder's complete result with its reason to its caller; no branch was created. Output shall include `coderOutput: <verbatim final text>`.

## Prefixed prompts

- BRANCH-1: relays → tail
