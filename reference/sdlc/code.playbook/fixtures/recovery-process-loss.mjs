// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// A real process is killed after a durable write, without running abort cleanup.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { writeFile, appendFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { assign, createMachine } from 'xstate';
import { createEvent } from '@sublang/cligent';
import { assertPlaybookRuntimeSnapshot, createXStatePlaybookRuntime } from '../../../../src/xstate-runtime.js';
import { createSessionStore } from '../session-store.js';
import { openSessionHost } from '../session-host.js';
import { executionConfigFromPlan } from '../bin/run.js';
import { loadLaunchPlan } from '../bin/launch-config.js';

const [dir, scenario, phase] = process.argv.slice(2);
const automatic = scenario === 'automatic-answer';
const QUESTION = 'Which option should I use: preview or production?';
const sessionId = '95000000-0000-4000-8000-000000000031';
const git = (...args) => execFileSync('git', args, { cwd: dir, encoding: 'utf8' }).trim();
let armed = phase !== 'start';
const kill = () => process.kill(process.pid, 'SIGKILL');
const meta = (stateId) => ({ playbook: { stateId, description: stateId } });
const factory = createXStatePlaybookRuntime(createMachine({
  context: { task: '', pendingBossQuestion: undefined, bossReply: undefined }, initial: 'ready', states: {
    ready: { meta: meta('ready'), tags: ['playbook.parked'], on: { START: { target: 'work', actions: assign({ task: ({ event }) => event.text }) } } },
    work: { meta: { playbook: { stateId: 'work', description: 'Do work', role: 'worker' } }, tags: ['playbook.busy'], invoke: {
      src: 'player', input: ({ context }) => ({ stateId: 'work', sourceItem: 'WORK-1', role: 'worker', prompt: `work: ${context.task}`, ...(context.bossReply === undefined ? {} : { pendingBossQuestion: context.pendingBossQuestion, bossReply: context.bossReply }),
        result: { done: 'Done.', ...(automatic ? { needsBossReply: 'A question for Boss. Output shall include `question: <verbatim question>`.' } : {}) } }),
      onDone: automatic ? [
        { guard: ({ event }) => event.output.guard === 'needsBossReply', target: 'awaitBossReply', actions: assign({ pendingBossQuestion: ({ event }) => ({ questionId: 'choice', resumeStateId: 'work', sourceItem: 'WORK-1', asker: { kind: 'role', roleId: 'worker' }, question: event.output.question }), bossReply: () => undefined }) },
        { target: 'done' },
      ] : 'done', onError: 'failed',
    } },
    awaitBossReply: { meta: meta('awaitBossReply'), tags: ['playbook.parked'], on: { BOSS_REPLY: { target: 'work', actions: assign({ bossReply: ({ event }) => event.answer }) } } },
    failed: { meta: meta('failed'), tags: ['playbook.parked'], on: { START: 'work' } },
    done: { meta: meta('done'), type: 'final' },
  },
}), {
  label: 'flow', compat: { artifactSchema: 3, runtimeAbi: 1 }, snapshotOptions: () => ({}), unfinishedFinalStateIds: new Set(),
  entryEvent: { type: 'START', textField: 'text' }, roleStates: { work: { role: 'worker', label: 'Do work' } },
  verbatimPayloadFields: new Set(automatic ? ['question'] : []),
  outcomeAuthority: { governedPlayerStates: { work: { done: { fields: {}, repositoryDisposition: scenario === 'commit' ? 'one-descendant-commit' : 'unchanged' }, ...(automatic ? { needsBossReply: { fields: { question: 'presentation' }, repositoryDisposition: 'unchanged' } } : {}) } } },
});
const entry = { id: 'flow', command: 'flow', intent: 'Work', artifactSchema: 3, runtimeProfile: { kind: 'shared-factory', compat: factory.compat }, requiredRoleIds: ['worker'], concurrentRoleSets: [], validateOptions: (o) => o ?? {}, createRuntime: (configuredOptions, hostCapabilities) => factory({ configuredOptions, hostCapabilities }) };
const loadModule = async () => ({ default: entry });
const closings = [];
let playerCalls = 0;
class Adapter {
  agent = 'claude-code';
  async *run(prompt) {
    let result;
    if (prompt.includes('Check whether existing instructions already answer')) result = '{"instructionIndex":0}';
    else if (prompt.includes('Classify the following Boss message')) result = '{"type":"BOSS_REPLY","questionId":"choice"}';
    else if (prompt.includes('You are Captain preparing an interrupted playbook')) result = JSON.stringify({ status: armed ? 'ready' : 'blocked', summary: armed ? 'Ready to continue.' : 'Need permission to continue.' });
    else if (prompt.includes('Select exactly one action')) result = '{"action":"recover"}';
    else if (prompt.includes('An action just settled')) {
      closings.push(prompt);
      if (armed && scenario === 'root-complete' && phase !== 'exit') kill();
      result = 'Work is saved. Review the available next action.';
    } else if (prompt.startsWith('You are the Playbook Captain shell hidden-control judge.')) {
      result = automatic && phase === 'start' && playerCalls === 1 ? '{"guard":"needsBossReply"}' : '{"guard":"done"}';
    } else if (prompt.includes('work:')) {
      playerCalls++;
      await appendFile(join(dir, 'calls'), 'player\n');
      if (!armed && !automatic) throw new Error('missing prerequisite');
      if (scenario === 'commit') { await writeFile(join(dir, 'work.txt'), 'finished'); git('add', 'work.txt'); git('commit', '-qm', 'completed work'); }
      result = automatic && phase === 'start' ? QUESTION : 'Done.';
    } else throw new Error('Unexpected fixture call: ' + prompt.slice(0, 100));
    yield createEvent('done', this.agent, { status: 'success', result, resumeToken: 'fixture-token', usage: { toolUses: 0 }, durationMs: 1 }, 'fixture');
  }
}
if (phase === 'start') {
  git('init', '-q'); git('config', 'user.name', 'Test'); git('config', 'user.email', 'test@example.invalid'); git('config', 'commit.gpgsign', 'false');
  await writeFile(join(dir, '.gitignore'), 'sessions/\ncalls\nconfig.yaml\n'); git('add', '.gitignore'); git('commit', '-qm', 'baseline');
  await writeFile(join(dir, 'config.yaml'), 'captain: { adapter: claude, model: fixture }\nplayers:\n  worker: { adapter: claude, model: fixture }\nplaybooks:\n  flow: { from: "mod://flow", roles: { worker: worker } }\n');
}
const store = createSessionStore({ sessionsDir: join(dir, 'sessions') });
const wrapped = { ...store, async acquire(id) {
  const lease = await store.acquire(id);
  return { ...lease,
    async checkpointRecovery(point) {
      await lease.checkpointRecovery(point);
      if (phase === 'start' && ((['repeated', 'before-dispatch'].includes(scenario) && armed && point.continuation?.kind === 'runtime') || (automatic && point.continuation?.kind === 'reply'))) kill();
    },
    async writeEffectLedger(authority, commands) {
      const before = await lease.read();
      const ledger = await lease.writeEffectLedger(authority, commands);
      if (armed && phase !== 'exit' && scenario !== 'root-complete' &&
          ledger.boundaries.some((b, i) => b.physicalReceipt && !before.effectLedger.boundaries[i]?.physicalReceipt)) kill();
      return ledger;
    },
  };
} };
const config = executionConfigFromPlan(await loadLaunchPlan({ userConfigPath: join(dir, 'config.yaml'), loadModule }));
let host = await openSessionHost({ store: wrapped, config, loadModule, cwd: dir, sessionId, mode: phase === 'start' ? 'new' : 'recover', adapterImports: { claude: async () => Adapter } });
if (phase === 'start') {
  const initial = await host.handleBossTurn('/flow original task');
  assert.equal(initial.snapshot.frames[0].runtime.state.stateId, 'failed');
  armed = true;
  if (scenario === 'whole-retry') await host.submitRuntimeAction('retry:START');
  else await host.recover('Prepare and continue.');
  throw new Error('expected SIGKILL');
} else if (phase === 'again') {
  await host.recover();
  throw new Error('expected second SIGKILL');
} else {
  const beforeCalls = await readFile(join(dir, 'calls'), 'utf8');
  const beforeHead = git('rev-parse', 'HEAD');
  const result = await host.recover();
  assert.equal(result.state, 'settled');
  assert.equal(await readFile(join(dir, 'calls'), 'utf8'), ['before-dispatch', 'automatic-answer'].includes(scenario) ? beforeCalls + 'player\n' : beforeCalls, JSON.stringify(result.snapshot.journal.slice(-4)));
  if (['root-complete', 'before-dispatch', 'automatic-answer'].includes(scenario)) {
    assert.equal(result.snapshot.mode, 'chat');
    if (scenario === 'before-dispatch') assert(closings.at(-1).includes('Captain preparation reported: Ready to continue.'));
    if (automatic) {
      assert(closings.at(-1).includes('Captain answered /flow using the existing task.'));
      assert(closings.at(-1).includes(QUESTION));
      assert(closings.at(-1).includes('Reused instruction (quoted): "original task"'));
    }
  }
  else {
    const runtime = result.snapshot.frames[0].runtime;
    assert.equal(runtime.retainedEffectReconciliation.interruptedTurn, true);
    assert.throws(() => assertPlaybookRuntimeSnapshot({ ...runtime, retainedEffectReconciliation: { ...runtime.retainedEffectReconciliation, interruptedTurn: false } }, 'flow'), /must be true/);
    if (runtime.failedEffectAttempt) assert.throws(() => assertPlaybookRuntimeSnapshot({ ...runtime, failedEffectAttempt: { boundaryPrefix: runtime.effectLedger.boundaries.length, attemptId: null } }, 'flow'), /exceeds the effect ledger/);
    await host.dispose();
    host = await openSessionHost({ store, config, loadModule, cwd: dir, sessionId, mode: 'continue', adapterImports: { claude: async () => Adapter } });
    const actions = host.listRuntimeActions();
    assert(actions.some((a) => a.id === 'abandon:unresolved-effect'));
    assert(actions.some((a) => a.id === 'reconcile:unresolved-effect'));
    const abandoned = await host.submitRuntimeAction('abandon:unresolved-effect');
    assert.equal(abandoned.snapshot.mode, 'chat');
  }
  assert.equal(git('rev-parse', 'HEAD'), beforeHead);
  assert.equal(git('rev-list', '--count', 'HEAD'), scenario === 'commit' ? '2' : '1');
  await host.dispose();
  console.log(JSON.stringify({ scenario, settled: true, preservedHead: beforeHead }));
}
