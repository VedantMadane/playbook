// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createMachine } from 'xstate';
import { expect, it } from 'vitest';
import { createXStatePlaybookRuntime, emptyPlaybookEffectLedger, assertPlaybookRuntimeSnapshot } from './xstate-runtime.js';
import type { PlaybookPorts, PlaybookRuntimeSnapshot, PlaybookStepRecord } from './runtime.js';

it.each(['result', 'unacknowledged-result', 'refused-start', 'authored-failure'])('preserves script progress across %s', async (failure) => {
  const dir = await mkdtemp(join(tmpdir(), 'durable-step-'));
  const meta = (stateId: string) => ({ playbook: { stateId, description: stateId } });
  const factory = createXStatePlaybookRuntime(createMachine({
    initial: 'ready', context: {}, states: {
      ready: { meta: meta('ready'), tags: ['playbook.parked'], on: { START: 'work' } },
      work: { meta: meta('work'), tags: ['playbook.busy'], invoke: { src: 'script', input: { stateId: 'work', sourceItem: 'TEST-1', command: 'echo work >> calls', result: { done: 'Done', failed: 'Failed' } }, onDone: failure === 'authored-failure' ? 'failed' : 'done', onError: 'failed' } },
      failed: { meta: meta('failed'), tags: ['playbook.parked'], on: { START: 'work' } },
      done: { meta: meta('done'), type: 'final' },
    },
  }), { label: 'test', roleStates: {}, outcomeAuthority: { governedPlayerStates: {} }, compat: { artifactSchema: 3, runtimeAbi: 1 }, entryEvent: { type: 'START', textField: 'text' }, scriptCwd: () => dir, snapshotOptions: () => ({}) });
  let saved: PlaybookRuntimeSnapshot | undefined, result: PlaybookStepRecord | undefined;
  const ports: PlaybookPorts = {
    callPlayer: async () => { throw new Error('unexpected player'); },
    callCaptain: async () => { throw new Error('unexpected Captain'); },
    callJudge: async () => JSON.stringify({ type: 'START', text: 'Go' }),
    callPlaybook: async () => { throw new Error('unexpected child'); },
    emitStatus: async () => {}, emitTelemetry: async () => {},
    recordStep: async (step, position) => {
      if (step.result === undefined) { saved = assertPlaybookRuntimeSnapshot(position, 'test'); if (failure === 'refused-start') throw new Error('Start save failed'); }
      else { result = step; throw new Error('Lost process after saving output'); }
    },
  };
  const capabilities = { effectLedger: { snapshot: emptyPlaybookEffectLedger, writeAhead: async () => emptyPlaybookEffectLedger() } };
  const session = { sessionId: '89000000-0000-4000-8000-000000000001', rootSessionId: '89000000-0000-4000-8000-000000000001', playbookId: 'test', depth: 0, ports };
  const first = factory({ configuredOptions: {}, hostCapabilities: capabilities });
  let second;
  try {
    await first.init(session);
    await first.handleBossInput({ text: 'Go', signal: new AbortController().signal });
    expect(saved?.recoveryCheckpoint?.stateId).toBe('work');
    if (failure === 'refused-start') {
      await expect(readFile(join(dir, 'calls'), 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });
      return;
    }
    expect(result?.result).toEqual({ guard: 'done', exitStatus: 0 });
    expect(await readFile(join(dir, 'calls'), 'utf8')).toBe('work\n');
    const stopped = first.exportSnapshot!();
    await first.dispose();
    const position = structuredClone(failure === 'unacknowledged-result' ? stopped! : saved!);
    if (failure === 'unacknowledged-result') expect(position.recoveryCheckpoint?.result).toEqual(result!.result);
    position.recoveryCheckpoint = { ...position.recoveryCheckpoint!, result: result!.result };
    for (const [patch, message] of [
      [{ id: 'not-a-uuid' }, /UUID/],
      [{ result: { guard: 'unknown', exitStatus: 0 } }, /guard|result/],
      [{ result: { guard: 'done', exitStatus: 1 } }, /result/],
      [{ result: { guard: 'done', exitStatus: 0, extra: true } }, /script|result/],
    ] as const) {
      const invalid = structuredClone(position);
      invalid.recoveryCheckpoint = { ...invalid.recoveryCheckpoint!, ...patch };
      const rejected = factory({ configuredOptions: {}, hostCapabilities: capabilities });
      await expect(rejected.restore!(session, invalid)).rejects.toThrow(message);
      await rejected.dispose();
      expect(await readFile(join(dir, 'calls'), 'utf8')).toBe('work\n');
    }
    second = factory({ configuredOptions: {}, hostCapabilities: capabilities });
    await second.restore!(session, position);
    expect(await readFile(join(dir, 'calls'), 'utf8')).toBe('work\n');
    const action = second.describe!().actions.find((item) => item.id.startsWith('retry:'))!;
    expect(action.label).toContain('saved result');
    expect((second.exportSnapshot as any)({ interrupted: true })).toBeDefined();
    const outcome = await second.apply!({ actionId: action.id, key: 'Boss accepts', signal: new AbortController().signal });
    expect(outcome.disposition).toBe(failure === 'authored-failure' ? 'failed' : 'executed');
    if (failure === 'authored-failure') {
      const retry = second.describe!().actions.find((action) => action.id.startsWith('retry:'));
      expect(retry?.label).not.toContain('saved result');
      expect(retry).toBeDefined();
      expect((second.exportSnapshot as any)({ interrupted: true })).toEqual(second.exportSnapshot!());
    }
    expect(await readFile(join(dir, 'calls'), 'utf8')).toBe('work\n');
  } finally {
    await first.dispose(); await second?.dispose(); await rm(dir, { recursive: true, force: true });
  }
});
