// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';

it('checks recovery policy and rejects every deliberately broken rule', async () => {
  const { stdout } = await promisify(execFile)(process.execPath, [fileURLToPath(new URL('../scripts/models/recovery.mjs', import.meta.url))]);
  const result = JSON.parse(stdout);
  expect(result.durable).toHaveLength(6);
  expect(result.durable.every((row: any) => !row.failure)).toBe(true);
  expect(result.rejected).toHaveLength(8);
  expect(Object.fromEntries(result.rejected.map((row: any) => [row.mutation, row.failure.issue]))).toEqual({
    'lose-base': 'restored the wrong position',
    'stale-unsupported': 'restored the wrong position',
    'auto-retry': 'work repeated without Boss approval after interruption',
    'auto-accept': 'saved result accepted without Boss choice',
    'wrong-position': 'restored the wrong position',
    'skip-final-result': 'finished without durable results',
    'never-save-result': 'completed work cannot make durable progress',
    'report-writes-progress': 'report changed progress',
  });
  expect(result.rejected.every((row: any) => row.failure.trace.length > 0)).toBe(true);
}, 60_000);
