// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// A real process is killed after a durable write, without running abort cleanup.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { writeFile, appendFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { assign, createMachine } from 'xstate';
import { createEvent } from '@sublang/cligent';
import { createXStatePlaybookRuntime } from '../../../../src/xstate-runtime.js';
import { createSessionStore } from '../session-store.js';
import { openSessionHost } from '../session-host.js';
import { executionConfigFromPlan } from '../bin/run.js';
import { loadLaunchPlan } from '../bin/launch-config.js';

const [dir, scenario, phase] = process.argv.slice(2);
const automatic = scenario === 'automatic-answer';
const retryQuestion = scenario === 'retry-question';
const hasQuestion = automatic || retryQuestion;
const fromChat = ['from-chat', 'before-receipt'].includes(scenario);
const commits = ['commit', 'from-chat', 'before-receipt', 'closing-cancel', 'switch', 'same-root'].includes(scenario);
let closingAborted = false;
let newAttempt = false, failedNewAttempt = false;
const QUESTION = 'Which option should I use: preview or production?';
const sessionId = '95000000-0000-4000-8000-000000000031';
const git = (...args) => execFileSync('git', args, { cwd: dir, encoding: 'utf8' }).trim();
let armed = phase !== 'start' || fromChat;
const kill = () => process.kill(process.pid, 'SIGKILL');
const meta = (stateId) => ({ playbook: { stateId, description: stateId } });
const factory = createXStatePlaybookRuntime(createMachine({
  context: { task: '', pendingBossQuestion: undefined, bossReply: undefined }, initial: 'ready', states: {
    ready: { meta: meta('ready'), tags: ['playbook.parked'], on: { START: { target: 'work', actions: assign({ task: ({ event }) => event.text }) } } },
    work: { meta: { playbook: { stateId: 'work', description: 'Do work', role: 'worker' } }, tags: ['playbook.busy'], invoke: {
      src: 'player', input: ({ context }) => ({ stateId: 'work', sourceItem: 'WORK-1', role: 'worker', prompt: `work: ${context.task}`, ...(context.bossReply === undefined ? {} : { pendingBossQuestion: context.pendingBossQuestion, bossReply: context.bossReply }),
        result: { done: 'Done.', ...(hasQuestion ? { needsBossReply: 'A question for Boss. Output shall include `question: <verbatim question>`.' } : {}) } }),
      onDone: hasQuestion ? [
        { guard: ({ event }) => event.output.guard === 'needsBossReply', target: 'awaitBossReply', actions: assign({ pendingBossQuestion: ({ event }) => ({ questionId: 'choice', resumeStateId: 'work', sourceItem: 'WORK-1', asker: { kind: 'role', roleId: 'worker' }, question: event.output.question }), bossReply: () => undefined }) },
        { target: 'done' },
      ] : { target: 'done', actions: { type: 'playbook.acceptedOutcome', params: { source: 'work', target: 'done', acceptedOutcome: 'done' } } }, onError: 'failed',
    } },
    awaitBossReply: { meta: meta('awaitBossReply'), tags: ['playbook.parked'], on: { BOSS_REPLY: { target: 'work', actions: assign({ bossReply: ({ event }) => event.answer }) } } },
    failed: { meta: meta('failed'), tags: ['playbook.parked'], on: { START: 'work' } },
    done: { meta: meta('done'), type: 'final' },
  },
}), {
  label: 'flow', compat: { artifactSchema: 3, runtimeAbi: 1 }, snapshotOptions: () => ({}), unfinishedFinalStateIds: new Set(),
  entryEvent: { type: 'START', textField: 'text' }, roleStates: { work: { role: 'worker', label: 'Do work' } },
  verbatimPayloadFields: new Set(hasQuestion ? ['question'] : []),
  outcomeAuthority: { governedPlayerStates: { work: { done: { fields: {}, repositoryDisposition: commits ? 'one-descendant-commit' : 'unchanged' }, ...(hasQuestion ? { needsBossReply: { fields: { question: 'presentation' }, repositoryDisposition: 'unchanged' } } : {}) } } },
});
const entry = { summaryPolicy: { stateCountLabels: { work: 'work step' }, copyPasteGuardNames: ['done'], savedCountsLine: (counts, rounds) => `Saved ${counts.interruptions} replies, ${counts.copyPastes} copies, ${rounds} rounds.` }, id: 'flow', command: 'flow', intent: 'Work', artifactSchema: 3, runtimeProfile: { kind: 'shared-factory', compat: factory.compat }, requiredRoleIds: ['worker'], concurrentRoleSets: [], validateOptions: (o) => o ?? {}, createRuntime: (configuredOptions, hostCapabilities) => factory({ configuredOptions, hostCapabilities }) };
const loadModule = async (id) => ({ default: id.endsWith('other') ? { ...entry, id: 'other', command: 'other' } : entry });
const closings = [];
let playerCalls = 0, questionChecks = 0;
class Adapter {
  agent = 'claude-code';
  async *run(prompt) {
    let result;
    if (prompt.includes('Check whether existing instructions already answer')) { questionChecks++; result = '{"instructionIndex":0}'; }
    else if (prompt.includes('Classify the following Boss message')) result = '{"type":"BOSS_REPLY","questionId":"choice"}';
    else if (prompt.includes('You are Captain preparing an interrupted playbook')) {
      if (armed && phase === 'start' && scenario === 'preparation-only') kill();
      result = JSON.stringify({ status: armed ? 'ready' : 'blocked', summary: armed ? 'Ready to continue.' : 'Need permission to continue.' });
    }
    else if (prompt.includes('Select exactly one action')) {
      if (prompt.includes('[Boss message]\nStop the task')) result = '{"action":"dismiss"}';
      else if (prompt.includes('[Boss message]\nExplain saved work')) {
        if (phase === 'chat') kill();
        result = JSON.stringify({ action: 'respond', text: 'Your work is saved and ready to inspect.' });
      } else result = '{"action":"recover"}';
    }
    else if (prompt.includes('An action just settled')) {
      closings.push(prompt);
      if (armed && scenario === 'root-complete' && phase !== 'exit') kill();
      if (armed && scenario === 'closing-cancel' && phase === 'start') { closingAborted = true; host.host.abortActiveTurn('cancel closing reply'); }
      result = 'Work is saved. Review the available next action.';
    } else if (prompt.startsWith('You are the Playbook Captain shell hidden-control judge.')) {
      result = ((automatic && phase === 'start' && playerCalls === 1) || retryQuestion) ? '{"guard":"needsBossReply"}' : '{"guard":"done"}';
    } else if (prompt.includes('work:')) {
      playerCalls++;
      await appendFile(join(dir, 'calls'), 'player\n');
      if (!armed && !automatic) throw new Error('missing prerequisite');
      if (newAttempt && !failedNewAttempt) { failedNewAttempt = true; throw new Error('prepare new attempt'); }
      if (commits) { await writeFile(join(dir, 'work.txt'), 'finished'); git('add', 'work.txt'); if (scenario === 'closing-cancel') git('add', 'boss.txt'); git('commit', '-qm', 'completed work'); }
      if (scenario === 'before-receipt' && phase === 'start') kill();
      result = (automatic && phase === 'start') || retryQuestion ? QUESTION : 'Done.';
    } else throw new Error('Unexpected fixture call: ' + prompt.slice(0, 100));
    yield createEvent('done', this.agent, { status: 'success', result, resumeToken: 'fixture-token', usage: { toolUses: 0 }, durationMs: 1 }, 'fixture');
  }
}
if (phase === 'start') {
  git('init', '-q'); git('config', 'user.name', 'Test'); git('config', 'user.email', 'test@example.invalid'); git('config', 'commit.gpgsign', 'false');
  if (scenario === 'closing-cancel') { await writeFile(join(dir, 'boss.txt'), 'original'); git('add', 'boss.txt'); }
  await writeFile(join(dir, '.gitignore'), 'sessions/\ncalls\nconfig.yaml\n'); git('add', '.gitignore'); git('commit', '-qm', 'baseline');
  if (scenario === 'closing-cancel') await writeFile(join(dir, 'boss.txt'), 'Boss pre-existing edit');
  await writeFile(join(dir, 'config.yaml'), 'captain: { adapter: claude, model: fixture }\nplayers:\n  worker: { adapter: claude, model: fixture }\nplaybooks:\n  flow: { from: "mod://flow", roles: { worker: worker } }\n  other: { from: "mod://other", roles: { worker: worker } }\n');
}
const store = createSessionStore({ sessionsDir: join(dir, 'sessions') });
const wrapped = { ...store, async acquire(id) {
  const lease = await store.acquire(id);
  return { ...lease,
    async checkpointRecovery(point) {
      await lease.checkpointRecovery(point);
      if (point.continuation?.kind === 'settle' && ((phase === 'again' && scenario === 'retry-save') || closingAborted)) kill();
      if (phase === 'start' && ((['repeated', 'retry-save', 'before-dispatch', 'retry-question'].includes(scenario) && armed && point.continuation?.kind === 'runtime') || (automatic && point.continuation?.kind === 'reply'))) kill();
    },
    async writeEffectLedger(authority, commands) {
      const before = await lease.read();
      const ledger = await lease.writeEffectLedger(authority, commands);
      if (armed && phase !== 'exit' && (scenario !== 'same-root' || ledger.boundaries.some((b) => b.physicalReceipt?.classification === 'one-descendant-commit')) && !['root-complete', 'retry-save', 'closing-cancel', 'preparation-only'].includes(scenario) &&
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
  if (scenario === 'same-root') { await host.handleBossTurn('Stop the task'); newAttempt = true; }
  armed = true;
  if (scenario === 'same-root') await host.handleBossTurn('/flow A different attempt.');
  else if (scenario === 'switch') await host.handleBossTurn('/other Do other work.');
  else if (scenario === 'whole-retry') await host.submitRuntimeAction('retry:START');
  else await host.recover('Prepare and continue.');
  throw new Error('expected SIGKILL');
} else if (phase === 'again') {
  await host.recover();
  throw new Error('expected second SIGKILL');
} else {
  if (scenario === 'root-complete') {
    const record = await host.read();
    const point = record.uncertain.recovery;
    assert.equal(point.continuation.status, 'ok');
    for (const mutate of [
      (s) => { s.report.counts.interruptions = -1; },
      (s) => { s.report.progressRounds = 0.5; },
      (s) => { s.report.progressPhrase = ''; },
      (s) => { s.report.status = 'failed'; },
      (s) => { s.extra = true; },
      (s) => { s.retentionUpdates = [{ kind: 'clear', rootPlaybookId: 'absent' }]; },
      (s) => { s.retentionUpdates = [{ kind: 'retain', rootPlaybookId: 'flow', generation: {} }]; },
      (s) => { s.unresolvedEffects = [{ classification: 'incomplete', baselineHead: 'invalid' }]; },
    ]) {
      const invalid = structuredClone(point); mutate(invalid.continuation.settlement);
      await assert.rejects(host.lease.checkpointRecovery(invalid));
      assert.deepEqual(await host.read(), record);
    }
  }
  const beforeCalls = await readFile(join(dir, 'calls'), 'utf8');
  const beforeHead = git('rev-parse', 'HEAD');
  const result = await host.recover();
  assert.equal(result.state, 'settled');
  if (scenario === 'later-chat') {
    if (phase === 'chat') { await host.handleBossTurn('Explain saved work'); throw new Error('expected chat SIGKILL'); }
    assert.equal(result.snapshot.lastAction, 'respond');
    assert.equal(result.snapshot.journal.filter((r) => r.kind === 'boss').at(-1).payload, 'Explain saved work');
    assert.equal(await readFile(join(dir, 'calls'), 'utf8'), beforeCalls);
    await host.dispose();
    console.log(JSON.stringify({ scenario, settled: true }));
    process.exit(0);
  }
  assert.equal(await readFile(join(dir, 'calls'), 'utf8'), ['before-dispatch', 'automatic-answer', 'preparation-only', 'retry-question'].includes(scenario) ? beforeCalls + 'player\n' : beforeCalls, JSON.stringify(result.snapshot.journal.slice(-4)));
  if (retryQuestion) {
    assert.equal(questionChecks, 0, 'Retry must not add an automatic question check');
    assert.equal(result.snapshot.mode, 'engaged.parked');
    assert.equal(result.snapshot.frames[0].runtime.state.stateId, 'awaitBossReply');
    assert(closings.at(-1).includes(QUESTION));
  }
  else if (['root-complete', 'before-dispatch', 'automatic-answer', 'closing-cancel', 'retry-save', 'preparation-only'].includes(scenario)) {
    assert.equal(result.snapshot.mode, 'chat');
    assert.equal(result.retainedGenerations?.flow, undefined);
    if (['root-complete', 'closing-cancel', 'retry-save'].includes(scenario)) {
      assert.equal(result.snapshot.lastSettlementStatus, 'ok');
      assert(closings.at(-1).includes('Saved 1 replies, 1 copies, 1 rounds.'));
      assert(closings.at(-1).includes('Counts: {"interruptions":1,"copyPastes":1,"progressRounds":1}'));
    }
    if (scenario === 'closing-cancel') { assert(result.snapshot.journal.filter((r) => r.kind === 'reply').at(-1).payload.includes('Pre-existing changes carried by commit'));  assert(closings.at(-1).includes('boss.txt')); }
    if (scenario === 'before-dispatch') assert(closings.at(-1).includes('Captain preparation reported: Ready to continue.'));
    if (automatic) {
      assert(closings.at(-1).includes('Captain answered /flow using the existing task.'));
      assert(closings.at(-1).includes(QUESTION));
      assert(closings.at(-1).includes('Reused instruction (quoted): "original task"'));
    }
  }
  else {
    assert.equal(result.snapshot.mode, 'chat');
    if (['switch', 'same-root'].includes(scenario)) assert.equal(result.retainedGenerations.flow.frames[0].runtime.state.stateId, 'failed');
    else assert.equal(result.retainedGenerations?.flow, undefined);
    assert.equal(result.unresolvedEffects.length, commits ? 1 : 0);
    assert(!closings.at(-1).includes('Restored the saved result'));
    await host.dispose();
    host = await openSessionHost({ store, config, loadModule, cwd: dir, sessionId, mode: 'continue', adapterImports: { claude: async () => Adapter } });
    assert.equal(host.shell.exportSnapshot().mode, 'chat');
  }
  assert.equal(git('rev-parse', 'HEAD'), beforeHead);
  assert.equal(git('rev-list', '--count', 'HEAD'), commits ? '2' : '1');
  await host.dispose();
  console.log(JSON.stringify({ scenario, settled: true, preservedHead: beforeHead }));
}
