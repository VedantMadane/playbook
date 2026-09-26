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

it.each(['unchanged', 'commit', 'whole-retry', 'root-complete', 'repeated', 'before-dispatch', 'automatic-answer'])(
  'keeps an exit after SIGKILL during %s', async (scenario) => {
    const dir = await mkdtemp(join(tmpdir(), 'captain-kill-'));
    try {
      await expect(exec(process.execPath, [fixture, dir, scenario, 'start'])).rejects.toMatchObject({ signal: 'SIGKILL' });
      if (scenario === 'repeated') await expect(exec(process.execPath, [fixture, dir, scenario, 'again'])).rejects.toMatchObject({ signal: 'SIGKILL' });
      const result = await exec(process.execPath, [fixture, dir, scenario, 'exit']);
      expect(JSON.parse(result.stdout)).toMatchObject({ scenario, settled: true });
    } finally { await rm(dir, { recursive: true, force: true }); }
  }, 30_000,
);
