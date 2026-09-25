// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  createEvent,
  type AgentOptions,
  type AgentEvent,
} from '@sublang/cligent';
import { expect, it } from 'vitest';
import decide from '../decide.playbook/decide.registry.js';
import { createSessionStore } from './session-store.js';
import { openSessionHost } from './session-host.js';
import { executionConfigFromPlan } from './bin/run.js';
import { loadLaunchPlan } from './bin/launch-config.js';

class DecideAdapter {
  readonly agent = 'claude-code';
  static coderCalls: Array<{ prompt: string; options?: AgentOptions }> = [];
  async *run(
    prompt: string,
    options?: AgentOptions,
  ): AsyncGenerator<AgentEvent> {
    let text: string;
    if (prompt.includes('Select exactly one action from the closed set'))
      text = '{"action":"deliver"}';
    else if (
      prompt.includes('An action just settled for the current Boss turn')
    )
      text = 'The player is waiting for your answer.';
    else if (prompt.includes('Boss-input classifier'))
      text = '{"type":"BOSS_REPLY","questionId":"commitCoderProposal"}';
    else if (prompt.includes('This is hidden control work.'))
      text = JSON.stringify({
        guard: prompt.includes('source item DECIDE-3')
          ? 'needsBossReply'
          : 'proposed',
      });
    else if (options?.model === 'reviewer-model') text = 'Reviewer proposal';
    else {
      DecideAdapter.coderCalls.push({ prompt, options });
      text =
        DecideAdapter.coderCalls.length === 1
          ? 'Coder proposal'
          : `Approve checkpoint ${DecideAdapter.coderCalls.length}?`;
    }
    yield createEvent(
      'done',
      this.agent,
      {
        status: 'success',
        result: text,
        usage: { toolUses: 0 },
        durationMs: 1,
        resumeToken: 'provider-only-token',
      },
      'fixture',
    );
  }
  async isAvailable() {
    return true;
  }
}

it('reopens DECIDE from the portable store and answers without a provider hint', async () => {
  const root = await mkdtemp(join(tmpdir(), 'decide-portable-reply-'));
  const cwd = join(root, 'repo');
  await mkdir(cwd);
  const git = (...args: string[]) =>
    execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
  git('init', '-q');
  git('config', 'user.name', 'Test');
  git('config', 'user.email', 'test@example.invalid');
  git('config', 'commit.gpgsign', 'false');
  await writeFile(join(cwd, 'source.txt'), 'baseline');
  git('add', '.');
  git('commit', '-qm', 'baseline');
  const configPath = join(root, 'playbook.config.yaml');
  await writeFile(
    configPath,
    'captain: {adapter: claude, model: captain-model}\nplayers:\n  coder: {adapter: claude, model: coder-model}\n  reviewer: {adapter: claude, model: reviewer-model}\nplaybooks:\n  decide:\n    from: mod://decide\n    roles: {coder: coder, reviewer: reviewer}\n',
  );
  const loadModule = async () => ({ default: decide });
  const config = executionConfigFromPlan(
    await loadLaunchPlan({ userConfigPath: configPath, loadModule }),
  );
  const store = createSessionStore({ sessionsDir: join(root, 'sessions') });
  const adapterImports = { claude: async () => DecideAdapter } as never;
  DecideAdapter.coderCalls = [];
  let controller = await openSessionHost({
    store,
    mode: 'new',
    cwd,
    config,
    loadModule,
    adapterImports,
  });
  try {
    const waiting = await controller.handleBossTurn(
      '/decide Choose a durable design.',
    );
    expect(waiting.snapshot.frames?.[0]?.runtime.state.stateId).toBe(
      'awaitBossReply',
    );
    const operationId = waiting.effectLedger.logicalOperations[0]!.operationId;
    const id = controller.sessionId;
    await controller.dispose();
    await rm(join(store.sessionsDir, `${id}.hints.json`), { force: true });
    expect(
      await readFile(join(store.sessionsDir, `${id}.json`), 'utf8'),
    ).not.toContain('provider-only-token');
    controller = await openSessionHost({
      store,
      mode: 'continue',
      sessionId: id,
      config,
      loadModule,
      adapterImports,
    });
    const replied = await controller.handleBossTurn('Yes, continue.');
    expect(replied.snapshot.frames?.[0]?.runtime.state.stateId).toBe(
      'awaitBossReply',
    );
    expect(replied.effectLedger.logicalOperations).toHaveLength(1);
    expect(replied.effectLedger.logicalOperations[0]).toMatchObject({
      operationId,
      playerContinuation: { v: 1, playerId: 'coder' },
      pendingQuestion: { question: 'Approve checkpoint 3?' },
    });
    expect(DecideAdapter.coderCalls).toHaveLength(3);
    expect(DecideAdapter.coderCalls[2]!.options?.resume).toBeUndefined();
    expect(DecideAdapter.coderCalls[2]!.prompt).toContain(
      'Choose a durable design.',
    );
    expect(DecideAdapter.coderCalls[2]!.prompt).toContain('Yes, continue.');
    expect(git('status', '--porcelain')).toBe('');
  } finally {
    await controller.dispose();
    await rm(root, { recursive: true, force: true });
  }
});
