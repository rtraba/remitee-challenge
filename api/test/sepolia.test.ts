import { test, expect } from 'vitest';
import { publicCommand } from '../../scripts/sepolia-commands.js';
import { sender } from './helpers.js';
const env = {
  NETWORK: 'sepolia',
  SEPOLIA_RPC_URL: 'https://rpc.example.com',
  FOUNDRY_ACCOUNT: 'encrypted-test-account',
  DEPLOYER_ADDRESS: sender,
  TARGET_ADDRESS: sender,
  ETHERSCAN_API_KEY: 'fixture-key',
  BLOCKSCOUT_VERIFIER_URL: 'https://explorer.example.com/api/',
};
test('public dry-run excludes broadcast and signing, broadcast explicitly selects encrypted account', () => {
  const dry = publicCommand('dry-run', env).args;
  expect(dry).not.toContain('--broadcast');
  expect(dry).not.toContain('--account');
  expect(dry).toContain('11155111');
  const broadcast = publicCommand('broadcast', env).args;
  expect(broadcast).toContain('--broadcast');
  expect(broadcast).toContain('encrypted-test-account');
  expect(broadcast).not.toContain('--private-key');
  for (const invalid of [
    { ...env, NETWORK: 'local' },
    { ...env, SEPOLIA_RPC_URL: '' },
    { ...env, FOUNDRY_ACCOUNT: '' },
    { ...env, DEPLOYER_ADDRESS: 'bad' },
  ])
    expect(() => publicCommand('broadcast', invalid)).toThrow();
});
test('verify-only commands pin exact build and explorer endpoints, never broadcast', () => {
  for (const mode of ['etherscan', 'blockscout'] as const) {
    const command = publicCommand(mode, env);
    expect(command.args).toContain('0.8.30');
    expect(command.args).toContain('200');
    expect(command.args).toContain('cancun');
    expect(command.args).not.toContain('--broadcast');
    expect(command.args).not.toContain('fixture-key');
  }
  expect(publicCommand('etherscan', env).args).toContain(
    'https://api.etherscan.io/v2/api?chainid=11155111',
  );
  expect(() => publicCommand('etherscan', { ...env, ETHERSCAN_API_KEY: '' })).toThrow();
  expect(() => publicCommand('blockscout', { ...env, BLOCKSCOUT_VERIFIER_URL: '' })).toThrow();
  expect(() =>
    publicCommand('blockscout', { ...env, BLOCKSCOUT_VERIFIER_URL: 'http://example.com' }),
  ).toThrow();
  expect(() => publicCommand('etherscan', { ...env, TARGET_ADDRESS: '' })).toThrow();
});
test('pinned Forge accepts verifier flags and produces exact standard compiler input offline', async () => {
  const { execFileSync } = await import('node:child_process');
  for (const mode of ['etherscan', 'blockscout'] as const) {
    const command = publicCommand(mode, env);
    const args = command.args.filter((arg) => arg !== '--watch');
    args.push('--show-standard-json-input');
    const output = execFileSync('forge', args, {
      cwd: 'contracts',
      encoding: 'utf8',
      maxBuffer: 8 * 1024 * 1024,
      env: { ...process.env, ETHERSCAN_API_KEY: undefined },
    });
    const input = JSON.parse(output);
    expect(input.settings.optimizer).toMatchObject({ enabled: true, runs: 200 });
    expect(input.settings.evmVersion).toBe('cancun');
    expect(Object.keys(input.sources)).toContain('src/Escrow.sol');
  }
});
