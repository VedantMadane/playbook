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
const later = scenario === 'later-step';
const preparation = scenario === 'preparation';
const retention = scenario.startsWith('retention-');
const question = retention || ['accepted-answer', 'waiting-question', 'reserved-question', 'before-first-step', 'automatic-answer'].includes(scenario);
const questionText = scenario === 'reserved-question' ? 'Should I remove the undeclared variable?' : 'Which database should I use?';
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
      onDone: question ? [{ guard: ({ event }) => event.output.guard === 'needsBossReply', target: 'awaitBossReply', actions: assign({ pendingBossQuestion: ({ event }) => ({ questionId: 'q-1', resumeStateId: 'work', sourceItem: 'FLOW-2', asker: { kind: 'role', roleId: 'worker' }, question: event.output.question }) }) }, { target: 'done' }] : (later ? 'after' : 'done'), onError: 'failed',
    },
  };
  const factory = createXStatePlaybookRuntime(createMachine({ initial: 'ready', context: { task: '' }, states: {
    ready: { meta: meta('ready'), tags: ['playbook.parked'], on: { START: { target: 'work', actions: assign({ task: ({ event }) => event.text }) } } },
    work, ...(later ? { after: { meta: { playbook: { stateId: 'after', description: 'Check the earlier work', role: 'worker' } }, tags: ['playbook.busy'], invoke: { src: 'player', input: { stateId: 'after', sourceItem: 'FLOW-3', role: 'worker', prompt: 'Later step', result: { done: 'The check is complete.' } }, onDone: 'done', onError: 'failed' } } } : {}), awaitBossReply: { meta: meta('awaitBossReply'), tags: ['playbook.parked'], on: { BOSS_REPLY: { target: 'work', actions: assign({ bossReply: ({ event }) => event.answer }) } } }, failed: { meta: meta('failed'), tags: ['playbook.parked'], on: { START: 'work' } }, done: { meta: scenario === 'completed-terminal-only' ? { playbook: { stateId: 'done', description: 'The task needs a different approach.', terminal: 'failure' } } : meta('done'), type: 'final' },
  } }), { label: id, compat: { artifactSchema: 3, runtimeAbi: 1 }, snapshotOptions: () => ({}), unfinishedFinalStateIds: [], scriptCwd: () => dir,
    entryEvent: { type: 'START', textField: 'text' }, roleStates: parent || script ? {} : { work: { role: 'worker', label: 'Complete the task' }, ...(later ? { after: { role: 'worker', label: 'Check the earlier work' } } : {}) },
    outcomeAuthority: { governedPlayerStates: parent || script ? {} : { ...(later ? { after: { done: { fields: {}, repositoryDisposition: 'unchanged' } } } : {}), work: { ...(question ? { needsBossReply: { fields: { question: 'presentation' }, repositoryDisposition: 'unchanged' } } : {}), done: { fields: {}, repositoryDisposition: 'one-descendant-commit' }, failed: { fields: {}, repositoryDisposition: 'unchanged' } } } },
  });
  return { id, command: id, intent: 'Complete a task', artifactSchema: 3, runtimeProfile: { kind: 'shared-factory', compat: factory.compat }, requiredRoleIds: parent || script ? [] : ['worker'], concurrentRoleSets: [], validateOptions: () => ({}), createRuntime: (configuredOptions, hostCapabilities) => {
    const runtime = factory({ configuredOptions, hostCapabilities });
    if (scenario !== 'completed-terminal-only') return runtime;
    return { ...runtime, async handleBossInput(turn) { const result = await runtime.handleBossInput(turn); const { stateDescription, ...withoutDescription } = result; return withoutDescription; } };
  } };
}
const loadModule = async (id) => ({ default: entry(id.endsWith('leaf') ? 'leaf' : 'flow', id.endsWith('flow') && nested) });
class Adapter {
  agent = 'claude-code';
  async *run(prompt) {
    let result;
    if (prompt.includes('Check whether existing instructions already answer')) {
      if (scenario === 'automatic-answer') await writeFile(join(dir, 'answer-sent'), 'yes');
      result = scenario === 'automatic-answer' ? '{"instructionIndex":0}' : '{"instructionIndex":null}';
    }
    else if (prompt.includes('Classify the following Boss message')) result = '{"type":"BOSS_REPLY","questionId":"q-1"}';
    else if (prompt.includes('Select exactly one action')) {
      if (scenario === 'before-first-step' && phase === 'start') kill();
      result = prompt.includes('[Boss message]\nStop flow') ? '{"action":"dismiss"}' : '{"action":"respond","text":"Please choose how to continue."}';
    }
    else if (prompt.includes('You are Captain preparing an interrupted playbook')) {
      await appendFile(join(dir, 'calls'), 'preparation\n');
      await writeFile(join(dir, 'prepared'), 'ready');
      result = '{"status":"ready","summary":"The prerequisite is ready."}';
    } else if (prompt.includes('An action just settled')) {
      if (scenario === 'carried-cancel') { host.host.abortActiveTurn('cancel closing reply'); throw new Error('closing reply cancelled'); }
      result = 'The task is complete.';
    }
    else if (prompt.includes('hidden-control judge')) result = JSON.stringify({ guard: asking ? 'needsBossReply' : 'done' });
    else if (prompt === 'Later step') { await appendFile(join(dir, 'calls'), 'later\n'); result = 'Done.'; }
    else if (prompt.includes('work:')) {
      await appendFile(join(dir, 'calls'), 'player\n');
      if (preparation && phase === 'start') throw new Error('Prerequisite unavailable');
      asking = question && !(await readFile(join(dir, 'answer-sent'), 'utf8').catch(() => ''));
      if (asking) { result = questionText; } else {
      if (question) assert(prompt.includes(scenario === 'automatic-answer' ? 'Keep the accepted Boss instruction' : 'Use SQLite'), 'authored continuation must include accepted Boss answer');
      await writeFile(join(dir, 'work.txt'), 'finished'); git('add', 'work.txt'); if (scenario.startsWith('carried')) git('add', 'boss.txt'); git('commit', '-qm', 'work');
      if (scenario === 'player-before-receipt' && phase === 'start') kill();
      result = 'Done.';
      }
    } else throw new Error('Unexpected call: ' + prompt.slice(0, 100));
    yield createEvent('done', this.agent, { status: 'success', result, resumeToken: 'fixture', usage: { toolUses: 0 }, durationMs: 1 }, 'fixture');
  }
}
if (phase === 'start') {
  git('init', '-q'); git('config', 'user.name', 'Test'); git('config', 'user.email', 'test@example.invalid'); git('config', 'commit.gpgsign', 'false');
  await writeFile(join(dir, '.gitignore'), 'sessions/\ncalls\nconfig.yaml\nprepared\nanswer-sent\n'); git('add', '.gitignore'); if (scenario.startsWith('carried')) { await writeFile(join(dir, 'boss.txt'), 'original'); git('add', 'boss.txt'); } git('commit', '-qm', 'baseline');
  if (scenario.startsWith('carried')) await writeFile(join(dir, 'boss.txt'), 'Boss changes');
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
    if (scenario.includes('retention-lost') && change.step?.result === undefined && change.step?.kind === 'player' && await readFile(join(dir, 'answer-sent'), 'utf8').catch(() => '')) change = { ...change, snapshot: null };
    await lease.recordProgress(change);
    if (phase === 'again') throw new Error('A report must not write progress');
    if (phase === 'start') {
      if (later && change.step?.stateId === 'after' && change.step.result === undefined) kill();
      if (scenario.startsWith('completed') && change.step?.kind === 'completion') kill();
      if (['waiting-question', 'reserved-question'].includes(scenario) && change.snapshot?.frames?.at(-1).runtime.state.stateId === 'awaitBossReply') kill();
      if (change.step?.result !== undefined && (preparation ? change.step.kind === 'preparation' : !later && !scenario.startsWith('completed') && scenario !== 'carried-cancel' && (!question || !asking))) kill();
    }
  } };
} };
const config = executionConfigFromPlan(await loadLaunchPlan({ userConfigPath: join(dir, 'config.yaml'), loadModule }));
if (phase === 'cli') {
  const calls = await readFile(join(dir, 'calls'), 'utf8');
  let stdout = '', stderr = '';
  const result = await runPlaybookCli({ argv: ['run', '--session', sessionId, '--retry-uncertain'], cwd: dir, userConfigPath: join(dir, 'config.yaml'), sessionStore: wrapped, loadModule, adapterImports: { claude: async () => Adapter }, env: { ANTHROPIC_API_KEY: 'fixture' }, probeAdapterSdk: async () => true, stdout: { write: (text) => { stdout += text; } }, stderr: { write: (text) => { stderr += text; } } });
  assert.equal(result.code ?? result, 0, stderr);
  assert(stdout.includes('no work was repeated'));
  assert.equal((await store.read(sessionId)).state, 'settled');
  assert.equal(await readFile(join(dir, 'calls'), 'utf8'), calls, 'CLI reporting must start no work');
  console.log(JSON.stringify({ settled: true }));
  process.exit(0);
}
const events = [];
const beforeCalls = await readFile(join(dir, 'calls'), 'utf8');
if (phase === 'discard') {
  const before = await store.read(sessionId), lease = await store.acquire(sessionId);
  await lease.recordProgress({ snapshot: before.snapshot });
  await lease.discard({ attemptId: before.uncertain.attemptId });
  const after = await lease.read();
  assert.deepEqual(after.snapshot, before.snapshot);
  assert.equal(await readFile(join(dir, 'calls'), 'utf8'), beforeCalls);
  await lease.release(); console.log(JSON.stringify({ settled: true })); process.exit(0);
}
const host = await openSessionHost({ store: wrapped, config, loadModule, cwd: dir, sessionId, mode: phase === 'start' ? 'new' : 'recover', observers: [{ onRecord(event) { events.push(event); if (phase === 'again' && event.type === 'captain_reply') kill(); } }], adapterImports: { claude: async () => Adapter } });
if (phase === 'start') {
  if (scenario === 'carried-cancel') {
    await assert.rejects(host.handleBossTurn('/flow Keep the accepted Boss instruction'));
    const stopped = await host.read();
    assert.equal(stopped.state, 'settled');
    assert(JSON.stringify(stopped.snapshot.journal).includes('Pre-existing changes carried by commit'));
    assert(events.some((event) => event.type === 'captain_reply' && event.text.includes('Pre-existing changes carried by commit')), 'Boss must receive the carried-edits report even after closing cancellation');
    assert.equal(await readFile(join(dir, 'calls'), 'utf8'), 'player\n');
    await host.dispose(); console.log(JSON.stringify({ settled: true })); process.exit(0);
  }
  await host.handleBossTurn('/flow Keep the accepted Boss instruction');
  if (retention) {
    if (scenario.endsWith('same-root')) await host.handleBossTurn('Stop flow');
    await writeFile(join(dir, 'answer-sent'), 'yes');
    await host.handleBossTurn(scenario.endsWith('same-root') ? '/flow Use SQLite' : '/leaf Use SQLite');
  }
  if (scenario === 'before-first-step') await host.handleBossTurn('Please answer the pending question');
  if (scenario === 'accepted-answer') { await writeFile(join(dir, 'answer-sent'), 'yes'); await host.handleBossTurn('/flow Use SQLite'); }
  throw new Error('Expected process loss');
}
assert.equal(await readFile(join(dir, 'calls'), 'utf8'), beforeCalls, 'opening must start no work');
const record = await host.read();
if (scenario !== 'before-first-step') assert(record.uncertain.progress);
if (scenario === 'script-before-result') assert(record.uncertain.progress.steps.every((step) => step.result === undefined));
assert(!JSON.stringify(record.uncertain.progress ?? {}).includes('resumeToken'));
if (scenario === 'before-first-step') {
  const recovered = await host.recover();
  assert.equal(recovered.snapshot.mode, 'engaged.parked');
  assert.equal(recovered.snapshot.pendingBossQuestions[0].question, questionText);
  assert(recovered.snapshot.journal.filter((e) => e.kind === 'reply').at(-1).payload.includes('not processed'));
  assert.equal(await readFile(join(dir, 'calls'), 'utf8'), beforeCalls);
  await host.dispose(); console.log(JSON.stringify({ settled: true })); process.exit(0);
}
if (phase === 'exit') {
const savedStep = record.uncertain.progress.steps[0];
const position = record.uncertain.progress.snapshot === null ? null : { ...record.uncertain.progress.snapshot, effectLedger: record.effectLedger, ...(record.uncertain.progress.snapshot.frames ? { frames: record.uncertain.progress.snapshot.frames.map((frame) => ({ ...frame, runtime: { ...frame.runtime, effectLedger: record.effectLedger, ...(frame.runtime.failedEffectAttempt ? { failedEffectAttempt: { ...frame.runtime.failedEffectAttempt, attemptId: record.effectLedger.boundaries.find((entry) => entry.sequence > frame.runtime.failedEffectAttempt.boundaryPrefix)?.attemptId ?? null } } : {}) } })) } : {}) };
for (const step of [
  { ...savedStep, stateId: 'a different step' },
  { ...savedStep, id: '97000000-0000-4000-8000-000000000099', result: { guard: 'done' } },
  ...(savedStep.result === undefined ? [] : [{ ...savedStep, result: { changed: true } }]),
]) {
  await assert.rejects(host.lease.recordProgress({ snapshot: position, step }), /saved step cannot be replaced|result requires its saved start/);
  assert.deepEqual(await host.read(), record, 'rejected progress must not change the record');
}
if (savedStep.result !== undefined) await host.lease.recordProgress({ step: savedStep });
if (position) {
  const wrongController = structuredClone(position); wrongController.captain.runtime.sequences.trace++;
  await assert.rejects(host.lease.recordProgress({ snapshot: wrongController }), /retain the settled controller/);
  if (position.journal.length) {
    const wrongJournal = structuredClone(position); wrongJournal.journal[0].payload = 'Changed Boss input';
    await assert.rejects(host.lease.recordProgress({ snapshot: wrongJournal }), /retain the settled controller/);
  }
  const { result: _savedResult, ...start } = savedStep;
  await assert.rejects(host.lease.recordProgress({ snapshot: position, step: { ...start, id: 'invalid-id' } }), /UUID/);
  assert.deepEqual(await host.read(), record);
}
}

await assert.rejects(host.lease.discard({ attemptId: record.uncertain.attemptId }));
const recovered = await host.recover();
assert.equal(recovered.state, 'settled');
if (!script && !preparation && !['waiting-question', 'reserved-question'].includes(scenario)) assert(recovered.snapshot.journal.filter((entry) => entry.kind === 'reply').at(-1).payload.includes(git('rev-parse', 'HEAD')));
if (scenario.startsWith('carried')) assert(recovered.snapshot.journal.filter((entry) => entry.kind === 'reply').at(-1).payload.includes('Pre-existing changes carried by commit'));
assert(!recovered.snapshot.journal.filter((entry) => entry.kind === 'reply').at(-1).payload.includes('Saved 1'));
assert.equal(await readFile(join(dir, 'calls'), 'utf8'), beforeCalls, 'reporting must start no work');
if (retention) {
  if (scenario.includes('lost')) assert.equal(recovered.snapshot.mode, 'chat');
  else assert.equal(recovered.snapshot.frames[0].playbookId, 'leaf');
  assert(recovered.retainedGenerations?.flow, 'the earlier generation owns none of this attempt’s work');
  assert.equal(recovered.retainedGenerations.flow.frames[0].sessionId, record.retainedGenerations.flow.frames[0].sessionId);
  assert.equal(await readFile(join(dir, 'calls'), 'utf8'), beforeCalls);
  await host.dispose(); console.log(JSON.stringify({ settled: true })); process.exit(0);
}
if (!scenario.startsWith('completed')) {
  assert.equal(recovered.snapshot.mode, 'engaged.parked');
  assert.equal(recovered.snapshot.frames.length, nested ? 2 : 1);
  assert.equal(recovered.snapshot.frames.at(-1).runtime.recoveryCheckpoint.machine.context.task, 'Keep the accepted Boss instruction');
}
if (scenario === 'accepted-answer') assert.equal(recovered.snapshot.frames.at(-1).runtime.recoveryCheckpoint.machine.context.bossReply, 'Use SQLite');
if (['waiting-question', 'reserved-question'].includes(scenario)) assert(recovered.snapshot.journal.filter((entry) => entry.kind === 'reply').at(-1).payload.includes(questionText));
if (scenario === 'completed-terminal-only') assert(recovered.snapshot.journal.filter((entry) => entry.kind === 'reply').at(-1).payload.includes('/flow stopped with a failure. The task needs a different approach.'));
if (scenario === 'automatic-answer') {
  assert(record.uncertain.progress.steps.some((step) => step.kind === 'answer'));
  assert(recovered.snapshot.journal.filter((entry) => entry.kind === 'reply').at(-1).payload.includes('Captain selected the original task as the answer'));
}
if (scenario === 'completed') assert(recovered.snapshot.journal.filter((entry) => entry.kind === 'reply').at(-1).payload.includes('/flow finished. done'));
if (!later && !preparation && !['waiting-question', 'reserved-question'].includes(scenario) && !scenario.includes('before-') && !scenario.startsWith('completed')) {
  const action = host.listRuntimeActions().find((action) => action.label.startsWith('Continue from saved result'));
  assert(action, JSON.stringify(host.listRuntimeActions()));
  const done = await host.submitRuntimeAction(action.id);
  assert.equal(done.snapshot.mode, 'chat');
  assert.equal(await readFile(join(dir, 'calls'), 'utf8'), beforeCalls, 'accepting the saved result must not repeat work');
}
if (later || scenario === 'player-before-receipt') {
  const after = await host.handleBossTurn('/flow Please do the second task instead');
  assert.equal(after.snapshot.mode, 'engaged.parked');
  assert.equal(await readFile(join(dir, 'calls'), 'utf8'), beforeCalls, 'unaccepted input must not trigger automatic recovery');
  const outcomes = after.snapshot.journal.filter((entry) => entry.kind === 'outcome' && entry.turn === after.snapshot.sequences.turn);
  assert(!JSON.stringify(outcomes).includes('Delivered the Boss text'));
  if (later) {
    const action = host.listRuntimeActions().find((action) => action.id === 'retry:step');
    assert(action);
    assert.equal((await host.submitRuntimeAction(action.id)).snapshot.mode, 'chat');
    assert.equal(await readFile(join(dir, 'calls'), 'utf8'), beforeCalls + 'later\n');
  }
}
if (scenario === 'script-before-rename') {
  const action = host.listRuntimeActions().find((action) => action.id.startsWith('retry:'));
  assert(action && !action.label.startsWith('Continue from saved result'));
  const done = await host.submitRuntimeAction(action.id);
  assert.equal(done.snapshot.mode, 'chat');
  assert.equal(await readFile(join(dir, 'calls'), 'utf8'), beforeCalls + 'script\n', 'only Boss may choose to repeat unfinished work');
}
await host.dispose();
console.log(JSON.stringify({ settled: true }));
