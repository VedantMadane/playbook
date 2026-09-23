<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# compiler-prompt-prefix: Prefix-First Prompt Layout

## Intent

This package governs the prompt-prefix pass of [DR-065](../decisions/065-prompt-prefix-pass.md): the compile-time reorder that puts an acting prompt's static instructions ahead of its relayed runtime values, its deterministic tool, and the fidelity acceptance of the reordered items.

## External Behavior

### compiler-prompt-prefix-1

When the prefix pass rewrites an eligible acting item, the pass shall move every standalone relay block — a maximal run of prompt lines beginning with the literal quote marker [[playbook-6](playbook.md#playbook-6)] bounded by blank prompt lines or the blockquote's edges — after the item's last instruction line, keeping every prompt line byte-for-byte, the instruction lines in their order with one blank line separating them from the relays, and the relay blocks in their order with one blank line between consecutive blocks, and shall leave the item's heading, condition, acting clause, and `Results:` metadata, every other item, and every non-item section byte-for-byte.

### compiler-prompt-prefix-2

Where an item is a script item, has no standalone relay block preceding an instruction line, or carries an instruction whose meaning depends on a relayed value standing before it, the pass shall leave the item unchanged, and the pass shall add no prompt line, label, or separator to any item.

### compiler-prompt-prefix-3

When the pass has rewritten at least one item, the pass shall append one `## Prefixed prompts` section after every other section listing each rewritten item in item order as `- <ITEM-ID>: relays → tail`; when it has rewritten none, the target shall equal the source with no such section.

### compiler-prompt-prefix-4

When invoked with `--source <gears.md>` and `--target <gears.md>` and zero or more `--keep <ITEM-ID>`, the `slc/prefix-prompts.mjs` tool shall write to the target the source rewritten by the mechanical rules [[compiler-prompt-prefix-1](#compiler-prompt-prefix-1)], [[compiler-prompt-prefix-3](#compiler-prompt-prefix-3)] for every eligible item not named by `--keep`, preserving the source's line-ending convention and leaving the source unmodified, and shall print the rewritten item IDs or report that no item was eligible.

### compiler-prompt-prefix-5

When the Source-to-GEARS fidelity checker evaluates an item listed under `## Prefixed prompts`, the checker shall read each authored fragment as units — a quoted relay fragment as one relay unit, and an instruction or prompt fragment split at its blank lines into paragraphs, a paragraph of only quoted lines being a relay unit and any other an instruction unit — and shall accept the item only when every unit of every fragment the item carries is intact, the instruction units keep their Source order, the relay units keep their Source order, and every relay unit and bare relay line follows the last instruction unit; the checker shall report a listed ID that names no item, a malformed entry, a listed item whose relays still precede an instruction, and a listed item whose units are already in that order in Source, while holding every unlisted item to Source order [[playbook-1](playbook.md#playbook-1)]:

- The units are the blocks the pass moves or keeps [[compiler-prompt-prefix-1](#compiler-prompt-prefix-1)], so a quoted block set apart by blank lines inside a fenced instruction is accepted at the tail like a separate relay, while a quoted line beside instruction text stays with it.

## Verification

### compiler-prompt-prefix-6

When the integration suite runs the shipped tool over each maintained workflow's GEARS, it shall verify that the rewritten set is exactly the items whose relays precede an instruction, that every unlisted item and the `## Optimizations` section are byte-identical, that the provenance section lists the rewritten items in order, that a second run changes nothing, and that a kept item is skipped [[compiler-prompt-prefix-1](#compiler-prompt-prefix-1)], [[compiler-prompt-prefix-2](#compiler-prompt-prefix-2)], [[compiler-prompt-prefix-3](#compiler-prompt-prefix-3)], [[compiler-prompt-prefix-4](#compiler-prompt-prefix-4)]; and that the shipped definition's example rewrites through the tool exactly as printed [[compiler-prompt-prefix-1](#compiler-prompt-prefix-1)].

### compiler-prompt-prefix-7

When the integration suite composes a rewritten item's prompt through the real runtime composer with two different relayed values, it shall verify that the two prompts share the complete instruction text as a common prefix while the original layout shares only the relay label [[compiler-prompt-prefix-1](#compiler-prompt-prefix-1)].

### compiler-prompt-prefix-8

When the integration suite runs the fidelity checker over each maintained source and its tool-rewritten GEARS, it shall verify zero findings, and over mutants — the provenance section removed, a nested-call item listed, an unknown ID and a malformed entry listed, a listed item with a relay dropped, and the original layout listed — it shall verify the respective findings [[compiler-prompt-prefix-5](#compiler-prompt-prefix-5)]; and over a Source whose fenced instruction opens with a blank-separated quoted block, it shall verify that the tool moves the block, the checker accepts the listed result and rejects the same result unlisted, and a quoted line beside instruction text stays in place [[compiler-prompt-prefix-1](#compiler-prompt-prefix-1)], [[compiler-prompt-prefix-5](#compiler-prompt-prefix-5)].
