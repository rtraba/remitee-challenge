import { test, expect, vi, afterEach } from 'vitest';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { identity, h } from './helpers.js';
const mocks = vi.hoisted(() => ({
  head: vi.fn(),
  block: vi.fn(),
  validate: vi.fn(),
  config: vi.fn(),
  manifest: vi.fn(),
  destroy: vi.fn(),
}));
vi.mock('../src/config.js', () => ({
  config: mocks.config,
  loadManifest: mocks.manifest,
  validateDeployment: mocks.validate,
  provider: () => ({ send: mocks.head, getBlock: mocks.block, destroy: mocks.destroy }),
  sanitizedEndpoint: () => 'https://example.com',
}));
import { diagnose, healthcheckMain } from '../../scripts/healthcheck.js';
const good = () => ({
  ...identity,
  status: 'healthy',
  databaseReady: true,
  schemaVersion: 1,
  journalEventCount: 0,
  escrowCount: 0,
  workerState: 'idle',
  listenerRegistered: true,
  fallbackTimerActive: true,
  lastCycleCompletedAt: Date.now() / 1000,
  lastProgressAt: null,
  rpcObservationAgeSeconds: 0,
  lastIndexedBlock: 3,
  lastIndexedBlockHash: h(3),
  indexingLag: 0,
  lastJournalEvent: null,
});
function setup() {
  mocks.config.mockReturnValue({
    network: 'local',
    rpcUrl: 'https://user:secret@example.com/key',
    apiUrl: 'http://api',
    manifestPath: 'local.json',
    confirmationDepth: 0,
    rpcStale: 30,
    workerStale: 30,
  });
  mocks.manifest.mockReturnValue(identity);
  mocks.validate.mockResolvedValue(undefined);
  mocks.head.mockResolvedValue('0x3');
  mocks.block.mockResolvedValue({ hash: h(3) });
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ ok: true, json: async () => good() })),
  );
}
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
test('read-only diagnostics accept empty caught-up deployment and JSON/report return same content', async () => {
  setup();
  const dir = mkdtempSync(join(tmpdir(), 'diagnostic-'));
  const log = vi.spyOn(console, 'log').mockImplementation(() => {});
  try {
    expect(await healthcheckMain(['--json', '--report', join(dir, 'report.json')])).toBe(0);
    const report = JSON.parse(readFileSync(join(dir, 'report.json'), 'utf8'));
    expect(report.ok).toBe(true);
    expect(JSON.parse(String(log.mock.calls[0][0]))).toEqual(report);
    expect(report.endpoint).not.toContain('secret');
    expect(mocks.head).toHaveBeenCalledWith('eth_blockNumber', []);
  } finally {
    rmSync(dir, { recursive: true });
  }
});
test('fresh RPC cannot mask stopped/stale worker, schema, identity, integrity or checkpoint mismatch', async () => {
  for (const override of [
    { workerState: 'stopped' },
    { lastCycleCompletedAt: 0, lastProgressAt: 0 },
    { databaseReady: false, schemaVersion: 2 },
    { chainId: '1' },
    { status: 'reorg_detected' },
    { rpcObservationAgeSeconds: 31 },
    { lastIndexedBlock: 2 },
    { escrowCount: 1 },
    {
      lastJournalEvent: {
        name: 'EscrowCreated',
        transactionHash: h(9),
        creationTransactionHash: h(8),
      },
    },
  ]) {
    setup();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, json: async () => ({ ...good(), ...override }) })),
    );
    const report = await diagnose(0);
    expect(report.ok, JSON.stringify(override)).toBe(false);
  }
  setup();
  mocks.block.mockResolvedValue({ hash: h(99) });
  expect((await diagnose(0)).ok).toBe(false);
});
test('captured target is bounded and does not chase a moving head; latest journal is snapshot-consistent', async () => {
  setup();
  let calls = 0;
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({
      ok: true,
      json: async () => ({
        ...good(),
        lastIndexedBlock: ++calls === 1 ? 2 : 3,
        lastJournalEvent: {
          name: 'EscrowReleased',
          transactionHash: h(7),
          resolutionTransactionHash: h(7),
        },
      }),
    })),
  );
  mocks.head.mockClear();
  expect((await diagnose(1000)).ok).toBe(true);
  expect(calls).toBe(2);
  expect(mocks.head).toHaveBeenCalledTimes(1);
});
test('unreachable RPC/API and deployment failures yield sanitized failure and nonzero exit', async () => {
  setup();
  mocks.validate.mockRejectedValue(Error('https://secret@example.com/password'));
  expect(JSON.stringify(await diagnose(0))).not.toContain('password');
  setup();
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => {
      throw Error('secret');
    }),
  );
  vi.spyOn(console, 'log').mockImplementation(() => {});
  expect(await healthcheckMain(['--json', '--timeout', '0'])).toBe(1);
  await expect(healthcheckMain(['--unknown'])).rejects.toThrow();
});
