import { readFileSync, writeFileSync, renameSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { keccak256 } from 'ethers';
import {
  config,
  provider,
  buildIdentity,
  validateDeployment,
  type Manifest,
} from '../api/src/config.js';
import { run } from './common.js';
export const LOCAL_SENDER = '0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266';
export async function deployLocal() {
  const c = config();
  if (c.network !== 'local') throw Error('Local profile required');
  const p = provider(c.rpcUrl);
  try {
    if (BigInt(await p.send('eth_chainId', [])) !== 31337n) throw Error('LOCAL_ONLY');
    await run(
      'forge',
      [
        'script',
        'script/DeployLocal.s.sol:DeployLocal',
        '--sig',
        'deployLocal()',
        '--rpc-url',
        c.rpcUrl,
        '--broadcast',
        '--unlocked',
        '--sender',
        LOCAL_SENDER,
      ],
      { cwd: 'contracts' },
    );
    const broadcast = JSON.parse(
      readFileSync('contracts/broadcast/DeployLocal.s.sol/31337/deployLocal-latest.json', 'utf8'),
    );
    const tx = broadcast.transactions.find(
        (t: { contractName: string }) => t.contractName === 'Escrow',
      ),
      token = broadcast.transactions.find(
        (t: { contractName: string }) => t.contractName === 'DemoToken',
      );
    if (!tx || !token) throw Error('Missing deployment transactions');
    const receipt = await p.getTransactionReceipt(tx.hash),
      tr = await p.getTransactionReceipt(token.hash);
    if (
      !receipt?.contractAddress ||
      receipt.status !== 1 ||
      tr?.status !== 1 ||
      !tr.contractAddress
    )
      throw Error('Failed receipts');
    const block = await p.getBlock(receipt.blockNumber),
      genesis = await p.getBlock(0);
    if (!block?.hash || !genesis?.hash) throw Error('Missing blocks');
    const manifest: Manifest = {
      schemaVersion: 1,
      network: 'local',
      chainId: '31337',
      genesisHash: genesis.hash.toLowerCase(),
      contractAddress: receipt.contractAddress.toLowerCase(),
      deploymentTransactionHash: receipt.hash.toLowerCase(),
      deploymentBlock: receipt.blockNumber,
      deploymentBlockHash: block.hash.toLowerCase(),
      ...buildIdentity(),
      demoTokenAddress: tr.contractAddress.toLowerCase(),
      demoTokenTransactionHash: tr.hash.toLowerCase(),
      demoTokenRuntimeCodeHash: keccak256(await p.getCode(tr.contractAddress)),
    };
    await validateDeployment(p, manifest);
    mkdirSync(dirname(c.manifestPath), { recursive: true });
    writeFileSync(c.manifestPath + '.tmp', JSON.stringify(manifest, null, 2) + '\n');
    renameSync(c.manifestPath + '.tmp', c.manifestPath);
    return manifest;
  } finally {
    p.destroy();
  }
}
