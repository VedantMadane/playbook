<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# compiler-prompt-prefix: Prefix-First Prompt Layout

## Intent

This package governs the prompt-prefix pass of [DR-065](../decisions/065-prompt-prefix-pass.md): the compile-time reorder that puts an acting prompt's static instructions ahead of its relayed runtime values, its deterministic tool, and the fidelity acceptance of the reordered items.

## External Behavior

### compiler-prompt-prefix-1

When the prefix pass rewrites an eligible acting item, the pass shall move every standalone relay block — a maximal run of prompt lines beginning with the literal quote marker [[playbook-5](playbook.md#playbook-5)] bounded by blank prompt lines or the blockquote's edges — after the item's last instruction line, keeping every non-blank prompt line byte-for-byte, the instruction lines in their order with one blank line separating them from the relays, and the relay blocks in their order with one blank line between consecutive blocks, and shall leave the item's heading, condition, acting clause, and `Results:` metadata, every other item, and every non-item section other than its provenance section [[compiler-prompt-prefix-3](#compiler-prompt-prefix-3)] byte-for-byte.
The pass shall replace each maximal run of moved blocks and their bounding blank lines with that run's first blank line where it separated two remaining prompt lines and with nothing where it led or trailed them, drop any other blank line leading or trailing the remaining lines, and keep every other blank line byte-for-byte in place.

### compiler-prompt-prefix-2

Where an item is a script item, has no standalone relay block preceding an instruction line, or carries an instruction whose meaning depends on a relayed value standing before it, the pass shall leave the item unchanged, and the pass shall add no prompt line, label, or separator to any item.

### compiler-prompt-prefix-3

When the pass has rewritten at least one item, the pass shall replace every `## Prefixed prompts` section of the source with one such section after every other section, listing in item order as `- <ITEM-ID>: relays → tail` each item it rewrote and each item a replaced section listed; when it has rewritten none, the target shall equal the source.

### compiler-prompt-prefix-4

When invoked with `--source <gears.md>` and `--target <gears.md>` and zero or more `--keep <ITEM-ID>`, the `slc/prefix-prompts.mjs` tool shall write to the target the source rewritten by the mechanical rules [[compiler-prompt-prefix-1](#compiler-prompt-prefix-1)], [[compiler-prompt-prefix-3](#compiler-prompt-prefix-3)] for every eligible item not named by `--keep`, preserving the source's line-ending convention and leaving the source unmodified, and shall print the rewritten item IDs or report that no item was eligible.

### compiler-prompt-prefix-5

When the Source-to-GEARS fidelity checker evaluates an item listed under `## Prefixed prompts`, the checker shall read each authored fragment as units — a quoted relay fragment as one relay unit, and in an instruction or prompt fragment each paragraph of only quoted lines a relay unit and the lines between relay units, without their bounding blank lines, one instruction unit keeping its interior blank lines — and shall accept the item only when whole fragments taken in Source order tile its prompt — their instruction units before the trailing relay blocks, one blank line between the units of one fragment and the boundary Source authored between fragments, and their relay units among the trailing blocks or, where the raw layout kept a relay beside instruction text, in place — each unit occurrence used exactly once, blank lines and bare relay lines free among the trailing blocks, and every alternative tiling kept; the checker shall read every `## Prefixed prompts` section and report a section after the first, a listed ID that names no item, a malformed entry, a listed item whose relays still precede an instruction, and a listed item no tiling of which moved a relay past an instruction unless a bare relay line, whose Source position the prose leaves open, trails it, while holding every unlisted item to Source order [[playbook-1](playbook.md#playbook-1)]:

- The units are the blocks the pass moves or keeps [[compiler-prompt-prefix-1](#compiler-prompt-prefix-1)], so a quoted block set apart by blank lines inside a fenced instruction is accepted at the tail like a separate relay, while a quoted line beside instruction text stays with it.

## Verification

### compiler-prompt-prefix-6

When the integration suite runs the shipped tool over each maintained workflow's GEARS, it shall verify that the rewritten set is exactly the items whose relays precede an instruction, that every unlisted item and the `## Optimizations` section are byte-identical, that the provenance section lists the rewritten items in order, that a second run changes nothing, and that a kept item is skipped [[compiler-prompt-prefix-1](#compiler-prompt-prefix-1)], [[compiler-prompt-prefix-2](#compiler-prompt-prefix-2)], [[compiler-prompt-prefix-3](#compiler-prompt-prefix-3)], [[compiler-prompt-prefix-4](#compiler-prompt-prefix-4)]; and that the shipped definition's example rewrites through the tool exactly as printed [[compiler-prompt-prefix-1](#compiler-prompt-prefix-1)].
When the integration suite runs the shipped tool over the output of a run with `--keep`, it shall verify that the second run rewrites only the kept item and yields the text of one run without `--keep`, with one provenance section [[compiler-prompt-prefix-3](#compiler-prompt-prefix-3)], [[compiler-prompt-prefix-4](#compiler-prompt-prefix-4)].

### compiler-prompt-prefix-7

When the integration suite composes a rewritten item's prompt through the real runtime composer with two different relayed values, it shall verify that the two prompts share the complete instruction text as a common prefix while the original layout shares only the relay label [[compiler-prompt-prefix-1](#compiler-prompt-prefix-1)].

### compiler-prompt-prefix-8

When the integration suite runs the fidelity checker over each maintained source and its tool-rewritten GEARS, it shall verify zero findings, and over mutants — the provenance section removed, a nested-call item listed, an unknown ID and a malformed entry listed, a second provenance section, a listed item with a relay dropped, and the original layout listed — it shall verify the respective findings [[compiler-prompt-prefix-5](#compiler-prompt-prefix-5)]; and over a Source whose fenced instruction opens with a blank-separated quoted block, it shall verify that the tool moves the block, the checker accepts the listed result and rejects the same result unlisted, and a quoted line beside instruction text stays in place [[compiler-prompt-prefix-1](#compiler-prompt-prefix-1)], [[compiler-prompt-prefix-5](#compiler-prompt-prefix-5)].

### compiler-prompt-prefix-9

When the integration suite runs the shipped tool and the fidelity checker over Sources in which two items share an instruction paragraph, one instruction repeats a paragraph, one instruction repeats a relay block, one instruction carries an authored run of two blank lines, a relay-last item shares a relay with a relay-first one, one item's two instruction fragments are joined by two blank lines, two items' fragments mirror each other, bare relays authored through prose precede an instruction alone and beside another, and Source joins two instructions, two relays, and a relay with an instruction without a blank line, it shall verify that the authored run survives the rewrite while the blank lines bounding a moved block collapse to one [[compiler-prompt-prefix-1](#compiler-prompt-prefix-1)], that each listed result has zero findings, and that the checker reports a listed result with one repeated relay block deleted, with the authored run shortened, removed, or lengthened, and with the relay-last item listed [[compiler-prompt-prefix-5](#compiler-prompt-prefix-5)].
