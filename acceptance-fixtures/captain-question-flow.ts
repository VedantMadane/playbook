// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>
import { assign, createMachine } from 'xstate';
import { createXStatePlaybookRuntime, RUNTIME_ABI } from '../src/xstate-runtime.js';

export const QUESTION = 'We need to select the execution topology. ' +
  'The compatibility envelope retains the current configuration without modifying existing deployments. '.repeat(7) +
  'Preview is ephemeral: all preview data is deleted after seven days. Production persists data but requires separate approval. Which option do you authorize?';
const meta = (stateId: string, description: string, role?: string) => ({
  playbook: { stateId, description, ...(role ? { role } : {}) },
});
const machine = createMachine({
  id: 'question-flow', initial: 'ready',
  context: { task: '', pendingBossQuestion: undefined, bossReply: undefined } as any,
  states: {
    ready: {
      meta: meta('ready', 'Waiting'), tags: ['playbook.parked'],
      on: { START: { target: 'consult', actions: assign({ task: ({ event }) => event.text }) } },
    },
    consult: {
      meta: meta('consult', 'Choose preview or production', 'worker'), tags: ['playbook.busy'],
      invoke: {
        src: 'player',
        input: ({ context }) => ({
          stateId: 'consult', role: 'worker', sourceItem: 'CHOICE-1',
          prompt: `QUESTION_RELAY_WORKER: ${context.task}. This is a conversation test: use no tools, change no files. Before Boss chooses, ask this question exactly: ${QUESTION}\nIf Boss asks you to clarify, answer their question and ask again for their choice. Once Boss explicitly chooses preview or production, confirm the choice and finish. Do not infer a choice from a clarification.`,
          ...(context.bossReply === undefined ? {} : {
            pendingBossQuestion: context.pendingBossQuestion, bossReply: context.bossReply,
          }),
          result: {
            done: 'Boss explicitly chose an option and the player confirmed it.',
            needsBossReply: 'The player asks Boss to choose or clarify. Output shall include `question: <verbatim question>`.',
          },
        }),
        onDone: [
          {
            guard: ({ event }) => event.output.guard === 'needsBossReply',
            target: 'awaitBossReply',
            actions: assign({
              pendingBossQuestion: ({ event }) => ({
                questionId: 'choice', resumeStateId: 'consult', sourceItem: 'CHOICE-1',
                asker: { kind: 'role', roleId: 'worker' }, question: event.output.question,
              }),
              bossReply: () => undefined,
            }),
          },
          { target: 'done', actions: assign({ pendingBossQuestion: () => undefined, bossReply: () => undefined }) },
        ],
        onError: { target: 'failed', actions: assign({ lastError: ({ event }) => event.error }) },
      },
    },
    awaitBossReply: {
      meta: meta('awaitBossReply', 'Waiting for a choice'), tags: ['playbook.parked'],
      on: { BOSS_REPLY: { target: 'consult', actions: assign({ bossReply: ({ event }) => event.answer }) } },
    },
    failed: { meta: meta('failed', 'The conversation stopped'), tags: ['playbook.parked'] },
    done: { meta: meta('done', 'The worker confirmed the option Boss chose.'), type: 'final' },
  },
});
const createRuntime = createXStatePlaybookRuntime(machine, {
  label: 'question-flow', compat: { artifactSchema: 3, runtimeAbi: RUNTIME_ABI },
  snapshotOptions: () => ({}), entryEvent: { type: 'START', textField: 'text' },
  roleStates: { consult: { role: 'worker', label: 'Choose preview or production' } },
  verbatimPayloadFields: new Set(['question']),
  outcomeAuthority: { governedPlayerStates: { consult: {
    done: { fields: {}, repositoryDisposition: 'unchanged' },
    needsBossReply: { fields: { question: 'presentation' }, repositoryDisposition: 'unchanged' },
  } } },
});
export const questionRegistry = {
  id: 'question-flow', command: 'question-flow', intent: 'Ask Boss to choose an option, then confirm it',
  artifactSchema: 3,
  runtimeProfile: { kind: 'shared-factory', compat: createRuntime.compat },
  requiredRoleIds: ['worker'], concurrentRoleSets: [],
  validateOptions: (value: unknown) => value ?? {},
  createRuntime: (configuredOptions: unknown, hostCapabilities: any) => createRuntime({ configuredOptions, hostCapabilities }),
};
