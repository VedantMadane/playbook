// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { assign, createMachine } from 'xstate';
import { describe, expect, it } from 'vitest';
import { assertPlaybookEffectLedger, createXStatePlaybookRuntime, isPlaybookEffectLedgerMonotonicExtension, RUNTIME_ABI } from './xstate-runtime.js';
import { createWorktreeHostCapabilities } from '../reference/sdlc/code.playbook/host-capabilities.js';
import type {
  PlaybookPorts,
  PlaybookRuntimeSnapshot,
  PlaybookSession,
} from './runtime.js';

const metadata = (stateId: string, description: string, role?: string) => ({
  playbook: { stateId, description, ...(role ? { role } : {}) },
});
const machine = createMachine(
  {
    id: 'recovery-flow',
    initial: 'ready',
    context: { task: '', prior: '' },
    states: {
      ready: {
        tags: ['playbook.parked'],
        meta: metadata('ready', 'Waiting'),
        on: {
          START: {
            target: 'first',
            actions: assign({ task: ({ event }) => event.text }),
          },
        },
      },
      first: {
        tags: ['playbook.busy'],
        meta: metadata('first', 'Create the first commit', 'worker'),
        invoke: {
          src: 'player',
          input: ({ context }) => ({
            stateId: 'first',
            role: 'worker',
            sourceItem: 'FLOW-1',
            prompt: `First: ${context.task}`,
            result: { done: 'The first commit is complete.' },
          }),
          onDone: {
            target: 'second',
            actions: [
              assign({ prior: () => 'first-completed' }),
              {
                type: 'playbook.acceptedOutcome',
                params: {
                  source: 'first',
                  target: 'second',
                  acceptedOutcome: 'done',
                },
              },
            ],
          },
          onError: {
            target: 'failed',
            actions: assign({ lastError: ({ event }) => event.error }),
          },
        },
      },
      second: {
        tags: ['playbook.busy'],
        meta: metadata('second', 'Check the completed commit', 'worker'),
        invoke: {
          src: 'player',
          input: ({ context }) => ({
            stateId: 'second',
            role: 'worker',
            sourceItem: 'FLOW-2',
            prompt: `Second: ${context.task}; ${context.prior}`,
            result: { done: 'The check is complete.' },
          }),
          onDone: {
            target: 'done',
            actions: {
              type: 'playbook.acceptedOutcome',
              params: {
                source: 'second',
                target: 'done',
                acceptedOutcome: 'done',
              },
            },
          },
          onError: {
            target: 'failed',
            actions: assign({ lastError: ({ event }) => event.error }),
          },
        },
      },
      failed: {
        tags: ['playbook.parked'],
        meta: metadata('failed', 'The flow needs recovery'),
        on: { START: 'first' },
      },
      done: { type: 'final', meta: metadata('done', 'Finished') },
    },
  },
  { actions: { 'playbook.acceptedOutcome': () => undefined } },
);
const createRuntime = createXStatePlaybookRuntime(machine, {
  label: 'recovery-flow',
  compat: { artifactSchema: 3, runtimeAbi: RUNTIME_ABI },
  snapshotOptions: () => ({}),
  entryEvent: { type: 'START', textField: 'text' },
  roleStates: {
    first: { role: 'worker', label: 'Create the first commit' },
    second: { role: 'worker', label: 'Check the completed commit' },
  },
  outcomeAuthority: {
    governedPlayerStates: {
      first: {
        done: { fields: {}, repositoryDisposition: 'one-descendant-commit' },
      },
      second: { done: { fields: {}, repositoryDisposition: 'unchanged' } },
    },
  },
});

describe('interrupted-step recovery with real Git', () => {
  for (const restored of [false, true])
    for (const failureKind of ['player', 'judge', 'files', 'missing-transition']) {
      const failedJudge = failureKind === 'judge';
      const unwantedFiles = failureKind === 'files';
      const missingTransition = failureKind === 'missing-transition';
      it(`preserves the commit after ${failureKind} failure (${restored ? 'restored' : 'live'})`, async () => {
        const cwd = await mkdtemp(join(tmpdir(), 'playbook-step-recovery-'));
        const git = (...args: string[]) =>
          execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
        let runtime: ReturnType<typeof createRuntime> | undefined;
        try {
          git('init', '-q');
          git('config', 'commit.gpgsign', 'false');
          git('config', 'user.name', 'Recovery Test');
          git('config', 'user.email', 'test@example.invalid');
          await writeFile(join(cwd, 'file.txt'), 'initial\n');
          git('add', '.');
          git('commit', '-qm', 'initial');
          const baseCapabilities = await createWorktreeHostCapabilities({
            cwd,
            playbookId: 'recovery-flow',
            requiredRoleIds: ['worker'],
          });
          let loseAcknowledgement = false;
          let judgeCalls = 0;
          let injectDrift = false;
          const hostCapabilities = {
            ...baseCapabilities,
            repository: {
              ...baseCapabilities.repository,
              async acquire(options: { signal: AbortSignal }) {
                const claim = await baseCapabilities.repository.acquire(options);
                return { assertOwner: () => claim.assertOwner(), async release() {
                  await claim.release();
                  if (injectDrift) { injectDrift = false; await writeFile(join(cwd, 'late-change'), 'concurrent work'); }
                } };
              },
            },
            effectLedger: {
              snapshot: () => baseCapabilities.effectLedger.snapshot(),
              writeAhead: async (commands: any) => {
                const acknowledged =
                  await baseCapabilities.effectLedger.writeAhead(commands);
                if (loseAcknowledgement) {
                  loseAcknowledgement = false;
                  throw new Error('injected disconnect after durable judgment');
                }
                return acknowledged;
              },
            },
          };
          const calls: string[] = [];
          let fail = true;
          let judgeReply = '{"guard":"done"}';
          const ports: PlaybookPorts = {
            callPlayer: async (_role, prompt) => {
              calls.push(prompt);
              if (prompt.startsWith('First:')) {
                await writeFile(join(cwd, 'file.txt'), 'completed\n');
                git('add', '.');
                git('commit', '-qm', 'first step');
                return { status: 'ok', finalText: 'First step committed.' };
              }
              if (fail && unwantedFiles) {
                await writeFile(join(cwd, 'intermediate-output'), 'generated');
                return { status: 'ok', finalText: 'Check passed.' };
              }
              if (fail && !failedJudge && !missingTransition)
                return {
                  status: 'error',
                  error: 'ECONNRESET: injected player network interruption',
                };
              return { status: 'ok', finalText: missingTransition ? 'Boss must decide whether to keep the data; no declared path requests that decision.' : 'Check passed.' };
            },
            callJudge: async (prompt) => {
              judgeCalls++;
              if (missingTransition && calls.length === 2) {
                expect(prompt).toContain('If no declared outcome matches');
                return '{"blocked":"Boss must choose whether to keep the data, but the playbook offers only done."}';
              }
              if (fail && failedJudge)
                throw new Error(
                  'ECONNRESET: injected judge network interruption',
                );
              return judgeReply;
            },
            callCaptain: async () => {
              throw Error('unexpected Captain call');
            },
            callPlaybook: async () => {
              throw Error('unexpected child');
            },
            emitStatus: async () => {},
            emitTelemetry: async () => {},
          };
          const id = randomUUID();
          const session: PlaybookSession = {
            sessionId: id,
            rootSessionId: id,
            playbookId: 'recovery-flow',
            depth: 0,
            ports,
          };
          runtime = createRuntime({ configuredOptions: {}, hostCapabilities });
          await runtime.init(session);
          const first = await runtime.handleBossInput({
            text: 'original task',
            signal: new AbortController().signal,
          });
          expect(first.outcome).toBe('failed');
          expect(calls).toHaveLength(failedJudge ? 1 : 2);
          expect(git('rev-list', '--count', 'HEAD')).toBe('2');
          const snapshot = JSON.parse(
            JSON.stringify(runtime.exportSnapshot!()),
          ) as PlaybookRuntimeSnapshot;
          expect(snapshot.recoveryCheckpoint?.stateId).toBe(
            failedJudge ? 'first' : 'second',
          );
          expect(snapshot.recoveryCheckpoint?.boundaryPrefix).toBe(
            failedJudge ? 0 : 1,
          );
          if (restored) {
            await runtime.dispose();
            for (const corrupt of [
              (value: PlaybookRuntimeSnapshot) => {
                value.recoveryCheckpoint = {
                  ...value.recoveryCheckpoint!,
                  boundaryPrefix: -1,
                };
              },
              (value: PlaybookRuntimeSnapshot) => {
                value.recoveryCheckpoint = {
                  ...value.recoveryCheckpoint!,
                  stateId: 'missing',
                };
              },
              (value: PlaybookRuntimeSnapshot) => {
                (value.recoveryCheckpoint!.machine as any).children = {};
              },
            ]) {
              const invalid = JSON.parse(JSON.stringify(snapshot));
              corrupt(invalid);
              const refused = createRuntime({
                configuredOptions: {},
                hostCapabilities,
              });
              await expect(refused.restore!(session, invalid)).rejects.toThrow(
                /recovery[Cc]heckpoint|recovery checkpoint/,
              );
              await refused.dispose();
              expect(calls).toHaveLength(failedJudge ? 1 : 2);
            }
            runtime = createRuntime({
              configuredOptions: {},
              hostCapabilities,
            });
            await runtime.restore!(session, snapshot);
            expect(calls).toHaveLength(failedJudge ? 1 : 2);
          }
          if (missingTransition) {
            expect(judgeCalls).toBe(2);
            const boundary = hostCapabilities.effectLedger.snapshot().boundaries[1]!;
            expect(boundary.semanticCandidate).toEqual({ blocked: 'Boss must choose whether to keep the data, but the playbook offers only done.' });
            expect(boundary.correctionBudget.spent).toBe(false);
            expect(runtime.describe!().recovery?.evidence).toMatchObject({ savedPlayerText: expect.stringContaining('Boss must decide') });
            expect(runtime.describe!().lastError).toMatchObject({ cause: { code: 'runtime-defect', evidence: { reason: expect.stringContaining('No declared outcome matches') } } });
            expect(calls).toHaveLength(2);
            return;
          }
          let actionId = failedJudge ? 'retry:adjudication' : unwantedFiles ? 'retry:restored-step' : 'retry:step';
          expect(runtime.describe!().actions).toContainEqual({
            id: actionId,
            label: failedJudge
              ? 'Retry assessment of the saved result'
              : unwantedFiles ? 'Restore the repository and retry the read-only step' : 'Retry: Check the completed commit',
            standing: 'ready',
          });
          if (unwantedFiles) {
            const original = hostCapabilities.effectLedger.snapshot().boundaries[1]!;
            expect(await runtime.apply!({ actionId, key: 'before-repair', signal: new AbortController().signal }))
              .toMatchObject({ disposition: 'failed' });
            expect(calls).toHaveLength(2);
            await rm(join(cwd, 'intermediate-output'));
            expect(runtime.describe!().recovery?.preparation).toContain('read-only');
            expect(original.physicalReceipt?.classification).toBe('concurrent-or-foreign-change');
            for (const amendment of [
              { restored: original.after },
              { restored: original.baseline, dispositions: ['one-descendant-commit'] },
              { restored: original.baseline, cohortId: randomUUID() },
              { restored: original.baseline, logicalOperationId: randomUUID() },
              { restored: original.baseline, physicalReceipt: undefined },
            ]) {
              const corrupted = JSON.parse(JSON.stringify(hostCapabilities.effectLedger.snapshot()));
              Object.assign(corrupted.boundaries[1], amendment);
              expect(() => assertPlaybookEffectLedger(corrupted)).toThrow();
            }
            if (!restored) {
              injectDrift = true;
              expect(await runtime.apply!({ actionId, key: 'drift-after-check', signal: new AbortController().signal })).toMatchObject({ disposition: 'failed' });
              expect(calls).toHaveLength(2);
              actionId = 'retry:step';
              expect(await runtime.apply!({ actionId, key: 'still-drifted', signal: new AbortController().signal })).toMatchObject({ disposition: 'failed' });
              expect(calls).toHaveLength(2);
              await rm(join(cwd, 'late-change'));
            }
          }
          fail = false;
          if (failedJudge) {
            for (const invalid of ['not JSON', '{"guard":"unknown"}']) {
              judgeReply = invalid;
              expect(
                await runtime.apply!({
                  actionId,
                  key: invalid,
                  signal: new AbortController().signal,
                }),
              ).toMatchObject({ disposition: 'failed' });
              expect(calls).toHaveLength(1);
              expect(
                hostCapabilities.effectLedger.snapshot().boundaries[0]
                  ?.semanticCandidate,
              ).toBeUndefined();
              expect(git('rev-list', '--count', 'HEAD')).toBe('2');
            }
            judgeReply = '{"guard":"done"}';
          }
          if (failedJudge && restored) {
            loseAcknowledgement = true;
            expect(
              await runtime.apply!({
                actionId,
                key: 'interrupted-ack',
                signal: new AbortController().signal,
              }),
            ).toMatchObject({ disposition: 'failed' });
            expect(calls).toHaveLength(1);
            expect(judgeCalls).toBe(4);
            const saved = JSON.parse(JSON.stringify(runtime.exportSnapshot!()));
            await runtime.dispose();
            runtime = createRuntime({
              configuredOptions: {},
              hostCapabilities,
            });
            await runtime.restore!(session, saved);
            expect(runtime.describe!().actions[0]?.id).toBe(actionId);
          }
          const receipt = await runtime.apply!({
            actionId,
            key: 'recover-once',
            signal: new AbortController().signal,
          });
          expect(receipt, JSON.stringify(receipt)).toMatchObject({
            disposition: 'executed',
            run: { outcome: 'terminal' },
          });
          expect(calls).toHaveLength(failedJudge ? 2 : 3);
          if (!failedJudge) expect(calls[2]).toBe(calls[1]);
          expect(calls.at(-1)).toContain('first-completed');
          if (unwantedFiles) {
            const saved = hostCapabilities.effectLedger.snapshot().boundaries[1]!;
            expect(saved.physicalReceipt?.classification).toBe('concurrent-or-foreign-change');
            expect(saved.restored).toEqual(saved.baseline);
            const current = hostCapabilities.effectLedger.snapshot();
            const removed = JSON.parse(JSON.stringify(current));
            delete removed.boundaries[1].restored;
            expect(isPlaybookEffectLedgerMonotonicExtension(current as any, removed)).toBe(false);
          }
          expect(git('rev-list', '--count', 'HEAD')).toBe('2');
          expect(
            await runtime.apply!({
              actionId,
              key: 'recover-once',
              signal: new AbortController().signal,
            }),
          ).toEqual(receipt);
          expect(calls).toHaveLength(failedJudge ? 2 : 3);
        } finally {
          await runtime?.dispose();
          await rm(cwd, { recursive: true, force: true });
        }
      });
    }
});
