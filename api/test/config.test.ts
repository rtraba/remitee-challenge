import { test, expect, vi } from 'vitest';
import {
  config,
  parseManifest,
  loadManifest,
  buildIdentity,
  sanitizedEndpoint,
  validateDeployment,
  provider,
  type Manifest,
} from '../src/config.js';
import { identity, header, h } from './helpers.js';
import { AbiCoder, JsonRpcProvider, keccak256, Interface } from 'ethers';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
function manifest(): Manifest {
  return {
    schemaVersion: 1,
    network: 'local',
    ...identity,
    deploymentTransactionHash: h(101),
    ...buildIdentity(),
    demoTokenAddress: '0x' + '55'.repeat(20),
    demoTokenTransactionHash: h(102),
    demoTokenRuntimeCodeHash: keccak256('0x1234'),
  };
}
test('explicit network configuration, manifest parsing, sanitized endpoints and no signing config', () => {
  expect(config({})).toMatchObject({ network: 'local', confirmationDepth: 0 });
  expect(config({ NETWORK: 'sepolia', SEPOLIA_RPC_URL: 'https://example.com/key' })).toMatchObject({
    confirmationDepth: 2,
    dbPath: 'data/sepolia.sqlite',
  });
  for (const env of [
    { NETWORK: 'mainnet' },
    { NETWORK: 'sepolia' },
    { RPC_URL: 'ws://example.com' },
    { PORT: '01' },
    { PORT: '0' },
    { CONFIRMATION_DEPTH: '-1' },
    { NETWORK: 'sepolia', SEPOLIA_RPC_URL: 'https://example.com', DB_PATH: 'data/local.sqlite' },
  ])
    expect(() => config(env)).toThrow();
  expect(sanitizedEndpoint('https://user:secret@example.com:9000/private?token=secret')).toBe(
    'https://example.com:9000',
  );
  const m = manifest();
  expect(parseManifest(m)).toEqual(m);
  expect(() => parseManifest({ ...m, chainId: '1' })).toThrow();
  expect(() => parseManifest({ ...m, contractAddress: 'bad' })).toThrow();
  expect(() => parseManifest({ ...m, contractAddress: '0x' + 'AA'.repeat(20) })).toThrow();
  const dir = mkdtempSync(join(tmpdir(), 'manifest-'));
  try {
    const path = join(dir, 'local.json');
    writeFileSync(path, JSON.stringify(m));
    expect(loadManifest(path, 'local')).toEqual(m);
    expect(() => loadManifest(path, 'sepolia')).toThrow();
  } finally {
    rmSync(dir, { recursive: true });
  }
  const p = provider('http://127.0.0.1:1');
  expect(p.pollingInterval).toBe(1000);
  p.destroy();
});
test('deployment preflight checks receipt/code/artifact and fixed interface without any escrow', async () => {
  const m = manifest(),
    coder = AbiCoder.defaultAbiCoder();
  const a = JSON.parse(
    (await import('node:fs')).readFileSync('contracts/out/Escrow.sol/Escrow.json', 'utf8'),
  );
  const abi = new Interface(a.abi);
  const goodReceipt = {
    status: 1,
    blockNumber: 1,
    blockHash: h(1),
    contractAddress: m.contractAddress,
  };
  const p = {
    send: vi.fn(async () => '0x7a69'),
    getBlock: vi.fn(async (n: number) => header(n)),
    getTransactionReceipt: vi.fn(async (tx: string) =>
      tx === m.deploymentTransactionHash
        ? goodReceipt
        : { ...goodReceipt, contractAddress: m.demoTokenAddress },
    ),
    getCode: vi.fn(async (addr: string) =>
      addr === m.contractAddress ? a.deployedBytecode.object : '0x1234',
    ),
    call: vi.fn(async (tx: { data: string }) =>
      coder.encode(['uint256'], [tx.data === abi.getFunction('TTL')!.selector ? 604800n : 7200n]),
    ),
  };
  const validate = (v = m) => validateDeployment(p as unknown as JsonRpcProvider, v);
  await expect(validate()).resolves.toBeUndefined();
  await expect(validate({ ...m, chainId: '1' })).rejects.toThrow('chain');
  await expect(validate({ ...m, genesisHash: h(999) })).rejects.toThrow('history');
  await expect(validate({ ...m, artifactHash: h(999) })).rejects.toThrow('Artifact');
  p.getTransactionReceipt.mockResolvedValueOnce({ ...goodReceipt, status: 0 });
  await expect(validate()).rejects.toThrow('receipt');
  p.getCode.mockResolvedValueOnce('0x');
  await expect(validate()).rejects.toThrow('Runtime');
  p.call.mockResolvedValueOnce(coder.encode(['uint256'], [0]));
  await expect(validate()).rejects.toThrow('interface');
  p.getCode.mockImplementation(async (addr: string) =>
    addr === m.contractAddress ? a.deployedBytecode.object : '0x',
  );
  await expect(validate()).rejects.toThrow('token');
});
