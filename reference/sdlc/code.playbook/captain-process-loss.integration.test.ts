// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

import { execFile } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { expect, it } from 'vitest';
const exec = promisify(execFile);
it.each(['root', 'nested'])('settles loss through the maintained DECIDE runtime (%s)', async (kind) => {
  const dir = await mkdtemp(join(tmpdir(), 'captain-bespoke-kill-'));
  const bespoke = fileURLToPath(new URL('./fixtures/recovery-bespoke-loss.mjs', import.meta.url));
  try {
    await expect(exec(process.execPath, [bespoke, dir, kind, 'start'])).rejects.toMatchObject({ signal: 'SIGKILL' });
    const result = await exec(process.execPath, [bespoke, dir, kind, 'exit']);
    expect(JSON.parse(result.stdout)).toEqual({ settled: true });
  } finally { await rm(dir, { recursive: true, force: true }); }
}, 30_000);

it('keeps real DECIDE under its parent when the first accepted proposal is cancelled', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'captain-decide-acceptance-'));
  const bespoke = fileURLToPath(new URL('./fixtures/recovery-bespoke-loss.mjs', import.meta.url));
  try {
    const result = await exec(process.execPath, [bespoke, dir, 'acceptance-cancel', 'start']);
    expect(JSON.parse(result.stdout)).toEqual({ settled: true });
  } finally { await rm(dir, { recursive: true, force: true }); }
}, 30_000);
