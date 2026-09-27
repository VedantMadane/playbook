// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// A bounded policy model, not a proof of the runtime, tools, or TypeScript.
// Mutants change one rule at a time; none claims to model an older release.
// Model limits: two crashes, two parallel lanes, two nested frames. Workers
// may survive a crash. Repository inspection cannot observe outside effects.
// Unknown work can be inspected or abandoned; it is never replayed by guessing.
import assert from 'node:assert/strict';

const programs = {
  ordinary: [{ kind: 'player', owner: 'root', lanes: 1 }],
  nested: [{ kind: 'player', owner: 'root', lanes: 1 }, { kind: 'player', owner: 'root/child', lanes: 1 }],
  parallel: [{ kind: 'player', owner: 'root/child', lanes: 2, supported: false }],
  preparation: [{ kind: 'preparation', owner: 'root', lanes: 1 }, { kind: 'player', owner: 'root', lanes: 1 }],
  script: [{ kind: 'script', owner: 'root', lanes: 1 }],
  answer: [{ kind: 'player', owner: 'root', lanes: 1 }, { kind: 'player', owner: 'root', lanes: 1, input: 'Boss answer' }],
  'supported-then-bespoke': [{ kind: 'player', owner: 'root', lanes: 1 }, { kind: 'player', owner: 'root/decide', lanes: 2, supported: false }],
  'parked-question': [{ kind: 'player', owner: 'root/child', lanes: 1, input: 'Boss answer' }],
  bespoke: [{ kind: 'player', owner: 'root/decide', lanes: 2, supported: false }],
};
const copy = (s) => structuredClone(s);
const key = (s) => JSON.stringify(s);
const ids = (s, program) => program.flatMap((step, pc) => Array.from({ length: step.lanes }, (_, lane) => `${pc}/${lane}`)).filter((id) => id.startsWith(`${s.pc}/`));
function successors(s, program, protocol) {
  const out = [];
  const add = (event, change) => { const n = copy(s); change(n); out.push([event, n]); };
  const step = program[s.pc], members = ids(s, program);
  if (s.ended) return out;
  if (s.write && s.host) add('atomic write acknowledged', (n) => { n.disk = n.write; n.write = null; });
  if (s.crashes < 2 && s.host) {
    for (const committed of s.write ? [false, true] : [false]) {
      add(`crash (${committed ? 'new' : 'old'} atomic record survives)`, (n) => {
        if (committed) n.disk = n.write;
        n.write = null; n.host = false; n.approved = false; n.inspected = false; n.crashes++;
        // Erase the volatile machine. Recovery must not consult it.
        n.pc = -1; n.launched = {}; n.acceptedInput = null; n.reported = false;
      });
    }
  }
  for (const [id, worker] of Object.entries(s.workers)) {
    if (worker !== 'running') continue;
    if ((s.effects[id] ?? 0) < s.launches[id]) add(`worker ${id} changes repository and outside world`, (n) => { n.effects[id] = (n.effects[id] ?? 0) + 1; });
    add(`worker ${id} stops`, (n) => { n.workers[id] = 'stopped'; });
  }
  if (!s.host) {
    add('reopen saved position without execution', (n) => { n.host = true; n.pc = n.disk.position?.pc ?? (Object.keys(n.disk.entries).length ? -1 : n.base.pc); n.acceptedInput = n.disk.position?.input ?? (n.pc === n.base.pc ? n.base.input : null); n.recovering = true;
      if (protocol === 'lose-base' && !Object.keys(n.disk.entries).length) n.pc = -1;
      if (protocol === 'wrong-position' && n.disk.position) n.pc++;  });
    return out;
  }
  if (s.recovering) {
    if (!s.reported) {
      add('report interruption and keep all evidence', (n) => { n.reported = true; if (protocol === 'report-writes-progress') n.disk.position = { pc: n.pc, input: n.acceptedInput }; });
      return out;
    }
    add('Boss stops', (n) => { n.ended = true; });
    if (protocol === 'auto-retry') add('unrelated Boss text triggers automatic recovery', (n) => { n.recovering = false; });
    // An explicit Boss confirmation represents checking/retiring workers. The
    // host cannot infer this fact from a repository inspection.
    if (Object.values(s.workers).includes('running')) return out;
    if (!s.inspected) add('inspect repository after workers stop', (n) => {
      n.inspected = true;
      for (const [id, record] of Object.entries(n.disk.entries)) record.repositoryChange = Boolean(n.effects[id]);
    });
    const complete = members.length && members.every((id) => s.disk.entries[id]?.result);
    if (complete && step?.supported !== false) add(protocol === 'auto-accept' ? 'automatically accepts saved results' : 'Boss accepts saved results', (n) => { n.approved = protocol !== 'auto-accept'; n.recovering = false; });
    // Boss may deliberately repeat unfinished work after checking it. This
    // differs from replay chosen by the host merely because files look clean.
    if (s.inspected && s.disk.position?.pc === s.pc && step?.supported !== false && !complete && members.some((id) => s.disk.entries[id])) {
      add('Boss explicitly authorizes repeating unfinished work', (n) => {
        n.approved = true; n.recovering = false;
        for (const id of members) if (!n.disk.entries[id]?.result) {
          n.authorizedLaunches[id] = (n.launches[id] ?? 0) + 1;
          delete n.launched[id];
        }
      });
    }
    const unstarted = members.every((id) => !s.disk.entries[id]) && Object.keys(s.disk.entries).length === 0;
    if (unstarted && !Object.values(s.effects).some(Boolean)) add('Boss starts previously unstarted work', (n) => { n.approved = true; n.recovering = false; n.acceptedInput = n.base.input; });
    return out;
  }
  if (!step) { if (s.pc < 0) return out; add('finish', (n) => { n.ended = true; }); return out; }
  if (s.write) return out;
  const logged = members.every((id) => s.disk.entries[id]);
  if (!logged) {
    add('write step starts and accepted input', (n) => {
      n.write = copy(n.disk);
      for (const id of members) n.write.entries[id] = { owner: step.owner, result: false, repositoryChange: false };
      if (step.supported !== false) n.write.position = { pc: n.pc, input: n.acceptedInput };
      else if (protocol !== 'stale-unsupported') n.write.position = null;
    });
    return out;
  }
  for (const id of members) {
    if (!s.launched[id] && !s.disk.entries[id]?.result) add(`start worker ${id}`, (n) => { n.launched[id] = true; n.launches[id] = (n.launches[id] ?? 0) + 1; n.workers[id] = 'running'; });
  }
  if (members.every((id) => s.launched[id] && s.workers[id] === 'stopped') && logged && members.some((id) => !s.disk.entries[id].result)) {
    if (protocol !== 'never-save-result') add('write results before taking the next step', (n) => {
      n.write = copy(n.disk);
      for (const id of members) { n.write.entries[id].result = true; n.write.entries[id].repositoryChange = Boolean(n.effects[id]); }
    });
  }
  if (protocol === 'skip-final-result' && s.pc === program.length - 1 && members.every((id) => s.workers[id] === 'stopped')) add('finish', (n) => { n.ended = true; });
  if (logged && members.every((id) => s.disk.entries[id].result)) add('advance to next step or parent', (n) => { n.pc++; n.acceptedInput = program[n.pc]?.input ?? n.acceptedInput; });
  if (!s.cancelled && members.some((id) => s.workers[id])) add('cancel and retain unfinished work', (n) => { n.cancelled = true; n.recovering = true; n.approved = false; n.inspected = false; });
  return out;
}
function violation(s, program, protocol, event, previous) {
  if ((event.startsWith('advance') || event === 'finish') && !s.approved) return 'saved result accepted without Boss choice';
  if (event === 'finish' && program.some((step, pc) => Array.from({ length: step.lanes }, (_, lane) => `${pc}/${lane}`).some((id) => !s.disk.entries[id]?.result))) return 'finished without durable results';
  if (event.startsWith('report interruption') && key(s.disk) !== key(previous.disk)) return 'report changed progress';
  if (event.startsWith('reopen')) {
    const started = Object.keys(s.disk.entries).map((id) => Number(id.split('/')[0]));
    const last = started.length ? Math.max(...started) : undefined;
    const expected = last === undefined ? s.base.pc : program[last].supported === false ? -1 : last;
    if (s.pc !== expected) return 'restored the wrong position';
    if (last === undefined && s.acceptedInput !== s.base.input) return 'lost parked input';
  }
  if (s.host && !s.recovering && !s.write && !s.ended) {
    const members = ids(s, program);
    if (members.length && members.every((id) => s.launched[id] && s.workers[id] === 'stopped') && members.some((id) => !s.disk.entries[id]?.result) && !successors(s, program, protocol).some(([e]) => e === 'write results before taking the next step')) return 'completed work cannot make durable progress';
  }
  if (event.startsWith('start worker') && !s.approved) return 'work repeated without Boss approval after interruption';
  if (Object.entries(s.launches).some(([id, count]) => count > (s.authorizedLaunches[id] ?? 1))) return 'work repeated without a specific Boss choice';
  if (event.startsWith('start worker') && s.acceptedInput !== (program[s.pc]?.input ?? 'Boss task')) return 'accepted Boss input was lost';
  if (s.host && s.recovering && s.crashes > 0) {
    for (const [id, count] of Object.entries(s.effects)) {
      const pc = Number(id.split('/')[0]), step = program[pc];
      if (count && step.supported !== false && !s.disk.entries[id]?.result && s.disk.position?.pc !== pc) return 'unfinished work has no resumable position';
    }
    if (!s.ended && !successors(s, program, protocol).some(([e]) => e.startsWith('report interruption') || e === 'Boss stops')) return 'no safe exit';
  }
  for (const [id, record] of Object.entries(s.disk.entries)) {
    if (record.owner !== program[Number(id.split('/')[0])].owner) return 'work attributed to another frame';
    if (record.repositoryChange && !s.effects[id]) return 'report invents a repository change';
    if (record.result && Boolean(s.effects[id]) !== record.repositoryChange) return 'completed report omits a repository change';
  }
}
export function checkRecoveryModel(protocol) {
  return Object.entries(programs).map(([name, program]) => {
    const initial = { base: { pc: 0, input: program[0].input ?? 'Boss task' }, reported: false, pc: 0, disk: { position: null, entries: {} }, write: null, host: true, recovering: false, approved: true, crashes: 0, workers: {}, launched: {}, launches: {}, authorizedLaunches: {}, effects: {}, acceptedInput: program[0].input ?? 'Boss task', cancelled: false, inspected: false, ended: false };
    const queue = [[initial, [], 'initial']], seen = new Set([key(initial)]);
    let failure;
    for (let cursor = 0; cursor < queue.length; cursor++) {
      const [s, trace, event, previous] = queue[cursor];
      const issue = violation(s, program, protocol, event, previous);
      if (issue) { failure = { issue, trace }; break; }
      for (const [nextEvent, n] of successors(s, program, protocol)) {
        const id = key(n);
        if (!seen.has(id)) { seen.add(id); queue.push([n, [...trace, nextEvent], nextEvent, s]); }
      }
      assert(seen.size < 300_000, `${name}: model bound exceeded`);
    }
    return { name, states: seen.size, ...(failure ? { failure } : {}) };
  });
}
export const mutations = ['lose-base', 'stale-unsupported', 'auto-retry', 'auto-accept', 'wrong-position', 'skip-final-result', 'never-save-result', 'report-writes-progress'];
if (process.argv[1]?.endsWith('/recovery.mjs')) {
  const durable = checkRecoveryModel('durable');
  assert(durable.every((r) => !r.failure), JSON.stringify(durable.filter((r) => r.failure)));
  const rejected = mutations.map((mutation) => {
    const failure = checkRecoveryModel(mutation).find((r) => r.failure);
    assert(failure, `${mutation} escaped the checks`);
    return { mutation, ...failure };
  });
  console.log(JSON.stringify({ durable, rejected }, null, 2));
}
