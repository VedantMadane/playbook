// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { appendFile, readFile, writeFile, rename } from 'node:fs/promises';
import { join } from 'node:path';
import { assign, createMachine } from 'xstate';
import { createEvent } from '@sublang/cligent';
import { createXStatePlaybookRuntime } from '../../../../src/xstate-runtime.js';
import { createSessionStore } from '../session-store.js';
import { openSessionHost } from '../session-host.js';
import { executionConfigFromPlan } from '../bin/run.js';
import { runPlaybookCli } from '../bin/playbook.js';
import { loadLaunchPlan } from '../bin/launch-config.js';

const [dir, scenario, phase] = process.argv.slice(2);
const sessionId = '97000000-0000-4000-8000-000000000001';
const git = (...args) => execFileSync('git', args, { cwd: dir, encoding: 'utf8' }).trim();
const kill = () => process.kill(process.pid, 'SIGKILL');
const nested = scenario.startsWith('nested');
const script = scenario.includes('script');
const preparation = scenario === 'preparation';
const question = ['accepted-answer', 'waiting-question'].includes(scenario);
let asking = false;
const meta = (stateId) => ({ playbook: { stateId, description: stateId } });
function entry(id, parent = false) {
  const work = parent ? {
    meta: meta('work'), tags: ['playbook.suspended'], invoke: {
      src: 'playbook', input: ({ context }) => ({ stateId: 'work', sourceItem: 'FLOW-1', playbookId: 'leaf', text: context.task }), onDone: 'done', onError: 'failed',
    },
  } : {
    meta: { playbook: { stateId: 'work', description: 'Complete the task', ...(script ? {} : { role: 'worker' }) } }, tags: ['playbook.busy'], invoke: {
      src: script ? 'script' : 'player', input: ({ context }) => ({ stateId: 'work', sourceItem: 'FLOW-2',
        ...(script ? { command: `echo script >> calls${scenario === 'script-before-result' && phase === 'start' ? '; kill -KILL $PPID' : ''}` } : { role: 'worker', prompt: `work: ${context.task}`, ...(context.bossReply ? { bossReply: context.bossReply, pendingBossQuestion: context.pendingBossQuestion } : {}) }), result: { done: 'Done.', failed: 'Failed.', ...(question ? { needsBossReply: 'Ask Boss. Output shall include `question: <question>`.' } : {}) } }),
      onDone: question ? [{ guard: ({ event }) => event.output.guard === 'needsBossReply', target: 'awaitBossReply', actions: assign({ pendingBossQuestion: ({ event }) => ({ questionId: 'q-1', resumeStateId: 'work', sourceItem: 'FLOW-2', asker: { kind: 'role', roleId: 'worker' }, question: event.output.question }) }) }, { target: 'done' }] : 'done', onError: 'failed',
    },
  };
  const factory = createXStatePlaybookRuntime(createMachine({ initial: 'ready', context: { task: '' }, states: {
    ready: { meta: meta('ready'), tags: ['playbook.parked'], on: { START: { target: 'work', actions: assign({ task: ({ event }) => event.text }) } } },
    work, awaitBossReply: { meta: meta('awaitBossReply'), tags: ['playbook.parked'], on: { BOSS_REPLY: { target: 'work', actions: assign({ bossReply: ({ event }) => event.answer }) } } }, failed: { meta: meta('failed'), tags: ['playbook.parked'], on: { START: 'work' } }, done: { meta: meta('done'), type: 'final' },
  } }), { label: id, compat: { artifactSchema: 3, runtimeAbi: 1 }, snapshotOptions: () => ({}), scriptCwd: () => dir,
    entryEvent: { type: 'START', textField: 'text' }, roleStates: parent || script ? {} : { work: { role: 'worker', label: 'Complete the task' } },
    outcomeAuthority: { governedPlayerStates: parent || script ? {} : { work: { ...(question ? { needsBossReply: { fields: { question: 'presentation' }, repositoryDisposition: 'unchanged' } } : {}), done: { fields: {}, repositoryDisposition: 'one-descendant-commit' }, failed: { fields: {}, repositoryDisposition: 'unchanged' } } } },
  });
  return { id, command: id, intent: 'Complete a task', artifactSchema: 3, runtimeProfile: { kind: 'shared-factory', compat: factory.compat }, requiredRoleIds: parent || script ? [] : ['worker'], concurrentRoleSets: [], validateOptions: () => ({}), createRuntime: (configuredOptions, hostCapabilities) => factory({ configuredOptions, hostCapabilities }) };
}
const loadModule = async (id) => ({ default: entry(id.endsWith('leaf') ? 'leaf' : 'flow', id.endsWith('flow') && nested) });
class Adapter {
  agent = 'claude-code';
  async *run(prompt) {
    let result;
    if (prompt.includes('Check whether existing instructions already answer')) result = '{"instructionIndex":null}';
    else if (prompt.includes('Classify the following Boss message')) result = '{"type":"BOSS_REPLY","questionId":"q-1"}';
    else if (prompt.includes('Select exactly one action')) result = '{"action":"recover"}';
    else if (prompt.includes('You are Captain preparing an interrupted playbook')) {
      await appendFile(join(dir, 'calls'), 'preparation\n');
      await writeFile(join(dir, 'prepared'), 'ready');
      result = '{"status":"ready","summary":"The prerequisite is ready."}';
    } else if (prompt.includes('An action just settled')) result = 'The task is complete.';
    else if (prompt.includes('hidden-control judge')) result = JSON.stringify({ guard: asking ? 'needsBossReply' : 'done' });
    else if (prompt.includes('work:')) {
      await appendFile(join(dir, 'calls'), 'player\n');
      if (preparation && phase === 'start') throw new Error('Prerequisite unavailable');
      asking = question && !(await readFile(join(dir, 'answer-sent'), 'utf8').catch(() => ''));
      if (asking) { result = 'Which database should I use?'; } else {
      if (question) assert(prompt.includes('Use SQLite'), 'authored continuation must include accepted Boss answer');
      await writeFile(join(dir, 'work.txt'), 'finished'); git('add', 'work.txt'); if (scenario === 'carried') git('add', 'boss.txt'); git('commit', '-qm', 'work');
      if (scenario === 'player-before-receipt' && phase === 'start') kill();
      result = 'Done.';
      }
    } else throw new Error('Unexpected call: ' + prompt.slice(0, 100));
    yield createEvent('done', this.agent, { status: 'success', result, resumeToken: 'fixture', usage: { toolUses: 0 }, durationMs: 1 }, 'fixture');
  }
}
if (phase === 'start') {
  git('init', '-q'); git('config', 'user.name', 'Test'); git('config', 'user.email', 'test@example.invalid'); git('config', 'commit.gpgsign', 'false');
  await writeFile(join(dir, '.gitignore'), 'sessions/\ncalls\nconfig.yaml\nprepared\nanswer-sent\n'); git('add', '.gitignore'); if (scenario === 'carried') { await writeFile(join(dir, 'boss.txt'), 'original'); git('add', 'boss.txt'); } git('commit', '-qm', 'baseline');
  if (scenario === 'carried') await writeFile(join(dir, 'boss.txt'), 'Boss changes');
  await writeFile(join(dir, 'calls'), '');
  await writeFile(join(dir, 'config.yaml'), `captain: { adapter: claude, model: fixture }\nplayers:\n  worker: { adapter: claude, model: fixture }\nplaybooks:\n  flow: { from: "mod://flow", roles: ${nested || script ? '{}' : '{ worker: worker }'} }\n  leaf: { from: "mod://leaf", roles: ${script ? '{}' : '{ worker: worker }'} }\n`);
}
const store = createSessionStore({ sessionsDir: join(dir, 'sessions'), fsOps: { async rename(from, to) {
  const point = phase === 'start' && scenario.includes('rename') && String(from).endsWith('.tmp')
    ? JSON.parse(await readFile(from, 'utf8')) : undefined;
  const savingResult = point?.uncertain?.progress?.steps.some((step) => step.result !== undefined);
  if (savingResult && scenario === 'script-before-rename') kill();
  await rename(from, to);
  if (savingResult && scenario === 'script-after-rename') kill();
} } });
const wrapped = { ...store, async acquire(id) {
  const lease = await store.acquire(id);
  return { ...lease, async recordProgress(change) {
    await lease.recordProgress(change);
    if (phase === 'again') kill();
    if (phase === 'start') {
      if (scenario === 'completed' && change.snapshot?.mode === 'chat' && !change.step) kill();
      if (scenario === 'waiting-question' && change.snapshot?.frames?.at(-1).runtime.state.stateId === 'awaitBossReply') kill();
      if (change.step?.result !== undefined && (preparation ? change.step.kind === 'preparation' : scenario !== 'completed' && (!question || !asking))) kill();
    }
  } };
} };
const config = executionConfigFromPlan(await loadLaunchPlan({ userConfigPath: join(dir, 'config.yaml'), loadModule }));
if (phase === 'cli') {
  let stdout = '', stderr = '';
  const result = await runPlaybookCli({ argv: ['run', '--session', sessionId, '--retry-uncertain'], cwd: dir, userConfigPath: join(dir, 'config.yaml'), sessionStore: wrapped, loadModule, adapterImports: { claude: async () => Adapter }, env: { ANTHROPIC_API_KEY: 'fixture' }, probeAdapterSdk: async () => true, stdout: { write: (text) => { stdout += text; } }, stderr: { write: (text) => { stderr += text; } } });
  assert.equal(result.code ?? result, 0, stderr);
  assert(stdout.includes('no work was repeated'));
  assert.equal((await store.read(sessionId)).state, 'settled');
  console.log(JSON.stringify({ settled: true }));
  process.exit(0);
}
const beforeCalls = await readFile(join(dir, 'calls'), 'utf8');
const host = await openSessionHost({ store: wrapped, config, loadModule, cwd: dir, sessionId, mode: phase === 'start' ? 'new' : 'recover', adapterImports: { claude: async () => Adapter } });
if (phase === 'start') {
  await host.handleBossTurn('/flow Keep the accepted Boss instruction');
  if (scenario === 'accepted-answer') { await writeFile(join(dir, 'answer-sent'), 'yes'); await host.handleBossTurn('/flow Use SQLite'); }
  throw new Error('Expected process loss');
}
assert.equal(await readFile(join(dir, 'calls'), 'utf8'), beforeCalls, 'opening must start no work');
const record = await host.read();
assert(record.uncertain.progress);
assert(!JSON.stringify(record.uncertain.progress).includes('resumeToken'));
if (phase === 'exit') {
const savedStep = record.uncertain.progress.steps[0];
for (const step of [
  { ...savedStep, stateId: 'a different step' },
  { ...savedStep, id: '97000000-0000-4000-8000-000000000099', result: { guard: 'done' } },
  ...(savedStep.result === undefined ? [] : [{ ...savedStep, result: { changed: true } }]),
]) {
  await assert.rejects(host.lease.recordProgress({ step }));
  assert.deepEqual(await host.read(), record, 'rejected progress must not change the record');
}
if (savedStep.result !== undefined) await host.lease.recordProgress({ step: savedStep });
}

await assert.rejects(host.lease.discard({ attemptId: record.uncertain.attemptId }));
const recovered = await host.recover();
assert.equal(recovered.state, 'settled');
if (!script && !preparation && scenario !== 'waiting-question') assert(recovered.snapshot.journal.filter((entry) => entry.kind === 'reply').at(-1).payload.includes(git('rev-parse', 'HEAD')));
if (scenario === 'carried') assert(recovered.snapshot.journal.filter((entry) => entry.kind === 'reply').at(-1).payload.includes('Pre-existing changes carried by commit'));
assert(!recovered.snapshot.journal.filter((entry) => entry.kind === 'reply').at(-1).payload.includes('Saved 1'));
assert.equal(await readFile(join(dir, 'calls'), 'utf8'), beforeCalls, 'reporting must start no work');
if (scenario !== 'completed') {
  assert.equal(recovered.snapshot.mode, 'engaged.parked');
  assert.equal(recovered.snapshot.frames.length, nested ? 2 : 1);
  assert.equal(recovered.snapshot.frames.at(-1).runtime.recoveryCheckpoint.machine.context.task, 'Keep the accepted Boss instruction');
}
if (scenario === 'accepted-answer') assert.equal(recovered.snapshot.frames.at(-1).runtime.recoveryCheckpoint.machine.context.bossReply, 'Use SQLite');
if (scenario === 'waiting-question') assert(recovered.snapshot.journal.filter((entry) => entry.kind === 'reply').at(-1).payload.includes('Which database should I use?'));
if (!preparation && scenario !== 'waiting-question' && !scenario.includes('before-') && scenario !== 'completed') {
  const action = host.listRuntimeActions().find((action) => action.label.includes('saved result'));
  assert(action, JSON.stringify(host.listRuntimeActions()));
  const done = await host.submitRuntimeAction(action.id);
  assert.equal(done.snapshot.mode, 'chat');
  assert.equal(await readFile(join(dir, 'calls'), 'utf8'), beforeCalls, 'accepting the saved result must not repeat work');
}
if (scenario === 'script-before-rename') {
  const action = host.listRuntimeActions().find((action) => action.id.startsWith('retry:'));
  assert(action && !action.label.includes('saved result'));
  const done = await host.submitRuntimeAction(action.id);
  assert.equal(done.snapshot.mode, 'chat');
  assert.equal(await readFile(join(dir, 'calls'), 'utf8'), beforeCalls + 'script\n', 'only Boss may choose to repeat unfinished work');
}
await host.dispose();
console.log(JSON.stringify({ settled: true }));
