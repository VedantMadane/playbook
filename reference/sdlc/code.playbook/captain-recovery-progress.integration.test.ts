// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

import { execFileSync } from 'node:child_process';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createEvent } from '@sublang/cligent';
import { assign, createMachine } from 'xstate';
import { expect, it } from 'vitest';
import {
  createXStatePlaybookRuntime,
  emptyPlaybookEffectLedger,
} from '../../../src/xstate-runtime.js';
import { projectRecovery } from './bin/portable-codec.js';
import { validateCaptainSessionRecord } from './bin/session-store.js';
import { assertPlaybookCaptainShellSnapshot } from './playbook-captain.js';
import { createSessionStore } from './session-store.js';
import { openSessionHost } from './session-host.js';
import { executionConfigFromPlan } from './bin/run.js';
import { loadLaunchPlan } from './bin/launch-config.js';

const meta = (stateId: string) => ({
  playbook: { stateId, description: stateId },
});
function entry(id: string, commit: boolean, child = false, counts = false) {
  const factory = createXStatePlaybookRuntime(
    createMachine(
      {
        initial: 'ready',
        context: { task: '' },
        states: {
          ready: {
            meta: meta('ready'),
            tags: ['playbook.parked'],
            on: {
              START: {
                target: 'work',
                actions: assign({ task: ({ event }) => event.text }),
              },
            },
          },
          work: {
            meta: {
              playbook: {
                stateId: 'work',
                description: 'Do the work',
                role: 'worker',
              },
            },
            tags: ['playbook.busy'],
            invoke: {
              src: 'player',
              input: ({ context }) => ({
                stateId: 'work',
                sourceItem: 'FLOW-1',
                role: 'worker',
                prompt: `${id} work: ${context.task}`,
                result: { done: 'Work complete.' },
              }),
              onDone: {
                target: child ? 'child' : 'done',
                actions: {
                  type: 'playbook.acceptedOutcome',
                  params: {
                    source: 'work',
                    target: child ? 'child' : 'done',
                    acceptedOutcome: 'done',
                  },
                },
              },
              onError: 'failed',
            },
          },
          ...(child
            ? {
                child: {
                  meta: meta('child'),
                  tags: ['playbook.suspended'],
                  invoke: {
                    src: 'playbook',
                    input: ({ context }: any) => ({
                      stateId: 'child',
                      sourceItem: 'FLOW-2',
                      playbookId: 'leaf',
                      text: context.task,
                    }),
                    onDone: counts ? 'finish' : 'done',
                    onError: 'failed',
                  },
                },
              }
            : {}),
          ...(counts
            ? {
                finish: {
                  meta: {
                    playbook: {
                      stateId: 'finish',
                      description: 'Finish parent work',
                      role: 'worker',
                    },
                  },
                  tags: ['playbook.busy'],
                  invoke: {
                    src: 'player',
                    input: {
                      stateId: 'finish',
                      sourceItem: 'FLOW-3',
                      role: 'worker',
                      prompt: 'Finish parent',
                      result: { done: 'Work complete.' },
                    },
                    onDone: 'done',
                    onError: 'failed',
                  },
                },
              }
            : {}),
          failed: {
            meta: meta('failed'),
            tags: ['playbook.parked'],
            on: { START: 'work' },
          },
          done: { meta: meta('done'), type: 'final' },
        },
      },
      { actions: { 'playbook.acceptedOutcome': () => {} } },
    ),
    {
      label: id,
      compat: { artifactSchema: 3, runtimeAbi: 1 },
      snapshotOptions: () => ({}),
      unfinishedFinalStateIds: new Set<string>(),
      entryEvent: { type: 'START', textField: 'text' },
      roleStates: {
        work: { role: 'worker', label: 'Do the work' },
        ...(counts
          ? { finish: { role: 'worker', label: 'Finish parent work' } }
          : {}),
      },
      outcomeAuthority: {
        governedPlayerStates: {
          work: {
            done: {
              fields: {},
              repositoryDisposition: commit
                ? 'one-descendant-commit'
                : 'unchanged',
            },
          },
          ...(counts
            ? {
                finish: {
                  done: { fields: {}, repositoryDisposition: 'unchanged' },
                },
              }
            : {}),
        },
      },
    },
  );
  return {
    ...(counts || id === 'leaf'
      ? {
          summaryPolicy: {
            stateCountLabels: counts
              ? { work: 'parent step', finish: 'parent finish' }
              : { work: 'child step' },
            copyPasteGuardNames: [],
            savedCountsLine: (_counts: unknown, rounds: number) =>
              `${id} saved ${rounds} rounds.`,
          },
        }
      : {}),
    id,
    command: id,
    intent: `${id} task`,
    artifactSchema: 3,
    runtimeProfile: { kind: 'shared-factory', compat: factory.compat },
    requiredRoleIds: ['worker'],
    concurrentRoleSets: [],
    validateOptions: (options: unknown) => options ?? {},
    createRuntime: (configuredOptions: unknown, hostCapabilities: any) =>
      factory({ configuredOptions, hostCapabilities }),
  };
}

it.each([
  'step',
  'adjudication',
  'restored',
  'adopted-assessment',
  'vanished',
  'counts',
])(
  'keeps the stopped step through %s recovery and process loss',
  async (kind) => {
    const dir = await mkdtemp(join(tmpdir(), 'captain-progress-'));
    const git = (...args: string[]) =>
      execFileSync('git', args, { cwd: dir, encoding: 'utf8' }).trim();
    let controller: Awaited<ReturnType<typeof openSessionHost>> | undefined;
    let allow = false,
      failLeaf = true,
      judgeFailed = false,
      loseAcknowledgement = false;
    let crash = false,
      refusePoint = false,
      vanish = false;
    let interrupted = false;
    const players: string[] = [];
    const closings: string[] = [];
    let failedFinish = false;
    const records: any[] = [];
    const committed = kind === 'adjudication' || kind === 'adopted-assessment';
    class Adapter {
      readonly agent = 'claude-code';
      async *run(prompt: string) {
        let result = '{"guard":"done"}';
        if (
          prompt.includes('You are Captain preparing an interrupted playbook')
        ) {
          if (allow) await rm(join(dir, 'stray'), { force: true });
          result = JSON.stringify({
            status: allow ? 'ready' : 'blocked',
            summary: allow
              ? 'Prerequisites checked.'
              : 'Wait for the test instruction.',
          });
        } else if (
          prompt.includes('Select exactly one action from the closed set')
        ) {
          result = JSON.stringify(
            prompt.includes('[Boss message]\nAnswer child')
              ? { action: 'deliver' }
              : prompt.includes('[Boss message]\nStop flow')
                ? { action: 'dismiss' }
                : prompt.includes('[Boss message]\nResume flow')
                  ? { action: 'resume', playbookId: 'flow' }
                  : { action: 'recover' },
          );
        } else if (prompt.includes('An action just settled')) {
          closings.push(prompt);
          result = 'Work has stopped at the next step.';
        } else if (prompt.includes('This is hidden control work.')) {
          if (committed && !judgeFailed) {
            judgeFailed = true;
            throw new Error('assessment network interruption');
          }
        } else {
          players.push(prompt);
          if (prompt.startsWith('flow work:')) {
            if (committed) {
              await writeFile(join(dir, 'commit.txt'), 'work');
              git('add', 'commit.txt');
              git('commit', '-qm', 'work');
            } else if (!allow && kind !== 'counts') {
              if (kind === 'restored')
                await writeFile(join(dir, 'stray'), 'generated');
              else throw new Error('missing local prerequisite');
            }
          } else if (prompt === 'Finish parent') {
            if (!failedFinish) {
              failedFinish = true;
              throw new Error('parent needs recovery');
            }
          } else if (failLeaf) throw new Error('downstream interruption');
          result = 'Work complete.';
        }
        yield createEvent(
          'done',
          this.agent,
          {
            status: 'success',
            result,
            resumeToken: 'fixture-token',
            usage: { toolUses: 0 },
            durationMs: 1,
          },
          'test-session',
        );
      }
    }
    try {
      git('init', '-q');
      git('config', 'user.name', 'Test');
      git('config', 'user.email', 'test@example.invalid');
      git('config', 'commit.gpgsign', 'false');
      git('commit', '--allow-empty', '-qm', 'baseline');
      const configPath = join(dir, 'config.yaml');
      await writeFile(
        configPath,
        'captain: { adapter: claude, model: fixture-model }\nplayers:\n  root.worker: { adapter: claude, model: fixture-model }\n  child.worker: { adapter: claude, model: fixture-model }\nplaybooks:\n  flow: { from: "mod://flow", roles: { worker: root.worker } }\n  leaf: { from: "mod://leaf", roles: { worker: child.worker } }\n',
      );
      await writeFile(join(dir, '.gitignore'), 'sessions/\n');
      git('add', 'config.yaml', '.gitignore');
      git('commit', '-qm', 'config');
      const flow = entry('flow', committed, true, kind === 'counts'),
        leaf = entry('leaf', false);
      const loadModule = async (id: string) => ({
        default: id.endsWith('leaf')
          ? leaf
          : {
              ...flow,
              createRuntime: (
                ...args: Parameters<typeof flow.createRuntime>
              ) => {
                const runtime = flow.createRuntime(...args);
                return {
                  ...runtime,
                  describe() {
                    const view = runtime.describe!();
                    return vanish
                      ? { ...view, actions: [], recovery: undefined }
                      : view;
                  },
                  async apply(
                    input: Parameters<NonNullable<typeof runtime.apply>>[0],
                  ) {
                    const result = await runtime.apply!(input);
                    if (
                      allow &&
                      !interrupted &&
                      kind === 'adopted-assessment'
                    ) {
                      interrupted = true;
                      crash = true;
                      controller!.host.abortActiveTurn(
                        'process interrupted after recovery',
                      );
                    }
                    return result;
                  },
                };
              },
            },
      });
      const store = createSessionStore({ sessionsDir: join(dir, 'sessions') });
      const wrappedStore = {
        ...store,
        async acquire(id: string) {
          const lease = await store.acquire(id);
          return {
            ...lease,
            async checkpointRecovery(point: any) {
              const prior = await lease.read();
              if (
                allow &&
                !interrupted &&
                ['step', 'adjudication', 'restored'].includes(kind) &&
                !point.continuation &&
                point.snapshot.frames.length === 2
              ) {
                interrupted = true;
                crash = true;
                controller!.host.abortActiveTurn(
                  'interrupted after the child parked',
                );
                throw new Error('lost the first checkpoint acknowledgement');
              }
              if (!crash) {
                expect(() =>
                  validateCaptainSessionRecord(
                    projectRecovery({
                      ...prior,
                      uncertain: { ...prior.uncertain, recovery: point },
                    }),
                  ),
                ).not.toThrow();
                if (point.snapshot.sequences.turn > 0) {
                  const variants = [];
                  const captain = structuredClone(point);
                  captain.snapshot.captain.runtime.sequences.trace++;
                  variants.push(captain);
                  const journal = structuredClone(point);
                  journal.snapshot.journal[0].payload = {
                    text: 'different valid Boss input',
                  };
                  variants.push(journal);
                  const {
                    frames: _frames,
                    pendingBossQuestions: _questions,
                    lastError: _error,
                    retainedEffectReconciliation: _fence,
                    ...base
                  } = point.snapshot;
                  variants.push({
                    ...point,
                    snapshot: { ...base, mode: 'chat' },
                  });
                  for (const variant of variants) {
                    expect(() =>
                      assertPlaybookCaptainShellSnapshot(variant.snapshot),
                    ).not.toThrow();
                    await expect(
                      lease.checkpointRecovery(variant),
                    ).rejects.toThrow(
                      'must retain the settled controller and current parked work',
                    );
                  }
                }
              }
              if (
                prior.uncertain.recovery &&
                JSON.stringify(
                  prior.uncertain.recovery.snapshot.effectLedger,
                ) !== JSON.stringify(prior.effectLedger)
              ) {
                // A stale point remains a valid historical record, but cannot be
                // submitted as the current checkpoint through the writer API.
                expect(() => validateCaptainSessionRecord(prior)).not.toThrow();
                await expect(
                  lease.checkpointRecovery(prior.uncertain.recovery),
                ).rejects.toThrow('must contain the current effect ledger');
              }
              if (
                kind === 'vanished' &&
                allow &&
                point.continuation &&
                !interrupted
              ) {
                await lease.checkpointRecovery(point);
                interrupted = true;
                crash = true;
                controller!.host.abortActiveTurn('stopped before dispatch');
                throw new Error('stopped before dispatch');
              }
              if (crash && refusePoint)
                throw new Error('process lost before checkpoint');
              return lease.checkpointRecovery(point);
            },
            async settle(point: any) {
              if (crash) throw new Error('process lost before settlement');
              return lease.settle(point);
            },
          };
        },
      };
      const config = executionConfigFromPlan(
        await loadLaunchPlan({ userConfigPath: configPath, loadModule }),
      );
      const options = {
        store: wrappedStore,
        config,
        loadModule,
        cwd: dir,
        adapterImports: { claude: async () => Adapter } as never,
        observers: [
          {
            onRecord(record: any) {
              records.push(record);
            },
          },
        ],
        async createEffectLedgerWriteAhead(lease: any) {
          let mirror =
            (await lease.read())?.effectLedger ?? emptyPlaybookEffectLedger();
          return {
            snapshot: () => mirror,
            async refresh() {
              mirror =
                (await lease.read())?.effectLedger ??
                emptyPlaybookEffectLedger();
              return mirror;
            },
            async writeAhead(authority: any, commands: any) {
              const prior = mirror;
              mirror = await lease.writeEffectLedger(authority, commands);
              if (
                loseAcknowledgement &&
                mirror.boundaries.some(
                  (boundary: any, i: number) =>
                    boundary.semanticCandidate &&
                    !prior.boundaries[i]?.semanticCandidate,
                )
              ) {
                loseAcknowledgement = false;
                throw new Error('assessment saved but acknowledgement lost');
              }
              return mirror;
            },
          };
        },
      };
      controller = await openSessionHost({ ...options, mode: 'new' });
      const first = await controller.handleBossTurn(
        '/flow original flow request',
      );
      expect(first.snapshot.frames.at(-1).runtime.state.stateId).toBe('failed');
      const sourceSession = first.snapshot.frames[0].sessionId;
      if (kind === 'counts') {
        allow = true;
        failLeaf = false;
        const completed = await controller.handleBossTurn('Answer child');
        expect(completed.snapshot.mode).toBe('chat');
        const closing = closings.at(-1)!;
        expect(closing).toContain('1 child step');
        expect(closing).toContain('1 parent finish');
        expect(closing).toContain('flow saved 2 rounds.');
        expect(closing).not.toContain('leaf saved');
        const actions = completed.snapshot.journal.filter(
          ({ kind }: any) => kind === 'action',
        );
        const outcomes = completed.snapshot.journal.filter(
          ({ kind }: any) => kind === 'outcome',
        );
        expect(actions).toHaveLength(outcomes.length);
        return;
      }

      if (kind === 'adopted-assessment') {
        await controller.handleBossTurn('Stop flow');
        const adopted = await controller.handleBossTurn('Resume flow');
        expect(adopted.snapshot.frames[0].sessionId).not.toBe(sourceSession);
        expect(
          adopted.snapshot.frames[0].runtime.retainedEffectSourceSessionId,
        ).toBe(sourceSession);
        expect(adopted.snapshot.frames[0].request).toBe(
          'original flow request',
        );
        loseAcknowledgement = true;
        refusePoint = true;
      }
      if (kind === 'vanished') refusePoint = true;
      allow = true;
      await expect(
        kind === 'adopted-assessment'
          ? controller.submitRuntimeAction('retry:adjudication')
          : controller.recover('Prepare and continue.'),
      ).rejects.toThrow();
      const saved = await controller.read();
      expect(saved.state).toBe('uncertain');
      expect(saved.uncertain.recovery).toBeDefined();
      if (kind !== 'adopted-assessment' && kind !== 'vanished') {
        expect(saved.uncertain.recovery.continuation).toBeUndefined();
        expect(
          saved.uncertain.recovery.snapshot.frames.map(
            (frame: any) => frame.playbookId,
          ),
        ).toEqual(['flow', 'leaf']);
        expect(
          saved.uncertain.recovery.snapshot.frames.at(-1).runtime
            .recoveryCheckpoint.boundaryPrefix,
        ).toBeGreaterThan(0);
      }
      const id = controller.sessionId;
      await controller.dispose();
      crash = false;
      refusePoint = false;
      failLeaf = false;
      // A vanished saved action is refused as a normal turn, not a setup crash.
      vanish = kind === 'vanished';
      controller = await openSessionHost({
        ...options,
        mode: 'retry',
        sessionId: id,
      });
      const last = await controller.recover();
      expect(last.state).toBe('settled');
      expect(last.snapshot.lastSettlementStatus).toBe(
        vanish ? 'rejected' : 'ok',
      );
      if (!vanish) expect(last.snapshot.mode).toBe('chat');
      if (committed) {
        expect(
          players.filter((prompt) => prompt.startsWith('flow work:')),
        ).toHaveLength(1);
        expect(git('rev-list', '--count', 'HEAD')).toBe('3');
      }
    } finally {
      await controller?.dispose();
      await rm(dir, { recursive: true, force: true });
    }
  },
  30_000,
);
