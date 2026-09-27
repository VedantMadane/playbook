// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { writeFile, appendFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { assign, createMachine } from 'xstate';
import { createEvent } from '@sublang/cligent';
import decide from '../../decide.playbook/decide.registry.js';
import { createXStatePlaybookRuntime } from '../../../../src/xstate-runtime.js';
import { createSessionStore } from '../session-store.js';
import { openSessionHost } from '../session-host.js';
import { executionConfigFromPlan } from '../bin/run.js';
import { loadLaunchPlan } from '../bin/launch-config.js';

const [dir, nested, phase] = process.argv.slice(2);
const acceptanceCancel = nested === 'acceptance-cancel';
const sessionId = '96000000-0000-4000-8000-000000000001';
const git = (...args) => execFileSync('git', args, { cwd: dir, encoding: 'utf8' }).trim();
let continuing = phase !== 'start';
const meta = (stateId) => ({ playbook: { stateId, description: stateId } });
const parentFactory = createXStatePlaybookRuntime(createMachine({ initial: 'ready', context: { task: '' }, states: {
  ready: { meta: meta('ready'), tags: ['playbook.parked'], on: { START: { target: acceptanceCancel ? 'waiting' : 'child', actions: assign({ task: ({ event }) => event.text }) } } },
  ...(acceptanceCancel ? { waiting: { meta: meta('waiting'), tags: ['playbook.parked'], on: { START: { target: 'child', actions: assign({ task: ({ event }) => event.text }) } } } } : {}),
  child: { meta: meta('child'), tags: ['playbook.suspended'], invoke: { src: 'playbook', input: ({ context }) => ({ stateId: 'child', sourceItem: 'OUTER-1', playbookId: 'decide', text: context.task }), onDone: 'done', onError: 'failed' } },
  done: { meta: meta('done'), type: 'final' }, failed: { meta: meta('failed'), tags: ['playbook.parked'] },
} }), { label: 'outer', compat: { artifactSchema: 3, runtimeAbi: 1 }, snapshotOptions: () => ({}), unfinishedFinalStateIds: new Set(), entryEvent: { type: 'START', textField: 'text' }, roleStates: {}, outcomeAuthority: { governedPlayerStates: {} } });
const outer = { id: 'outer', command: 'outer', intent: 'Call DECIDE', artifactSchema: 3, runtimeProfile: { kind: 'shared-factory', compat: parentFactory.compat }, requiredRoleIds: [], concurrentRoleSets: [], validateOptions: () => ({}), createRuntime: (configuredOptions, hostCapabilities) => parentFactory({ configuredOptions, hostCapabilities }) };
const loadModule = async (id) => ({ default: id.endsWith('decide') ? decide : outer });
class Adapter {
  agent = 'claude-code';
  async *run(prompt, options) {
    let result;
    if (prompt.includes('Boss-input classifier')) result = JSON.stringify(continuing ? { type: 'BOSS_REPLY' } : { type: 'START', text: 'Design task' });
    else if (acceptanceCancel && prompt.includes('Classify the following Boss message')) result = '{"type":"START"}';
    else if (prompt.includes('Select exactly one action')) result = '{"action":"deliver"}';
    else if (prompt.includes('An action just settled')) result = 'The work is saved. Check the next step.';
    else if (prompt.includes('hidden-control judge')) result = JSON.stringify({ guard: prompt.includes('NEED_CHOICE') ? 'needsBossReply' : prompt.includes('DECIDE-3') ? 'committed' : 'proposed' });
    else {
      await appendFile(join(dir, 'calls'), options.model + '\n');
      if (acceptanceCancel) {
        host.host.abortActiveTurn('Cancel the first DECIDE proposal after input acceptance');
        assert(options.signal.aborted, 'the active proposal must observe cancellation');
        throw new Error('proposal cancelled after DECIDE accepted its input');
      }
      if (prompt.includes('Synthesize your independent proposal')) {
        await writeFile(join(dir, 'design.md'), 'A small design.'); git('add', 'design.md'); git('commit', '-qm', 'design'); result = 'Committed ' + git('rev-parse', 'HEAD');
      } else result = !continuing && options.model === 'coder-model' ? 'NEED_CHOICE: Which design?' : 'A small complete proposal.';
    }
    yield createEvent('done', this.agent, { status: 'success', result, resumeToken: 'fixture', usage: { toolUses: 0 }, durationMs: 1 }, 'fixture');
  }
}
if (phase === 'start') {
  git('init', '-q'); git('config', 'user.name', 'Test'); git('config', 'user.email', 'test@example.invalid'); git('config', 'commit.gpgsign', 'false');
  await writeFile(join(dir, '.gitignore'), 'sessions/\ncalls\nconfig.yaml\n'); git('add', '.gitignore'); git('commit', '-qm', 'baseline');
  await writeFile(join(dir, 'config.yaml'), 'captain: { adapter: claude, model: captain-model }\nplayers:\n  coder: { adapter: claude, model: coder-model }\n  reviewer: { adapter: claude, model: reviewer-model }\nplaybooks:\n  decide: { from: "mod://decide", roles: { coder: coder, reviewer: reviewer } }\n  outer: { from: "mod://outer", roles: {} }\n');
}
const store = createSessionStore({ sessionsDir: join(dir, 'sessions') });
const wrapped = { ...store, async acquire(id) { const lease = await store.acquire(id); return { ...lease, async writeEffectLedger(authority, commands) {
  const ledger = await lease.writeEffectLedger(authority, commands);
  if (phase === 'start' && continuing && ledger.boundaries.some((b) => b.physicalReceipt?.classification === 'one-descendant-commit')) process.kill(process.pid, 'SIGKILL');
  return ledger;
} }; } };
const config = executionConfigFromPlan(await loadLaunchPlan({ userConfigPath: join(dir, 'config.yaml'), loadModule }));
const host = await openSessionHost({ store: wrapped, config, loadModule, cwd: dir, sessionId, mode: phase === 'start' ? 'new' : 'recover', adapterImports: { claude: async () => Adapter } });
if (phase === 'start') {
  if (acceptanceCancel) {
    await host.handleBossTurn('/outer Prepare to design');
    let interrupted = false;
    await host.handleBossTurn('/outer Design task').catch(() => { interrupted = true; });
    const stopped = await host.read();
    assert(interrupted, JSON.stringify(stopped.snapshot));
    assert.equal(stopped.state, 'settled');
    assert.deepEqual(stopped.snapshot.frames.map((frame) => frame.playbookId), ['outer', 'decide']);
    assert.equal(stopped.snapshot.frames[0].runtime.state.stateId, 'child');
    const facts = JSON.stringify(stopped.snapshot.journal.filter((entry) => entry.kind === 'outcome' && entry.turnId === stopped.snapshot.sequences.turn));
    assert(facts.includes('Delivered the Boss text'), facts);
    assert(!facts.includes('did not accept'), facts);
    assert((await readFile(join(dir, 'calls'), 'utf8')).includes('-model'), 'a real DECIDE proposal must have started');
    await host.dispose();
    console.log(JSON.stringify({ settled: true }));
    process.exit(0);
  }
  const saved = await host.handleBossTurn(nested === 'nested' ? '/outer Design task' : '/decide Design task');
  assert.equal(saved.snapshot.frames.length, nested === 'nested' ? 2 : 1);
  assert(saved.snapshot.frames.at(-1).runtime.pendingBossQuestions.length > 0, JSON.stringify(saved.snapshot));
  continuing = true;
  await host.handleBossTurn('Use the small design.');
  throw new Error('expected SIGKILL');
}
const calls = await readFile(join(dir, 'calls'), 'utf8');
const recovered = await host.recover();
assert.equal(recovered.snapshot.mode, 'chat');
assert.equal(recovered.unresolvedEffects[0].commitOid, git('rev-parse', 'HEAD'));
assert.equal(await readFile(join(dir, 'calls'), 'utf8'), calls);
assert.equal(git('rev-list', '--count', 'HEAD'), '2');
await host.dispose();
console.log(JSON.stringify({ settled: true }));
