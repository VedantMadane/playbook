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
const fixture = fileURLToPath(new URL('./fixtures/recovery-process-loss.mjs', import.meta.url));

it.each(['unchanged', 'commit', 'whole-retry', 'root-complete', 'repeated', 'before-dispatch', 'automatic-answer', 'from-chat', 'before-receipt', 'preparation-only', 'retry-save', 'closing-cancel', 'switch', 'later-chat', 'same-root', 'retry-question'])(
  'keeps an exit after SIGKILL during %s', async (scenario) => {
    const dir = await mkdtemp(join(tmpdir(), 'captain-kill-'));
    try {
      await expect(exec(process.execPath, [fixture, dir, scenario, 'start'])).rejects.toMatchObject({ signal: 'SIGKILL' });
      if (['repeated', 'retry-save'].includes(scenario)) await expect(exec(process.execPath, [fixture, dir, scenario, 'again'])).rejects.toMatchObject({ signal: 'SIGKILL' });
      if (scenario === 'later-chat') await expect(exec(process.execPath, [fixture, dir, scenario, 'chat'])).rejects.toMatchObject({ signal: 'SIGKILL' });
      const result = await exec(process.execPath, [fixture, dir, scenario, 'exit']);
      expect(JSON.parse(result.stdout)).toMatchObject({ scenario, settled: true });
    } finally { await rm(dir, { recursive: true, force: true }); }
  }, 30_000,
);

it.each(['root', 'nested'])('settles loss through the maintained DECIDE runtime (%s)', async (kind) => {
  const dir = await mkdtemp(join(tmpdir(), 'captain-bespoke-kill-'));
  const bespoke = fileURLToPath(new URL('./fixtures/recovery-bespoke-loss.mjs', import.meta.url));
  try {
    await expect(exec(process.execPath, [bespoke, dir, kind, 'start'])).rejects.toMatchObject({ signal: 'SIGKILL' });
    const result = await exec(process.execPath, [bespoke, dir, kind, 'exit']);
    expect(JSON.parse(result.stdout)).toEqual({ settled: true });
  } finally { await rm(dir, { recursive: true, force: true }); }
}, 30_000);
