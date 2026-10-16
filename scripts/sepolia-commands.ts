import { address } from '../api/src/validation.js';
export type PublicMode = 'dry-run' | 'broadcast' | 'etherscan' | 'blockscout';
export function publicCommand(mode: PublicMode, env: NodeJS.ProcessEnv) {
  if (env.NETWORK !== 'sepolia' || !env.SEPOLIA_RPC_URL)
    throw Error('Explicit Sepolia profile and RPC required');
  const rpc = new URL(env.SEPOLIA_RPC_URL);
  if (!['https:', 'http:'].includes(rpc.protocol)) throw Error('HTTP RPC required');
  if (mode === 'dry-run' || mode === 'broadcast') {
    if (!env.FOUNDRY_ACCOUNT || !env.DEPLOYER_ADDRESS)
      throw Error('Explicit encrypted account name and deployer address required');
    const sender = address(env.DEPLOYER_ADDRESS);
    const args = [
      'script',
      'script/DeployEscrow.s.sol:DeployEscrow',
      '--rpc-url',
      'sepolia',
      '--chain',
      '11155111',
      '--sender',
      sender,
    ];
    if (mode === 'broadcast') args.push('--account', env.FOUNDRY_ACCOUNT, '--broadcast');
    return { args, env: { ...env } };
  }
  if (!env.TARGET_ADDRESS) throw Error('Explicit target address required');
  const args = [
    'verify-contract',
    address(env.TARGET_ADDRESS),
    'src/Escrow.sol:Escrow',
    '--chain',
    '11155111',
    '--compiler-version',
    '0.8.30',
    '--num-of-optimizations',
    '200',
    '--evm-version',
    'cancun',
    '--watch',
    '--verifier',
    mode,
  ];
  let key = env.ETHERSCAN_API_KEY;
  if (mode === 'etherscan') {
    if (!key) throw Error('Etherscan API key required');
    args.push('--verifier-url', 'https://api.etherscan.io/v2/api?chainid=11155111');
  } else {
    if (!env.BLOCKSCOUT_VERIFIER_URL) throw Error('Explicit Blockscout API endpoint required');
    const endpoint = new URL(env.BLOCKSCOUT_VERIFIER_URL);
    if (endpoint.protocol !== 'https:') throw Error('HTTPS verifier endpoint required');
    args.push('--verifier-url', endpoint.toString());
    key = env.BLOCKSCOUT_API_KEY ?? '';
  }
  return { args, env: { ...env, ETHERSCAN_API_KEY: key } };
}
