import { test, expect, vi } from 'vitest';
import { Repository } from '../src/db/repository.js';
import { Worker } from '../src/indexer/worker.js';
import { created, resolved, header, identity, FakeChain, h } from './helpers.js';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
test('real SQLite atomically commits journal/projection/checkpoint, duplicate and conflicting retry', () => {
  const repo = new Repository(':memory:', identity);
  try {
    expect(repo.checkpoint()).toBeNull();
    repo.commit([header(1), header(2)], [created(), resolved()]);
    repo.commit([header(1), header(2)], [created(), resolved()]);
    expect(repo.diagnostics()).toMatchObject({
      journalEventCount: 2,
      escrowCount: 1,
      schemaVersion: 1,
    });
    expect(repo.detail('1')).toMatchObject({
      recordedState: 'Released',
      resolutionTransactionHash: h(102),
    });
    expect(() =>
      repo.commit([header(3)], [{ ...created(), payload: { ...created().payload, amount: '2' } }]),
    ).toThrow('Conflicting duplicate');
    expect(repo.checkpoint()?.number).toBe(2);
    expect(() =>
      repo.commit([header(3)], [created('2', 3)], () => {
        throw Error('crash');
      }),
    ).toThrow('crash');
    expect(repo.detail('2')).toBeUndefined();
    expect(repo.checkpoint()?.number).toBe(2);
    repo.commit([header(3)], [created('2', 3)]);
    expect(repo.detail('2')?.recordedState).toBe('Pending');
    expect(() => repo.commit([header(4)], [resolved('EscrowCancelled', '1', 4)])).toThrow();
    expect(repo.checkpoint()?.number).toBe(3);
    expect(() => repo.commit([{ ...header(3), hash: h(999) }], [])).toThrow('Conflicting stored');
  } finally {
    repo.close();
  }
});
test('all terminal events and multiple events in one transaction have independent identities', () => {
  const repo = new Repository(':memory:', identity);
  try {
    let i = 0;
    for (const name of ['EscrowCancelled', 'EscrowReleased', 'EscrowRejected', 'EscrowExpired']) {
      repo.commit(
        [header(1)],
        [created(String(++i), 1, i * 2), resolved(name, String(i), 1, i * 2 + 1)],
      );
    }
    expect(repo.diagnostics()).toMatchObject({ journalEventCount: 8, escrowCount: 4 });
    expect(repo.detail('4')?.recordedState).toBe('Expired');
    expect(() => repo.commit([header(2)], [resolved('Unknown', '1', 2)])).toThrow();
    expect(() => repo.commit([header(2)], [resolved('EscrowReleased', '999', 2)])).toThrow();
  } finally {
    repo.close();
  }
});
test('persistent restart, identity and schema guard', () => {
  const dir = mkdtempSync(join(tmpdir(), 'remitee-db-')),
    path = join(dir, 'test.sqlite');
  try {
    let r = new Repository(path, identity);
    r.commit([header(1)], [created()]);
    r.close();
    r = new Repository(path, identity);
    expect(r.checkpoint()?.number).toBe(1);
    r.close();
    expect(() => new Repository(path, { ...identity, chainId: '1' })).toThrow('identity mismatch');
    r = new Repository(path, identity);
    r.db.pragma('user_version=2');
    r.close();
    expect(() => new Repository(path, identity)).toThrow('schema');
  } finally {
    rmSync(dir, { recursive: true });
  }
});
test('worker cutoff, empty blocks, restart and committed reorg fails closed', async () => {
  const repo = new Repository(':memory:', { ...identity, confirmationDepth: 2 }),
    chain = new FakeChain(),
    w = new Worker(repo, chain);
  try {
    await w.start();
    expect(repo.checkpoint()?.number).toBe(1);
    expect(repo.detail('1')?.recordedState).toBe('Pending');
    chain.height = 5;
    await Promise.all([w.request(), w.request(), w.request()]);
    expect(repo.checkpoint()?.number).toBe(3);
    expect(repo.detail('1')?.recordedState).toBe('Released');
    chain.headers.set(3, { ...header(3), hash: h(999) });
    await w.request();
    expect(w.state).toBe('failed');
    expect(w.integrityError).not.toBeNull();
    await w.request();
    expect(repo.checkpoint()?.hash).toBe(h(3));
  } finally {
    await w.stop();
    repo.close();
  }
  expect(chain.listeners.size).toBe(0);
  expect(w.fallbackTimerActive).toBe(false);
});
test('uncommitted range change retries, no initial eligible block, RPC retry, fallback liveness and serialization', async () => {
  vi.useFakeTimers();
  const repo = new Repository(':memory:', { ...identity, confirmationDepth: 2 }),
    chain = new FakeChain();
  chain.height = 1;
  const w = new Worker(repo, chain, () => Date.now() / 1000, 1);
  try {
    await w.start();
    expect(repo.checkpoint()).toBeNull();
    chain.fail = true;
    await w.request();
    expect(w.integrityError).toBeNull();
    chain.fail = false;
    chain.height = 5;
    const get = chain.header.bind(chain);
    let calls = 0;
    chain.header = async (n) => {
      if (n === 1 && ++calls === 2) return { ...header(1), hash: h(99) };
      return get(n);
    };
    await w.request();
    expect(repo.checkpoint()).toBeNull();
    chain.header = get;
    await vi.advanceTimersByTimeAsync(2000);
    expect(repo.checkpoint()?.number).toBe(3);
    expect(w.lastCycleCompletedAt).not.toBeNull();
    await w.stop();
    const fresh = new Worker(repo, chain);
    await fresh.start();
    expect(repo.diagnostics().journalEventCount).toBe(2);
    await fresh.stop();
  } finally {
    await w.stop();
    repo.close();
    vi.useRealTimers();
  }
});
test('log/header mismatch and malformed projections never advance checkpoint', async () => {
  const repo = new Repository(':memory:', identity),
    chain = new FakeChain(),
    w = new Worker(repo, chain);
  try {
    chain.events = [{ ...created(), blockHash: h(99) }];
    await w.request();
    expect(repo.checkpoint()).toBeNull();
    expect(w.integrityError).toBeNull();
    chain.events = [{ ...created(), payload: { ...created().payload, amount: '0' } }];
    await w.request();
    expect(w.integrityError).not.toBeNull();
    expect(repo.diagnostics().escrowCount).toBe(0);
  } finally {
    await w.stop();
    repo.close();
  }
});
test('head reset, identity mismatch and broken parent continuity are distinguished', async () => {
  for (const scenario of ['head', 'identity', 'parent']) {
    const r = new Repository(':memory:', identity),
      c = new FakeChain(),
      w = new Worker(r, c);
    try {
      if (scenario === 'head') {
        await w.request();
        c.height = 1;
      }
      if (scenario === 'identity') c.identity = async () => ({ ...identity, chainId: '1' });
      if (scenario === 'parent') c.headers.set(2, { ...header(2), parentHash: h(900) });
      await w.request();
      expect(w.integrityError !== null).toBe(scenario !== 'parent');
      if (scenario === 'parent') expect(r.checkpoint()).toBeNull();
    } finally {
      await w.stop();
      r.close();
    }
  }
});
