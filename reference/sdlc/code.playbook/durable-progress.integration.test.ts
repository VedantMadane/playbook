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
const fixture = fileURLToPath(new URL('./fixtures/durable-progress-loss.mjs', import.meta.url));
it.each(['player-result', 'player-before-receipt', 'script-result', 'script-before-result', 'nested-player', 'nested-script', 'preparation', 'completed', 'script-before-rename', 'script-after-rename', 'carried', 'accepted-answer', 'waiting-question'])(
  'restores %s after SIGKILL without repeating work', async (scenario) => {
    const dir = await mkdtemp(join(tmpdir(), 'durable-progress-'));
    try {
      const stopped = await exec(process.execPath, [fixture, dir, scenario, 'start']).catch((error) => error);
      expect(stopped.signal, stopped.stderr).toBe('SIGKILL');
      const result = await exec(process.execPath, [fixture, dir, scenario, 'exit']);
      expect(JSON.parse(result.stdout)).toEqual({ settled: true });
    } finally { await rm(dir, { recursive: true, force: true }); }
  }, 30_000,
);

it.each(['second-crash', 'cli'])('reports safely through %s', async (kind) => {
  const dir = await mkdtemp(join(tmpdir(), 'durable-reopen-'));
  try {
    await expect(exec(process.execPath, [fixture, dir, 'nested-script', 'start'])).rejects.toMatchObject({ signal: 'SIGKILL' });
    if (kind === 'second-crash') await expect(exec(process.execPath, [fixture, dir, 'nested-script', 'again'])).rejects.toMatchObject({ signal: 'SIGKILL' });
    const result = await exec(process.execPath, [fixture, dir, 'nested-script', kind === 'cli' ? 'cli' : 'exit']);
    expect(JSON.parse(result.stdout)).toEqual({ settled: true });
  } finally { await rm(dir, { recursive: true, force: true }); }
}, 30_000);
