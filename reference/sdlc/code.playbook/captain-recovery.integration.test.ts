// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import {
  createEvent,
  type AgentAdapter,
  type AgentEvent,
  type AgentOptions,
} from '@sublang/cligent';
import { describe, expect, it, vi } from 'vitest';
import { assign, createMachine } from 'xstate';
import { createXStatePlaybookRuntime } from '../../../src/xstate-runtime.js';
import codePlaybookRegistryEntry from './code.registry.js';
import { createSessionStore } from './session-store.js';
import { openSessionHost } from './session-host.js';
import { createRepositoryEffectCoordinator } from './bin/repository-effects.js';
import { loadLaunchPlan } from './bin/launch-config.js';
import { executionConfigFromPlan } from './bin/run.js';
import { runPlaybookCli } from './bin/playbook.js';

const execFileAsync = promisify(execFile);
class RecoveryAdapter implements AgentAdapter {
  static cwd = '';
  static startWithQuestion = false;
  static preparation = 'ready';
  static holdInitial = false;
  static commitContinuation = false;
  static longContinuation = false;
  static alreadyAnswered = false;
  static interruptPreparation: (() => void) | undefined;
  static calls: Array<{
    kind: string;
    prompt: string;
    options?: AgentOptions;
  }> = [];
  readonly agent = 'claude-code';
  async *run(
    prompt: string,
    options?: AgentOptions,
  ): AsyncGenerator<AgentEvent, void, void> {
    const kind = prompt.includes(
      'You are Captain preparing an interrupted playbook',
    )
      ? 'prepare'
      : prompt.includes('Select exactly one action from the closed set')
        ? 'decision'
        : prompt.includes('An action just settled for the current Boss turn')
          ? 'closing'
          : prompt.includes('Classify the following Boss message')
            ? 'classify'
            : prompt.includes('This is hidden control work.')
              ? 'judge'
              : 'player';
    RecoveryAdapter.calls.push({ kind, prompt, options });
    let result: string;
    if (prompt.startsWith('Check whether existing instructions already answer')) {
      RecoveryAdapter.calls.at(-1)!.kind = 'question-check';
      expect(options?.allowedTools).toEqual([]);
      result = JSON.stringify({ instructionIndex: RecoveryAdapter.alreadyAnswered && RecoveryAdapter.calls.filter(({ kind }) => kind === 'question-check').length === 1 ? 0 : null });
    } else if (kind === 'prepare') {
      if (RecoveryAdapter.interruptPreparation) {
        const interrupt = RecoveryAdapter.interruptPreparation;
        RecoveryAdapter.interruptPreparation = undefined;
        await mkdir(join(RecoveryAdapter.cwd, 'node_modules'), { recursive: true });
        await writeFile(join(RecoveryAdapter.cwd, 'node_modules', 'partial-preparation'), 'preserved');
        interrupt();
        throw new Error('injected process interruption during preparation');
      }
      const preparation = RecoveryAdapter.holdInitial ? 'blocked' : RecoveryAdapter.preparation;
      if (preparation === 'timeout') {
        await new Promise<void>((resolve) => {
          if (options?.signal?.aborted) resolve();
          else options?.signal?.addEventListener('abort', () => resolve(), { once: true });
        });
        throw new Error('preparation cancelled by its deadline');
      }
      const coordinator = createRepositoryEffectCoordinator();
      await expect(
        coordinator.acquire(RecoveryAdapter.cwd, {
          signal: AbortSignal.timeout(30),
        }),
      ).rejects.toThrow();
      if (preparation === 'network')
        throw new Error('ECONNRESET: injected interruption during preparation');
      if (preparation === 'aborted') {
        yield createEvent(
          'done',
          this.agent,
          {
            status: 'aborted',
            error: 'injected disconnect',
            usage: { toolUses: 1 },
            durationMs: 1,
          },
          'transport:aborted',
        );
        return;
      }
      if (preparation === 'ready') {
        await mkdir(join(RecoveryAdapter.cwd, 'node_modules'), {
          recursive: true,
        });
        await writeFile(
          join(RecoveryAdapter.cwd, 'node_modules', 'tool-ready'),
          'ready',
        );
        if (!RecoveryAdapter.startWithQuestion)
          await writeFile(
            join(RecoveryAdapter.cwd, 'tracked.txt'),
            'repaired prerequisite\n',
          );
      }
      result =
        preparation === 'malformed'
          ? 'I might be done.'
          : JSON.stringify({
              status:
                preparation === 'stale'
                  ? 'ready'
                  : preparation === 'missing-transition' ? 'blocked'
                  : preparation,
              summary:
                preparation === 'ready'
                  ? 'Prepared and checked the missing tool.'
                  : preparation === 'missing-transition' ? 'The playbook has no transition for this outcome. Boss must clarify the playbook before it can continue.'
                  : 'The tool needs Boss input.',
            });
    } else if (kind === 'decision') {
      result = JSON.stringify({
        action: prompt.includes('answer only') ? 'deliver' : 'recover',
      });
    } else if (kind === 'closing')
      result = 'The playbook is paused at its next question.';
    else if (kind === 'classify')
      result = '{"type":"BOSS_REPLY","questionId":"runFirstPhase"}';
    else if (kind === 'judge') result = '{"guard":"needsBossReply"}';
    else {
      const first =
        RecoveryAdapter.calls.filter((call) => call.kind === 'player')
          .length === 1;
      if (first && !RecoveryAdapter.startWithQuestion) {
        if (RecoveryAdapter.preparation === 'unresolved')
          await writeFile(
            join(RecoveryAdapter.cwd, 'partial.txt'),
            'partial work',
          );
        yield createEvent(
          'done',
          this.agent,
          {
            status: 'error',
            error: 'The required local tool is missing.',
            usage: { toolUses: 0 },
            durationMs: 1,
          },
          'transport:error',
        );
        return;
      }
      if (!first && !RecoveryAdapter.alreadyAnswered)
        expect(
          await readFile(
            join(RecoveryAdapter.cwd, 'node_modules', 'tool-ready'),
            'utf8',
          ),
        ).toBe('ready');
      if (!first && RecoveryAdapter.longContinuation) await new Promise((resolve) => setTimeout(resolve, 1400));
      if (!first && RecoveryAdapter.commitContinuation) {
        await writeFile(join(RecoveryAdapter.cwd, 'completed.txt'), 'completed work');
        await execFileAsync('git', ['add', 'completed.txt', 'tracked.txt'], { cwd: RecoveryAdapter.cwd });
        await execFileAsync('git', ['-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', '-c', 'commit.gpgsign=false', 'commit', '-qm', 'completed continuation'], { cwd: RecoveryAdapter.cwd });
      }
      result = 'Boss question: Which test target should I use?';
    }
    yield createEvent(
      'done',
      this.agent,
      {
        status: 'success',
        result,
        resumeToken: 'conversation-' + RecoveryAdapter.calls.length,
        usage: { toolUses: kind === 'prepare' ? 1 : 0 },
        durationMs: 1,
      },
      'transport:success',
    );
  }
}
const adapterImports = { claude: async () => RecoveryAdapter } as never;
async function initializeTestRepository(root: string) {
  const cwd = join(root, 'repository');
  await mkdir(cwd);
  await execFileAsync('git', ['init', '--quiet'], { cwd });
  await writeFile(join(cwd, 'tracked.txt'), 'baseline\n', 'utf8');
  await execFileAsync('git', ['add', 'tracked.txt'], { cwd });
  await execFileAsync(
    'git',
    [
      '-c',
      'user.name=Playbook Test',
      '-c',
      'user.email=playbook-test@example.invalid',
      '-c',
      'commit.gpgsign=false',
      'commit',
      '--quiet',
      '-m',
      'baseline',
    ],
    { cwd },
  );
  return cwd;
}

function withFixture(prefix: string, run: (dir: string) => Promise<void>) {
  return async () => {
    const dir = await mkdtemp(join(tmpdir(), prefix));
    try {
      await run(dir);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  };
}

const parentFactory = createXStatePlaybookRuntime(
  createMachine({
    initial: 'ready',
    context: { task: '' },
    states: {
      ready: {
        meta: {
          playbook: { stateId: 'ready', description: 'Wait for request' },
        },
        tags: ['playbook.parked'],
        on: {
          START: {
            target: 'child',
            actions: assign({ task: ({ event }) => event.text }),
          },
        },
      },
      child: {
        tags: ['playbook.suspended'],
        meta: {
          playbook: { stateId: 'child', description: 'Wait for coding' },
        },
        invoke: {
          src: 'playbook',
          input: ({ context }) => ({
            stateId: 'child',
            sourceItem: 'WRAPPER-1',
            playbookId: 'code',
            text: context.task,
          }),
          onDone: 'done',
          onError: 'failed',
        },
      },
      failed: {
        meta: { playbook: { stateId: 'failed', description: 'Child failed' } },
        tags: ['playbook.parked'],
      },
      done: {
        meta: { playbook: { stateId: 'done', description: 'Completed' } },
        type: 'final',
      },
    },
  }),
  {
    label: 'wrapper',
    compat: { artifactSchema: 3, runtimeAbi: 1 },
    snapshotOptions: () => ({}),
    entryEvent: { type: 'START', textField: 'text' },
    roleStates: {},
    outcomeAuthority: { governedPlayerStates: {} },
  },
);
const parentEntry = {
  id: 'wrapper',
  command: 'wrapper',
  intent: 'Run coding in a nested leaf',
  artifactSchema: 3,
  runtimeProfile: { kind: 'shared-factory', compat: parentFactory.compat },
  requiredRoleIds: [],
  concurrentRoleSets: [],
  validateOptions: (value: unknown) => value ?? {},
  createRuntime: (configuredOptions: unknown, hostCapabilities: any) =>
    parentFactory({ configuredOptions, hostCapabilities }),
};

describe('Captain preparation through a durable session', () => {
  for (const scenario of [
    { startWithQuestion: false, preparation: 'ready', automatic: true },
    { startWithQuestion: false, preparation: 'ready', automatic: true, nested: true },
    { startWithQuestion: false, preparation: 'ready', automatic: true, nested: true, throws: true },
    { startWithQuestion: false, preparation: 'ready', interrupted: true, nested: true },
    { startWithQuestion: false, preparation: 'ready', interrupted: true, nested: true, cliRetry: true },
    { startWithQuestion: false, preparation: 'ready', interrupted: true, nested: true, cliStart: true },
    { startWithQuestion: false, preparation: 'ready' },
    { startWithQuestion: false, preparation: 'ready', hostRetry: true },
    { startWithQuestion: false, preparation: 'ready', longContinuation: true },
    { startWithQuestion: true, preparation: 'ready', alreadyAnswered: true, automatic: true },
    { startWithQuestion: true, preparation: 'ready', admissionFailure: true },
    { startWithQuestion: true, preparation: 'ready' },
    { startWithQuestion: true, preparation: 'ready', interruptContinuation: true },
    { startWithQuestion: false, preparation: 'ready', interruptContinuation: true },
    { startWithQuestion: false, preparation: 'ready', nested: true },
    ...[
      'blocked',
      'malformed',
      'network',
      'aborted',
      'stale',
      'unresolved',
      'missing-transition',
      'save-failure',
      'timeout',
    ].map((preparation) => ({ startWithQuestion: false, preparation })),
  ])
    it(
      `restored ${'nested' in scenario ? 'nested ' : ''}${scenario.startWithQuestion ? 'question' : 'failed step'} with ${scenario.preparation} preparation${'interrupted' in scenario ? ' after preparation interruption' : ''}${'cliRetry' in scenario ? ' from SDK to CLI' : 'cliStart' in scenario ? ' from CLI to SDK' : ''}${'longContinuation' in scenario ? ' during a long continuation' : ''}${'hostRetry' in scenario ? ' after a host retry' : ''}${'interruptContinuation' in scenario ? ' after a committed continuation' : ''}${'alreadyAnswered' in scenario ? ' for an already answered question' : ''}${'admissionFailure' in scenario ? ' after rejected admission' : ''}`,
      withFixture('captain-preparation-', async (dir) => {
        const { startWithQuestion, preparation } = scenario;
        const nested = 'nested' in scenario && scenario.nested;
        const automatic = 'automatic' in scenario && scenario.automatic;
        const interrupted = 'interrupted' in scenario && scenario.interrupted;
        RecoveryAdapter.holdInitial = !automatic && !interrupted;
        RecoveryAdapter.interruptPreparation = undefined;
        RecoveryAdapter.commitContinuation = 'interruptContinuation' in scenario;
        RecoveryAdapter.longContinuation = 'longContinuation' in scenario;
        RecoveryAdapter.alreadyAnswered = 'alreadyAnswered' in scenario;
        let interruptContinuation: (() => void) | undefined;
        const cwd = await initializeTestRepository(dir);
        await writeFile(join(cwd, '.gitignore'), 'node_modules/\n');
        await execFileAsync('git', ['add', '.gitignore'], { cwd });
        await execFileAsync(
          'git',
          [
            '-c',
            'user.name=Test',
            '-c',
            'user.email=test@example.invalid',
            '-c',
            'commit.gpgsign=false',
            'commit',
            '-qm',
            'ignore dependencies',
          ],
          { cwd },
        );
        RecoveryAdapter.cwd = cwd;
        RecoveryAdapter.startWithQuestion = startWithQuestion;
        RecoveryAdapter.preparation = preparation;
        RecoveryAdapter.calls = [];
        const configPath = join(dir, 'playbook.config.yaml');
        await writeFile(
          configPath,
          'captain: { adapter: claude, model: captain-model }\nplayers:\n  dev.coder: { adapter: claude, model: coder-model }\nplaybooks:\n  code:\n    from: mod://code\n    roles: { coder: dev.coder }\n  wrapper:\n    from: mod://wrapper\n    roles: {}\n',
        );
        const loadModule = async (specifier: string) => ({
          default:
            specifier === 'mod://wrapper'
              ? parentEntry
              : {
                  ...codePlaybookRegistryEntry,
                  createRuntime: (
                    ...args: Parameters<
                      typeof codePlaybookRegistryEntry.createRuntime
                    >
                  ) => {
                    const runtime = codePlaybookRegistryEntry.createRuntime(
                      ...args,
                    );
                    return {
                      ...runtime,
                      async apply(input: Parameters<NonNullable<typeof runtime.apply>>[0]) {
                        const result = await runtime.apply!(input);
                        interruptContinuation?.();
                        return result;
                      },
                      async handleBossInput(input: Parameters<typeof runtime.handleBossInput>[0]) {
                        const result = await runtime.handleBossInput(input);
                        interruptContinuation?.();
                        return result;
                      },
                      ...('throws' in scenario ? {
                        async handleBossInput(input: Parameters<typeof runtime.handleBossInput>[0]) {
                          const result = await runtime.handleBossInput(input);
                          if (result.outcome === 'failed') throw new Error('injected unexpected exception after the child parked');
                          return result;
                        },
                      } : {}),
                      describe: () => {
                        const view = runtime.describe!();
                        return preparation === 'stale' &&
                          RecoveryAdapter.calls.some(
                            (call) => call.kind === 'prepare',
                          )
                          ? { ...view, recovery: undefined }
                          : view;
                      },
                    };
                  },
                },
        });
        const realStore = createSessionStore({
          sessionsDir: join(dir, 'sessions'),
        });
        let refuseInterruptedSettlement = Boolean(interrupted);
        const store = {
          ...realStore,
          async acquire(id: string) {
            const lease = await realStore.acquire(id);
            return { ...lease,
              async checkpointRecovery(point: Parameters<typeof lease.checkpointRecovery>[0]) {
                if (preparation === 'save-failure') throw new Error('injected recovery storage failure');
                return lease.checkpointRecovery(point);
              },
              async settle(point: Parameters<typeof lease.settle>[0]) {
                if (refuseInterruptedSettlement) throw new Error('injected process death before settlement');
                return lease.settle(point);
              },
            };
          },
        };
        const plan = await loadLaunchPlan({
          userConfigPath: configPath,
          loadModule,
        });
        const config = executionConfigFromPlan(plan);
        let controller = await openSessionHost({
          store,
          mode: 'new',
          cwd,
          config,
          loadModule,
          adapterImports,
        });
        let timeoutOverride: ReturnType<typeof vi.spyOn> | undefined;
        let rejectAdmission = 'admissionFailure' in scenario;
        async function runCli(argv: string[], signal?: AbortSignal) {
          let stdout = '', stderr = '';
          const result = await runPlaybookCli({
            argv: ['run', ...argv], cwd, userConfigPath: configPath,
            sessionStore: store, loadModule, adapterImports, signal,
            env: { ANTHROPIC_API_KEY: 'fixture-only' },
            probeAdapterSdk: async () => true,
            stdout: { write(text: string) { stdout += text; return true; } },
            stderr: { write(text: string) { stderr += text; return true; } },
          });
          return { ...result, stdout, stderr };
        }
        try {
          if (interrupted) {
            const id = controller.sessionId;
            if ('cliStart' in scenario) {
              await controller.dispose();
              const abort = new AbortController();
              RecoveryAdapter.interruptPreparation = () => abort.abort(new Error('injected CLI interruption'));
              const stopped = await runCli(['--session', id, '/wrapper implement the original task'], abort.signal);
              expect(stopped.code, stopped.stderr).toBe(2);
              expect(stopped.stdout).toBe('');
            } else {
              RecoveryAdapter.interruptPreparation = () => controller.host.abortActiveTurn();
              await expect(controller.handleBossTurn('/wrapper implement the original task')).rejects.toThrow();
              const stopped = await controller.read();
              await expect(controller.lease.discard({ attemptId: stopped!.uncertain!.attemptId })).rejects.toThrow('resume its saved step');
              await controller.dispose();
            }
            const saved = await realStore.read(id);
            expect(saved?.state).toBe('uncertain');
            expect(saved?.uncertain?.recovery?.snapshot.frames).toHaveLength(2);
            expect(saved?.uncertain?.recovery?.snapshot.frames.at(-1).runtime.state.stateId).toBe('failed');
            expect(JSON.stringify(saved?.uncertain?.recovery)).not.toContain('resumeToken');
            if (!('cliStart' in scenario) && !('cliRetry' in scenario)) {
              const lease = await realStore.acquire(id);
              try {
                const point = saved!.uncertain!.recovery!;
                for (const invalid of [
                  { ...point, instruction: '' },
                  { ...point, extra: true },
                  { ...point, continuation: { kind: 'runtime' } },
                  { ...point, continuation: { kind: 'reply', actionId: 'invented' } },
                  { ...point, snapshot: { ...point.snapshot, sequences: { ...point.snapshot.sequences, turn: 99 } } },
                ]) {
                  await expect(lease.checkpointRecovery(invalid as any)).rejects.toThrow();
                  expect(await realStore.read(id)).toEqual(saved);
                }
                const hinted = JSON.parse(JSON.stringify(point));
                hinted.snapshot.captain.conversation = { kind: 'pinned', token: 'secret-preparation-hint' };
                await lease.checkpointRecovery(hinted);
                expect(JSON.stringify((await realStore.read(id)).uncertain.recovery)).not.toContain('secret-preparation-hint');
              } finally { await lease.release(); }
            }
            refuseInterruptedSettlement = false;
            let resumed;
            if ('cliRetry' in scenario) {
              const calls = RecoveryAdapter.calls.length;
              const discarded = await runCli(['--session', id, '--discard-uncertain']);
              expect(discarded.code).toBe(2);
              expect(discarded.stdout).toBe('');
              expect(discarded.stderr).toContain('resume its saved step');
              expect(RecoveryAdapter.calls).toHaveLength(calls);
              expect((await realStore.read(id)).uncertain?.attemptId).toBe(saved.uncertain?.attemptId);
              const retried = await runCli(['--session', id, '--retry-uncertain']);
              expect(retried.code, retried.stderr).toBe(0);
              expect(retried.stdout).toBe(`${retried.reply}\n`);
              resumed = retried.record;
            } else {
              controller = await openSessionHost({ store, mode: 'recover', sessionId: id, config, loadModule, adapterImports });
              resumed = await controller.recover();
            }
            expect(RecoveryAdapter.calls.filter(({ kind }) => kind === 'closing').at(-1)?.prompt).toContain('Recovery preparation: available');
            expect(resumed.state).toBe('settled');
            expect(resumed.snapshot.frames).toHaveLength(2);
            expect(resumed.snapshot.frames.map(({ sessionId }) => sessionId)).toEqual(
              saved!.uncertain!.recovery!.snapshot.frames.map(({ sessionId }) => sessionId),
            );
            expect(resumed.snapshot.frames.at(-1).runtime.state.stateId).toBe('awaitBossReply');
            expect(RecoveryAdapter.calls.filter(({ kind }) => kind === 'decision')).toHaveLength(0);
            expect(RecoveryAdapter.calls.filter(({ kind }) => kind === 'player')).toHaveLength(2);
            expect(await readFile(join(cwd, 'node_modules', 'partial-preparation'), 'utf8')).toBe('preserved');
            return;
          }
          const first = await controller.handleBossTurn(
            `${nested ? '/wrapper' : '/code'} implement the original task${RecoveryAdapter.alreadyAnswered ? '. Use the small test target.' : ''}`,
          );
          if (automatic) {
            if (RecoveryAdapter.alreadyAnswered) {
              expect(RecoveryAdapter.calls.filter(({ kind }) => kind === 'prepare')).toHaveLength(0);
              const calls = RecoveryAdapter.calls.filter(({ kind }) => kind === 'player');
              expect(calls).toHaveLength(2);
              expect(calls[1]!.prompt).toContain('implement the original task. Use the small test target.');
              return;
            }
            expect(first.state).toBe('settled');
            expect(first.snapshot.frames).toHaveLength(nested ? 2 : 1);
            expect(first.snapshot.frames!.at(-1)!.runtime.state.stateId).toBe('awaitBossReply');
            expect(RecoveryAdapter.calls.filter(({ kind }) => kind === 'prepare')).toHaveLength(1);
            expect(RecoveryAdapter.calls.filter(({ kind }) => kind === 'player')).toHaveLength(2);
            expect(await readFile(join(cwd, 'tracked.txt'), 'utf8')).toBe('repaired prerequisite\n');
            return;
          }
          const actionRecords = first.snapshot.journal.filter(({ kind }) => kind === 'action');
          expect(first.snapshot.journal.filter(({ kind }) => kind === 'outcome')).toHaveLength(actionRecords.length);
          RecoveryAdapter.holdInitial = false;
          RecoveryAdapter.calls = RecoveryAdapter.calls.filter(({ kind }) => kind !== 'prepare');
          const sourceId = first.snapshot.frames!.at(-1)!.sessionId;
          expect(first.snapshot.frames).toHaveLength(nested ? 2 : 1);
          expect(first.snapshot.frames!.at(-1)!.runtime.state.stateId).toBe(
            startWithQuestion ? 'awaitBossReply' : 'failed',
          );
          const id = controller.sessionId;
          await controller.dispose();
          controller = await openSessionHost({
            store,
            mode: 'continue',
            sessionId: id,
            config,
            loadModule,
            adapterImports,
            onCheckpoint: async () => {
              if (rejectAdmission) { rejectAdmission = false; throw new Error('injected admission failure'); }
            },
          });
          const instruction =
            'Install the missing local tool and continue. Use the small test target.';
          if ('admissionFailure' in scenario) {
            const text = 'answer only: use the small target';
            await expect(controller.recover(text)).rejects.toThrow('injected admission failure');
            const stopped = await controller.read();
            await controller.lease.discard({ attemptId: stopped.uncertain!.attemptId });
            const decisions = RecoveryAdapter.calls.filter(({ kind }) => kind === 'decision').length;
            RecoveryAdapter.holdInitial = true;
            await controller.handleBossTurn(text);
            expect(RecoveryAdapter.calls.filter(({ kind }) => kind === 'decision')).toHaveLength(decisions + 1);
            return;
          }
          if ('longContinuation' in scenario) {
            const original = AbortSignal.timeout.bind(AbortSignal);
            timeoutOverride = vi.spyOn(AbortSignal, 'timeout').mockImplementation((ms) => original(ms === 150_000 ? 1000 : ms));
          }
          if (preparation === 'timeout') {
            const original = AbortSignal.timeout.bind(AbortSignal);
            timeoutOverride = vi.spyOn(AbortSignal, 'timeout').mockImplementation((ms) => original(ms === 150_000 ? 500 : ms));
            await expect(controller.handleBossTurn(instruction)).rejects.toThrow();
            const stopped = await controller.read();
            expect(stopped?.state).toBe('settled');
            expect(stopped?.snapshot.frames?.at(-1)?.runtime.state.stateId).toBe('failed');
            expect(RecoveryAdapter.calls.filter(({ kind }) => kind === 'player')).toHaveLength(1);
            RecoveryAdapter.preparation = 'ready';
            expect((await controller.recover('Try the repair again.')).state).toBe('settled');
            expect(RecoveryAdapter.calls.filter(({ kind }) => kind === 'player')).toHaveLength(2);
            return;
          }
          if ('interruptContinuation' in scenario) {
            interruptContinuation = () => controller.host.abortActiveTurn('injected interruption after continuation');
            const beforeCommits = Number((await execFileAsync('git', ['rev-list', '--count', 'HEAD'], { cwd })).stdout.trim());
            await expect(controller.recover(instruction)).rejects.toThrow();
            const stopped = await controller.read();
            expect(stopped.state).toBe('uncertain');
            expect(stopped.uncertain?.recovery?.continuation?.kind).toBe(startWithQuestion ? 'reply' : 'runtime');
            const calls = RecoveryAdapter.calls.length;
            await controller.dispose();
            await expect(openSessionHost({ store, mode: 'retry', sessionId: id, config, loadModule, adapterImports })).rejects.toThrow(/deferred logical-operation progress|one-descendant-commit/);
            expect(RecoveryAdapter.calls).toHaveLength(calls);
            expect(Number((await execFileAsync('git', ['rev-list', '--count', 'HEAD'], { cwd })).stdout.trim())).toBe(beforeCommits + 1);
            return;
          }
          const missingInput = controller.recover();
          expect(missingInput).toBeInstanceOf(Promise);
          await expect(missingInput).rejects.toThrow('requires a Boss instruction');
          if ('hostRetry' in scenario) {
            const action = controller.listRuntimeActions().find(({ id }) => id.startsWith('retry:'))!;
            const retried = await controller.submitRuntimeAction(action.id);
            expect(retried.snapshot.frames!.at(-1)!.runtime.state.stateId).toBe('awaitBossReply');
            expect(RecoveryAdapter.calls.filter(({ kind }) => kind === 'player')).toHaveLength(3);
            const outcomes = retried.snapshot.journal.filter(({ kind }) => kind === 'outcome');
            expect(outcomes.length).toBe(retried.snapshot.journal.filter(({ kind }) => kind === 'action').length);
            return;
          }
          const resumed = await controller.recover(instruction);
          if (preparation !== 'ready') {
            expect(
              RecoveryAdapter.calls.filter((call) => call.kind === 'prepare'),
            ).toHaveLength(['unresolved', 'save-failure'].includes(preparation) ? 0 : 1);
            if (preparation === 'missing-transition') {
              const call = RecoveryAdapter.calls.find(({ kind }) => kind === 'prepare')!;
              expect(call.prompt).toContain('Never patch the running playbook, invent a transition');
              expect(call.prompt).toContain('declaredResults');
              expect(JSON.stringify(resumed.snapshot.journal)).toContain('no transition for this outcome');
            }
            expect(
              RecoveryAdapter.calls.filter((call) => call.kind === 'player'),
            ).toHaveLength(1);
            expect(resumed.snapshot.frames!.at(-1)!.sessionId).toBe(sourceId);
            expect(resumed.snapshot.frames!.at(-1)!.runtime.state.stateId).toBe(
              'failed',
            );
            expect(resumed.snapshot.lastSettlementStatus).not.toBe('ok');
            if (preparation === 'stale') {
              const rejected = await controller.recover('Prepare the same step.');
              expect(rejected.snapshot.lastSettlementStatus).toBe('rejected');
              expect(RecoveryAdapter.calls.filter(({ kind }) => kind === 'closing').at(-1)?.prompt).toContain('Recovery preparation: unavailable');
              expect(RecoveryAdapter.calls.filter(({ kind }) => kind === 'prepare')).toHaveLength(1);
            }
            return;
          }
          expect(resumed.state).toBe('settled');
          expect(resumed.snapshot.lastAction).toBe('recover');
          expect(resumed.snapshot.lastSettlementStatus).toBe('ok');
          expect(resumed.snapshot.frames!.at(-1)!.sessionId).toBe(sourceId);
          expect(resumed.snapshot.frames!.at(-1)!.runtime.state.stateId).toBe(
            'awaitBossReply',
          );
          const preparations = RecoveryAdapter.calls.filter(
            ({ kind }) => kind === 'prepare',
          );
          expect(preparations).toHaveLength(1);
          if (!startWithQuestion)
            expect(await readFile(join(cwd, 'tracked.txt'), 'utf8')).toBe(
              'repaired prerequisite\n',
            );
          expect(preparations[0]!.prompt).toContain(
            JSON.stringify(instruction),
          );
          expect(preparations[0]!.prompt).toContain(
            'Do not perform the remaining specialist task',
          );
          // Cligent represents a fresh conversation by omitting its resume token.
          expect(preparations[0]!.options?.resume).toBeUndefined();
          expect(preparations[0]!.options?.allowedTools).toBeUndefined();
          const player = RecoveryAdapter.calls.filter(
            ({ kind }) => kind === 'player',
          );
          expect(player).toHaveLength(2);
          if (startWithQuestion)
            expect(player[1]!.prompt).toContain(instruction);
          else
            expect(player[1]!.prompt).toContain('implement the original task');
          const answer = 'answer only: use the small target';
          RecoveryAdapter.holdInitial = true;
          const answered = await controller.handleBossTurn(answer);
          expect(answered.snapshot.journal).toContainEqual(expect.objectContaining({ kind: 'action', payload: expect.objectContaining({ action: 'deliver' }) }));
          expect(
            RecoveryAdapter.calls.filter(({ kind }) => kind === 'prepare'),
          ).toHaveLength(1);
        } finally {
          timeoutOverride?.mockRestore();
          await controller.dispose();
        }
      }),
      60_000,
    );
});
